export type ThemeId = '3b1b' | 'whiteboard' | 'flipchart' | 'ted' | 'blueprint' | 'chalkboard';

export const THEME_IDS: ThemeId[] = ['3b1b', 'whiteboard', 'flipchart', 'ted', 'blueprint', 'chalkboard'];

export type SemanticZone =
  | 'hero'
  | 'center'
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'split_tl'
  | 'split_tr'
  | 'split_bl'
  | 'split_br'
  | 'footer';

export const SEMANTIC_ZONES: SemanticZone[] = [
  'hero', 'center', 'left', 'right', 'top', 'bottom',
  'split_tl', 'split_tr', 'split_bl', 'split_br', 'footer',
];

export type NodeKind =
  | 'math'
  | 'plot_2d'
  | 'geometry_2d'
  | 'chart'
  | 'diagram'
  | 'bullets'
  | 'code'
  | 'matrix_2x2'
  | 'funnel'
  | 'timeline'
  | 'kpi'
  | 'comparison'
  | 'callout'
  | 'freehand_note';

export const NODE_KIND_LABELS: Record<NodeKind, string> = {
  math: 'Matemática',
  plot_2d: 'Gráfico 2D',
  geometry_2d: 'Geometria',
  chart: 'Gráfico de dados',
  diagram: 'Diagrama',
  bullets: 'Tópicos',
  code: 'Código',
  matrix_2x2: 'Matriz 2×2',
  funnel: 'Funil',
  timeline: 'Linha do tempo',
  kpi: 'KPI',
  comparison: 'Comparação',
  callout: 'Destaque',
  freehand_note: 'Post-it',
};

export type SemanticColor = 'primary' | 'secondary' | 'accent' | 'warning' | 'danger' | string;
export type NodeData = Record<string, unknown>;

export interface SceneNode {
  id: string;
  kind: NodeKind;
  zone: SemanticZone;
  title: string | null;
  pinned: boolean;
  version: number;
  orderIndex: number;
  createdAtMs: number;
  updatedAtMs: number;
  data: NodeData;
}

export interface SceneEdge {
  id: string;
  from: string;
  to: string;
  label: string | null;
  animated: boolean;
  style: 'solid' | 'dashed';
}

export interface ActiveHighlight {
  target: string | null;
  style: 'pulse' | 'box' | 'underline' | 'spotlight';
  expiresAtMs: number;
}

export interface Camera {
  focus: string;
  zoom: number;
}

export interface SceneGraph {
  sessionId: string;
  revision: number;
  theme: ThemeId;
  themeLocked: boolean;
  themeAutoDetected: boolean;
  title: string | null;
  subtitle: string | null;
  camera: Camera;
  nodes: Record<string, SceneNode>;
  edges: Record<string, SceneEdge>;
  activeHighlights: Record<string, ActiveHighlight>;
}

export type SceneOp =
  | { op: 'theme'; style: ThemeId; locked?: boolean }
  | { op: 'title'; text: string; subtitle?: string }
  | { op: 'upsert'; id: string; kind: NodeKind; zone: SemanticZone; title?: string; pinned?: boolean; data: NodeData }
  | { op: 'patch'; id: string; zone?: SemanticZone; title?: string; data?: NodeData }
  | { op: 'connect'; id: string; from: string; to: string; label?: string; animated?: boolean; style?: 'solid' | 'dashed' }
  | { op: 'highlight'; id: string; target?: string; style?: ActiveHighlight['style']; ttl_ms?: number }
  | { op: 'remove'; id: string }
  | { op: 'camera'; focus: string; zoom?: number }
  | { op: 'clear'; keep_title?: boolean }
  | { op: 'noop' };

export interface BeatSummary {
  id: number;
  sessionId: string;
  label: string;
  createdAtMs: number;
}

export const THEME_MAX_NODES: Record<ThemeId, number> = {
  '3b1b': 6,
  whiteboard: 8,
  flipchart: 7,
  ted: 3,
  blueprint: 10,
  chalkboard: 6,
};

export function createEmptyScene(theme: ThemeId = 'whiteboard', sessionId = 'local'): SceneGraph {
  return {
    sessionId,
    revision: 0,
    theme,
    themeLocked: false,
    themeAutoDetected: false,
    title: null,
    subtitle: null,
    camera: { focus: 'all', zoom: 1 },
    nodes: {},
    edges: {},
    activeHighlights: {},
  };
}

export interface RendererProps {
  node: SceneNode;
  rect: { x: number; y: number; w: number; h: number };
  theme: ThemeId;
}
