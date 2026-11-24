#![allow(clippy::too_many_arguments)]

mod audio;
mod brain;
mod config;
mod demo;
mod error;
mod scene;
mod storage;

use audio::capture;
use audio::model_downloader;
use audio::model_manifest;
use audio::vad_loop;
use audio::{asr_worker, AsrTranscriptEvent};
use brain::engine::{BrainEngine, BrainStatus};
use brain::sse_client::{build_http_client, test_llm_connection as probe_llm};
use config::{default_config_dir, load_config, save_config as save_config_to_disk, AppConfig, LlmConfig};
use parking_lot::{Mutex, RwLock};
use scene::{BeatSummary, SceneGraph, SceneOp};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use storage::SqliteStore;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or_default()
}

struct AudioRuntime {
    stop_flag: Arc<AtomicBool>,
    threads: Vec<std::thread::JoinHandle<()>>,
}

pub struct AppState {
    app: AppHandle,
    config_path: PathBuf,
    models_dir: PathBuf,
    config: Arc<RwLock<AppConfig>>,
    scene: Arc<Mutex<SceneGraph>>,
    store: SqliteStore,
    brain: Arc<BrainEngine>,
    session_id: Arc<RwLock<Option<String>>>,
    audio: Mutex<Option<AudioRuntime>>,
    muted: Arc<AtomicBool>,
    events_tx: tokio::sync::mpsc::UnboundedSender<AsrTranscriptEvent>,
    demo_running: Arc<AtomicBool>,
    downloads: Mutex<HashSet<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DemoDonePayload {
    session_id: String,
}

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

#[tauri::command]
fn get_config(state: State<'_, AppState>) -> Result<AppConfig, String> {
    Ok(state.config.read().clone())
}

#[tauri::command]
fn save_config(state: State<'_, AppState>, config: AppConfig) -> Result<(), String> {
    let mut config = config;
    config.normalize();
    save_config_to_disk(&state.config_path, &config).map_err(err)?;
    *state.config.write() = config.clone();
    let _ = state.app.global_shortcut().unregister_all();
    register_shortcuts(&state.app, &config);
    let _ = state.app.emit("config:updated", &config);
    Ok(())
}

#[tauri::command]
fn list_audio_devices() -> Result<Vec<audio::AudioDeviceInfo>, String> {
    capture::list_audio_devices()
}

#[tauri::command]
fn get_models_status(state: State<'_, AppState>) -> Result<model_manifest::ModelsStatusReport, String> {
    Ok(model_manifest::models_status(&state.models_dir))
}

#[tauri::command]
async fn download_model(state: State<'_, AppState>, model_id: String) -> Result<(), String> {
    {
        let mut downloads = state.downloads.lock();
        if !downloads.insert(model_id.clone()) {
            return Err("esse modelo já está sendo baixado".into());
        }
    }
    let app = state.app.clone();
    let dir = state.models_dir.clone();
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(15))
        .timeout(std::time::Duration::from_secs(3600))
        .build()
        .map_err(err)?;
    let result = model_downloader::download_model(&client, &dir, &model_id, move |progress| {
        let _ = app.emit("models:progress", &progress);
    })
    .await;
    state.downloads.lock().remove(&model_id);
    result.map_err(err)
}

#[tauri::command]
async fn test_llm_connection(
    state: State<'_, AppState>,
    llm_cfg: LlmConfig,
) -> Result<brain::sse_client::LlmProbeResult, String> {
    probe_llm(&state.brain.client, &llm_cfg)
        .await
        .map_err(err)
}

#[tauri::command]
async fn list_llm_models(
    state: State<'_, AppState>,
    base_url: String,
    api_key: String,
) -> Result<Vec<String>, String> {
    let trimmed = base_url.trim().trim_end_matches('/');
    let models_url = if trimmed.ends_with("/v1") {
        format!("{trimmed}/models")
    } else if trimmed.ends_with("/chat/completions") {
        trimmed.replace("/chat/completions", "/models")
    } else if trimmed.ends_with("/openai") || trimmed.ends_with("/api") {
        format!("{trimmed}/models")
    } else {
        format!("{trimmed}/v1/models")
    };
    let mut request = state.brain.client.get(&models_url);
    if !api_key.trim().is_empty() {
        request = request.bearer_auth(api_key.trim());
    }
    let response = request.send().await.map_err(|e| format!("falha ao consultar modelos: {e}"))?;
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("servidor respondeu {status}: {body}"));
    }
    let value: serde_json::Value =
        serde_json::from_str(&body).map_err(|e| format!("resposta inválida: {e}"))?;
    let mut models = Vec::new();
    if let Some(items) = value.get("data").and_then(|v| v.as_array()) {
        for item in items {
            if let Some(id) = item.get("id").and_then(|v| v.as_str()) {
                models.push(id.to_string());
            }
        }
    } else if let Some(items) = value.get("models").and_then(|v| v.as_array()) {
        for item in items {
            if let Some(id) = item
                .get("name")
                .or_else(|| item.get("model"))
                .and_then(|v| v.as_str())
            {
                models.push(id.to_string());
            }
        }
    }
    models.sort();
    models.dedup();
    Ok(models)
}

#[tauri::command]
fn start_session(state: State<'_, AppState>, title: Option<String>) -> Result<String, String> {
    if state.audio.lock().is_some() {
        return Err("já existe uma sessão de áudio ativa".into());
    }
    let cfg = state.config.read().clone();
    let model_files = model_manifest::model_files(&state.models_dir, &cfg.asr.active_model_id)
        .map_err(|e| format!("{e}. Baixe um modelo no Onboarding/Ajustes."))?;
    let silero_path = model_manifest::silero_onnx_path(&state.models_dir);
    if !silero_path.is_file() {
        return Err("Silero VAD ainda não foi baixado. Abra o Onboarding para instalar os ouvidos locais.".into());
    }

    let vad = vad_loop::create_vad(
        &silero_path,
        cfg.audio.vad_threshold,
        cfg.audio.min_silence_duration_sec,
    )?;
    let recognizer = asr_worker::build_recognizer(&asr_worker::AsrWorkerConfig {
        model_files,
        onnx_threads: cfg.asr.onnx_threads,
        forced_language: cfg.asr.forced_language.clone(),
    })?;

    let (producer, consumer) = rtrb::RingBuffer::<f32>::new(96_000);
    let (partial_tx, partial_rx) = crossbeam_channel::bounded(2);
    let (final_tx, final_rx) = crossbeam_channel::unbounded();

    let stop_flag = Arc::new(AtomicBool::new(false));
    let (ready_tx, ready_rx) = std::sync::mpsc::channel::<Result<u32, String>>();
    let owner_flag = stop_flag.clone();
    let input_device = cfg.audio.input_device_name.clone();
    let audio_thread = std::thread::Builder::new()
        .name("gizmo-audio-owner".into())
        .spawn(move || match capture::start_capture(input_device.as_deref(), producer) {
            Ok(audio_capture) => {
                let _ = ready_tx.send(Ok(audio_capture.sample_rate));
                while !owner_flag.load(Ordering::Relaxed) {
                    std::thread::sleep(std::time::Duration::from_millis(20));
                }
                drop(audio_capture);
            }
            Err(e) => {
                let _ = ready_tx.send(Err(e));
            }
        })
        .map_err(err)?;

    let native_sample_rate = match ready_rx.recv_timeout(std::time::Duration::from_secs(8)) {
        Ok(Ok(rate)) => rate,
        Ok(Err(e)) => {
            let _ = audio_thread.join();
            return Err(e);
        }
        Err(_) => {
            stop_flag.store(true, Ordering::Relaxed);
            let _ = audio_thread.join();
            return Err("tempo esgotado ao abrir o microfone".into());
        }
    };

    let vad_thread = match vad_loop::spawn_vad_loop(
        vad_loop::VadLoopConfig {
            native_sample_rate,
            vad_threshold: cfg.audio.vad_threshold,
            min_silence_duration: cfg.audio.min_silence_duration_sec,
            partial_tick_ms: cfg.audio.partial_tick_ms as u64,
            muted: state.muted.clone(),
            stop_flag: stop_flag.clone(),
        },
        consumer,
        partial_tx,
        final_tx,
        state.app.clone(),
        vad,
    ) {
        Ok(thread) => thread,
        Err(e) => {
            stop_flag.store(true, Ordering::Relaxed);
            let _ = audio_thread.join();
            return Err(e);
        }
    };

    let asr_thread = match asr_worker::spawn_asr_worker(
        recognizer,
        partial_rx,
        final_rx,
        stop_flag.clone(),
        state.events_tx.clone(),
        state.app.clone(),
    ) {
        Ok(thread) => thread,
        Err(e) => {
            stop_flag.store(true, Ordering::Relaxed);
            let _ = audio_thread.join();
            let _ = vad_thread.join();
            return Err(e);
        }
    };

    let session_id = uuid::Uuid::new_v4().to_string();
    let session_title = title.unwrap_or_else(|| "Aula ao vivo".to_string());
    if let Err(e) = state
        .store
        .create_session(&session_id, &session_title, cfg.canvas.default_theme.as_str())
    {
        stop_flag.store(true, Ordering::Relaxed);
        let _ = audio_thread.join();
        let _ = vad_thread.join();
        let _ = asr_thread.join();
        return Err(err(e));
    }
    {
        let mut scene = state.scene.lock();
        *scene = SceneGraph::new(&session_id, cfg.canvas.default_theme);
    }
    *state.session_id.write() = Some(session_id.clone());
    state.brain.reset_session();
    state.muted.store(false, Ordering::Relaxed);
    *state.audio.lock() = Some(AudioRuntime {
        stop_flag,
        threads: vec![audio_thread, vad_thread, asr_thread],
    });
    state.brain.emit_snapshot();
    let _ = state.app.emit("session:started", &session_id);
    Ok(session_id)
}

#[tauri::command]
fn stop_session(state: State<'_, AppState>) -> Result<(), String> {
    let runtime = state.audio.lock().take();
    if let Some(runtime) = runtime {
        runtime.stop_flag.store(true, Ordering::Relaxed);
        for thread in runtime.threads {
            let _ = thread.join();
        }
    }
    state.brain.save_beat("Fim da aula");
    if let Some(session) = state.session_id.write().take() {
        let _ = state.store.end_session(&session);
        let _ = state
            .store
            .update_snapshot(&session, &state.scene.lock().snapshot_json());
    }
    state.brain.reset_session();
    state.muted.store(false, Ordering::Relaxed);
    let _ = state.app.emit("session:stopped", ());
    Ok(())
}

#[tauri::command]
fn set_mute(state: State<'_, AppState>, muted: bool) -> Result<(), String> {
    state.muted.store(muted, Ordering::Relaxed);
    let _ = state.app.emit("audio:muted", muted);
    Ok(())
}

#[tauri::command]
fn get_scene_snapshot(state: State<'_, AppState>) -> Result<SceneGraph, String> {
    Ok(state.scene.lock().clone())
}

#[tauri::command]
fn dispatch_manual_prompt(state: State<'_, AppState>, text: String) -> Result<(), String> {
    let clean = text.trim().to_string();
    if clean.is_empty() {
        return Ok(());
    }
    state.brain.dispatch_manual(clean);
    Ok(())
}

#[tauri::command]
fn apply_manual_op(state: State<'_, AppState>, op: SceneOp) -> Result<(), String> {
    state.brain.apply_op(&op, true);
    Ok(())
}

#[tauri::command]
fn list_beats(state: State<'_, AppState>, session_id: String) -> Result<Vec<BeatSummary>, String> {
    state.store.list_beats(&session_id).map_err(err)
}

#[tauri::command]
fn restore_beat_snapshot(state: State<'_, AppState>, beat_id: i64) -> Result<SceneGraph, String> {
    let snapshot = state
        .store
        .restore_beat(beat_id)
        .map_err(err)?
        .ok_or_else(|| "beat não encontrado".to_string())?;
    let graph: SceneGraph =
        serde_json::from_str(&snapshot).map_err(|e| format!("snapshot inválido: {e}"))?;
    {
        let mut scene = state.scene.lock();
        *scene = graph.clone();
    }
    state.brain.emit_snapshot();
    Ok(graph)
}

#[tauri::command]
fn open_projector_window(state: State<'_, AppState>, transparent: bool) -> Result<(), String> {
    open_projector(&state.app, transparent)
}

fn open_projector(app: &AppHandle, transparent: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("projector") {
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }
    let mut builder = WebviewWindowBuilder::new(
        app,
        "projector",
        WebviewUrl::App(
            if transparent {
                "index.html?window=projector&transparent=1"
            } else {
                "index.html?window=projector"
            }
            .into(),
        ),
    )
    .title("Gizmo — Projetor")
    .inner_size(1280.0, 720.0)
    .min_inner_size(640.0, 360.0)
    .resizable(true)
    .decorations(false);
    if transparent {
        builder = builder.transparent(true);
    }
    builder.build().map_err(err)?;
    Ok(())
}

fn ensure_session(state: &AppState, title: &str) -> String {
    if let Some(session) = state.session_id.read().clone() {
        return session;
    }
    let session = uuid::Uuid::new_v4().to_string();
    let theme = state.config.read().canvas.default_theme;
    let _ = state.store.create_session(&session, title, theme.as_str());
    *state.session_id.write() = Some(session.clone());
    *state.scene.lock() = SceneGraph::new(&session, theme);
    state.brain.reset_session();
    state.brain.emit_snapshot();
    session
}

#[tauri::command]
async fn run_demo_lecture(state: State<'_, AppState>) -> Result<(), String> {
    if state.demo_running.swap(true, Ordering::SeqCst) {
        return Err("a aula demo já está rodando".into());
    }
    let session = ensure_session(&state, "Aula Demo");
    let app = state.app.clone();
    let scene = state.scene.clone();
    let store = state.store.clone();
    let brain = state.brain.clone();
    let flag = state.demo_running.clone();
    let session_for_task = session.clone();
    tauri::async_runtime::spawn(async move {
        let result = demo::simulator::run_demo(
            app.clone(),
            scene,
            store,
            brain,
            session_for_task.clone(),
        )
        .await;
        if let Err(e) = result {
            let _ = app.emit("brain:status", BrainStatus {
                state: "error".into(),
                model: "demo".into(),
                ttft_ms: None,
                first_op_ms: None,
                error: Some(e),
            });
        }
        flag.store(false, Ordering::SeqCst);
        let _ = app.emit("demo:done", DemoDonePayload { session_id: session_for_task });
    });
    Ok(())
}

#[tauri::command]
fn export_session_html(
    state: State<'_, AppState>,
    session_id: String,
    target_path: String,
) -> Result<(), String> {
    let beats = state.store.list_beats_with_snapshots(&session_id).map_err(err)?;
    let transcript = state.store.list_utterances(&session_id).map_err(err)?;
    let title = state
        .store
        .session_title(&session_id)
        .map_err(err)?
        .unwrap_or_else(|| "Aula Gizmo".to_string());
    scene::exporter::write_session_html(
        std::path::Path::new(&target_path),
        &title,
        &beats,
        &transcript,
    )
    .map_err(err)
}

fn register_shortcuts(app: &AppHandle, config: &AppConfig) {
    let mute = config.shortcuts.toggle_mute.clone();
    if let Err(e) = app.global_shortcut().on_shortcut(mute.as_str(), move |app, _, event| {
        if event.state == ShortcutState::Pressed {
            let state = app.state::<AppState>();
            let previous = state.muted.fetch_xor(true, Ordering::SeqCst);
            let _ = app.emit("audio:muted", !previous);
        }
    }) {
        tracing::warn!("atalho de mute indisponível: {e}");
    }

    let clear = config.shortcuts.clear_canvas.clone();
    if let Err(e) = app.global_shortcut().on_shortcut(clear.as_str(), move |app, _, event| {
        if event.state == ShortcutState::Pressed {
            let state = app.state::<AppState>();
            state.brain.apply_op(&SceneOp::Clear { keep_title: None }, true);
        }
    }) {
        tracing::warn!("atalho de limpar canvas indisponível: {e}");
    }

    let projector = config.shortcuts.open_projector.clone();
    if let Err(e) = app
        .global_shortcut()
        .on_shortcut(projector.as_str(), move |app, _, event| {
            if event.state == ShortcutState::Pressed {
                if let Err(err) = open_projector(app, false) {
                    tracing::warn!("falha ao abrir projetor: {err}");
                }
            }
        })
    {
        tracing::warn!("atalho do projetor indisponível: {e}");
    }
}

fn build_state(app: &AppHandle) -> Result<AppState, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| default_config_dir());
    std::fs::create_dir_all(&data_dir).map_err(err)?;
    let config_path = data_dir.join("config.json");
    let models_dir = data_dir.join("models");
    std::fs::create_dir_all(&models_dir).ok();
    let mut config = load_config(&config_path);
    config.normalize();
    if !config_path.exists() {
        let _ = save_config_to_disk(&config_path, &config);
    }

    let db_path = data_dir.join("sessions.sqlite");
    let store = match SqliteStore::open(&db_path) {
        Ok(store) => store,
        Err(e) => {
            tracing::warn!("SQLite indisponível ({e}); usando memória");
            SqliteStore::in_memory().map_err(err)?
        }
    };

    let config = Arc::new(RwLock::new(config.clone()));
    let theme = config.read().canvas.default_theme;
    let scene = Arc::new(Mutex::new(SceneGraph::new("boot", theme)));
    let session_id = Arc::new(RwLock::new(None::<String>));
    let muted = Arc::new(AtomicBool::new(false));
    let client = build_http_client().map_err(err)?;
    let (events_tx, mut events_rx) = tokio::sync::mpsc::unbounded_channel();

    let brain = Arc::new(BrainEngine::new(
        app.clone(),
        scene.clone(),
        store.clone(),
        client,
        config.clone(),
        session_id.clone(),
    ));

    let brain_for_events = brain.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = events_rx.recv().await {
            brain_for_events.handle_transcript(event);
        }
    });

    Ok(AppState {
        app: app.clone(),
        config_path,
        models_dir,
        config,
        scene,
        store,
        brain,
        session_id,
        audio: Mutex::new(None),
        muted,
        events_tx,
        demo_running: Arc::new(AtomicBool::new(false)),
        downloads: Mutex::new(HashSet::new()),
    })
}

pub fn run() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "gizmo=info,tauri=warn".into()),
        )
        .with_target(false)
        .try_init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            let state = build_state(app.handle()).map_err(|e| -> Box<dyn std::error::Error> {
                e.into()
            })?;
            let config = state.config.read().clone();
            app.manage(state);
            register_shortcuts(app.handle(), &config);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_config,
            list_audio_devices,
            get_models_status,
            download_model,
            test_llm_connection,
            list_llm_models,
            start_session,
            stop_session,
            set_mute,
            get_scene_snapshot,
            dispatch_manual_prompt,
            apply_manual_op,
            list_beats,
            restore_beat_snapshot,
            open_projector_window,
            run_demo_lecture,
            export_session_html
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Gizmo");
}


