use super::model_manifest::{
    find_file_ending_with, find_manifest, is_model_installed, is_silero_installed,
    silero_onnx_path, ArchiveType, ModelManifestEntry, ASR_MODELS_MANIFEST,
    SILERO_VAD_MANIFEST,
};
use crate::error::{AppError, AppResult};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tokio::io::AsyncWriteExt;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub model_id: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub phase: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

impl DownloadProgress {
    pub fn new(model_id: &str, downloaded: u64, total: u64, phase: &str) -> Self {
        Self {
            model_id: model_id.into(),
            downloaded_bytes: downloaded,
            total_bytes: total,
            phase: phase.into(),
            message: None,
        }
    }
}

fn manifest_for(model_id: &str) -> Option<&'static ModelManifestEntry> {
    if model_id == SILERO_VAD_MANIFEST.id {
        Some(&SILERO_VAD_MANIFEST)
    } else {
        find_manifest(model_id)
    }
}

pub fn model_is_ready(models_dir: &Path, model_id: &str) -> bool {
    if model_id == SILERO_VAD_MANIFEST.id {
        is_silero_installed(models_dir)
    } else {
        find_manifest(model_id)
            .map(|entry| is_model_installed(models_dir, entry))
            .unwrap_or(false)
    }
}

/// Baixa e instala um modelo de forma atômica. Se a energia cair no meio,
/// a próxima abertura nunca encontra um `.onnx` corrompido.
pub async fn download_model<F>(
    client: &reqwest::Client,
    models_dir: &Path,
    model_id: &str,
    mut on_progress: F,
) -> AppResult<()>
where
    F: FnMut(DownloadProgress),
{
    let entry = manifest_for(model_id)
        .ok_or_else(|| AppError::Model(format!("modelo desconhecido: {model_id}")))?;

    if model_is_ready(models_dir, model_id) {
        on_progress(DownloadProgress::new(
            model_id,
            entry.approx_bytes,
            entry.approx_bytes,
            "ready",
        ));
        return Ok(());
    }

    std::fs::create_dir_all(models_dir)?;
    let staging = models_dir.join(".staging");
    std::fs::create_dir_all(&staging)?;
    let download_path = staging.join(format!("{}.download", entry.id));

    download_to_file(client, entry.url, &download_path, entry.approx_bytes, |downloaded, total| {
        on_progress(DownloadProgress::new(
            model_id,
            downloaded,
            total,
            "downloading",
        ));
    })
    .await?;

    if entry.archive_type == ArchiveType::RawFile {
        let final_dir = models_dir.join(entry.expected_subdir);
        std::fs::create_dir_all(&final_dir)?;
        let final_path = final_dir.join("silero_vad.onnx");
        std::fs::rename(&download_path, &final_path)?;
        if final_path
            .metadata()
            .map(|m| m.len() > 1024)
            .unwrap_or(false)
            == false
        {
            return Err(AppError::Model(
                "arquivo silero_vad.onnx inválido após download".into(),
            ));
        }
        on_progress(DownloadProgress::new(
            model_id,
            entry.approx_bytes,
            entry.approx_bytes,
            "ready",
        ));
        return Ok(());
    }

    on_progress(DownloadProgress::new(
        model_id,
        0,
        entry.approx_bytes,
        "extracting",
    ));

    let extract_dir = staging.join(format!("{}_extracted", entry.id));
    if extract_dir.exists() {
        std::fs::remove_dir_all(&extract_dir).ok();
    }
    std::fs::create_dir_all(&extract_dir)?;

    let archive_path = download_path.clone();
    let extract_dir_clone = extract_dir.clone();
    tokio::task::spawn_blocking(move || extract_tar_bz2(&archive_path, &extract_dir_clone))
        .await
        .map_err(|e| AppError::Model(format!("falha ao aguardar extração: {e}")))??;

    let source = locate_extracted_root(&extract_dir, entry)?;
    let final_dir = models_dir.join(entry.expected_subdir);
    if final_dir.exists() {
        std::fs::remove_dir_all(&final_dir).ok();
    }
    if let Some(parent) = final_dir.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::rename(&source, &final_dir).map_err(|e| {
        AppError::Model(format!(
            "não foi possível mover {} para {}: {e}",
            source.display(),
            final_dir.display()
        ))
    })?;

    std::fs::remove_file(&download_path).ok();
    std::fs::remove_dir_all(&extract_dir).ok();

    if !is_model_installed(models_dir, entry) {
        return Err(AppError::Model(format!(
            "modelo {} extraído, mas arquivos ONNX/tokens não foram encontrados",
            entry.id
        )));
    }

    on_progress(DownloadProgress::new(
        model_id,
        entry.approx_bytes,
        entry.approx_bytes,
        "ready",
    ));
    Ok(())
}

async fn download_to_file<F>(
    client: &reqwest::Client,
    url: &str,
    target: &Path,
    approx_bytes: u64,
    mut progress: F,
) -> AppResult<()>
where
    F: FnMut(u64, u64),
{
    let response = client
        .get(url)
        .header("User-Agent", "gizmo/0.1 (+local lecture companion)")
        .send()
        .await
        .map_err(|e| AppError::Model(format!("falha de rede ao baixar modelo: {e}")))?;
    let response = response
        .error_for_status()
        .map_err(|e| AppError::Model(format!("servidor recusou o download: {e}")))?;
    let total = response.content_length().unwrap_or(approx_bytes);
    let mut file = tokio::fs::File::create(target).await?;
    let mut stream = response.bytes_stream();
    let mut downloaded = 0u64;
    let mut last_emit = Instant::now() - Duration::from_secs(1);
    progress(0, total);

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| AppError::Model(format!("download interrompido: {e}")))?;
        file.write_all(&chunk).await?;
        downloaded += chunk.len() as u64;
        if last_emit.elapsed() >= Duration::from_millis(100) {
            progress(downloaded, total);
            last_emit = Instant::now();
        }
    }
    file.flush().await?;
    progress(downloaded, total);
    Ok(())
}

fn extract_tar_bz2(archive_path: &Path, extract_dir: &Path) -> AppResult<()> {
    let file = std::fs::File::open(archive_path)?;
    let reader = std::io::BufReader::new(file);
    let decoder = bzip2::read::BzDecoder::new(reader);
    let mut archive = tar::Archive::new(decoder);
    archive
        .unpack(extract_dir)
        .map_err(|e| AppError::Model(format!("falha ao extrair tar.bz2: {e}")))?;
    Ok(())
}

fn locate_extracted_root(
    extract_dir: &Path,
    entry: &ModelManifestEntry,
) -> AppResult<PathBuf> {
    let direct = extract_dir.join(entry.expected_subdir);
    if direct.is_dir() {
        return Ok(direct);
    }
    // O pacote pode ter sido extraído diretamente na raiz ou com um nome
    // ligeiramente diferente. Encontramos a pasta que contém os ONNX.
    let probes: &[&str] = match entry.id {
        "parakeet-tdt-0.6b-v3-int8" => &["encoder.int8.onnx", "encoder.onnx"],
        "whisper-turbo-int8" => &["turbo-encoder.int8.onnx", "encoder.int8.onnx"],
        _ => &["model.int8.onnx", "model.onnx"],
    };
    if find_file_ending_with(extract_dir, probes).is_ok() {
        return Ok(extract_dir.to_path_buf());
    }
    Err(AppError::Model(format!(
        "arquivo .tar.bz2 extraído, mas a pasta de {} não foi localizada",
        entry.id
    )))
}

pub fn all_manifest_entries() -> Vec<&'static ModelManifestEntry> {
    let mut entries = vec![&SILERO_VAD_MANIFEST];
    entries.extend(ASR_MODELS_MANIFEST.iter());
    entries
}

#[allow(dead_code)]
pub fn expected_silero_file(models_dir: &Path) -> PathBuf {
    silero_onnx_path(models_dir)
}
