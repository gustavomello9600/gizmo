import React from 'react';
import {
  Eraser,
  Lock,
  Mic,
  MicOff,
  MonitorUp,
  Settings,
  Sparkles,
  Unlock,
} from 'lucide-react';
import { useSceneStore } from '../../stores/useSceneStore';
import { useSessionStore } from '../../stores/useSessionStore';
import { useConfigStore } from '../../stores/useConfigStore';
import { THEME_DESCRIPTORS } from '../../themes/themeDescriptors';
import type { ThemeId } from '../../types/scene';
import { THEME_IDS } from '../../types/scene';
import { applyManualOp, isTauri, openProjectorWindow, setMute, startSession, stopSession } from '../../types/ipc';

interface TopControlBarProps {
  onOpenSettings: () => void;
  onError: (message: string) => void;
}

export const TopControlBar: React.FC<TopControlBarProps> = ({ onOpenSettings, onError }) => {
  const scene = useSceneStore((state) => state.scene);
  const applyOp = useSceneStore((state) => state.applyOp);
  const setThemeLocked = useSceneStore((state) => state.setThemeLocked);
  const { isListening, isMuted, setListening, setMuted, addLocalBeat, brainState } = useSessionStore();
  const config = useConfigStore((state) => state.config);

  const toggleLive = async () => {
    try {
      if (isListening) {
        await stopSession();
        setListening(false);
        return;
      }
      if (!isTauri()) {
        onError('A escuta ao vivo exige o app nativo (Tauri). Use a Aula Demo para ver o Gizmo em ação.');
        return;
      }
      await startSession(scene.title ?? undefined);
      setListening(true);
      setMuted(false);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  };

  const toggleMute = async () => {
    const next = !isMuted;
    setMuted(next);
    try {
      await setMute(next);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  };

  const selectTheme = (value: string) => {
    if (value === 'auto') {
      setThemeLocked(false);
      const op = { op: 'theme' as const, style: scene.theme, locked: false };
      applyOp(op, { manual: true });
      void applyManualOp(op).catch((error) => onError(error instanceof Error ? error.message : String(error)));
      return;
    }
    const theme = value as ThemeId;
    const op = { op: 'theme' as const, style: theme, locked: true };
    applyOp(op, { manual: true });
    void applyManualOp(op).catch((error) => onError(error instanceof Error ? error.message : String(error)));
  };

  const toggleLock = () => {
    const op = { op: 'theme' as const, style: scene.theme, locked: !scene.themeLocked };
    applyOp(op, { manual: true });
    if (!scene.themeLocked) setThemeLocked(true);
    void applyManualOp(op).catch((error) => onError(error instanceof Error ? error.message : String(error)));
  };

  const clear = () => {
    if (!isTauri()) addLocalBeat('Antes de limpar');
    const op = { op: 'clear' as const };
    applyOp(op, { manual: true });
    void applyManualOp(op).catch((error) => onError(error instanceof Error ? error.message : String(error)));
  };

  const openProjector = async () => {
    try {
      await openProjectorWindow(Boolean(config.canvas.projectorTransparent));
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  };

  const listeningLabel = isListening ? (isMuted ? 'Mutado' : 'Ao vivo') : 'Iniciar escuta';
  const dotColor = brainState === 'error' ? '#F59E0B' : brainState === 'streaming' ? 'var(--color-primary)' : isListening ? '#34D399' : '#64748B';

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-white/10 bg-[#0B1220]/95 px-4 text-slate-100 backdrop-blur">
      <div className="flex items-center gap-2.5 pr-2">
        <img src="/assets/logo-icon.svg" alt="Gizmo" className="h-9 w-9" />
        <div className="hidden leading-tight sm:block">
          <p className="text-[15px] font-bold tracking-tight">Gizmo</p>
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">Studio</p>
        </div>
      </div>

      <button
        type="button"
        onClick={toggleLive}
        className={`group flex h-10 items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold transition-colors ${
          isListening
            ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
            : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20'
        }`}
        title={isListening ? 'Encerrar escuta' : 'Começar a ouvir'}
      >
        <span className="relative flex h-2.5 w-2.5">
          {isListening && !isMuted && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: dotColor }} />
        </span>
        {isListening ? <Mic size={15} /> : <MicOff size={15} />}
        {listeningLabel}
      </button>

      {isListening && (
        <button
          type="button"
          onClick={toggleMute}
          className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${
            isMuted ? 'border-amber-400/40 bg-amber-400/10 text-amber-200' : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20'
          }`}
          title="Mutar microfone (Ctrl/Cmd+Shift+M)"
        >
          {isMuted ? <MicOff size={15} /> : <Mic size={15} />}
        </button>
      )}

      <div className="mx-1 h-6 w-px bg-white/10" />

      <div className="flex h-10 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 pl-3 pr-1.5">
        <Sparkles size={14} className="text-slate-400" />
        <select
          value={scene.themeLocked ? scene.theme : 'auto'}
          onChange={(event) => selectTheme(event.target.value)}
          className="h-8 max-w-[190px] cursor-pointer appearance-none bg-transparent pr-2 text-[13px] font-semibold text-slate-200 outline-none"
          title="Estilo do canvas"
        >
          <option value="auto" className="bg-slate-900">Auto · {THEME_DESCRIPTORS[scene.theme].shortLabel}</option>
          {THEME_IDS.map((theme) => (
            <option key={theme} value={theme} className="bg-slate-900">
              {THEME_DESCRIPTORS[theme].shortLabel}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={toggleLock}
          className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
            scene.themeLocked ? 'bg-cyan-400/15 text-cyan-200' : 'text-slate-500 hover:text-slate-300'
          }`}
          title={scene.themeLocked ? 'Destravar tema automático (Alt+0)' : 'Travar tema atual'}
        >
          {scene.themeLocked ? <Lock size={13} /> : <Unlock size={13} />}
        </button>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={clear}
          className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
          title="Limpar canvas (Ctrl/Cmd+Shift+K)"
        >
          <Eraser size={15} />
          <span className="hidden xl:inline">Limpar</span>
        </button>
        <button
          type="button"
          onClick={openProjector}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 text-[12.5px] font-medium text-slate-200 transition-colors hover:border-white/20 hover:bg-white/10"
          title="Abrir janela Projetor/OBS (Ctrl/Cmd+Shift+P)"
        >
          <MonitorUp size={15} />
          <span className="hidden lg:inline">Projetor</span>
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
          title="Ajustes"
        >
          <Settings size={17} />
        </button>
      </div>
    </header>
  );
};
