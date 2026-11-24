import React from 'react';
import { Circle, Radio, RotateCcw } from 'lucide-react';
import { useSceneStore } from '../../stores/useSceneStore';
import { useSessionStore } from '../../stores/useSessionStore';
import { isTauri, restoreBeatSnapshot, getSceneSnapshot } from '../../types/ipc';
import { emit } from '@tauri-apps/api/event';

export const BeatTimelineBar: React.FC = () => {
  const setScene = useSceneStore((state) => state.setScene);
  const { beats, activeBeatId, setActiveBeat, layoutMs, ttftMs, demoRunning, demoAct, demoTitle, sessionId, transcriptLog } = useSessionStore();

  const restore = async (beatId: number) => {
    setActiveBeat(beatId);
    if (!isTauri()) return;
    try {
      await emit('beat:mode', { revisiting: true });
      const snapshot = await restoreBeatSnapshot(beatId);
      if (snapshot) setScene(snapshot);
    } catch {
      setActiveBeat(null);
    }
  };

  const goLive = async () => {
    setActiveBeat(null);
    if (!isTauri()) return;
    try {
      await emit('beat:mode', { revisiting: false });
      const live = await getSceneSnapshot();
      if (live) {
        setScene(live);
        await emit('scene:snapshot', live);
      }
    } catch {
      // a próxima operação ao vivo atualiza o canvas de qualquer forma
    }
  };

  return (
    <footer className="flex h-14 shrink-0 items-center gap-3 border-t border-white/10 bg-[#0B1220] px-4 text-slate-300">
      <div className="flex shrink-0 items-center gap-1.5 text-slate-500">
        <Circle size={7} fill="currentColor" />
        <span className="text-[10px] font-bold uppercase tracking-[0.14em]">Beats</span>
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-1">
        {beats.length === 0 && !demoRunning && (
          <span className="text-[11.5px] text-slate-600">
            {sessionId ? 'Os momentos da aula aparecem aqui.' : 'Inicie uma aula ou rode a demonstração.'}
          </span>
        )}
        {demoRunning && demoAct && (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-200">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />
            Demo · Ato {demoAct} · {demoTitle}
          </span>
        )}
        {beats.map((beat, index) => (
          <button
            key={beat.id}
            type="button"
            onClick={() => void restore(beat.id)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
              activeBeatId === beat.id
                ? 'border-amber-400/40 bg-amber-400/10 text-amber-200'
                : 'border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20 hover:text-slate-200'
            }`}
            title={new Date(beat.createdAtMs).toLocaleTimeString('pt-BR')}
          >
            <span className="font-mono text-[10px] opacity-60">{String(index + 1).padStart(2, '0')}</span>
            {beat.label}
          </button>
        ))}
      </div>

      {activeBeatId !== null && (
        <button
          type="button"
          onClick={goLive}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-bold text-emerald-200"
        >
          <Radio size={12} />
          Voltar ao vivo
        </button>
      )}

      <div className="hidden shrink-0 items-center gap-3 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 font-mono text-[10px] text-slate-500 lg:flex">
        <span>🎙️ {transcriptLog.length > 0 ? `${transcriptLog[transcriptLog.length - 1].latencyMs}ms` : '—'}</span>
        <span>🧠 {ttftMs != null ? `${ttftMs}ms` : '—'}</span>
        <span>🎨 {layoutMs.toFixed(1)}ms</span>
        <span className="inline-flex items-center gap-1 text-slate-600">
          <RotateCcw size={10} /> 60fps
        </span>
      </div>
    </footer>
  );
};
