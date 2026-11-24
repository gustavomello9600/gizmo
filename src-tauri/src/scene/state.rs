use super::{
    ActiveHighlight, Camera, EdgeStyle, HighlightStyle, SceneEdge, SceneGraph, SceneNode, SceneOp,
    SemanticZone, ThemeId,
};
use serde_json::{Map, Value};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Default)]
pub struct ApplyOutcome {
    pub changed: bool,
    pub evicted: Vec<String>,
}

impl SceneGraph {
    pub fn new(session_id: impl Into<String>, theme: ThemeId) -> Self {
        Self {
            session_id: session_id.into(),
            revision: 0,
            theme,
            theme_locked: false,
            theme_auto_detected: false,
            title: None,
            subtitle: None,
            camera: Camera::default(),
            nodes: BTreeMap::new(),
            edges: BTreeMap::new(),
            active_highlights: BTreeMap::new(),
        }
    }

    pub fn snapshot_json(&self) -> String {
        serde_json::to_string(self).unwrap_or_else(|_| "{}".into())
    }

    pub fn apply_auto(&mut self, op: &SceneOp, now_ms: u64) -> ApplyOutcome {
        self.apply(op, now_ms, false)
    }

    /// Aplica uma operação. `manual` é verdadeiro para ações explícitas da UI
    /// (ex.: destravar tema pelo seletor do professor).
    pub fn apply(&mut self, op: &SceneOp, now_ms: u64, manual: bool) -> ApplyOutcome {
        let mut outcome = ApplyOutcome::default();
        match op {
            SceneOp::Theme { style, locked } => {
                if self.theme_locked && !manual && *locked != Some(true) {
                    return outcome;
                }
                if manual && *locked == Some(false) {
                    self.theme_locked = false;
                }
                let mut changed = false;
                if self.theme != *style {
                    self.theme = *style;
                    changed = true;
                }
                if *locked == Some(true) && !self.theme_locked {
                    self.theme_locked = true;
                    changed = true;
                }
                if changed {
                    self.theme_auto_detected = false;
                }
                outcome.changed = changed;
            }
            SceneOp::Title { text, subtitle } => {
                let new_subtitle = subtitle.clone();
                if self.title.as_deref() != Some(text.as_str())
                    || self.subtitle != new_subtitle
                {
                    self.title = Some(text.clone());
                    self.subtitle = new_subtitle;
                    outcome.changed = true;
                }
            }
            SceneOp::Upsert {
                id,
                kind,
                zone,
                title,
                pinned,
                data,
            } => {
                if let Some(existing) = self.nodes.get_mut(id) {
                    existing.kind = *kind;
                    existing.zone = *zone;
                    existing.title = title.clone();
                    if let Some(pinned) = pinned {
                        existing.pinned = *pinned;
                    }
                    existing.data = normalize_data(data);
                    existing.version = existing.version.saturating_add(1);
                    existing.updated_at_ms = now_ms;
                } else {
                    let order_index = self
                        .nodes
                        .values()
                        .map(|n| n.order_index)
                        .max()
                        .map(|v| v + 1)
                        .unwrap_or(0);
                    self.nodes.insert(
                        id.clone(),
                        SceneNode {
                            id: id.clone(),
                            kind: *kind,
                            zone: *zone,
                            title: title.clone(),
                            pinned: pinned.unwrap_or(false),
                            version: 1,
                            order_index,
                            created_at_ms: now_ms,
                            updated_at_ms: now_ms,
                            data: normalize_data(data),
                        },
                    );
                }
                let limit = self.theme.max_nodes();
                while self.nodes.len() > limit {
                    let victim = self
                        .nodes
                        .values()
                        .filter(|n| !n.pinned && n.id != *id)
                        .min_by_key(|n| (n.updated_at_ms, n.order_index))
                        .map(|n| n.id.clone());
                    match victim {
                        Some(victim_id) => {
                            self.remove_node(&victim_id);
                            outcome.evicted.push(victim_id);
                        }
                        None => break,
                    }
                }
                outcome.changed = true;
            }
            SceneOp::Patch {
                id,
                zone,
                title,
                data,
            } => {
                if let Some(node) = self.nodes.get_mut(id) {
                    if let Some(zone) = zone {
                        node.zone = *zone;
                    }
                    if let Some(title) = title {
                        node.title = Some(title.clone());
                    }
                    if let Some(patch) = data {
                        let mut merged = node.data.clone();
                        merge_patch(&mut merged, patch);
                        node.data = merged;
                    }
                    node.version = node.version.saturating_add(1);
                    node.updated_at_ms = now_ms;
                    outcome.changed = true;
                }
            }
            SceneOp::Connect {
                id,
                from,
                to,
                label,
                animated,
                style,
            } => {
                if self.nodes.contains_key(from) && self.nodes.contains_key(to) {
                    let edge = SceneEdge {
                        id: id.clone(),
                        from: from.clone(),
                        to: to.clone(),
                        label: label.clone(),
                        animated: animated.unwrap_or(false),
                        style: style.unwrap_or(EdgeStyle::Solid),
                    };
                    if self.edges.get(id).map(|e| {
                        e.from == edge.from
                            && e.to == edge.to
                            && e.label == edge.label
                            && e.animated == edge.animated
                            && e.style == edge.style
                    }) != Some(true)
                    {
                        self.edges.insert(id.clone(), edge);
                        outcome.changed = true;
                    }
                }
            }
            SceneOp::Highlight {
                id,
                target,
                style,
                ttl_ms,
            } => {
                let ttl = ttl_ms.unwrap_or(2800).clamp(300, 15_000);
                self.active_highlights.insert(
                    id.clone(),
                    ActiveHighlight {
                        target: target.clone(),
                        style: style.unwrap_or(HighlightStyle::Pulse),
                        expires_at_ms: now_ms + ttl,
                    },
                );
                outcome.changed = true;
            }
            SceneOp::Remove { id } => {
                if self.edges.remove(id).is_some() {
                    outcome.changed = true;
                }
                if self.nodes.contains_key(id) {
                    self.remove_node(id);
                    outcome.changed = true;
                }
                if self.active_highlights.remove(id).is_some() {
                    outcome.changed = true;
                }
            }
            SceneOp::Camera { focus, zoom } => {
                let next = Camera {
                    focus: focus.clone(),
                    zoom: if focus == "all" {
                        1.0
                    } else {
                        zoom.unwrap_or(1.0).clamp(0.75, 1.6)
                    },
                };
                if self.camera.focus != next.focus || (self.camera.zoom - next.zoom).abs() > 1e-6 {
                    self.camera = next;
                    outcome.changed = true;
                }
            }
            SceneOp::Clear { keep_title } => {
                self.nodes.clear();
                self.edges.clear();
                self.active_highlights.clear();
                self.camera = Camera::default();
                if *keep_title != Some(true) {
                    self.title = None;
                    self.subtitle = None;
                }
                outcome.changed = true;
            }
            SceneOp::Noop => {}
        }

        if outcome.changed {
            self.revision = self.revision.saturating_add(1);
        }
        outcome
    }

    pub fn remove_node(&mut self, id: &str) {
        self.nodes.remove(id);
        self.edges.retain(|_, edge| edge.from != id && edge.to != id);
        self.active_highlights.remove(id);
    }

    pub fn set_theme_locked(&mut self, locked: bool) {
        if self.theme_locked != locked {
            self.theme_locked = locked;
            self.revision = self.revision.saturating_add(1);
        }
    }

    pub fn cleanup_highlights(&mut self, now_ms: u64) -> bool {
        let before = self.active_highlights.len();
        self.active_highlights
            .retain(|_, h| h.expires_at_ms > now_ms);
        if self.active_highlights.len() != before {
            self.revision = self.revision.saturating_add(1);
            true
        } else {
            false
        }
    }

    /// Resumo compacto da cena para o final da última mensagem `user`.
    /// Nunca entra no system prompt, preservando o prefixo KV-Cache.
    pub fn digest(&self, max_chars: usize) -> String {
        let mut out = String::with_capacity(1024);
        out.push_str(&format!(
            "theme: {} (locked: {})\n",
            self.theme.as_str(),
            self.theme_locked
        ));
        if let Some(title) = &self.title {
            out.push_str(&format!("title: \"{}\"\n", truncate(title, 120)));
        }
        if let Some(subtitle) = &self.subtitle {
            out.push_str(&format!("subtitle: \"{}\"\n", truncate(subtitle, 160)));
        }
        out.push_str("nodes:\n");
        for node in self.nodes.values() {
            let summary = summarize_node(node);
            out.push_str(&format!(
                "- {} ({} @ {}): {}\n",
                node.id,
                kind_str(node),
                zone_str(node.zone),
                truncate(&summary, 180)
            ));
        }
        if !self.edges.is_empty() {
            out.push_str("edges:\n");
            for edge in self.edges.values() {
                out.push_str(&format!(
                    "- {} -> {} {}\n",
                    edge.from,
                    edge.to,
                    edge.label
                        .as_deref()
                        .map(|l| format!("({})", truncate(l, 60)))
                        .unwrap_or_default()
                ));
            }
        }
        if out.chars().count() > max_chars {
            out = out.chars().take(max_chars).collect();
            out.push('…');
        }
        out
    }

    pub fn find_node_by_title(&self, needle: &str) -> Option<&SceneNode> {
        let needle = needle.to_lowercase();
        self.nodes
            .values()
            .find(|node| {
                node.title
                    .as_deref()
                    .map(|t| t.to_lowercase().contains(&needle))
                    .unwrap_or(false)
            })
    }
}

fn normalize_data(value: &Value) -> Value {
    if value.is_object() {
        value.clone()
    } else {
        Value::Object(Map::new())
    }
}

fn kind_str(node: &SceneNode) -> &'static str {
    use super::NodeKind::*;
    match node.kind {
        Math => "math",
        Plot2d => "plot_2d",
        Geometry2d => "geometry_2d",
        Chart => "chart",
        Diagram => "diagram",
        Bullets => "bullets",
        Code => "code",
        Matrix2x2 => "matrix_2x2",
        Funnel => "funnel",
        Timeline => "timeline",
        Kpi => "kpi",
        Comparison => "comparison",
        Callout => "callout",
        FreehandNote => "freehand_note",
    }
}

fn zone_str(zone: SemanticZone) -> &'static str {
    match zone {
        SemanticZone::Hero => "hero",
        SemanticZone::Center => "center",
        SemanticZone::Left => "left",
        SemanticZone::Right => "right",
        SemanticZone::Top => "top",
        SemanticZone::Bottom => "bottom",
        SemanticZone::SplitTl => "split_tl",
        SemanticZone::SplitTr => "split_tr",
        SemanticZone::SplitBl => "split_bl",
        SemanticZone::SplitBr => "split_br",
        SemanticZone::Footer => "footer",
    }
}

fn summarize_node(node: &SceneNode) -> String {
    let data = &node.data;
    match node.kind {
        super::NodeKind::Math => format!(
            "latex={} | caption={}",
            data.get("latex")
                .and_then(Value::as_str)
                .unwrap_or(""),
            data.get("caption")
                .and_then(Value::as_str)
                .unwrap_or("")
        ),
        super::NodeKind::Plot2d => {
            let funcs = data
                .get("functions")
                .and_then(Value::as_array)
                .map(|arr| {
                    arr.iter()
                        .filter_map(|f| f.get("expr").and_then(Value::as_str))
                        .collect::<Vec<_>>()
                        .join(", ")
                })
                .unwrap_or_default();
            format!("functions=[{}]", funcs)
        }
        super::NodeKind::Geometry2d => format!(
            "shapes={}",
            data.get("shapes")
                .and_then(Value::as_array)
                .map(|a| a.len())
                .unwrap_or(0)
        ),
        super::NodeKind::Chart => format!(
            "{} | series={}",
            data.get("chart_type")
                .and_then(Value::as_str)
                .unwrap_or("bar"),
            data.get("series")
                .and_then(Value::as_array)
                .map(|a| {
                    a.iter()
                        .filter_map(|s| s.get("name").and_then(Value::as_str))
                        .collect::<Vec<_>>()
                        .join(", ")
                })
                .unwrap_or_default()
        ),
        super::NodeKind::Diagram => format!(
            "nodes={} | edges={}",
            data.get("nodes")
                .and_then(Value::as_array)
                .map(|a| a.len())
                .unwrap_or(0),
            data.get("edges")
                .and_then(Value::as_array)
                .map(|a| a.len())
                .unwrap_or(0)
        ),
        super::NodeKind::Bullets => format!(
            "items={}",
            data.get("items")
                .and_then(Value::as_array)
                .map(|a| {
                    a.iter()
                        .filter_map(|i| i.get("text").and_then(Value::as_str))
                        .collect::<Vec<_>>()
                        .join(" | ")
                })
                .unwrap_or_default()
        ),
        super::NodeKind::Code => format!(
            "{} | {}",
            data.get("language")
                .and_then(Value::as_str)
                .unwrap_or(""),
            data.get("code")
                .and_then(Value::as_str)
                .unwrap_or("")
                .lines()
                .next()
                .unwrap_or("")
        ),
        super::NodeKind::Matrix2x2 => format!(
            "{} | {} | {} | {}",
            quadrant_title(data, "tl"),
            quadrant_title(data, "tr"),
            quadrant_title(data, "bl"),
            quadrant_title(data, "br")
        ),
        super::NodeKind::Funnel => format!(
            "stages={}",
            data.get("stages")
                .and_then(Value::as_array)
                .map(|a| {
                    a.iter()
                        .filter_map(|s| s.get("label").and_then(Value::as_str))
                        .collect::<Vec<_>>()
                        .join(" > ")
                })
                .unwrap_or_default()
        ),
        super::NodeKind::Timeline => format!(
            "events={}",
            data.get("events")
                .and_then(Value::as_array)
                .map(|a| {
                    a.iter()
                        .filter_map(|e| e.get("title").and_then(Value::as_str))
                        .collect::<Vec<_>>()
                        .join(" | ")
                })
                .unwrap_or_default()
        ),
        super::NodeKind::Kpi => format!(
            "{} | {}",
            data.get("value")
                .and_then(Value::as_str)
                .unwrap_or(""),
            data.get("label")
                .and_then(Value::as_str)
                .unwrap_or("")
        ),
        super::NodeKind::Comparison => format!(
            "{} vs {}",
            data.get("left_title")
                .and_then(Value::as_str)
                .unwrap_or(""),
            data.get("right_title")
                .and_then(Value::as_str)
                .unwrap_or("")
        ),
        super::NodeKind::Callout => format!(
            "{} | {}",
            data.get("title")
                .and_then(Value::as_str)
                .unwrap_or(""),
            data.get("body")
                .and_then(Value::as_str)
                .unwrap_or("")
        ),
        super::NodeKind::FreehandNote => data
            .get("text")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
    }
}

fn quadrant_title(data: &Value, key: &str) -> String {
    data.get("quadrants")
        .and_then(|q| q.get(key))
        .and_then(|q| q.get("title"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}

fn truncate(value: &str, max: usize) -> String {
    if value.chars().count() <= max {
        value.to_string()
    } else {
        value.chars().take(max).collect::<String>() + "…"
    }
}

/// JSON Merge Patch (RFC 7396).
pub fn merge_patch(target: &mut Value, patch: &Value) {
    match patch {
        Value::Object(patch_obj) => {
            if !target.is_object() {
                *target = Value::Object(Map::new());
            }
            if let Some(target_obj) = target.as_object_mut() {
                for (key, value) in patch_obj {
                    if value.is_null() {
                        target_obj.remove(key);
                    } else {
                        let entry = target_obj.entry(key.clone()).or_insert(Value::Null);
                        merge_patch(entry, value);
                    }
                }
            }
        }
        other => *target = other.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scene::{NodeKind, SceneOp};

    fn upsert(id: &str, zone: SemanticZone, kind: NodeKind) -> SceneOp {
        SceneOp::Upsert {
            id: id.into(),
            kind,
            zone,
            title: Some(id.into()),
            pinned: None,
            data: serde_json::json!({"latex": "x^2"}),
        }
    }

    #[test]
    fn test_auto_eviction_respects_pinned_and_theme_limit() {
        let mut scene = SceneGraph::new("s1", ThemeId::Ted);
        scene.apply_auto(&upsert("a", SemanticZone::Hero, NodeKind::Kpi), 1);
        scene.apply_auto(&upsert("b", SemanticZone::Hero, NodeKind::Kpi), 2);
        scene.apply_auto(&upsert("c", SemanticZone::Hero, NodeKind::Kpi), 3);
        assert_eq!(scene.nodes.len(), 3);
        let outcome = scene.apply_auto(&upsert("d", SemanticZone::Hero, NodeKind::Kpi), 4);
        assert_eq!(scene.nodes.len(), 3);
        assert!(scene.nodes.contains_key("d"));
        assert_eq!(outcome.evicted, vec!["a".to_string()]);
    }

    #[test]
    fn test_theme_lock_ignores_auto_theme_op() {
        let mut scene = SceneGraph::new("s1", ThemeId::ThreeBlueOneBrown);
        scene.apply_auto(
            &SceneOp::Theme {
                style: ThemeId::ThreeBlueOneBrown,
                locked: Some(true),
            },
            1,
        );
        assert!(scene.theme_locked);
        scene.apply_auto(
            &SceneOp::Theme {
                style: ThemeId::Flipchart,
                locked: None,
            },
            2,
        );
        assert_eq!(scene.theme, ThemeId::ThreeBlueOneBrown);
    }

    #[test]
    fn test_connect_requires_existing_nodes_and_remove_cleans_edges() {
        let mut scene = SceneGraph::new("s1", ThemeId::Blueprint);
        scene.apply_auto(&upsert("a", SemanticZone::Left, NodeKind::Diagram), 1);
        scene.apply_auto(&upsert("b", SemanticZone::Right, NodeKind::Diagram), 2);
        scene.apply_auto(
            &SceneOp::Connect {
                id: "e1".into(),
                from: "a".into(),
                to: "b".into(),
                label: Some("chama".into()),
                animated: Some(true),
                style: None,
            },
            3,
        );
        assert_eq!(scene.edges.len(), 1);
        scene.apply_auto(&SceneOp::Remove { id: "a".into() }, 4);
        assert!(scene.edges.is_empty());
    }

    #[test]
    fn test_patch_is_json_merge_patch() {
        let mut scene = SceneGraph::new("s1", ThemeId::ThreeBlueOneBrown);
        scene.apply_auto(
            &SceneOp::Upsert {
                id: "m".into(),
                kind: NodeKind::Math,
                zone: SemanticZone::Right,
                title: None,
                pinned: None,
                data: serde_json::json!({"latex":"x^2","caption":"antes"}),
            },
            1,
        );
        scene.apply_auto(
            &SceneOp::Patch {
                id: "m".into(),
                zone: None,
                title: None,
                data: Some(serde_json::json!({"caption":"depois","steps":["a","b"]})),
            },
            2,
        );
        let node = scene.nodes.get("m").unwrap();
        assert_eq!(node.data["latex"], "x^2");
        assert_eq!(node.data["caption"], "depois");
        assert_eq!(node.data["steps"][1], "b");
    }

    #[test]
    fn test_clear_keeps_title_when_asked() {
        let mut scene = SceneGraph::new("s1", ThemeId::Whiteboard);
        scene.apply_auto(
            &SceneOp::Title {
                text: "Título".into(),
                subtitle: None,
            },
            1,
        );
        scene.apply_auto(&upsert("a", SemanticZone::Left, NodeKind::Callout), 2);
        scene.apply_auto(
            &SceneOp::Clear {
                keep_title: Some(true),
            },
            3,
        );
        assert!(scene.nodes.is_empty());
        assert_eq!(scene.title.as_deref(), Some("Título"));
    }

    #[test]
    fn test_digest_is_compact() {
        let mut scene = SceneGraph::new("s1", ThemeId::ThreeBlueOneBrown);
        for i in 0..10 {
            scene.apply_auto(
                &upsert(
                    &format!("n{i}"),
                    SemanticZone::Left,
                    NodeKind::Math,
                ),
                1,
            );
        }
        let digest = scene.digest(800);
        assert!(digest.chars().count() <= 801);
        assert!(digest.contains("theme: 3b1b"));
    }
}
