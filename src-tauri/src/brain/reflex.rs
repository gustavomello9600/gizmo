use crate::audio::AsrTranscriptEvent;
use crate::scene::{HighlightStyle, SceneGraph, SceneOp, ThemeId};
use once_cell::sync::Lazy;
use regex::Regex;
use serde_json::Value;
use std::collections::{HashMap, HashSet};

#[derive(Debug, Default)]
pub struct ReflexResult {
    pub ops: Vec<SceneOp>,
    pub unlock_theme: bool,
    pub matched: Vec<String>,
}

pub struct ReflexEngine {
    command_cooldowns: HashMap<&'static str, u64>,
    node_cooldowns: HashMap<String, u64>,
}

static RE_CLEAR: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\b(limpar? (a )?(tela|lousa|quadro)|apagar? tudo|clear (the )?(board|screen|canvas))\b").unwrap()
});
static RE_THEME_MATH: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\b(modo|estilo|tema) (matem[aá]tica|3b1b|manim)\b").unwrap()
});
static RE_THEME_WHITEBOARD: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\b(modo|estilo|tema) (lousa branca|whiteboard)\b").unwrap()
});
static RE_THEME_FLIPCHART: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\b(modo|estilo|tema) (flipchart|neg[oó]cios)\b").unwrap()
});
static RE_THEME_TED: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\b(modo|estilo|tema) (palestra|ted|slides?|keynote)\b").unwrap()
});
static RE_THEME_BLUEPRINT: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\b(modo|estilo|tema) (blueprint|arquitetura|c[oó]digo)\b").unwrap()
});
static RE_THEME_CHALK: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\b(modo|estilo|tema) (quadro (negro|verde)|giz|chalkboard)\b").unwrap()
});
static RE_THEME_AUTO: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\b(tema autom[aá]tico|destravar tema|auto theme)\b").unwrap()
});
static RE_FOCUS_CUE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\b(repare|repara|veja|olhem|olhe|aqui no|aqui na|nesse|nessa|neste|nesta|look at|notice|focus on|no passo|na etapa|preste aten[cç][aã]o|presta aten[cç][aã]o)\b").unwrap()
});
static WORD_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"[\p{L}\p{N}%][\p{L}\p{N}%_\-\.]*").unwrap());

const STOPWORDS: &[&str] = &[
    "para", "com", "que", "the", "and", "uma", "um", "dos", "das", "por", "como", "mais",
    "menos", "isso", "este", "esta", "esse", "essa", "aqui", "ali", "onde", "quando", "então",
    "entao", "mas", "não", "nao", "sim", "nos", "nas", "seu", "sua", "ele", "ela", "foi",
    "ser", "ter", "tem", "vai", "são", "sao", "pelo", "pela", "the", "of", "to", "in", "on",
    "at", "for", "with", "this", "that", "from", "are", "was", "were", "you", "your",
];

impl Default for ReflexEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl ReflexEngine {
    pub fn new() -> Self {
        Self {
            command_cooldowns: HashMap::new(),
            node_cooldowns: HashMap::new(),
        }
    }

    pub fn process(
        &mut self,
        event: &AsrTranscriptEvent,
        scene: &SceneGraph,
        now_ms: u64,
    ) -> ReflexResult {
        let mut result = ReflexResult::default();
        let text = event.text.trim();
        if text.is_empty() {
            return result;
        }

        let commands: [(&'static str, &Lazy<Regex>, ThemeId); 6] = [
            ("theme-3b1b", &RE_THEME_MATH, ThemeId::ThreeBlueOneBrown),
            ("theme-whiteboard", &RE_THEME_WHITEBOARD, ThemeId::Whiteboard),
            ("theme-flipchart", &RE_THEME_FLIPCHART, ThemeId::Flipchart),
            ("theme-ted", &RE_THEME_TED, ThemeId::Ted),
            ("theme-blueprint", &RE_THEME_BLUEPRINT, ThemeId::Blueprint),
            ("theme-chalkboard", &RE_THEME_CHALK, ThemeId::Chalkboard),
        ];

        if self.cooldown_ready("clear", now_ms, 2000) && RE_CLEAR.is_match(text) {
            self.command_cooldowns.insert("clear", now_ms);
            result.ops.push(SceneOp::Clear { keep_title: None });
            result.matched.push("clear".into());
            return result;
        }

        for (name, re, theme) in commands {
            if !self.cooldown_ready(name, now_ms, 2000) {
                continue;
            }
            if re.is_match(text) {
                self.command_cooldowns.insert(name, now_ms);
                result.ops.push(SceneOp::Theme {
                    style: theme,
                    locked: Some(true),
                });
                result.matched.push(name.into());
                return result;
            }
        }

        if self.cooldown_ready("theme-auto", now_ms, 2000) && RE_THEME_AUTO.is_match(text) {
            self.command_cooldowns.insert("theme-auto", now_ms);
            result.unlock_theme = true;
            result.matched.push("theme-auto".into());
            return result;
        }

        // Spotlight deítico: só depois dos comandos explícitos.
        let cue = RE_FOCUS_CUE.is_match(text);
        let normalized_text = normalize(text);
        for node in scene.nodes.values() {
            if let Some(last) = self.node_cooldowns.get(&node.id) {
                if now_ms.saturating_sub(*last) < 4000 {
                    continue;
                }
            }
            let keywords = node_keywords(node);
            let title_hit = node
                .title
                .as_deref()
                .map(|title| {
                    let normalized_title = normalize(title);
                    normalized_title.len() >= 3 && normalized_text.contains(&normalized_title)
                })
                .unwrap_or(false);
            let keyword_hit = keywords
                .iter()
                .any(|keyword| normalized_text.contains(keyword));
            if title_hit || (cue && keyword_hit) {
                self.node_cooldowns.insert(node.id.clone(), now_ms);
                result.ops.push(SceneOp::Highlight {
                    id: node.id.clone(),
                    target: None,
                    style: Some(HighlightStyle::Pulse),
                    ttl_ms: Some(2400),
                });
                result.matched.push(format!("spotlight:{}", node.id));
                break;
            }
        }

        result
    }

    fn cooldown_ready(&self, key: &str, now_ms: u64, cooldown_ms: u64) -> bool {
        match self.command_cooldowns.get(key) {
            Some(last) => now_ms.saturating_sub(*last) >= cooldown_ms,
            None => true,
        }
    }

    pub fn clear_cooldowns(&mut self) {
        self.command_cooldowns.clear();
        self.node_cooldowns.clear();
    }
}

pub fn normalize(text: &str) -> String {
    text.to_lowercase()
        .chars()
        .map(|c| match c {
            'á' | 'à' | 'â' | 'ã' | 'ä' | 'å' => 'a',
            'é' | 'è' | 'ê' | 'ë' => 'e',
            'í' | 'ì' | 'î' | 'ï' => 'i',
            'ó' | 'ò' | 'ô' | 'õ' | 'ö' => 'o',
            'ú' | 'ù' | 'û' | 'ü' => 'u',
            'ç' => 'c',
            'ñ' => 'n',
            'ý' | 'ÿ' => 'y',
            _ => c,
        })
        .collect()
}

fn node_keywords(node: &crate::scene::SceneNode) -> HashSet<String> {
    let mut keywords = HashSet::new();
    if let Some(title) = &node.title {
        collect_keywords(title, &mut keywords);
    }
    collect_json_keywords(&node.data, &mut keywords, 0);
    keywords
}

fn collect_keywords(text: &str, out: &mut HashSet<String>) {
    for word in WORD_RE.find_iter(text) {
        let normalized = normalize(word.as_str());
        if normalized.chars().count() >= 3 && !STOPWORDS.contains(&normalized.as_str()) {
            out.insert(normalized);
        }
    }
}

fn collect_json_keywords(value: &Value, out: &mut HashSet<String>, depth: usize) {
    if depth > 2 {
        return;
    }
    match value {
        Value::String(text) => {
            // Ignore LaTeX commands puros ("frac", "sqrt") e URLs.
            if !text.starts_with("http") {
                collect_keywords(text, out);
            }
        }
        Value::Array(items) => {
            for item in items.iter().take(20) {
                collect_json_keywords(item, out, depth + 1);
            }
        }
        Value::Object(map) => {
            for (key, item) in map.iter().take(20) {
                if !matches!(key.as_str(), "color" | "icon" | "id" | "type" | "expression") {
                    collect_json_keywords(item, out, depth + 1);
                }
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio::AsrTranscriptEvent;
    use crate::scene::{NodeKind, SemanticZone, SceneGraph, SceneOp, ThemeId};

    fn event(text: &str, is_final: bool) -> AsrTranscriptEvent {
        AsrTranscriptEvent {
            utterance_id: "u_00001".into(),
            text: text.into(),
            is_final,
            duration_ms: 900,
            latency_ms: 42,
            language: Some("pt".into()),
            mean_rms: 0.08,
        }
    }

    #[test]
    fn test_reflex_voice_commands_pt_and_en() {
        let scene = SceneGraph::new("s1", ThemeId::Whiteboard);
        let mut reflex = ReflexEngine::new();
        let result = reflex.process(&event("vamos limpar a lousa", true), &scene, 0);
        assert!(result.ops.iter().any(|op| matches!(op, SceneOp::Clear { .. })));
        let result = reflex.process(&event("modo matemática", true), &scene, 3000);
        assert!(result.ops.iter().any(|op| matches!(op, SceneOp::Theme { style: ThemeId::ThreeBlueOneBrown, locked: Some(true) })));
        let result = reflex.process(&event("clear screen", true), &scene, 7000);
        assert!(result.ops.iter().any(|op| matches!(op, SceneOp::Clear { .. })));
    }

    #[test]
    fn test_reflex_deictic_spotlight() {
        let mut scene = SceneGraph::new("s1", ThemeId::ThreeBlueOneBrown);
        scene.apply_auto(
            &SceneOp::Upsert {
                id: "hip".into(),
                kind: NodeKind::Math,
                zone: SemanticZone::Right,
                title: Some("Hipotenusa".into()),
                pinned: None,
                data: serde_json::json!({"latex":"c^2 = a^2 + b^2"}),
            },
            0,
        );
        let mut reflex = ReflexEngine::new();
        let started = std::time::Instant::now();
        let result = reflex.process(&event("repare na hipotenusa", false), &scene, 10);
        assert!(started.elapsed().as_millis() < 12);
        match result.ops.first() {
            Some(SceneOp::Highlight { id, .. }) => assert_eq!(id, "hip"),
            other => panic!("esperava highlight, veio {other:?}"),
        }
    }

    #[test]
    fn test_auto_theme_command_unlocks() {
        let scene = SceneGraph::new("s1", ThemeId::ThreeBlueOneBrown);
        let mut reflex = ReflexEngine::new();
        let result = reflex.process(&event("destravar tema", true), &scene, 0);
        assert!(result.unlock_theme);
    }
}
