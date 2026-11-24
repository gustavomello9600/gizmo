use crate::audio::AsrTranscriptEvent;
use crate::brain::{
    Dispatch, LocalThemeClassifier, NdjsonStreamParser, ReflexEngine, Scheduler, stream_chat,
};
use crate::config::AppConfig;
use crate::scene::{SceneGraph, SceneOp};
use crate::storage::SqliteStore;
use parking_lot::{Mutex, RwLock};
use serde::Serialize;
use std::sync::Arc;
use std::time::Instant;
use tauri::{AppHandle, Emitter};
use tokio_util::sync::CancellationToken;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrainStatus {
    pub state: String,
    pub model: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ttft_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub first_op_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub struct BrainEngine {
    pub app: AppHandle,
    pub scene: Arc<Mutex<SceneGraph>>,
    pub store: SqliteStore,
    pub client: reqwest::Client,
    pub config: Arc<RwLock<AppConfig>>,
    pub scheduler: Mutex<Scheduler>,
    pub reflex: Mutex<ReflexEngine>,
    pub classifier: Mutex<LocalThemeClassifier>,
    pub session_id: Arc<RwLock<Option<String>>>,
}

impl BrainEngine {
    pub fn new(
        app: AppHandle,
        scene: Arc<Mutex<SceneGraph>>,
        store: SqliteStore,
        client: reqwest::Client,
        config: Arc<RwLock<AppConfig>>,
        session_id: Arc<RwLock<Option<String>>>,
    ) -> Self {
        Self {
            app,
            scene,
            store,
            client,
            config,
            scheduler: Mutex::new(Scheduler::new()),
            reflex: Mutex::new(ReflexEngine::new()),
            classifier: Mutex::new(LocalThemeClassifier::new()),
            session_id,
        }
    }

    pub fn save_beat(&self, label: &str) {
        let Some(session) = self.session_id.read().clone() else {
            return;
        };
        let snapshot = self.scene.lock().snapshot_json();
        if let Err(err) = self.store.save_beat(&session, label, &snapshot) {
            tracing::warn!("falha ao salvar beat: {err}");
        }
        let _ = self.app.emit("beats:updated", ());
    }

    pub fn apply_op(&self, op: &SceneOp, manual: bool) -> bool {
        if matches!(op, SceneOp::Clear { .. }) {
            self.save_beat("Antes de limpar");
        }
        let changed = {
            let mut scene = self.scene.lock();
            scene.apply(op, crate::now_ms(), manual).changed
        };
        if changed {
            let _ = self.app.emit("scene:op", op);
        }
        changed
    }

    pub fn emit_snapshot(&self) {
        let scene = self.scene.lock();
        let _ = self.app.emit("scene:snapshot", &*scene);
    }

    pub fn reset_session(&self) {
        self.scheduler.lock().reset();
        self.reflex.lock().clear_cooldowns();
        self.classifier.lock().reset();
    }

    pub fn handle_transcript(self: &Arc<Self>, event: AsrTranscriptEvent) {
        if let Some(session) = self.session_id.read().clone() {
            let _ = self.store.record_utterance(
                &session,
                &event.utterance_id,
                &event.text,
                event.is_final,
                event.latency_ms,
            );
        }

        let (ops, unlock_theme) = {
            let scene = self.scene.lock();
            let mut reflex = self.reflex.lock();
            let result = reflex.process(&event, &scene, crate::now_ms());
            (result.ops, result.unlock_theme)
        };
        for op in ops {
            self.apply_op(&op, true);
        }
        if unlock_theme {
            {
                let mut scene = self.scene.lock();
                scene.set_theme_locked(false);
            }
            self.emit_snapshot();
        }

        if event.is_final {
            let can_classify = {
                let scene = self.scene.lock();
                !scene.theme_locked && !scene.theme_auto_detected
            };
            if can_classify && self.config.read().canvas.auto_detect_theme {
                let classified = self.classifier.lock().observe(&event.text);
                if let Some(theme) = classified {
                    let op = SceneOp::Theme {
                        style: theme,
                        locked: Some(false),
                    };
                    self.apply_op(&op, true);
                    let mut scene = self.scene.lock();
                    scene.theme_auto_detected = true;
                }
            }
        }

        let now = Instant::now();
        let dispatch = {
            let mut scheduler = self.scheduler.lock();
            if scheduler.is_in_flight() {
                scheduler.request_barge_in(&event.text, now);
            }
            if event.is_final {
                scheduler.on_final(&event.text)
            } else {
                scheduler.on_partial(&event.text, now)
            }
        };
        if let Dispatch::Start(speech) = dispatch {
            self.spawn_turn(speech);
        }
    }

    pub fn dispatch_manual(self: &Arc<Self>, text: String) {
        let dispatch = {
            let mut scheduler = self.scheduler.lock();
            if scheduler.is_in_flight() {
                scheduler.request_barge_in(&text, Instant::now());
            }
            scheduler.manual(&text)
        };
        if let Dispatch::Start(speech) = dispatch {
            self.spawn_turn(speech);
        }
    }

    fn spawn_turn(self: &Arc<Self>, speech: String) {
        if self.config.read().llm.base_url.trim().is_empty() {
            self.emit_status("error", None, None, Some("Configure um endpoint OpenAI-compatível nas Ajustes.".into()));
            return;
        }
        let cancel = self.scheduler.lock().begin(&speech);
        let engine = self.clone();
        tokio::spawn(async move {
            engine.run_turn(speech, cancel).await;
        });
    }

    async fn run_turn(self: Arc<Self>, speech: String, cancel: CancellationToken) {
        let llm = self.config.read().llm.clone();
        let digest = self.scene.lock().digest(1500);
        let (messages, user_turn) = {
            let scheduler = self.scheduler.lock();
            (
                scheduler.messages(&digest, &speech),
                scheduler.current_turn(&digest, &speech),
            )
        };
        self.emit_status("streaming", None, None, None);

        let mut parser = NdjsonStreamParser::new();
        let mut raw = String::new();
        let started = Instant::now();
        let mut ttft_ms: Option<u64> = None;
        let mut first_op_ms: Option<u64> = None;
        let mut ops_count = 0usize;
        let turn_token = cancel.clone();

        let result = stream_chat(&self.client, &llm, &messages, cancel, |delta| {
            if ttft_ms.is_none() {
                ttft_ms = Some(started.elapsed().as_millis() as u64);
            }
            raw.push_str(delta);
            for op in parser.push_chunk(delta) {
                ops_count += 1;
                self.apply_op(&op, false);
                if first_op_ms.is_none() {
                    first_op_ms = Some(started.elapsed().as_millis() as u64);
                }
                self.scheduler.lock().record_op();
            }
        })
        .await;

        for op in parser.flush() {
            ops_count += 1;
            self.apply_op(&op, false);
        }

        if turn_token.is_cancelled() {
            tracing::debug!("turno cancelado; estado já pertence a outro turno");
            return;
        }

        match result {
            Ok(()) => {
                self.scheduler.lock().set_latency(ttft_ms, first_op_ms);
                let next = self.scheduler.lock().finish(
                    user_turn,
                    raw,
                    &digest,
                    &speech,
                    Instant::now(),
                );
                if ops_count > 0 {
                    self.save_beat(&format!("Beat: {}", truncate(&speech, 48)));
                }
                self.emit_status("idle", ttft_ms, first_op_ms, None);
                if let Dispatch::Start(next_speech) = next {
                    self.spawn_turn(next_speech);
                }
            }
            Err(err) => {
                self.scheduler.lock().finish(
                    user_turn,
                    raw,
                    &digest,
                    &speech,
                    Instant::now(),
                );
                self.emit_status("error", ttft_ms, first_op_ms, Some(err.to_string()));
            }
        }
    }

    fn emit_status(
        &self,
        state: &str,
        ttft_ms: Option<u64>,
        first_op_ms: Option<u64>,
        error: Option<String>,
    ) {
        let model = self.config.read().llm.model.clone();
        let _ = self.app.emit(
            "brain:status",
            BrainStatus {
                state: state.into(),
                model,
                ttft_ms,
                first_op_ms,
                error,
            },
        );
    }
}

fn truncate(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        text.to_string()
    } else {
        text.chars().take(max).collect::<String>() + "…"
    }
}
