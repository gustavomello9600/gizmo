use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArchiveType {
    RawFile,
    TarBz2,
}

#[derive(Debug, Clone, Copy)]
pub struct ModelManifestEntry {
    pub id: &'static str,
    pub display_name: &'static str,
    pub url: &'static str,
    pub archive_type: ArchiveType,
    pub expected_subdir: &'static str,
    pub approx_bytes: u64,
}

pub const SILERO_VAD_MANIFEST: ModelManifestEntry = ModelManifestEntry {
    id: "silero-vad-v5",
    display_name: "Silero VAD v5",
    url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx",
    archive_type: ArchiveType::RawFile,
    expected_subdir: "silero-vad",
    approx_bytes: 2_300_000,
};

pub const ASR_MODELS_MANIFEST: &[ModelManifestEntry] = &[
    ModelManifestEntry {
        id: "parakeet-tdt-0.6b-v3-int8",
        display_name: "NVIDIA Parakeet TDT 0.6B v3 (INT8 · 25 Idiomas)",
        url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2",
        archive_type: ArchiveType::TarBz2,
        expected_subdir: "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8",
        approx_bytes: 665_000_000,
    },
    ModelManifestEntry {
        id: "whisper-turbo-int8",
        display_name: "Whisper Large-v3 Turbo (INT8 · 99 Idiomas)",
        url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-turbo.tar.bz2",
        archive_type: ArchiveType::TarBz2,
        expected_subdir: "sherpa-onnx-whisper-turbo",
        approx_bytes: 565_000_000,
    },
    ModelManifestEntry {
        id: "sense-voice-small-int8",
        display_name: "SenseVoice Small (INT8 · EN/ZH/JA/KO)",
        url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2",
        archive_type: ArchiveType::TarBz2,
        expected_subdir: "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17",
        approx_bytes: 240_000_000,
    },
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelStatus {
    pub id: String,
    pub display_name: String,
    pub installed: bool,
    pub approx_bytes: u64,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelsStatusReport {
    pub silero_installed: bool,
    pub installed_models: Vec<String>,
    pub models: Vec<ModelStatus>,
    pub models_dir: String,
}

#[derive(Debug, Clone, Default)]
pub struct AsrModelFiles {
    pub model_id: String,
    pub model_type: String,
    pub encoder: Option<PathBuf>,
    pub decoder: Option<PathBuf>,
    pub joiner: Option<PathBuf>,
    pub tokens: Option<PathBuf>,
    pub model: Option<PathBuf>,
}

pub fn find_manifest(model_id: &str) -> Option<&'static ModelManifestEntry> {
    ASR_MODELS_MANIFEST.iter().find(|m| m.id == model_id)
}

pub fn silero_dir(models_dir: &Path) -> PathBuf {
    models_dir.join(SILERO_VAD_MANIFEST.expected_subdir)
}

pub fn silero_onnx_path(models_dir: &Path) -> PathBuf {
    silero_dir(models_dir).join("silero_vad.onnx")
}

pub fn is_silero_installed(models_dir: &Path) -> bool {
    silero_onnx_path(models_dir)
        .metadata()
        .map(|m| m.len() > 1024)
        .unwrap_or(false)
}

pub fn is_model_installed(models_dir: &Path, entry: &ModelManifestEntry) -> bool {
    model_files(models_dir, entry.id).is_ok()
}

pub fn models_status(models_dir: &Path) -> ModelsStatusReport {
    let silero_installed = is_silero_installed(models_dir);
    let mut installed_models = Vec::new();
    let mut models = Vec::new();
    for entry in ASR_MODELS_MANIFEST {
        let installed = is_model_installed(models_dir, entry);
        if installed {
            installed_models.push(entry.id.to_string());
        }
        models.push(ModelStatus {
            id: entry.id.to_string(),
            display_name: entry.display_name.to_string(),
            installed,
            approx_bytes: entry.approx_bytes,
            path: if installed {
                Some(models_dir.join(entry.expected_subdir).to_string_lossy().into_owned())
            } else {
                None
            },
        });
    }
    ModelsStatusReport {
        silero_installed,
        installed_models,
        models,
        models_dir: models_dir.to_string_lossy().into_owned(),
    }
}

/// Descobre arquivos ONNX reais dentro da pasta extraída, sem hardcode cego.
pub fn find_file_ending_with(dir: &Path, suffixes: &[&str]) -> Result<PathBuf, String> {
    for suffix in suffixes {
        if let Some(found) = find_one_by_suffix(dir, suffix, 0) {
            return Ok(found);
        }
    }
    Err(format!(
        "nenhum arquivo {:?} encontrado em {}",
        suffixes,
        dir.display()
    ))
}

fn find_one_by_suffix(dir: &Path, suffix: &str, depth: usize) -> Option<PathBuf> {
    if depth > 4 {
        return None;
    }
    let entries = std::fs::read_dir(dir).ok()?;
    let mut children = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            children.push(path);
        } else if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if name.ends_with(suffix)
                && path
                    .metadata()
                    .map(|m| m.len() > 1024)
                    .unwrap_or(false)
            {
                return Some(path);
            }
        }
    }
    children.sort();
    for child in children {
        if let Some(found) = find_one_by_suffix(&child, suffix, depth + 1) {
            return Some(found);
        }
    }
    None
}

pub fn model_files(models_dir: &Path, model_id: &str) -> Result<AsrModelFiles, String> {
    let entry = find_manifest(model_id)
        .ok_or_else(|| format!("modelo ASR desconhecido: {model_id}"))?;
    let dir = models_dir.join(entry.expected_subdir);
    if !dir.is_dir() {
        return Err(format!("modelo {} não está instalado em {}", entry.id, dir.display()));
    }

    match entry.id {
        "parakeet-tdt-0.6b-v3-int8" => Ok(AsrModelFiles {
            model_id: entry.id.into(),
            model_type: "nemo_transducer".into(),
            encoder: Some(find_file_ending_with(
                &dir,
                &["encoder.int8.onnx", "encoder.onnx"],
            )?),
            decoder: Some(find_file_ending_with(
                &dir,
                &["decoder.int8.onnx", "decoder.onnx"],
            )?),
            joiner: Some(find_file_ending_with(
                &dir,
                &["joiner.int8.onnx", "joiner.onnx"],
            )?),
            tokens: Some(find_file_ending_with(&dir, &["tokens.txt"])?),
            model: None,
        }),
        "whisper-turbo-int8" => Ok(AsrModelFiles {
            model_id: entry.id.into(),
            model_type: "whisper".into(),
            encoder: Some(find_file_ending_with(
                &dir,
                &[
                    "turbo-encoder.int8.onnx",
                    "encoder.int8.onnx",
                    "turbo-encoder.onnx",
                    "encoder.onnx",
                ],
            )?),
            decoder: Some(find_file_ending_with(
                &dir,
                &[
                    "turbo-decoder.int8.onnx",
                    "decoder.int8.onnx",
                    "turbo-decoder.onnx",
                    "decoder.onnx",
                ],
            )?),
            joiner: None,
            tokens: Some(find_file_ending_with(
                &dir,
                &["turbo-tokens.txt", "tokens.txt"],
            )?),
            model: None,
        }),
        "sense-voice-small-int8" => Ok(AsrModelFiles {
            model_id: entry.id.into(),
            model_type: "sense_voice".into(),
            encoder: None,
            decoder: None,
            joiner: None,
            tokens: Some(find_file_ending_with(&dir, &["tokens.txt"])?),
            model: Some(find_file_ending_with(
                &dir,
                &["model.int8.onnx", "model.onnx"],
            )?),
        }),
        other => Err(format!("modelo ASR sem mapeamento de arquivos: {other}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_nested_files_with_suffixes() {
        let dir = std::env::temp_dir().join(format!("gizmo-model-{}", uuid::Uuid::new_v4()));
        let nested = dir.join("nested");
        std::fs::create_dir_all(&nested).unwrap();
        std::fs::write(nested.join("encoder.int8.onnx"), vec![0u8; 2048]).unwrap();
        let found = find_file_ending_with(&dir, &["encoder.int8.onnx"]).unwrap();
        assert!(found.ends_with("encoder.int8.onnx"));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn reports_missing_models() {
        let dir = std::env::temp_dir().join(format!("gizmo-status-{}", uuid::Uuid::new_v4()));
        let status = models_status(&dir);
        assert!(!status.silero_installed);
        assert!(status.installed_models.is_empty());
        assert_eq!(status.models.len(), 3);
    }
}
