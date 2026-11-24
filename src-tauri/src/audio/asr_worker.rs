use crate::audio::model_manifest::AsrModelFiles;
use crate::audio::{sanitize_transcript, AsrJob, AsrTranscriptEvent};
use crossbeam_channel::Receiver;
use sherpa_onnx::{
    OfflineRecognizer, OfflineRecognizerConfig, OfflineSenseVoiceModelConfig,
    OfflineTransducerModelConfig, OfflineWhisperModelConfig,
};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::Emitter;

#[derive(Debug, Clone)]
pub struct AsrWorkerConfig {
    pub model_files: AsrModelFiles,
    pub onnx_threads: i32,
    pub forced_language: Option<String>,
}

pub fn build_recognizer(config: &AsrWorkerConfig) -> Result<OfflineRecognizer, String> {
    let files = &config.model_files;
    let mut recognizer_config = OfflineRecognizerConfig::default();
    recognizer_config.model_config.num_threads = config.onnx_threads.clamp(1, 8);
    recognizer_config.model_config.provider = Some("cpu".into());
    recognizer_config.model_config.debug = false;
    recognizer_config.model_config.tokens = files
        .tokens
        .as_ref()
        .map(|p| p.to_string_lossy().into_owned());

    match files.model_type.as_str() {
        "nemo_transducer" => {
            recognizer_config.model_config.transducer = OfflineTransducerModelConfig {
                encoder: files
                    .encoder
                    .as_ref()
                    .map(|p| p.to_string_lossy().into_owned()),
                decoder: files
                    .decoder
                    .as_ref()
                    .map(|p| p.to_string_lossy().into_owned()),
                joiner: files
                    .joiner
                    .as_ref()
                    .map(|p| p.to_string_lossy().into_owned()),
            };
            recognizer_config.model_config.model_type = Some("nemo_transducer".into());
        }
        "whisper" => {
            recognizer_config.model_config.whisper = OfflineWhisperModelConfig {
                encoder: files
                    .encoder
                    .as_ref()
                    .map(|p| p.to_string_lossy().into_owned()),
                decoder: files
                    .decoder
                    .as_ref()
                    .map(|p| p.to_string_lossy().into_owned()),
                language: Some(
                    config
                        .forced_language
                        .clone()
                        .unwrap_or_default(),
                ),
                task: Some("transcribe".into()),
                tail_paddings: 800,
                ..Default::default()
            };
        }
        "sense_voice" => {
            recognizer_config.model_config.sense_voice = OfflineSenseVoiceModelConfig {
                model: files
                    .model
                    .as_ref()
                    .map(|p| p.to_string_lossy().into_owned()),
                language: Some("auto".into()),
                use_itn: true,
            };
        }
        other => return Err(format!("tipo de modelo ASR não suportado: {other}")),
    }

    let recognizer = OfflineRecognizer::create(&recognizer_config)
        .ok_or_else(|| "não foi possível carregar o modelo ASR (verifique os arquivos .onnx)".to_string())?;

    // Warm-up: força ONNX a alocar arenas e compilar kernels antes da 1ª fala.
    let stream = recognizer.create_stream();
    stream.accept_waveform(16_000, &vec![0.0f32; 8_000]);
    recognizer.decode(&stream);
    let _ = stream.get_result();
    Ok(recognizer)
}

pub fn spawn_asr_worker(
    recognizer: OfflineRecognizer,
    partial_rx: Receiver<AsrJob>,
    final_rx: Receiver<AsrJob>,
    stop_flag: Arc<AtomicBool>,
    events_tx: tokio::sync::mpsc::UnboundedSender<AsrTranscriptEvent>,
    app: tauri::AppHandle,
) -> Result<std::thread::JoinHandle<()>, String> {
    std::thread::Builder::new()
        .name("gizmo-asr".into())
        .spawn(move || {
            run_asr_worker(
                recognizer,
                partial_rx,
                final_rx,
                stop_flag,
                events_tx,
                app,
            );
        })
        .map_err(|e| format!("falha ao criar thread de ASR: {e}"))
}

fn run_asr_worker(
    recognizer: OfflineRecognizer,
    partial_rx: Receiver<AsrJob>,
    final_rx: Receiver<AsrJob>,
    stop_flag: Arc<AtomicBool>,
    events_tx: tokio::sync::mpsc::UnboundedSender<AsrTranscriptEvent>,
    app: tauri::AppHandle,
) {
    while !stop_flag.load(Ordering::Relaxed) {
        if let Ok(job) = final_rx.try_recv() {
            process_job(&recognizer, job, true, &events_tx, &app);
            continue;
        }
        crossbeam_channel::select! {
            recv(final_rx) -> msg => {
                if let Ok(job) = msg {
                    process_job(&recognizer, job, true, &events_tx, &app);
                }
            }
            recv(partial_rx) -> msg => {
                if let Ok(job) = msg {
                    process_job(&recognizer, job, false, &events_tx, &app);
                }
            }
            default(Duration::from_millis(20)) => {}
        }
    }
    // Drena finais pendentes ao encerrar.
    while let Ok(job) = final_rx.try_recv() {
        process_job(&recognizer, job, true, &events_tx, &app);
    }
    tracing::info!("thread de ASR encerrada");
}

fn process_job(
    recognizer: &OfflineRecognizer,
    job: AsrJob,
    is_final: bool,
    events_tx: &tokio::sync::mpsc::UnboundedSender<AsrTranscriptEvent>,
    app: &tauri::AppHandle,
) {
    let (utterance_id, samples, duration_ms) = match job {
        AsrJob::Partial {
            utterance_id,
            samples,
        } => {
            let duration = (samples.len() as u64 * 1000 / 16_000) as u32;
            (utterance_id, samples, duration)
        }
        AsrJob::Final {
            utterance_id,
            samples,
            duration_ms,
        } => (utterance_id, samples, duration_ms),
    };
    if samples.len() < 1_600 {
        return;
    }
    let mean_rms = (samples.iter().map(|s| s * s).sum::<f32>() / samples.len() as f32).sqrt();
    let started = Instant::now();
    let stream = recognizer.create_stream();
    stream.accept_waveform(16_000, &samples);
    recognizer.decode(&stream);
    let result = stream.get_result();
    let latency_ms = started.elapsed().as_millis().min(u32::MAX as u128) as u32;
    let raw = result
        .as_ref()
        .map(|r| r.text.clone())
        .unwrap_or_default();
    let language = result
        .as_ref()
        .map(|r| r.lang.clone())
        .filter(|lang| !lang.trim().is_empty());

    let Some(text) = sanitize_transcript(&raw, mean_rms) else {
        return;
    };

    let event = AsrTranscriptEvent {
        utterance_id,
        text,
        is_final,
        duration_ms,
        latency_ms,
        language,
        mean_rms,
    };
    let event_name = if is_final { "asr:final" } else { "asr:partial" };
    if let Err(err) = app.emit(event_name, &event) {
        tracing::warn!("falha ao emitir {event_name}: {err}");
    }
    if let Err(err) = events_tx.send(event) {
        tracing::warn!("canal do cérebro fechado: {err}");
    }
}
