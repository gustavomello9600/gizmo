use crate::brain::prompts::{build_messages, format_turn, ChatMessage};
use std::time::{Duration, Instant};
use tokio_util::sync::CancellationToken;

const FILLERS: &[&str] = &[
    "é", "eh", "então", "entao", "tipo", "assim", "ok", "certo", "hum", "hã", "ah",
    "bom", "bem", "né", "ne", "you know", "like", "um", "uh", "er",
];

const BARGE_IN_MARKERS: &[&str] = &[
    "não, espera", "nao, espera", "esquece isso", "mudando de assunto", "actually wait",
    "deixa pra lá", "deixa pra la", "não era isso", "nao era isso", "outra coisa",
];

pub enum Dispatch {
    Start(String),
    None,
}

struct InFlight {
    started_at: Instant,
    ops_emitted: u32,
    cancel: CancellationToken,
}

pub struct Scheduler {
    pending: String,
    last_partial_text: String,
    in_flight: Option<InFlight>,
    last_completed_at: Instant,
    history: Vec<(String, String)>,
    checkpoint: Option<String>,
    turns_since_checkpoint: u32,
    pub last_ttft_ms: Option<u64>,
    pub last_first_op_ms: Option<u64>,
}

impl Default for Scheduler {
    fn default() -> Self {
        Self::new()
    }
}

impl Scheduler {
    pub fn new() -> Self {
        Self {
            pending: String::new(),
            last_partial_text: String::new(),
            in_flight: None,
            last_completed_at: Instant::now(),
            history: Vec::new(),
            checkpoint: None,
            turns_since_checkpoint: 0,
            last_ttft_ms: None,
            last_first_op_ms: None,
        }
    }

    pub fn reset(&mut self) {
        *self = Self::new();
    }

    pub fn is_in_flight(&self) -> bool {
        self.in_flight.is_some()
    }

    pub fn cancel_token(&self) -> Option<CancellationToken> {
        self.in_flight.as_ref().map(|f| f.cancel.clone())
    }

    pub fn cancel_current(&mut self) {
        if let Some(in_flight) = self.in_flight.take() {
            in_flight.cancel.cancel();
        }
    }

    pub fn on_partial(&mut self, text: &str, now: Instant) -> Dispatch {
        let text = text.trim();
        if text.is_empty() {
            return Dispatch::None;
        }
        let new_suffix = if let Some(suffix) = text.strip_prefix(self.last_partial_text.as_str()) {
            suffix.trim().to_string()
        } else {
            text.to_string()
        };
        self.last_partial_text = text.to_string();
        if new_suffix.is_empty() {
            return Dispatch::None;
        }
        self.append_pending(&new_suffix);
        if self.in_flight.is_some() {
            return Dispatch::None;
        }
        if now.duration_since(self.last_completed_at) < Duration::from_millis(950) {
            return Dispatch::None;
        }
        let words = self.pending.split_whitespace().count();
        if words >= 9 {
            let dispatch = self.pending.trim().to_string();
            self.pending.clear();
            if dispatch.is_empty() {
                Dispatch::None
            } else {
                Dispatch::Start(dispatch)
            }
        } else {
            Dispatch::None
        }
    }

    pub fn on_final(&mut self, text: &str) -> Dispatch {
        let text = text.trim();
        if text.is_empty() {
            return Dispatch::None;
        }
        let new_text = if let Some(suffix) = text.strip_prefix(self.last_partial_text.as_str()) {
            suffix.trim().to_string()
        } else {
            text.to_string()
        };
        self.last_partial_text.clear();
        self.append_pending(&new_text);
        if self.in_flight.is_some() {
            return Dispatch::None;
        }
        let cleaned = self
            .pending
            .to_lowercase()
            .replace(['á', 'ã', 'â', 'à'], "a")
            .replace(['é', 'ê'], "e")
            .replace("…", "")
            .replace('.', " ")
            .replace(',', " ");
        let words: Vec<&str> = cleaned.split_whitespace().collect();
        let meaningful = words.iter().any(|w| !FILLERS.contains(w));
        if meaningful && words.len() >= 3 {
            let dispatch = self.pending.trim().to_string();
            self.pending.clear();
            Dispatch::Start(dispatch)
        } else {
            Dispatch::None
        }
    }

    pub fn manual(&mut self, text: &str) -> Dispatch {
        let text = text.trim();
        if text.is_empty() {
            return Dispatch::None;
        }
        if self.pending.is_empty() {
            self.pending.push_str(text);
        } else {
            self.pending.push(' ');
            self.pending.push_str(text);
        }
        if self.in_flight.is_some() {
            Dispatch::None
        } else {
            let dispatch = self.pending.trim().to_string();
            self.pending.clear();
            Dispatch::Start(dispatch)
        }
    }

    pub fn request_barge_in(&mut self, text: &str, now: Instant) -> bool {
        let Some(in_flight) = self.in_flight.as_ref() else {
            return false;
        };
        let lower = text.to_lowercase();
        let marker = BARGE_IN_MARKERS.iter().any(|m| lower.contains(m));
        let stalled = in_flight.ops_emitted == 0
            && in_flight.started_at.elapsed() > Duration::from_millis(2500)
            && self.pending.split_whitespace().count() > 35;
        if marker || stalled {
            let cancel = in_flight.cancel.clone();
            self.in_flight = None;
            cancel.cancel();
            let _ = now;
            true
        } else {
            false
        }
    }

    pub fn begin(&mut self, _speech: &str) -> CancellationToken {
        let cancel = CancellationToken::new();
        self.in_flight = Some(InFlight {
            started_at: Instant::now(),
            ops_emitted: 0,
            cancel: cancel.clone(),
        });
        cancel
    }

    pub fn record_op(&mut self) {
        if let Some(in_flight) = self.in_flight.as_mut() {
            in_flight.ops_emitted += 1;
        }
    }

    pub fn set_latency(&mut self, ttft_ms: Option<u64>, first_op_ms: Option<u64>) {
        self.last_ttft_ms = ttft_ms;
        self.last_first_op_ms = first_op_ms;
    }

    pub fn finish(
        &mut self,
        user_turn: String,
        assistant_raw: String,
        scene_digest: &str,
        last_speech: &str,
        now: Instant,
    ) -> Dispatch {
        self.in_flight = None;
        self.last_completed_at = now;
        if !assistant_raw.trim().is_empty() {
            self.history
                .push((user_turn, assistant_raw.trim().to_string()));
        }
        self.turns_since_checkpoint += 1;
        if self.turns_since_checkpoint >= 12 {
            self.compact(scene_digest, last_speech);
        }
        if self.pending.split_whitespace().count() >= 4 {
            let dispatch = self.pending.trim().to_string();
            self.pending.clear();
            Dispatch::Start(dispatch)
        } else {
            Dispatch::None
        }
    }

    fn append_pending(&mut self, text: &str) {
        if text.trim().is_empty() {
            return;
        }
        if !self.pending.is_empty() {
            self.pending.push(' ');
        }
        self.pending.push_str(text.trim());
        if self.pending.len() > 6000 {
            self.pending = self.pending.chars().rev().take(6000).collect::<String>().chars().rev().collect();
        }
    }

    fn compact(&mut self, scene_digest: &str, last_speech: &str) {
        let keep_from = self.history.len().saturating_sub(4);
        self.history = self.history[keep_from..].to_vec();
        self.checkpoint = Some(format!(
            "Tema/cena: {}. Última fala: \"{}\"",
            scene_digest.lines().take(4).collect::<Vec<_>>().join(" | "),
            last_speech.chars().take(220).collect::<String>()
        ));
        self.turns_since_checkpoint = 0;
    }

    pub fn messages(&self, scene_digest: &str, speech: &str) -> Vec<ChatMessage> {
        let current = format_turn(scene_digest, speech);
        build_messages(self.checkpoint.as_deref(), &self.history, &current)
    }

    pub fn current_turn(&self, scene_digest: &str, speech: &str) -> String {
        format_turn(scene_digest, speech)
    }

    pub fn pending_words(&self) -> usize {
        self.pending.split_whitespace().count()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn final_clause_dispatches() {
        let mut s = Scheduler::new();
        assert!(matches!(s.on_final("a derivada da função é 2x"), Dispatch::Start(_)));
        assert!(s.is_in_flight() == false);
    }

    #[test]
    fn partial_requires_long_suffix_and_time() {
        let mut s = Scheduler::new();
        let now = Instant::now();
        assert!(matches!(
            s.on_partial("uma duas três quatro cinco seis sete oito nove", now),
            Dispatch::None
        ));
        let later = now + Duration::from_millis(1000);
        assert!(matches!(
            s.on_partial("uma duas três quatro cinco seis sete oito nove dez", later),
            Dispatch::Start(_)
        ));
    }

    #[test]
    fn single_flight_accumulates_pending() {
        let mut s = Scheduler::new();
        let _ = s.begin("primeira");
        assert!(matches!(s.on_final("segunda frase completa aqui"), Dispatch::None));
        let next = s.finish(
            "turno".into(),
            "{\"op\":\"noop\"}".into(),
            "theme: 3b1b",
            "segunda",
            Instant::now(),
        );
        assert!(matches!(next, Dispatch::Start(_)));
    }

    #[test]
    fn barge_in_cancels() {
        let mut s = Scheduler::new();
        let cancel = s.begin("algo");
        assert!(s.request_barge_in("não, espera, outra coisa", Instant::now()));
        assert!(cancel.is_cancelled());
        assert!(!s.is_in_flight());
    }
}
