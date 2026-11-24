import { create } from 'zustand';
import type { AppConfig, AudioDeviceInfo, DownloadProgress, ModelsStatusReport } from '../types/config';
import { DEFAULT_CONFIG, EMPTY_MODELS } from '../types/config';
import * as ipc from '../types/ipc';

interface ConfigStore {
  config: AppConfig;
  loaded: boolean;
  saving: boolean;
  error: string | null;
  models: ModelsStatusReport;
  devices: AudioDeviceInfo[];
  downloads: Record<string, DownloadProgress>;
  load: () => Promise<void>;
  save: (next?: AppConfig) => Promise<void>;
  refreshModels: () => Promise<void>;
  refreshDevices: () => Promise<void>;
  download: (modelId: string) => Promise<void>;
  setDownloadProgress: (progress: DownloadProgress) => void;
  setConfigLocal: (updater: (config: AppConfig) => AppConfig) => void;
  dismissError: () => void;
}

function localConfig(): AppConfig {
  try {
    const raw = localStorage.getItem('gizmo.config');
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppConfig>;
      return {
        audio: { ...DEFAULT_CONFIG.audio, ...parsed.audio },
        asr: { ...DEFAULT_CONFIG.asr, ...parsed.asr },
        llm: { ...DEFAULT_CONFIG.llm, ...parsed.llm },
        canvas: { ...DEFAULT_CONFIG.canvas, ...parsed.canvas },
        shortcuts: { ...DEFAULT_CONFIG.shortcuts, ...parsed.shortcuts },
      };
    }
  } catch {
    // ignore corrupted local config
  }
  return DEFAULT_CONFIG;
}

export const useConfigStore = create<ConfigStore>((set, get) => ({
  config: DEFAULT_CONFIG,
  loaded: false,
  saving: false,
  error: null,
  models: EMPTY_MODELS,
  devices: [],
  downloads: {},
  load: async () => {
    if (get().loaded) return;
    try {
      if (ipc.isTauri()) {
        const config = await ipc.getConfig();
        if (config) set({ config });
        else set({ config: localConfig() });
        set({ loaded: true });
        await Promise.all([get().refreshModels(), get().refreshDevices()]);
      } else {
        set({ config: localConfig(), loaded: true, models: EMPTY_MODELS });
      }
    } catch (error) {
      set({ config: localConfig(), loaded: true, error: error instanceof Error ? error.message : String(error) });
    }
  },
  save: async (next) => {
    const config = next ?? get().config;
    set({ saving: true, error: null });
    try {
      await ipc.saveConfig(config);
      localStorage.setItem('gizmo.config', JSON.stringify(config));
      set({ config, saving: false, loaded: true });
    } catch (error) {
      set({ saving: false, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  },
  refreshModels: async () => {
    if (!ipc.isTauri()) return;
    try {
      set({ models: await ipc.getModelsStatus() });
    } catch {
      // onboarding will show the download screen anyway
    }
  },
  refreshDevices: async () => {
    if (!ipc.isTauri()) return;
    try {
      set({ devices: await ipc.listAudioDevices() });
    } catch {
      set({ devices: [] });
    }
  },
  download: async (modelId) => {
    set({ error: null });
    try {
      await ipc.downloadModel(modelId);
      await get().refreshModels();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message });
      throw error;
    }
  },
  setDownloadProgress: (progress) =>
    set((state) => ({ downloads: { ...state.downloads, [progress.modelId]: progress } })),
  setConfigLocal: (updater) => set((state) => ({ config: updater(state.config) })),
  dismissError: () => set({ error: null }),
}));
