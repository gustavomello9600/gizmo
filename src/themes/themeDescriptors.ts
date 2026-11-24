import type { CSSProperties } from 'react';
import type { NodeKind, ThemeId } from '../types/scene';

export type StrokeMode = 'crisp-glow' | 'marker' | 'rough' | 'editorial' | 'technical' | 'chalk';

export interface ThemeDescriptor {
  id: ThemeId;
  label: string;
  shortLabel: string;
  tagline: string;
  dark: boolean;
  gridPattern: string;
  strokeMode: StrokeMode;
  strokeWidth: number;
  borderRadius: number;
  maxNodes: number;
  drawDuration: number;
  animationPreset: 'spring' | 'cubic';
  tokens: Record<string, string>;
}

const BASE_TOKENS = {
  '--font-heading': "'Inter', system-ui, sans-serif",
  '--font-body': "'Inter', system-ui, sans-serif",
  '--font-mono': "'JetBrains Mono', monospace",
  '--node-border': '1px solid color-mix(in srgb, var(--color-primary) 26%, transparent)',
  '--shadow-card': '0 18px 42px -24px rgba(2, 6, 23, 0.45)',
  '--grid-color': 'rgba(148, 163, 184, 0.22)',
  '--highlight-color': 'var(--color-accent)',
};

export const THEME_DESCRIPTORS: Record<ThemeId, ThemeDescriptor> = {
  '3b1b': {
    id: '3b1b',
    label: 'Matemática · 3b1b',
    shortLabel: '3b1b',
    tagline: 'Precisão vetorial com brilho neon',
    dark: true,
    gridPattern: 'cartesian-subtle',
    strokeMode: 'crisp-glow',
    strokeWidth: 2.8,
    borderRadius: 10,
    maxNodes: 6,
    drawDuration: 520,
    animationPreset: 'cubic',
    tokens: {
      ...BASE_TOKENS,
      '--bg-canvas': '#070B14',
      '--bg-surface': '#0F1729E6',
      '--bg-elevated': '#162238',
      '--fg-primary': '#F8FAFC',
      '--fg-secondary': '#CBD5E1',
      '--fg-muted': '#64748B',
      '--color-primary': '#58C4DD',
      '--color-secondary': '#83C167',
      '--color-accent': '#FFFF00',
      '--color-warning': '#FBBF24',
      '--color-danger': '#FC6255',
      '--font-heading': "'Crimson Pro', 'CMU Serif', Georgia, serif",
      '--font-body': "'Inter', system-ui, sans-serif",
      '--grid-color': 'rgba(88, 196, 221, 0.14)',
      '--highlight-color': '#FFFF00',
    },
  },
  whiteboard: {
    id: 'whiteboard',
    label: 'Lousa Branca',
    shortLabel: 'Whiteboard',
    tagline: 'Clareza didática com caneta e marca-texto',
    dark: false,
    gridPattern: 'dots',
    strokeMode: 'marker',
    strokeWidth: 2.6,
    borderRadius: 14,
    maxNodes: 8,
    drawDuration: 320,
    animationPreset: 'spring',
    tokens: {
      ...BASE_TOKENS,
      '--bg-canvas': '#F8FAFC',
      '--bg-surface': '#FFFFFF',
      '--bg-elevated': '#F1F5F9',
      '--fg-primary': '#0F172A',
      '--fg-secondary': '#334155',
      '--fg-muted': '#64748B',
      '--color-primary': '#1D4ED8',
      '--color-secondary': '#15803D',
      '--color-accent': '#DC2626',
      '--color-warning': '#D97706',
      '--color-danger': '#DC2626',
      '--font-heading': "'Plus Jakarta Sans', Inter, sans-serif",
      '--font-body': "'Inter', system-ui, sans-serif",
      '--grid-color': '#CBD5E1',
      '--highlight-color': '#DC2626',
      '--shadow-card': '0 14px 34px -22px rgba(15, 23, 42, 0.35)',
    },
  },
  flipchart: {
    id: 'flipchart',
    label: 'Flipchart · Negócios',
    shortLabel: 'Flipchart',
    tagline: 'Traço orgânico de Sharpie em papel creme',
    dark: false,
    gridPattern: 'flipchart-pad',
    strokeMode: 'rough',
    strokeWidth: 2.4,
    borderRadius: 6,
    maxNodes: 7,
    drawDuration: 380,
    animationPreset: 'spring',
    tokens: {
      ...BASE_TOKENS,
      '--bg-canvas': '#FAF6EE',
      '--bg-surface': '#FFFDF8',
      '--bg-elevated': '#F5EFE2',
      '--fg-primary': '#1C1917',
      '--fg-secondary': '#44403C',
      '--fg-muted': '#78716C',
      '--color-primary': '#292524',
      '--color-secondary': '#0D9488',
      '--color-accent': '#F59E0B',
      '--color-warning': '#EA580C',
      '--color-danger': '#E11D48',
      '--font-heading': "'Kalam', 'Caveat', system-ui, sans-serif",
      '--font-body': "'Plus Jakarta Sans', sans-serif",
      '--grid-color': 'rgba(120, 113, 108, 0.18)',
      '--highlight-color': '#F59E0B',
      '--node-border': '1px solid rgba(41, 37, 36, 0.22)',
      '--shadow-card': '0 12px 26px -18px rgba(68, 64, 60, 0.5)',
    },
  },
  ted: {
    id: 'ted',
    label: 'Palestra · TED',
    shortLabel: 'TED',
    tagline: 'Uma ideia gigante por vez, luz de palco',
    dark: true,
    gridPattern: 'radial-spotlight',
    strokeMode: 'editorial',
    strokeWidth: 2.0,
    borderRadius: 20,
    maxNodes: 3,
    drawDuration: 450,
    animationPreset: 'cubic',
    tokens: {
      ...BASE_TOKENS,
      '--bg-canvas': '#09090B',
      '--bg-surface': '#18181BCC',
      '--bg-elevated': '#27272A',
      '--fg-primary': '#FAFAFA',
      '--fg-secondary': '#A1A1AA',
      '--fg-muted': '#52525B',
      '--color-primary': '#E11D48',
      '--color-secondary': '#F97316',
      '--color-accent': '#FB7185',
      '--color-warning': '#FACC15',
      '--color-danger': '#EF4444',
      '--font-heading': "'Outfit', Inter, sans-serif",
      '--font-body': "'Inter', system-ui, sans-serif",
      '--grid-color': 'rgba(250, 250, 250, 0.04)',
      '--highlight-color': '#FB7185',
      '--node-border': '1px solid rgba(250, 250, 250, 0.1)',
      '--shadow-card': '0 28px 70px -36px rgba(0, 0, 0, 0.85)',
    },
  },
  blueprint: {
    id: 'blueprint',
    label: 'Blueprint · Engenharia',
    shortLabel: 'Blueprint',
    tagline: 'Malha milimetrada e fluxo de pacotes',
    dark: true,
    gridPattern: 'blueprint-grid',
    strokeMode: 'technical',
    strokeWidth: 1.8,
    borderRadius: 4,
    maxNodes: 10,
    drawDuration: 240,
    animationPreset: 'cubic',
    tokens: {
      ...BASE_TOKENS,
      '--bg-canvas': '#0B1324',
      '--bg-surface': '#0F1E36F2',
      '--bg-elevated': '#162B4D',
      '--fg-primary': '#E2E8F0',
      '--fg-secondary': '#94A3B8',
      '--fg-muted': '#475569',
      '--color-primary': '#38BDF8',
      '--color-secondary': '#34D399',
      '--color-accent': '#A78BFA',
      '--color-warning': '#F59E0B',
      '--color-danger': '#F87171',
      '--font-heading': "'JetBrains Mono', monospace",
      '--font-body': "'Inter', system-ui, sans-serif",
      '--grid-color': 'rgba(56, 189, 248, 0.12)',
      '--highlight-color': '#38BDF8',
      '--node-border': '1px solid rgba(56, 189, 248, 0.3)',
    },
  },
  chalkboard: {
    id: 'chalkboard',
    label: 'Quadro Negro · Humanas',
    shortLabel: 'Chalkboard',
    tagline: 'Giz seco sobre ardósia verde',
    dark: true,
    gridPattern: 'chalk-dust',
    strokeMode: 'chalk',
    strokeWidth: 2.8,
    borderRadius: 8,
    maxNodes: 6,
    drawDuration: 420,
    animationPreset: 'cubic',
    tokens: {
      ...BASE_TOKENS,
      '--bg-canvas': '#163024',
      '--bg-surface': '#1D3D2EE6',
      '--bg-elevated': '#244B39',
      '--fg-primary': '#F8FAFC',
      '--fg-secondary': '#DCE7E0',
      '--fg-muted': '#8FA89B',
      '--color-primary': '#FEF08A',
      '--color-secondary': '#93C5FD',
      '--color-accent': '#FCA5A5',
      '--color-warning': '#FDE047',
      '--color-danger': '#F87171',
      '--font-heading': "'Crimson Pro', Georgia, serif",
      '--font-body': "'Crimson Pro', Georgia, serif",
      '--grid-color': 'rgba(220, 231, 224, 0.08)',
      '--highlight-color': '#FEF08A',
      '--node-border': '1px solid rgba(248, 250, 252, 0.12)',
    },
  },
};

export function applyThemeVars(element: HTMLElement, theme: ThemeId): void {
  const descriptor = THEME_DESCRIPTORS[theme];
  for (const [token, value] of Object.entries(descriptor.tokens)) {
    element.style.setProperty(token, value);
  }
  element.dataset.theme = theme;
}

export function themeStyle(theme: ThemeId): CSSProperties {
  return THEME_DESCRIPTORS[theme].tokens as CSSProperties;
}

export function semanticColor(color: string | undefined): string {
  switch (color) {
    case 'secondary':
      return 'var(--color-secondary)';
    case 'accent':
      return 'var(--color-accent)';
    case 'warning':
      return 'var(--color-warning)';
    case 'danger':
    case 'red':
      return 'var(--color-danger)';
    case 'primary':
    case undefined:
      return 'var(--color-primary)';
    default:
      return color;
  }
}

export const NODE_WEIGHTS: Record<NodeKind, number> = {
  plot_2d: 2.0,
  diagram: 2.0,
  chart: 2.0,
  matrix_2x2: 2.0,
  math: 1.4,
  bullets: 1.4,
  code: 1.4,
  comparison: 1.4,
  geometry_2d: 1.6,
  funnel: 1.6,
  timeline: 1.5,
  callout: 0.9,
  kpi: 0.9,
  freehand_note: 0.9,
};
