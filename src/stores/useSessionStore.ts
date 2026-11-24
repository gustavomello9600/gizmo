import { create } from 'zustand';
import type { BeatSummary } from '../types/scene';

export interface AudioLevel {
  rms: number;
  peak: number;
  speaking: boolean;
}

export const audioLevelRef: { current: AudioLevel } = {
  current: { rms: 0, peak: 0, speaking: false },
};

export interface TranscriptEntry {
  id: string;
  utteranceId: string;
  text: string;
  at: number;
  latencyMs: number;
  durationMs: number;
  manual?: boolean;
}

export type BrainState = 'idle' | 'streaming' | 'error';

interface SessionStore {
  sessionId: string | null;
  isListening: boolean;
  isMuted: boolean;
  partialTranscript: string;
  partialUtteranceId: string | null;
  transcriptLog: TranscriptEntry[];
  brainState: BrainState;
  brainError: string | null;
  brainModel: string;
  ttftMs: number | null;
  firstOpMs: number | null;
  layoutMs: number;
  beats: BeatSummary[];
  activeBeatId: number | null;
  demoRunning: boolean;
  demoAct: number | null;
  demoTitle: string | null;
  setListening: (value: boolean) => void;
  setMuted: (value: boolean) => void;
  setPartial: (utteranceId: string, text: string) => void;
  clearPartial: () => void;
  addTranscript: (entry: Omit<TranscriptEntry, 'id' | 'at'> & { at?: number }) => void;
  addManualTranscript: (text: string) => void;
  setBrainStatus: (status: { state: BrainState; error?: string | null; model?: string; ttftMs?: number; firstOpMs?: number }) => void;
  setLayoutMs: (value: number) => void;
  setBeats: (beats: BeatSummary[]) => void;
  addLocalBeat: (label: string) => void;
  setActiveBeat: (id: number | null) => void;
  setSessionId: (id: string | null) => void;
  setDemo: (running: boolean, act?: number | null, title?: string | null) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessionId: null,
  isListening: false,
  isMuted: false,
  partialTranscript: '',
  partialUtteranceId: null,
  transcriptLog: [],
  brainState: 'idle',
  brainError: null,
  brainModel: '',
  ttftMs: null,
  firstOpMs: null,
  layoutMs: 1.2,
  beats: [],
  activeBeatId: null,
  demoRunning: false,
  demoAct: null,
  demoTitle: null,
  setListening: (value) => set({ isListening: value }),
  setMuted: (value) => set({ isMuted: value }),
  setPartial: (utteranceId, text) => set({ partialUtteranceId: utteranceId, partialTranscript: text }),
  clearPartial: () => set({ partialUtteranceId: null, partialTranscript: '' }),
  addTranscript: (entry) =>
    set((state) => ({
      partialTranscript: '',
      partialUtteranceId: null,
      transcriptLog: [
        ...state.transcriptLog.slice(-199),
        {
          ...entry,
          id: `${entry.utteranceId}-${Date.now()}`,
          at: entry.at ?? Date.now(),
        },
      ],
    })),
  addManualTranscript: (text) =>
    set((state) => ({
      transcriptLog: [
        ...state.transcriptLog.slice(-199),
        {
          id: `manual-${Date.now()}`,
          utteranceId: 'manual',
          text,
          at: Date.now(),
          latencyMs: 0,
          durationMs: 0,
          manual: true,
        },
      ],
    })),
  setBrainStatus: (status) =>
    set((state) => ({
      brainState: status.state,
      brainError: status.error ?? null,
      brainModel: status.model ?? state.brainModel,
      ttftMs: status.ttftMs ?? state.ttftMs,
      firstOpMs: status.firstOpMs ?? state.firstOpMs,
    })),
  setLayoutMs: (value) => set({ layoutMs: value }),
  setBeats: (beats) => set({ beats }),
  addLocalBeat: (label) =>
    set((state) => ({
      beats: [
        ...state.beats,
        {
          id: Date.now(),
          sessionId: state.sessionId ?? 'local',
          label,
          createdAtMs: Date.now(),
        },
      ],
    })),
  setActiveBeat: (id) => set({ activeBeatId: id }),
  setSessionId: (id) => set({ sessionId: id }),
  setDemo: (running, act = null, title = null) => set({ demoRunning: running, demoAct: act, demoTitle: title }),
  reset: () =>
    set({
      isListening: false,
      isMuted: false,
      partialTranscript: '',
      partialUtteranceId: null,
      transcriptLog: [],
      brainState: 'idle',
      brainError: null,
      ttftMs: null,
      firstOpMs: null,
      activeBeatId: null,
      demoRunning: false,
      demoAct: null,
      demoTitle: null,
    }),
}));
