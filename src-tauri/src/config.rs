use crate::error::{AppError, AppResult};
use crate::scene::ThemeId;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioConfig {
    #[serde(default)]
    pub input_device_name: Option<String>,
    #[serde(default = "default_vad_threshold")]
    pub vad_threshold: f32,
    #[serde(default = "default_min_silence")]
    pub min_silence_duration_sec: f32,
    #[serde(default = "default_partial_tick")]
    pub partial_tick_ms: u32,
}

fn default_vad_threshold() -> f32 {
    0.45
}
fn default_min_silence() -> f32 {
    0.28
}
fn default_partial_tick() -> u32 {
    400
}

impl Default for AudioConfig {
    fn default() -> Self {
        Self {
            input_device_name: None,
            vad_threshold: default_vad_threshold(),
            min_silence_duration_sec: default_min_silence(),
            partial_tick_ms: default_partial_tick(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AsrConfig {
    #[serde(default = "default_model_id")]
    pub active_model_id: String,
    #[serde(default)]
    pub forced_language: Option<String>,
    #[serde(default = "default_onnx_threads")]
    pub onnx_threads: i32,
}

fn default_model_id() -> String {
    "parakeet-tdt-0.6b-v3-int8".into()
}
fn default_onnx_threads() -> i32 {
    3
}

impl Default for AsrConfig {
    fn default() -> Self {
        Self {
            active_model_id: default_model_id(),
            forced_language: None,
            onnx_threads: default_onnx_threads(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmConfig {
    #[serde(default = "default_base_url")]
    pub base_url: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default = "default_llm_model")]
    pub model: String,
    #[serde(default = "default_temperature")]
    pub temperature: f32,
    #[serde(default = "default_max_tokens")]
    pub max_tokens: u32,
    #[serde(default = "default_true")]
    pub disable_thinking: bool,
}

fn default_base_url() -> String {
    "http://127.0.0.1:11434/v1".into()
}
fn default_llm_model() -> String {
    "qwen2.5:7b-instruct".into()
}
fn default_temperature() -> f32 {
    0.2
}
fn default_max_tokens() -> u32 {
    512
}
fn default_true() -> bool {
    true
}

impl Default for LlmConfig {
    fn default() -> Self {
        Self {
            base_url: default_base_url(),
            api_key: String::new(),
            model: default_llm_model(),
            temperature: default_temperature(),
            max_tokens: default_max_tokens(),
            disable_thinking: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasConfig {
    #[serde(default = "default_theme")]
    pub default_theme: ThemeId,
    #[serde(default = "default_true")]
    pub auto_detect_theme: bool,
    #[serde(default = "default_true")]
    pub show_mascot_in_projector: bool,
    #[serde(default)]
    pub projector_chroma_bg: Option<String>,
    #[serde(default)]
    pub projector_transparent: bool,
}

fn default_theme() -> ThemeId {
    ThemeId::Whiteboard
}

impl Default for CanvasConfig {
    fn default() -> Self {
        Self {
            default_theme: ThemeId::Whiteboard,
            auto_detect_theme: true,
            show_mascot_in_projector: true,
            projector_chroma_bg: None,
            projector_transparent: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutsConfig {
    #[serde(default = "default_toggle_mute")]
    pub toggle_mute: String,
    #[serde(default = "default_clear_canvas")]
    pub clear_canvas: String,
    #[serde(default = "default_open_projector")]
    pub open_projector: String,
}

fn default_toggle_mute() -> String {
    "CommandOrControl+Shift+M".into()
}
fn default_clear_canvas() -> String {
    "CommandOrControl+Shift+K".into()
}
fn default_open_projector() -> String {
    "CommandOrControl+Shift+P".into()
}

impl Default for ShortcutsConfig {
    fn default() -> Self {
        Self {
            toggle_mute: default_toggle_mute(),
            clear_canvas: default_clear_canvas(),
            open_projector: default_open_projector(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    #[serde(default)]
    pub audio: AudioConfig,
    #[serde(default)]
    pub asr: AsrConfig,
    #[serde(default)]
    pub llm: LlmConfig,
    #[serde(default)]
    pub canvas: CanvasConfig,
    #[serde(default)]
    pub shortcuts: ShortcutsConfig,
}

impl AppConfig {
    pub fn normalize(&mut self) {
        self.audio.vad_threshold = self.audio.vad_threshold.clamp(0.15, 0.85);
        self.audio.min_silence_duration_sec = self.audio.min_silence_duration_sec.clamp(0.18, 1.2);
        self.audio.partial_tick_ms = self.audio.partial_tick_ms.clamp(250, 1200);
        self.asr.onnx_threads = self.asr.onnx_threads.clamp(1, 8);
        self.llm.temperature = self.llm.temperature.clamp(0.0, 1.0);
        self.llm.max_tokens = self.llm.max_tokens.clamp(128, 2048);
        if self.llm.base_url.trim().is_empty() {
            self.llm.base_url = default_base_url();
        }
        if self.llm.model.trim().is_empty() {
            self.llm.model = default_llm_model();
        }
    }
}

pub fn default_config_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| std::env::temp_dir())
        .join("app.gizmo.companion")
}

pub fn default_models_dir() -> PathBuf {
    default_config_dir().join("models")
}

pub fn default_db_path() -> PathBuf {
    default_config_dir().join("sessions.sqlite")
}

/// Leitura tolerante: config corrompida nunca impede o app de abrir.
pub fn load_config(path: &Path) -> AppConfig {
    match std::fs::read_to_string(path) {
        Ok(raw) => match serde_json::from_str::<AppConfig>(&raw) {
            Ok(mut cfg) => {
                cfg.normalize();
                cfg
            }
            Err(err) => {
                tracing::warn!("config.json inválida ({err}); usando padrões");
                AppConfig::default()
            }
        },
        Err(_) => AppConfig::default(),
    }
}

/// Escrita atômica: escreve em arquivo temporário e renomeia.
pub fn save_config(path: &Path, config: &AppConfig) -> AppResult<()> {
    let mut config = config.clone();
    config.normalize();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("json.tmp");
    let raw = serde_json::to_string_pretty(&config)?;
    std::fs::write(&tmp, raw)?;
    std::fs::rename(&tmp, path).map_err(|e| AppError::Config(e.to_string()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_roundtrip_and_clamp() {
        let dir = std::env::temp_dir().join(format!("gizmo-cfg-{}", uuid::Uuid::new_v4()));
        let path = dir.join("config.json");
        let mut cfg = AppConfig::default();
        cfg.llm.temperature = 4.0;
        save_config(&path, &cfg).expect("save");
        let loaded = load_config(&path);
        assert_eq!(loaded.llm.temperature, 1.0);
        assert_eq!(loaded.canvas.default_theme, ThemeId::Whiteboard);
        let _ = std::fs::remove_dir_all(dir);
    }
}
