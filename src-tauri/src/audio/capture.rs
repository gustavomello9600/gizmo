use crate::audio::AudioDeviceInfo;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::SampleFormat;
use rtrb::Producer;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

pub struct AudioCapture {
    pub stream: cpal::Stream,
    pub sample_rate: u32,
    pub channels: u16,
    pub device_name: String,
    pub dropped_samples: Arc<AtomicU64>,
}

pub fn list_audio_devices() -> Result<Vec<AudioDeviceInfo>, String> {
    let host = cpal::default_host();
    let default_name = host
        .default_input_device()
        .and_then(|device| device.name().ok());
    let devices = host
        .input_devices()
        .map_err(|e| format!("não foi possível listar microfones: {e}"))?;
    let mut result = Vec::new();
    for device in devices {
        let Ok(name) = device.name() else {
            continue;
        };
        let (channels, sample_rate, sample_format) = match device.default_input_config() {
            Ok(config) => (
                config.channels(),
                config.sample_rate().0,
                format!("{:?}", config.sample_format()),
            ),
            Err(_) => (0, 0, "desconhecido".into()),
        };
        result.push(AudioDeviceInfo {
            is_default: default_name.as_deref() == Some(name.as_str()),
            name,
            channels,
            sample_rate,
            sample_format,
        });
    }
    Ok(result)
}

/// Inicia a captura nativa. O callback do `cpal` apenas converte para mono e
/// empurra no ring buffer lock-free: zero Mutex, zero alocação, zero log.
pub fn start_capture(
    device_name: Option<&str>,
    producer: Producer<f32>,
) -> Result<AudioCapture, String> {
    let host = cpal::default_host();
    let device = match device_name {
        Some(name) if !name.trim().is_empty() && name != "default" => host
            .input_devices()
            .map_err(|e| e.to_string())?
            .find(|device| device.name().ok().as_deref() == Some(name))
            .ok_or_else(|| format!("microfone '{name}' não encontrado"))?,
        _ => host
            .default_input_device()
            .ok_or_else(|| "nenhum microfone de entrada disponível".to_string())?,
    };

    let resolved_name = device.name().unwrap_or_else(|_| "Microfone".into());
    let supported = device
        .default_input_config()
        .map_err(|e| format!("não foi possível obter a configuração do microfone: {e}"))?;
    let sample_format = supported.sample_format();
    let config: cpal::StreamConfig = supported.into();
    let channels = config.channels as usize;
    let sample_rate = config.sample_rate.0;
    let dropped = Arc::new(AtomicU64::new(0));
    let err_fn = |err| tracing::error!("erro no stream de áudio: {err}");

    let stream = match sample_format {
        SampleFormat::F32 => {
            let mut producer = producer;
            let dropped = dropped.clone();
            device.build_input_stream(
                &config,
                move |data: &[f32], _| push_f32(data, channels, &mut producer, &dropped),
                err_fn,
                None,
            )
        }
        SampleFormat::I16 => {
            let mut producer = producer;
            let dropped = dropped.clone();
            device.build_input_stream(
                &config,
                move |data: &[i16], _| {
                    push_converted(data, channels, &mut producer, &dropped, |s| {
                        s as f32 / 32768.0
                    })
                },
                err_fn,
                None,
            )
        }
        SampleFormat::U16 => {
            let mut producer = producer;
            let dropped = dropped.clone();
            device.build_input_stream(
                &config,
                move |data: &[u16], _| {
                    push_converted(data, channels, &mut producer, &dropped, |s| {
                        (s as f32 - 32768.0) / 32768.0
                    })
                },
                err_fn,
                None,
            )
        }
        other => {
            return Err(format!(
                "formato de amostra não suportado: {other:?} (use F32, I16 ou U16)"
            ))
        }
    }
    .map_err(|e| format!("falha ao abrir stream de entrada: {e}"))?;

    stream
        .play()
        .map_err(|e| format!("falha ao iniciar captura: {e}"))?;

    Ok(AudioCapture {
        stream,
        sample_rate,
        channels: channels as u16,
        device_name: resolved_name,
        dropped_samples: dropped,
    })
}

fn push_f32(data: &[f32], channels: usize, producer: &mut Producer<f32>, dropped: &AtomicU64) {
    if channels == 0 {
        return;
    }
    for frame in data.chunks_exact(channels) {
        let mut sum = 0.0f32;
        for sample in frame {
            sum += *sample;
        }
        if producer.push(sum / channels as f32).is_err() {
            dropped.fetch_add(1, Ordering::Relaxed);
        }
    }
}

fn push_converted<T: Copy>(
    data: &[T],
    channels: usize,
    producer: &mut Producer<f32>,
    dropped: &AtomicU64,
    convert: impl Fn(T) -> f32,
) {
    if channels == 0 {
        return;
    }
    for frame in data.chunks_exact(channels) {
        let mut sum = 0.0f32;
        for sample in frame {
            sum += convert(*sample);
        }
        if producer.push(sum / channels as f32).is_err() {
            dropped.fetch_add(1, Ordering::Relaxed);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mixdown_is_average_of_channels() {
        let (mut producer, mut consumer) = rtrb::RingBuffer::<f32>::new(16);
        let dropped = AtomicU64::new(0);
        let data = [0.5f32, -0.5, 1.0, 1.0];
        push_f32(&data, 2, &mut producer, &dropped);
        assert_eq!(consumer.pop().unwrap(), 0.0);
        assert_eq!(consumer.pop().unwrap(), 1.0);
        assert_eq!(dropped.load(Ordering::Relaxed), 0);
    }
}
