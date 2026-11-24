import React, { useCallback, useEffect, useRef, useState } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { save } from '@tauri-apps/plugin-dialog';
import { X } from 'lucide-react';
import { TopControlBar } from './TopControlBar';
import { TranscriptDrawer } from './TranscriptDrawer';
import { BeatTimelineBar } from './BeatTimelineBar';
import { OnboardingWizard } from './OnboardingWizard';
import { SettingsModal } from './SettingsModal';
import { CanvasViewport } from '../canvas/CanvasViewport';
import { GizmoMascot, type MascotState } from '../mascot/GizmoMascot';
import { useSceneStore } from '../../stores/useSceneStore';
import { audioLevelRef, useSessionStore } from '../../stores/useSessionStore';
import { useConfigStore } from '../../stores/useConfigStore';
import { runLocalDemo } from '../../lib/demoLecture';
import {
  applyManualOp,
  exportSessionHtml,
  isTauri,
  listBeats,
  openProjectorWindow,
  runDemoLecture,
  setMute,
  startSession,
  stopSession,
} from '../../types/ipc';
import type { SceneGraph, SceneOp, ThemeId } from '../../types/scene';
import { THEME_IDS } from '../../types/scene';
import type { AudioLevel, BrainState, TranscriptEntry } from '../../stores/useSessionStore';
import type { DownloadProgress } from '../../types/config';

interface AsrEventPayload {
  utteranceId: string;
  text: string;
  isFinal: boolean;
  durationMs: number;
  latencyMs: number;
}

interface BrainStatusPayload {
  state: BrainState;
  model?: string;
  ttftMs?: number;
  firstOpMs?: number;
  error?: string;
}

export const StudioApp: React.FC = () => {
  const { scene, applyOp, setScene, resetScene, lastOpAt, setThemeLocked, prune } = useSceneStore();
  const {
    isListening,
    isMuted,
    setListening,
    setMuted,
    setPartial,
    addTranscript,
    setBrainStatus,
    setBeats,
    addLocalBeat,
    setActiveBeat,
    setSessionId,
    setDemo,
    demoRunning,
    demoAct,
    demoTitle,
    beats,
    activeBeatId,
    sessionId,
  } = useSessionStore();
  const { config, loaded, models, load, setDownloadProgress } = useConfigStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const demoTimer = useRef<number | null>(null);
  const demoStop = useRef(false);

  const showError = useCallback((message: string) => {
    setError(message);
    window.setTimeout(() => setError((current) => (current === message ? null : current)), 7000);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!loaded) return;
    if (new URLSearchParams(window.location.search).get('onboarding') === '1') {
      setOnboardingOpen(true);
      return;
    }
    if (!isTauri() || models.modelsDir === '') return;
    const dismissed = localStorage.getItem('gizmo.onboarding.dismissed') === '1';
    const ready = models.sileroInstalled && models.installedModels.length > 0;
    if (dismissed || ready) {
      setOnboardingOpen(false);
      return;
    }
    setOnboardingOpen(true);
  }, [loaded, models.modelsDir, models.sileroInstalled, models.installedModels.length]);

  useEffect(() => {
    const timer = window.setInterval(() => prune(), 500);
    return () => window.clearInterval(timer);
  }, [prune]);

  useEffect(() => {
    if (lastOpAt === 0) return;
    setDrawing(true);
    if (demoTimer.current) window.clearTimeout(demoTimer.current);
    demoTimer.current = window.setTimeout(() => setDrawing(false), 460);
    return () => {
      if (demoTimer.current) window.clearTimeout(demoTimer.current);
    };
  }, [lastOpAt]);

  const refreshBeats = useCallback(async () => {
    const id = useSessionStore.getState().sessionId;
    if (!id || !isTauri() || id === 'local-demo') return;
    try {
      setBeats(await listBeats(id));
    } catch {
      // a sessão pode ter acabado de começar
    }
  }, [setBeats]);

  useEffect(() => {
    void refreshBeats();
  }, [sessionId, refreshBeats]);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    const unlisteners: UnlistenFn[] = [];
    const register = async () => {
      const add = async <T,>(event: string, handler: (payload: T) => void) => {
        const unlisten = await listen<T>(event, (message) => handler(message.payload));
        if (disposed) unlisten();
        else unlisteners.push(unlisten);
      };

      await add<SceneOp>('scene:op', (op) => {
        if (useSessionStore.getState().activeBeatId === null) applyOp(op);
      });
      await add<SceneGraph>('scene:snapshot', (snapshot) => setScene(snapshot));
      await add<AsrEventPayload>('asr:partial', (event) => setPartial(event.utteranceId, event.text));
      await add<AsrEventPayload>('asr:final', (event) => {
        addTranscript({
          utteranceId: event.utteranceId,
          text: event.text,
          latencyMs: event.latencyMs,
          durationMs: event.durationMs,
        });
      });
      await add<AudioLevel>('audio:level', (level) => {
        audioLevelRef.current = level;
      });
      await add<boolean>('audio:muted', (muted) => setMuted(muted));
      await add<BrainStatusPayload>('brain:status', (status) =>
        setBrainStatus({
          state: status.state,
          model: status.model,
          ttftMs: status.ttftMs,
          firstOpMs: status.firstOpMs,
          error: status.error,
        }),
      );
      await add<DownloadProgress>('models:progress', (progress) => setDownloadProgress(progress));
      await add<void>('beats:updated', () => void refreshBeats());
      await add<string>('session:started', (id) => {
        setSessionId(id);
        setListening(true);
        void refreshBeats();
      });
      await add<void>('session:stopped', () => {
        setListening(false);
        setSessionId(null);
        setBrainStatus({ state: 'idle' });
      });
      await add<{ act: number; title: string; theme: string }>('demo:progress', (payload) => {
        setDemo(true, payload.act, payload.title);
      });
      await add<{ sessionId: string }>('demo:done', () => {
        setDemo(false);
        void refreshBeats();
      });
    };
    void register();
    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [applyOp, setScene, setPartial, addTranscript, setMuted, setBrainStatus, setDownloadProgress, refreshBeats, setSessionId, setListening, setDemo]);

  const toggleMute = useCallback(() => {
    const next = !useSessionStore.getState().isMuted;
    setMuted(next);
    void setMute(next).catch(() => undefined);
  }, [setMuted]);

  const clearCanvas = useCallback(() => {
    if (!isTauri()) addLocalBeat('Antes de limpar');
    const op = { op: 'clear' as const };
    applyOp(op, { manual: true });
    void applyManualOp(op).catch((error) => showError(error instanceof Error ? error.message : String(error)));
  }, [addLocalBeat, applyOp, showError]);

  const navigateBeat = useCallback(async (direction: -1 | 1) => {
    if (beats.length === 0) return;
    const currentIndex = activeBeatId === null ? beats.length - 1 : beats.findIndex((beat) => beat.id === activeBeatId);
    const nextIndex = Math.max(-1, Math.min(beats.length - 1, currentIndex + direction));
    if (nextIndex < 0) {
      setActiveBeat(null);
      return;
    }
    const beat = beats[nextIndex];
    setActiveBeat(beat.id);
    if (isTauri()) {
      try {
        const snapshot = await import('../../types/ipc').then((ipc) => ipc.restoreBeatSnapshot(beat.id));
        if (snapshot) setScene(snapshot);
      } catch {
        setActiveBeat(null);
      }
    }
  }, [activeBeatId, beats, setActiveBeat, setScene]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (event.altKey && !event.ctrlKey && !event.metaKey) {
        if (event.key === '0') {
          setThemeLocked(false);
          const op = { op: 'theme' as const, style: scene.theme, locked: false };
          applyOp(op, { manual: true });
          void applyManualOp(op).catch(() => undefined);
          event.preventDefault();
          return;
        }
        const index = Number(event.key);
        if (index >= 1 && index <= 6) {
          const theme = THEME_IDS[index - 1] as ThemeId;
          const op = { op: 'theme' as const, style: theme, locked: true };
          applyOp(op, { manual: true });
          void applyManualOp(op).catch(() => undefined);
          event.preventDefault();
          return;
        }
        if (event.key === 'ArrowLeft') {
          void navigateBeat(-1);
          event.preventDefault();
          return;
        }
        if (event.key === 'ArrowRight') {
          void navigateBeat(1);
          event.preventDefault();
          return;
        }
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey) {
        if (event.key.toLowerCase() === 'm') {
          toggleMute();
          event.preventDefault();
        } else if (event.key.toLowerCase() === 'k') {
          clearCanvas();
          event.preventDefault();
        } else if (event.key.toLowerCase() === 'p') {
          void openProjectorWindow(Boolean(config.canvas.projectorTransparent));
          event.preventDefault();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [applyOp, clearCanvas, config.canvas.projectorTransparent, navigateBeat, scene.theme, setThemeLocked, toggleMute]);

  const startDemo = useCallback(async () => {
    setOnboardingOpen(false);
    demoStop.current = false;
    if (isTauri()) {
      try {
        await runDemoLecture();
        setDemo(true, 1, 'Cálculo');
      } catch (e) {
        showError(e instanceof Error ? e.message : String(e));
      }
      return;
    }

    const session = useSessionStore.getState();
    session.reset();
    setSessionId('local-demo');
    resetScene(config.canvas.defaultTheme, 'local-demo');
    setDemo(true, 1, 'Cálculo');
    await runLocalDemo({
      applyOp: (op) => applyOp(op, { manual: true }),
      onAct: (act, title) => setDemo(true, act, title),
      onTranscript: (text) => {
        addTranscript({ utteranceId: `demo-${Date.now()}`, text, latencyMs: 38, durationMs: 900 });
      },
      onBeat: (label) => addLocalBeat(label),
      onStatus: (state) => setBrainStatus({ state }),
      shouldStop: () => demoStop.current,
    });
    setDemo(false);
  }, [addLocalBeat, addTranscript, applyOp, config.canvas.defaultTheme, resetScene, setBrainStatus, setDemo, setSessionId, showError]);

  const startLive = useCallback(async () => {
    setOnboardingOpen(false);
    try {
      if (isTauri()) {
        await startSession(scene.title ?? undefined);
      }
      setListening(true);
      setMuted(false);
    } catch (e) {
      showError(e instanceof Error ? e.message : String(e));
    }
  }, [scene.title, setListening, setMuted, showError]);

  const stopLive = useCallback(async () => {
    try {
      await stopSession();
    } catch (e) {
      showError(e instanceof Error ? e.message : String(e));
    }
    setListening(false);
  }, [setListening, showError]);

  const exportLesson = useCallback(async () => {
    if (!isTauri()) {
      const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Gizmo — Aula</title></head><body style="font-family:system-ui;padding:40px;background:#f8fafc;color:#0f172a"><h1>${scene.title ?? 'Aula Gizmo'}</h1><p>${scene.subtitle ?? ''}</p><pre style="white-space:pre-wrap;background:#0f172a;color:#e2e8f0;padding:20px;border-radius:12px">${JSON.stringify(scene, null, 2).replace(/</g, '&lt;')}</pre></body></html>`;
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'Aula-Gizmo.html';
      anchor.click();
      URL.revokeObjectURL(url);
      return;
    }
    if (!sessionId) {
      showError('Inicie uma aula antes de exportar.');
      return;
    }
    try {
      const path = await save({
        defaultPath: `Aula-Gizmo-${new Date().toISOString().slice(0, 10)}.html`,
        filters: [{ name: 'HTML', extensions: ['html'] }],
      });
      if (path) {
        await exportSessionHtml(sessionId, path);
      }
    } catch (e) {
      showError(e instanceof Error ? e.message : String(e));
    }
  }, [scene, sessionId, showError]);

  const mascotState: MascotState = useSessionStore((state) =>
    state.brainState === 'error'
      ? 'error'
      : state.isMuted
        ? 'muted'
        : state.brainState === 'streaming'
          ? 'thinking'
          : state.isListening
            ? 'listening'
            : 'idle',
  );

  const finalMascotState: MascotState = drawing ? 'drawing' : mascotState;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#070B14] text-slate-100">
      <TopControlBar onOpenSettings={() => setSettingsOpen(true)} onError={showError} />

      <div className="flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1 p-3">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_40%_20%,rgba(88,196,221,0.05),transparent_55%)]" />
          <CanvasViewport className="relative z-10" showEmptyHint={!demoRunning} />
          <div className="absolute bottom-6 right-6 z-30 flex flex-col items-end gap-2">
            <GizmoMascot
              state={finalMascotState}
              audioLevelRef={audioLevelRef}
              size={58}
              onClick={() => setSettingsOpen(true)}
            />
          </div>
          {demoRunning && (
            <div className="absolute left-7 top-7 z-30 flex items-center gap-2 rounded-full border border-cyan-400/30 bg-slate-950/80 px-3 py-1.5 text-[11px] font-bold text-cyan-200 backdrop-blur">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />
              Aula demo · Ato {demoAct ?? 1} · {demoTitle ?? 'Cálculo'}
            </div>
          )}
          {!isListening && !demoRunning && Object.keys(scene.nodes).length === 0 && !scene.title && (
            <button
              type="button"
              onClick={() => void startLive()}
              className="absolute bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-full border border-emerald-400/30 bg-slate-950/80 px-4 py-2 text-[12px] font-semibold text-emerald-200 backdrop-blur transition-colors hover:bg-slate-900"
            >
              🎙️ Começar aula ao vivo
            </button>
          )}
        </main>

        <TranscriptDrawer
          onDemo={() => void startDemo()}
          onExport={() => void exportLesson()}
          onError={showError}
        />
      </div>

      <BeatTimelineBar />

      <OnboardingWizard
        open={onboardingOpen}
        onClose={() => {
          localStorage.setItem('gizmo.onboarding.dismissed', '1');
          setOnboardingOpen(false);
        }}
        onStartLive={() => void startLive()}
        onStartDemo={() => void startDemo()}
      />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {error && (
        <div className="fixed bottom-20 left-1/2 z-[60] flex max-w-[560px] -translate-x-1/2 items-start gap-3 rounded-xl border border-rose-400/30 bg-rose-950/90 px-4 py-3 text-[12.5px] leading-relaxed text-rose-100 shadow-xl backdrop-blur">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-rose-300 hover:text-white">
            <X size={15} />
          </button>
        </div>
      )}

      {isListening && !isMuted && (
        <button
          type="button"
          onClick={() => void stopLive()}
          className="sr-only"
          aria-label="Parar escuta"
        />
      )}
    </div>
  );
};
