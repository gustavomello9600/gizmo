import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Cpu, Download, Loader2, Mic, Sparkles, Zap } from 'lucide-react';
import { useConfigStore } from '../../stores/useConfigStore';
import { audioLevelRef } from '../../stores/useSessionStore';
import { isTauri, testLlmConnection, listLlmModels } from '../../types/ipc';
import type { LlmProbeResult } from '../../types/config';
import { formatBytes, LLM_PRESETS } from '../../types/config';
import { GizmoMascot } from '../mascot/GizmoMascot';

interface OnboardingWizardProps {
  open: boolean;
  onClose: () => void;
  onStartLive: () => void;
  onStartDemo: () => void;
}

const MicLevel: React.FC = () => {
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    let smooth = 0;
    const tick = () => {
      smooth = smooth * 0.8 + Math.min(1, audioLevelRef.current.rms * 9) * 0.2;
      if (barRef.current) barRef.current.style.width = `${Math.round(smooth * 100)}%`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
      <div ref={barRef} className="h-full w-0 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-300 transition-[width] duration-75" />
    </div>
  );
};

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ open, onClose, onStartLive, onStartDemo }) => {
  const { config, models, devices, downloads, save, download, refreshDevices } = useConfigStore();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(config);
  const [testing, setTesting] = useState(false);
  const [probe, setProbe] = useState<LlmProbeResult | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(config);
      setStep(0);
      setProbe(null);
      setError(null);
      if (isTauri()) void refreshDevices();
    }
  }, [open, config, refreshDevices]);

  if (!open) return null;

  const progress = downloads[draft.asr.activeModelId];
  const selectedModel = models.models.find((model) => model.id === draft.asr.activeModelId);
  const installed = selectedModel?.installed ?? false;
  const canContinue = !isTauri() || (models.sileroInstalled && installed);

  const persist = async (next: typeof draft) => {
    setDraft(next);
    await save(next);
  };

  const chooseModel = (modelId: typeof draft.asr.activeModelId) => {
    const next = { ...draft, asr: { ...draft.asr, activeModelId: modelId } };
    setDraft(next);
  };

  const startDownload = async () => {
    setError(null);
    try {
      await download(draft.asr.activeModelId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const testBrain = async () => {
    setTesting(true);
    setError(null);
    try {
      const result = await testLlmConnection(draft.llm);
      setProbe(result);
      const list = await listLlmModels(draft.llm.baseUrl, draft.llm.apiKey);
      setAvailableModels(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setProbe(null);
    } finally {
      setTesting(false);
    }
  };

  const preset = (index: number) => {
    const item = LLM_PRESETS[index];
    setDraft({ ...draft, llm: { ...draft.llm, baseUrl: item.baseUrl, model: item.model } });
  };

  const finish = async () => {
    try {
      await save(draft);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-[820px] flex-col overflow-hidden rounded-[26px] border border-white/10 bg-[#0D1526] shadow-[0_50px_140px_-40px_rgba(0,0,0,0.9)]">
        <div className="flex shrink-0 items-center gap-4 border-b border-white/10 px-6 py-4">
          <GizmoMascot state="idle" audioLevelRef={audioLevelRef} size={52} />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">Primeira execução</p>
            <h2 className="text-[22px] font-bold tracking-tight text-white">
              {step === 0 ? 'Configure os ouvidos locais' : step === 1 ? 'Conecte o cérebro' : 'Pronto para começar'}
            </h2>
          </div>
          <div className="flex items-center gap-1.5">
            {[0, 1, 2].map((item) => (
              <span
                key={item}
                className={`h-1.5 rounded-full transition-all ${item === step ? 'w-8 bg-cyan-300' : item < step ? 'w-3 bg-emerald-400' : 'w-3 bg-white/15'}`}
              />
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {step === 0 && (
            <div className="space-y-4">
              <p className="text-[13.5px] leading-relaxed text-slate-400">
                O áudio nunca sai desta máquina. Escolha o modelo que combina com suas aulas; o Silero VAD (~2 MB) é instalado junto.
              </p>
              <div className="grid gap-2.5 md:grid-cols-3">
                {models.models.map((model) => {
                  const selected = draft.asr.activeModelId === model.id;
                  return (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => chooseModel(model.id)}
                      className={`relative rounded-2xl border p-4 text-left transition-colors ${
                        selected ? 'border-cyan-400/50 bg-cyan-400/10' : 'border-white/10 bg-white/[0.03] hover:border-white/20'
                      }`}
                    >
                      {selected && <Check size={14} className="absolute right-3 top-3 text-cyan-300" />}
                      <p className="pr-5 text-[13.5px] font-bold leading-tight text-white">{model.displayName}</p>
                      <p className="mt-1 text-[11px] text-slate-500">{formatBytes(model.approxBytes)}</p>
                      {model.installed && <span className="mt-2 inline-flex rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">instalado</span>}
                    </button>
                  );
                })}
              </div>

              {isTauri() && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-[12.5px] text-slate-300">
                      <Download size={15} className="text-cyan-300" />
                      {progress?.phase === 'extracting' ? 'Extraindo arquivos…' : progress?.phase === 'downloading' ? 'Baixando modelo…' : installed ? 'Ouvidos prontos' : 'Baixar modelo + Silero VAD'}
                    </div>
                    <button
                      type="button"
                      disabled={installed || progress?.phase === 'downloading' || progress?.phase === 'extracting'}
                      onClick={() => void startDownload()}
                      className="flex h-9 items-center gap-2 rounded-xl bg-cyan-400 px-3.5 text-[12px] font-bold text-slate-950 transition-colors hover:bg-cyan-300 disabled:opacity-40"
                    >
                      {progress && progress.phase !== 'ready' && <Loader2 size={14} className="animate-spin" />}
                      {installed ? 'Instalado' : progress ? 'Baixando…' : 'Baixar'}
                    </button>
                  </div>
                  {progress && progress.phase !== 'ready' && (
                    <div className="mt-3">
                      <div className="h-2 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-[width]"
                          style={{ width: `${progress.totalBytes ? Math.round((progress.downloadedBytes / progress.totalBytes) * 100) : 4}%` }}
                        />
                      </div>
                      <p className="mt-1.5 font-mono text-[10px] text-slate-500">
                        {formatBytes(progress.downloadedBytes)} / {formatBytes(progress.totalBytes)}
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <label className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                  <Mic size={13} /> Microfone
                </label>
                <select
                  value={draft.audio.inputDeviceName ?? ''}
                  onChange={(event) => setDraft({ ...draft, audio: { ...draft.audio, inputDeviceName: event.target.value || null } })}
                  className="mb-3 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-[12.5px] text-slate-200 outline-none focus:border-cyan-400/40"
                >
                  <option value="">Microfone padrão do sistema</option>
                  {devices.map((device) => (
                    <option key={device.name} value={device.name}>
                      {device.name}{device.isDefault ? ' (padrão)' : ''} · {device.channels}ch {device.sampleRate}Hz
                    </option>
                  ))}
                </select>
                <MicLevel />
                <p className="mt-2 text-[10.5px] text-slate-600">Fale algo para confirmar que o nível verde se move.</p>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <p className="text-[13.5px] leading-relaxed text-slate-400">
                Qualquer endpoint OpenAI-compatível funciona. Local e offline é o padrão; nuvem é opcional.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {LLM_PRESETS.map((item, index) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => preset(index)}
                    className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-300 transition-colors hover:border-cyan-400/30 hover:text-white"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="grid gap-3">
                <label className="grid gap-1 text-[11px] font-semibold text-slate-500">
                  Base URL
                  <input
                    value={draft.llm.baseUrl}
                    onChange={(event) => setDraft({ ...draft, llm: { ...draft.llm, baseUrl: event.target.value } })}
                    className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 font-mono text-[12.5px] text-slate-200 outline-none focus:border-cyan-400/40"
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-[11px] font-semibold text-slate-500">
                    Modelo
                    <input
                      list="onboarding-models"
                      value={draft.llm.model}
                      onChange={(event) => setDraft({ ...draft, llm: { ...draft.llm, model: event.target.value } })}
                      className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-[12.5px] text-slate-200 outline-none focus:border-cyan-400/40"
                    />
                    <datalist id="onboarding-models">
                      {availableModels.map((model) => <option key={model} value={model} />)}
                    </datalist>
                  </label>
                  <label className="grid gap-1 text-[11px] font-semibold text-slate-500">
                    API Key (opcional)
                    <input
                      type="password"
                      value={draft.llm.apiKey}
                      onChange={(event) => setDraft({ ...draft, llm: { ...draft.llm, apiKey: event.target.value } })}
                      placeholder="sk-…"
                      className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 font-mono text-[12.5px] text-slate-200 outline-none focus:border-cyan-400/40"
                    />
                  </label>
                </div>
              </div>

              <button
                type="button"
                onClick={() => void testBrain()}
                disabled={testing}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-400/10 text-[12.5px] font-bold text-cyan-200 transition-colors hover:bg-cyan-400/15 disabled:opacity-50"
              >
                {testing ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
                {testing ? 'Medindo latência…' : 'Testar conexão e medir latência'}
              </button>

              {probe && (
                <div className={`rounded-xl border p-3 text-[12px] ${probe.ttftMs < 350 ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' : probe.ttftMs < 900 ? 'border-amber-400/30 bg-amber-400/10 text-amber-200' : 'border-rose-400/30 bg-rose-400/10 text-rose-200'}`}>
                  <p className="font-bold">
                    TTFT {probe.ttftMs}ms · primeira operação {probe.firstOpMs}ms
                  </p>
                  <p className="mt-1 opacity-80">
                    {probe.ttftMs < 350 ? 'Excelente para tempo real!' : probe.ttftMs < 900 ? 'Bom — use modelos 7B/8B ou Groq para resposta instantânea.' : 'Pode ficar lento numa aula. Prefira um endpoint local quente.'}
                  </p>
                  <pre className="mt-2 overflow-hidden rounded-lg bg-black/20 p-2 font-mono text-[10px] opacity-70">{probe.sample.slice(0, 160)}</pre>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-5 text-center">
                <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">
                  <Sparkles size={28} />
                </div>
                <h3 className="text-[20px] font-bold text-white">Tudo conectado</h3>
                <p className="mt-1 text-[13px] leading-relaxed text-slate-400">
                  {isTauri() ? 'Microfone, VAD e cérebro estão configurados. A primeira ilustração chega em menos de meio segundo.' : 'Você está na prévia do navegador. A aula demo funciona; o microfone exige o app nativo.'}
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={onStartLive}
                  disabled={!canContinue || !isTauri()}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl bg-cyan-400 text-[13px] font-bold text-slate-950 transition-colors hover:bg-cyan-300 disabled:opacity-40"
                >
                  <Mic size={16} /> Começar aula ao vivo
                </button>
                <button
                  type="button"
                  onClick={onStartDemo}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 text-[13px] font-bold text-slate-200 transition-colors hover:border-white/20 hover:bg-white/10"
                >
                  <Cpu size={16} /> Assistir aula demo
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-3 rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-[12px] text-rose-200">{error}</div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-white/10 px-6 py-4">
          <button type="button" onClick={onClose} className="text-[12px] font-semibold text-slate-500 hover:text-slate-300">
            Configurar depois
          </button>
          {step < 2 ? (
            <button
              type="button"
              onClick={() => {
                if (step === 0 && !canContinue) {
                  setError('Baixe o modelo de voz e o Silero VAD para continuar.');
                  return;
                }
                setError(null);
                if (step === 0) {
                  void save(draft);
                }
                setStep(step + 1);
              }}
              className="flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-[12.5px] font-bold text-slate-950 transition-colors hover:bg-slate-200"
            >
              Continuar <ArrowRight size={15} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void finish()}
              className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-[12.5px] font-bold text-slate-200 transition-colors hover:bg-white/10"
            >
              Entrar no Studio <ArrowRight size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
