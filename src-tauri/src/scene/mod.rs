use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub mod exporter;
pub mod state;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
pub enum ThemeId {
    #[serde(rename = "3b1b")]
    ThreeBlueOneBrown,
    #[default]
    #[serde(rename = "whiteboard")]
    Whiteboard,
    #[serde(rename = "flipchart")]
    Flipchart,
    #[serde(rename = "ted")]
    Ted,
    #[serde(rename = "blueprint")]
    Blueprint,
    #[serde(rename = "chalkboard")]
    Chalkboard,
}

impl ThemeId {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ThreeBlueOneBrown => "3b1b",
            Self::Whiteboard => "whiteboard",
            Self::Flipchart => "flipchart",
            Self::Ted => "ted",
            Self::Blueprint => "blueprint",
            Self::Chalkboard => "chalkboard",
        }
    }

    pub fn max_nodes(self) -> usize {
        match self {
            Self::ThreeBlueOneBrown => 6,
            Self::Whiteboard => 8,
            Self::Flipchart => 7,
            Self::Ted => 3,
            Self::Blueprint => 10,
            Self::Chalkboard => 6,
        }
    }

    pub fn from_str_loose(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "3b1b" | "math" | "matematica" | "matemática" => Some(Self::ThreeBlueOneBrown),
            "whiteboard" | "lousa" => Some(Self::Whiteboard),
            "flipchart" | "business" | "negocios" | "negócios" => Some(Self::Flipchart),
            "ted" | "keynote" => Some(Self::Ted),
            "blueprint" | "engineering" | "codigo" | "código" => Some(Self::Blueprint),
            "chalkboard" | "chalk" => Some(Self::Chalkboard),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SemanticZone {
    Hero,
    Center,
    Left,
    Right,
    Top,
    Bottom,
    SplitTl,
    SplitTr,
    SplitBl,
    SplitBr,
    Footer,
}

impl SemanticZone {
    pub fn is_wide(self) -> bool {
        matches!(self, Self::Top | Self::Bottom | Self::Footer | Self::Hero)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NodeKind {
    Math,
    #[serde(rename = "plot_2d")]
    Plot2d,
    #[serde(rename = "geometry_2d")]
    Geometry2d,
    Chart,
    Diagram,
    Bullets,
    Code,
    #[serde(rename = "matrix_2x2")]
    Matrix2x2,
    Funnel,
    Timeline,
    Kpi,
    Comparison,
    Callout,
    #[serde(rename = "freehand_note")]
    FreehandNote,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EdgeStyle {
    Solid,
    Dashed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HighlightStyle {
    Pulse,
    Box,
    Underline,
    Spotlight,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum SceneOp {
    Theme {
        style: ThemeId,
        #[serde(default)]
        locked: Option<bool>,
    },
    Title {
        text: String,
        #[serde(default)]
        subtitle: Option<String>,
    },
    Upsert {
        id: String,
        kind: NodeKind,
        zone: SemanticZone,
        #[serde(default)]
        title: Option<String>,
        #[serde(default)]
        pinned: Option<bool>,
        #[serde(default)]
        data: serde_json::Value,
    },
    Patch {
        id: String,
        #[serde(default)]
        zone: Option<SemanticZone>,
        #[serde(default)]
        title: Option<String>,
        #[serde(default)]
        data: Option<serde_json::Value>,
    },
    Connect {
        id: String,
        from: String,
        to: String,
        #[serde(default)]
        label: Option<String>,
        #[serde(default)]
        animated: Option<bool>,
        #[serde(default)]
        style: Option<EdgeStyle>,
    },
    Highlight {
        id: String,
        #[serde(default)]
        target: Option<String>,
        #[serde(default)]
        style: Option<HighlightStyle>,
        #[serde(default)]
        ttl_ms: Option<u64>,
    },
    Remove {
        id: String,
    },
    Camera {
        focus: String,
        #[serde(default)]
        zoom: Option<f32>,
    },
    Clear {
        #[serde(default)]
        keep_title: Option<bool>,
    },
    Noop,
}

impl SceneOp {
    pub fn op_name(&self) -> &'static str {
        match self {
            Self::Theme { .. } => "theme",
            Self::Title { .. } => "title",
            Self::Upsert { .. } => "upsert",
            Self::Patch { .. } => "patch",
            Self::Connect { .. } => "connect",
            Self::Highlight { .. } => "highlight",
            Self::Remove { .. } => "remove",
            Self::Camera { .. } => "camera",
            Self::Clear { .. } => "clear",
            Self::Noop => "noop",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Camera {
    pub focus: String,
    pub zoom: f32,
}

impl Default for Camera {
    fn default() -> Self {
        Self {
            focus: "all".into(),
            zoom: 1.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneNode {
    pub id: String,
    pub kind: NodeKind,
    pub zone: SemanticZone,
    pub title: Option<String>,
    pub pinned: bool,
    pub version: u32,
    pub order_index: u32,
    pub created_at_ms: u64,
    pub updated_at_ms: u64,
    pub data: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneEdge {
    pub id: String,
    pub from: String,
    pub to: String,
    pub label: Option<String>,
    pub animated: bool,
    pub style: EdgeStyle,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveHighlight {
    pub target: Option<String>,
    pub style: HighlightStyle,
    pub expires_at_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneGraph {
    pub session_id: String,
    pub revision: u64,
    pub theme: ThemeId,
    pub theme_locked: bool,
    pub theme_auto_detected: bool,
    pub title: Option<String>,
    pub subtitle: Option<String>,
    pub camera: Camera,
    pub nodes: BTreeMap<String, SceneNode>,
    pub edges: BTreeMap<String, SceneEdge>,
    pub active_highlights: BTreeMap<String, ActiveHighlight>,
}

pub type CanonicalSceneGraph = SceneGraph;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BeatSummary {
    pub id: i64,
    pub session_id: String,
    pub label: String,
    pub created_at_ms: i64,
}
