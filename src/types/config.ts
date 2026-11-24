import type { ThemeId } from './scene';

export interface AudioConfig {
  inputDeviceName: string | null;
  vadThreshold: number;
  minSilenceDurationSec: number;
  partialTickMs: number;
}

export interface AsrConfig {
  activeModelId: AsrModelId;
  forcedLanguage: string | null;
  onnxThreads: number;
}

export type AsrModelId =
  | 'parakeet-tdt-0.6b-v3-int8'
  | 'whisper-turbo-int8'
  | 'sense-voice-small-int8';

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  disableThinking: boolean;
}

export interface CanvasConfig {
  defaultTheme: ThemeId;
  autoDetectTheme: boolean;
  showMascotInProjector: boolean;
  projectorChromaBg: string | null;
  projectorTransparent: boolean;
}

export interface ShortcutsConfig {
  toggleMute: string;
  clearCanvas: string;
  openProjector: string;
}

export interface AppConfig {
  audio: AudioConfig;
  asr: AsrConfig;
  llm: LlmConfig;
  canvas: CanvasConfig;
  shortcuts: ShortcutsConfig;
}

export interface ModelStatus {
  id: AsrModelId;
  displayName: string;
  installed: boolean;
  approxBytes: number;
  path: string | null;
}

export interface ModelsStatusReport {
  sileroInstalled: boolean;
  installedModels: AsrModelId[];
  models: ModelStatus[];
  modelsDir: string;
}

export interface AudioDeviceInfo {
  name: string;
  isDefault: boolean;
  channels: number;
  sampleRate: number;
  sampleFormat: string;
}

export interface LlmProbeResult {
  ttftMs: number;
  firstOpMs: number;
  model: string;
  sample: string;
}

export interface DownloadProgress {
  modelId: string;
  downloadedBytes: number;
  totalBytes: number;
  phase: 'downloading' | 'extracting' | 'ready' | 'error';
  message?: string;
}

export const DEFAULT_CONFIG: AppConfig = {
  audio: {
    inputDeviceName: null,
    vadThreshold: 0.45,
    minSilenceDurationSec: 0.28,
    partialTickMs: 400,
  },
  asr: {
    activeModelId: 'parakeet-tdt-0.6b-v3-int8',
    forcedLanguage: null,
    onnxThreads: 3,
  },
  llm: {
    baseUrl: 'http://127.0.0.1:11434/v1',
    apiKey: '',
    model: 'qwen2.5:7b-instruct',
    temperature: 0.2,
    maxTokens: 512,
    disableThinking: true,
  },
  canvas: {
    defaultTheme: 'whiteboard',
    autoDetectTheme: true,
    showMascotInProjector: true,
    projectorChromaBg: null,
    projectorTransparent: false,
  },
  shortcuts: {
    toggleMute: 'CommandOrControl+Shift+M',
    clearCanvas: 'CommandOrControl+Shift+K',
    openProjector: 'CommandOrControl+Shift+P',
  },
};

export const EMPTY_MODELS: ModelsStatusReport = {
  sileroInstalled: false,
  installedModels: [],
  models: [
    { id: 'parakeet-tdt-0.6b-v3-int8', displayName: 'NVIDIA Parakeet TDT 0.6B v3 (INT8 · 25 Idiomas)', installed: false, approxBytes: 665_000_000, path: null },
    { id: 'whisper-turbo-int8', displayName: 'Whisper Large-v3 Turbo (INT8 · 99 Idiomas)', installed: false, approxBytes: 565_000_000, path: null },
    { id: 'sense-voice-small-int8', displayName: 'SenseVoice Small (INT8 · EN/ZH/JA/KO)', installed: false, approxBytes: 240_000_000, path: null },
  ],
  modelsDir: '',
};

export const LLM_PRESETS = [
  { label: 'Ollama Local', baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen2.5:7b-instruct' },
  { label: 'LM Studio', baseUrl: 'http://127.0.0.1:1234/v1', model: 'local-model' },
  { label: 'llama.cpp', baseUrl: 'http://127.0.0.1:8080/v1', model: 'local-model' },
  { label: 'Groq Ultra-Fast', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4.1-mini' },
  { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini' },
];

export function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${Math.round(bytes / 1_000_000)} MB`;
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`;
  return `${bytes} B`;
}
