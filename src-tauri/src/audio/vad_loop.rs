use crate::audio::{AsrJob, AudioLevel};
use crossbeam_channel::Sender;
use rubato::{FastFixedIn, PolynomialDegree, Resampler};
use sherpa_onnx::{SileroVadModelConfig, VadModelConfig, VoiceActivityDetector};
use std::collections::VecDeque;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::Emitter;

const SAMPLE_RATE: usize = 16_000;
const FRAME_SAMPLES: usize = 512;
const PRE_ROLL_SAMPLES: usize = 4_800;
const MAX_PARTIAL_SAMPLES: usize = 96_000;

pub struct VadLoopConfig {
    pub native_sample_rate: u32,
    pub vad_threshold: f32,
    pub min_silence_duration: f32,
    pub partial_tick_ms: u64,
    pub muted: Arc<AtomicBool>,
    pub stop_flag: Arc<AtomicBool>,
}

pub fn create_vad(
    silero_model_path: &Path,
    threshold: f32,
    min_silence_duration: f32,
) -> Result<VoiceActivityDetector, String> {
    if !silero_model_path.is_file() {
        return Err(format!(
            "Silero VAD não encontrado em {}",
            silero_model_path.display()
        ));
    }
    let config = VadModelConfig {
        silero_vad: SileroVadModelConfig {
            model: Some(silero_model_path.to_string_lossy().into_owned()),
            threshold,
            min_speech_duration: 0.20,
            min_silence_duration,
            window_size: FRAME_SAMPLES as i32,
            max_speech_duration: 8.0,
        },
        sample_rate: SAMPLE_RATE as i32,
        num_threads: 1,
        provider: Some("cpu".into()),
        debug: false,
        ..Default::default()
    };
    VoiceActivityDetector::create(&config, 30.0)
        .ok_or_else(|| "não foi possível carregar o Silero VAD v5".to_string())
}

#[allow(clippy::too_many_arguments)]
pub fn spawn_vad_loop(
    config: VadLoopConfig,
    mut consumer: rtrb::Consumer<f32>,
    partial_tx: Sender<AsrJob>,
    final_tx: Sender<AsrJob>,
    app: tauri::AppHandle,
    vad: VoiceActivityDetector,
) -> Result<std::thread::JoinHandle<()>, String> {
    let resampler = if config.native_sample_rate == SAMPLE_RATE as u32 {
        None
    } else {
        let chunk_size = (config.native_sample_rate as usize / 50).max(64);
        let ratio = SAMPLE_RATE as f64 / config.native_sample_rate as f64;
        Some(
            FastFixedIn::<f32>::new(
                ratio,
                1.1,
                PolynomialDegree::Septic,
                chunk_size,
                1,
            )
            .map_err(|e| format!("não foi possível criar o reamostrador: {e}"))?,
        )
    };

    std::thread::Builder::new()
        .name("gizmo-vad".into())
        .spawn(move || {
            run_vad_loop(
                config,
                &mut consumer,
                partial_tx,
                final_tx,
                app,
                vad,
                resampler,
            );
        })
        .map_err(|e| format!("falha ao criar thread de VAD: {e}"))
}

struct ActiveUtterance {
    id: String,
    live: Vec<f32>,
}

fn run_vad_loop(
    config: VadLoopConfig,
    consumer: &mut rtrb::Consumer<f32>,
    partial_tx: Sender<AsrJob>,
    final_tx: Sender<AsrJob>,
    app: tauri::AppHandle,
    vad: VoiceActivityDetector,
    mut resampler: Option<FastFixedIn<f32>>,
) {
    let native_rate = config.native_sample_rate as usize;
    let resample_chunk = if resampler.is_some() {
        (native_rate / 50).max(64)
    } else {
        0
    };

    let mut pcm16k: VecDeque<f32> = VecDeque::with_capacity(SAMPLE_RATE * 2);
    let mut native_buf: Vec<f32> = Vec::with_capacity(resample_chunk * 2);
    let mut pre_roll: VecDeque<f32> = VecDeque::with_capacity(PRE_ROLL_SAMPLES);
    let mut active: Option<ActiveUtterance> = None;
    let mut counter: u32 = 0;
    let mut ema_rms = 0.0f32;
    let mut last_level = Instant::now() - Duration::from_secs(1);
    let mut last_partial = Instant::now();
    let mut was_muted = false;

    let mut next_id = |counter: &mut u32| -> String {
        *counter += 1;
        format!("u_{:05}", *counter)
    };

    loop {
        if config.stop_flag.load(Ordering::Relaxed) {
            break;
        }

        let mut drained = 0usize;
        while let Ok(sample) = consumer.pop() {
            native_buf.push(sample);
            drained += 1;
            if native_buf.len() > native_rate * 2 {
                break;
            }
        }
        if drained == 0 {
            std::thread::sleep(Duration::from_millis(10));
        }

        if let Some(resampler) = resampler.as_mut() {
            while native_buf.len() >= resample_chunk {
                let chunk: Vec<f32> = native_buf.drain(..resample_chunk).collect();
                match resampler.process(&[chunk], None) {
                    Ok(mut output) => {
                        if let Some(channel) = output.first_mut() {
                            pcm16k.extend(channel.drain(..));
                        }
                    }
                    Err(err) => {
                        tracing::warn!("reamostrador falhou: {err}");
                        native_buf.clear();
                        break;
                    }
                }
            }
        } else {
            pcm16k.extend(native_buf.drain(..));
        }

        // Limita o buffer a 2s para nunca crescer sem controle.
        while pcm16k.len() > SAMPLE_RATE * 2 {
            pcm16k.pop_front();
        }

        while pcm16k.len() >= FRAME_SAMPLES {
            let mut frame = [0.0f32; FRAME_SAMPLES];
            for sample in frame.iter_mut() {
                if let Some(value) = pcm16k.pop_front() {
                    *sample = value;
                }
            }
            process_frame(
                &config,
                &app,
                &vad,
                &partial_tx,
                &final_tx,
                &mut pre_roll,
                &mut active,
                &mut counter,
                &mut ema_rms,
                &mut last_level,
                &mut last_partial,
                &mut was_muted,
                &mut next_id,
                &frame,
            );
        }
    }

    vad.flush();
    drain_segments(&vad, &final_tx, &mut active, &mut counter, &mut next_id);
    if let Some(active) = active.take() {
        if active.live.len() > SAMPLE_RATE / 4 {
            let duration_ms = (active.live.len() as u64 * 1000 / SAMPLE_RATE as u64) as u32;
            let _ = final_tx.send(AsrJob::Final {
                utterance_id: active.id,
                samples: active.live,
                duration_ms,
            });
        }
    }
    let _ = app.emit(
        "audio:level",
        AudioLevel {
            rms: 0.0,
            peak: 0.0,
            speaking: false,
        },
    );
    tracing::info!("thread de VAD encerrada");
}

#[allow(clippy::too_many_arguments)]
fn process_frame(
    config: &VadLoopConfig,
    app: &tauri::AppHandle,
    vad: &VoiceActivityDetector,
    partial_tx: &Sender<AsrJob>,
    final_tx: &Sender<AsrJob>,
    pre_roll: &mut VecDeque<f32>,
    active: &mut Option<ActiveUtterance>,
    counter: &mut u32,
    ema_rms: &mut f32,
    last_level: &mut Instant,
    last_partial: &mut Instant,
    was_muted: &mut bool,
    next_id: &mut impl FnMut(&mut u32) -> String,
    frame: &[f32; FRAME_SAMPLES],
) {
    let mut sum_sq = 0.0f32;
    let mut peak = 0.0f32;
    for sample in frame {
        sum_sq += sample * sample;
        peak = peak.max(sample.abs());
    }
    let rms = (sum_sq / FRAME_SAMPLES as f32).sqrt();
    *ema_rms = 0.7 * *ema_rms + 0.3 * rms;

    let muted = config.muted.load(Ordering::Relaxed);
    if muted != *was_muted {
        if muted {
            vad.reset();
            active.take();
            pre_roll.clear();
        }
        *was_muted = muted;
    }

    if last_level.elapsed() >= Duration::from_millis(33) {
        let _ = app.emit(
            "audio:level",
            AudioLevel {
                rms: if muted { 0.0 } else { *ema_rms },
                peak: if muted { 0.0 } else { peak },
                speaking: !muted && vad.detected(),
            },
        );
        *last_level = Instant::now();
    }

    if muted {
        return;
    }

    vad.accept_waveform(frame);
    let detected = vad.detected();

    if detected {
        if active.is_none() {
            let id = next_id(counter);
            let mut live = Vec::with_capacity(PRE_ROLL_SAMPLES + FRAME_SAMPLES);
            live.extend(pre_roll.drain(..));
            live.extend_from_slice(frame);
            *active = Some(ActiveUtterance { id, live });
            *last_partial = Instant::now();
        } else if let Some(current) = active.as_mut() {
            current.live.extend_from_slice(frame);
            if current.live.len() > MAX_PARTIAL_SAMPLES {
                let excess = current.live.len() - MAX_PARTIAL_SAMPLES;
                current.live.drain(..excess);
            }
            if last_partial.elapsed() >= Duration::from_millis(config.partial_tick_ms)
                && current.live.len() >= 9_600
            {
                let _ = partial_tx.try_send(AsrJob::Partial {
                    utterance_id: current.id.clone(),
                    samples: current.live.clone(),
                });
                *last_partial = Instant::now();
            }
        }
    } else {
        if active.is_none() {
            pre_roll.extend(frame.iter().copied());
            while pre_roll.len() > PRE_ROLL_SAMPLES {
                pre_roll.pop_front();
            }
        } else if let Some(current) = active.as_mut() {
            current.live.extend_from_slice(frame);
            if current.live.len() > MAX_PARTIAL_SAMPLES {
                let excess = current.live.len() - MAX_PARTIAL_SAMPLES;
                current.live.drain(..excess);
            }
        }
    }

    drain_segments(vad, final_tx, active, counter, next_id);
}

fn drain_segments(
    vad: &VoiceActivityDetector,
    final_tx: &Sender<AsrJob>,
    active: &mut Option<ActiveUtterance>,
    counter: &mut u32,
    next_id: &mut impl FnMut(&mut u32) -> String,
) {
    while !vad.is_empty() {
        let Some(segment) = vad.front() else {
            break;
        };
        let samples = segment.samples().to_vec();
        let duration_ms = (samples.len() as u64 * 1000 / SAMPLE_RATE as u64) as u32;
        let id = match active.take() {
            Some(current) => current.id,
            None => next_id(counter),
        };
        if !samples.is_empty() {
            let _ = final_tx.send(AsrJob::Final {
                utterance_id: id,
                samples,
                duration_ms,
            });
        }
        vad.pop();
    }
}
