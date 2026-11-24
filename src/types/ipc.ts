import { invoke } from '@tauri-apps/api/core';
import type { AppConfig, AudioDeviceInfo, DownloadProgress, LlmProbeResult, ModelsStatusReport } from './config';
import { EMPTY_MODELS } from './config';
import type { BeatSummary, SceneGraph, SceneOp } from './scene';

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(command, args);
}

export async function getConfig(): Promise<AppConfig | null> {
  if (!isTauri()) return null;
  return call<AppConfig>('get_config');
}

export async function saveConfig(config: AppConfig): Promise<void> {
  if (!isTauri()) {
    localStorage.setItem('gizmo.config', JSON.stringify(config));
    return;
  }
  await call<void>('save_config', { config });
}

export async function listAudioDevices(): Promise<AudioDeviceInfo[]> {
  if (!isTauri()) return [];
  return call<AudioDeviceInfo[]>('list_audio_devices');
}

export async function getModelsStatus(): Promise<ModelsStatusReport> {
  if (!isTauri()) return EMPTY_MODELS;
  return call<ModelsStatusReport>('get_models_status');
}

export async function downloadModel(modelId: string): Promise<void> {
  if (!isTauri()) throw new Error('O download de modelos exige o app nativo.');
  await call<void>('download_model', { modelId });
}

export async function testLlmConnection(llmCfg: AppConfig['llm']): Promise<LlmProbeResult> {
  if (!isTauri()) {
    const started = performance.now();
    await new Promise((resolve) => setTimeout(resolve, 180));
    return {
      ttftMs: Math.round(performance.now() - started),
      firstOpMs: Math.round(performance.now() - started) + 20,
      model: llmCfg.model,
      sample: '{"op":"noop"}',
    };
  }
  return call<LlmProbeResult>('test_llm_connection', { llmCfg });
}

export async function listLlmModels(baseUrl: string, apiKey: string): Promise<string[]> {
  if (!isTauri()) return [];
  return call<string[]>('list_llm_models', { baseUrl, apiKey });
}

export async function startSession(title?: string): Promise<string> {
  if (!isTauri()) throw new Error('O microfone nativo exige o app Tauri.');
  return call<string>('start_session', { title });
}

export async function stopSession(): Promise<void> {
  if (!isTauri()) return;
  await call<void>('stop_session');
}

export async function setMute(muted: boolean): Promise<void> {
  if (!isTauri()) return;
  await call<void>('set_mute', { muted });
}

export async function getSceneSnapshot(): Promise<SceneGraph | null> {
  if (!isTauri()) return null;
  return call<SceneGraph>('get_scene_snapshot');
}

export async function dispatchManualPrompt(text: string): Promise<void> {
  if (!isTauri()) return;
  await call<void>('dispatch_manual_prompt', { text });
}

export async function applyManualOp(op: SceneOp): Promise<void> {
  if (!isTauri()) return;
  await call<void>('apply_manual_op', { op });
}

export async function listBeats(sessionId: string): Promise<BeatSummary[]> {
  if (!isTauri()) return [];
  return call<BeatSummary[]>('list_beats', { sessionId });
}

export async function restoreBeatSnapshot(beatId: number): Promise<SceneGraph | null> {
  if (!isTauri()) return null;
  return call<SceneGraph>('restore_beat_snapshot', { beatId });
}

export async function openProjectorWindow(transparent = false): Promise<void> {
  if (!isTauri()) {
    window.open(`${window.location.pathname}?window=projector${transparent ? '&transparent=1' : ''}`, 'gizmo-projector', 'width=1280,height=720');
    return;
  }
  await call<void>('open_projector_window', { transparent });
}

export async function runDemoLecture(): Promise<void> {
  if (!isTauri()) return;
  await call<void>('run_demo_lecture');
}

export async function exportSessionHtml(sessionId: string, targetPath: string): Promise<void> {
  if (!isTauri()) return;
  await call<void>('export_session_html', { sessionId, targetPath });
}

export type { DownloadProgress };
