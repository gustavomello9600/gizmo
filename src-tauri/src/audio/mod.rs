pub mod asr_worker;
pub mod capture;
pub mod model_downloader;
pub mod model_manifest;
pub mod vad_loop;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AsrTranscriptEvent {
    pub utterance_id: String,
    pub text: String,
    pub is_final: bool,
    pub duration_ms: u32,
    pub latency_ms: u32,
    pub language: Option<String>,
    pub mean_rms: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioLevel {
    pub rms: f32,
    pub peak: f32,
    pub speaking: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDeviceInfo {
    pub name: String,
    pub is_default: bool,
    pub channels: u16,
    pub sample_rate: u32,
    pub sample_format: String,
}

#[derive(Debug, Clone)]
pub enum AsrJob {
    Partial {
        utterance_id: String,
        samples: Vec<f32>,
    },
    Final {
        utterance_id: String,
        samples: Vec<f32>,
        duration_ms: u32,
    },
}

impl AsrJob {
    pub fn is_final(&self) -> bool {
        matches!(self, Self::Final { .. })
    }
}

/// Filtro anti-alucinação de silêncio/ruído estacionário.
pub fn sanitize_transcript(raw: &str, mean_rms: f32) -> Option<String> {
    let mut text = raw
        .replace("<|nospeech|>", " ")
        .replace("<|startoftranscript|>", " ")
        .replace("<|endoftext|>", " ")
        .replace("<|transcribe|>", " ");
    // Tokens especiais do SenseVoice: <|emo:...|>, <|lang:...|>, <|itn|> etc.
    if let Ok(re) = regex::Regex::new(r"<\|[^|>]{0,40}\|>") {
        text = re.replace_all(&text, " ").to_string();
    }
    let clean = text
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string();
    if clean.is_empty() || mean_rms < 0.0025 {
        return None;
    }
    let lower = clean.to_lowercase();
    let blacklist = [
        "thank you.",
        "thanks for watching.",
        "subtitles by",
        "legendas pela comunidade",
        "amara.org",
        "obrigado por assistir",
        "you",
        ".",
        "...",
        "-",
        "thank you",
        "obrigado.",
    ];
    if blacklist.contains(&lower.as_str()) {
        return None;
    }
    Some(clean)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_filters_silence_and_hallucinations() {
        assert!(sanitize_transcript("Ola turma", 0.0001).is_none());
        assert!(sanitize_transcript("Thank you.", 0.2).is_none());
        assert_eq!(
            sanitize_transcript("<|nospeech|> Vamos estudar a derivada ", 0.2).as_deref(),
            Some("Vamos estudar a derivada")
        );
    }
}
