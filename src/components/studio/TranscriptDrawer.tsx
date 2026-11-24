import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Film, Send, Sparkles } from 'lucide-react';
import { useSessionStore } from '../../stores/useSessionStore';
import { dispatchManualPrompt, isTauri } from '../../types/ipc';

interface TranscriptDrawerProps {
  onDemo: () => void;
  onExport: () => void;
  onError: (message: string) => void;
}

function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export const TranscriptDrawer: React.FC<TranscriptDrawerProps> = ({ onDemo, onExport, onError }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [draft, setDraft] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const {
    transcriptLog,
    partialTranscript,
    brainState,
    brainError,
    addManualTranscript,
    demoRunning,
  } = useSessionStore();

  useEffect(() => {
    const element = logRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [transcriptLog.length, partialTranscript]);

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    addManualTranscript(text);
    try {
      await dispatchManualPrompt(text);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  };

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="flex w-9 shrink-0 items-center justify-center border-l border-white/10 bg-[#0B1220] text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
        title="Abrir transcrição"
      >
        <ChevronLeft size={17} />
      </button>
    );
  }

  return (
    <aside className="flex w-[340px] shrink-0 flex-col border-l border-white/10 bg-[#0B1220] xl:w-[380px]">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-4">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Transcrição ao vivo</span>
          {brainState === 'streaming' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />}
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-white/5 hover:text-slate-300"
          title="Recolher painel"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div ref={logRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {transcriptLog.length === 0 && !partialTranscript && (
          <div className="rounded-xl border border-dashed border-white/10 p-4 text-center">
            <p className="text-[13px] font-semibold text-slate-300">Ouvidos locais prontos</p>
            <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
              Fale normalmente. Cada cláusula vira uma ilustração sem sair deste computador.
            </p>
          </div>
        )}

        {transcriptLog.map((entry) => (
          <div key={entry.id} className="group">
            <div className="mb-1 flex items-center gap-2 text-[10px] font-medium text-slate-500">
              <span className="font-mono">{formatClock(entry.at)}</span>
              {entry.latencyMs > 0 && (
                <span className="rounded-full bg-white/5 px-1.5 py-0.5 font-mono" title="Tempo de decodificação ASR">
                  {entry.latencyMs}ms
                </span>
              )}
              {entry.manual && <span className="rounded-full bg-cyan-400/10 px-1.5 py-0.5 text-cyan-300">direção</span>}
            </div>
            <p className={`text-[13.5px] leading-relaxed ${entry.manual ? 'italic text-cyan-100/80' : 'text-slate-200'}`}>
              “{entry.text}”
            </p>
          </div>
        ))}

        {partialTranscript && (
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium text-cyan-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />
              ouvindo agora
            </div>
            <p className="text-[13.5px] leading-relaxed text-slate-400">{partialTranscript}…</p>
          </div>
        )}

        {brainState === 'error' && brainError && (
          <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-[12px] leading-relaxed text-amber-100">
            <p className="font-semibold">O cérebro não respondeu</p>
            <p className="mt-1 opacity-80">{brainError}</p>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-white/10 p-3">
        <label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
          <Sparkles size={12} /> Direção rápida
        </label>
        <div className="flex items-end gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-1.5 focus-within:border-cyan-400/40">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            rows={2}
            placeholder="Ex.: adicione a reta tangente em x=2…"
            className="min-h-[38px] flex-1 resize-none bg-transparent px-1.5 py-1 text-[12.5px] leading-snug text-slate-200 outline-none placeholder:text-slate-600"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={!draft.trim()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-400/15 text-cyan-200 transition-colors hover:bg-cyan-400/25 disabled:opacity-30"
            title="Enviar para o cérebro"
          >
            <Send size={14} />
          </button>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onDemo}
            disabled={demoRunning}
            className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 text-[12px] font-semibold text-slate-200 transition-colors hover:border-white/20 hover:bg-white/10 disabled:opacity-40"
          >
            <Film size={14} />
            {demoRunning ? 'Demo rodando…' : 'Aula Demo'}
          </button>
          <button
            type="button"
            onClick={onExport}
            className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 text-[12px] font-semibold text-slate-200 transition-colors hover:border-white/20 hover:bg-white/10"
          >
            <Download size={14} />
            Exportar
          </button>
        </div>
        {!isTauri() && (
          <p className="mt-2 text-center text-[10px] leading-snug text-slate-600">
            Prévia no navegador: o microfone e a exportação ficam no app nativo.
          </p>
        )}
      </div>
    </aside>
  );
};
