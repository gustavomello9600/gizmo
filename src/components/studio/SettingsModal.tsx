import React, { useEffect, useState } from 'react';
import {
  Check,
  Cpu,
  Download,
  Loader2,
  Mic,
  Palette,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { useConfigStore } from '../../stores/useConfigStore';
import { isTauri, listLlmModels, testLlmConnection } from '../../types/ipc';
import type { AppConfig, LlmProbeResult } from '../../types/config';
import { formatBytes, LLM_PRESETS } from '../../types/config';
import { THEME_DESCRIPTORS } from '../../themes/themeDescriptors';
import { THEME_IDS } from '../../types/scene';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

type Tab = 'audio' | 'models' | 'brain' | 'canvas';

const TABS: Array<{ id: Tab; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { id: 'audio', label: 'Áudio', icon: Mic },
  { id: 'models', label: 'Modelos', icon: Cpu },
  { id: 'brain', label: 'Cérebro', icon: Sparkles },
  { id: 'canvas', label: 'Canvas', icon: Palette },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({ open, onClose }) => {
  const { config, models, devices, downloads, save, download, refreshDevices } = useConfigStore();
  const [tab, setTab] = useState<Tab>('audio');
  const [draft, setDraft] = useState<AppConfig>(config);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [probe, setProbe] = useState<LlmProbeResult | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setDraft(config);
    setError(null);
    setProbe(null);
    if (isTauri()) void refreshDevices();
  }, [open, config, refreshDevices]);

  if (!open) return null;

  const saveAll = async () => {
    setSaving(true);
    setError(null);
    try {
      await save(draft);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
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
    } finally {
      setTesting(false);
    }
  };

  const input = 'w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-[12.5px] text-slate-200 outline-none focus:border-cyan-400/40';
  const label = 'grid gap-1 text-[11px] font-semibold text-slate-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-[900px] overflow-hidden rounded-[26px] border border-white/10 bg-[#0D1526] shadow-[0_50px_140px_-40px_rgba(0,0,0,0.9)]">
        <nav className="flex w-[190px] shrink-0 flex-col gap-1 border-r border-white/10 bg-black/20 p-3">
          <div className="mb-3 flex items-center gap-2 px-2 py-1">
            <Settings2 size={17} className="text-cyan-300" />
            <span className="text-[13px] font-bold text-white">Ajustes</span>
          </div>
          {TABS.map(({ id, label: tabLabel, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex h-9 items-center gap-2 rounded-lg px-2.5 text-[12.5px] font-semibold transition-colors ${
                tab === id ? 'bg-cyan-400/10 text-cyan-200' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
            >
              <Icon size={15} />
              {tabLabel}
            </button>
          ))}
          <div className="mt-auto rounded-xl border border-white/5 bg-white/[0.02] p-2.5 text-[10px] leading-relaxed text-slate-600">
            Gizmo 0.1.0 · local-first. Nenhum áudio sai da máquina.
          </div>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-5">
            <h2 className="text-[16px] font-bold text-white">
              {TABS.find((item) => item.id === tab)?.label}
            </h2>
            <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-white/5 hover:text-slate-200">
              <X size={17} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {tab === 'audio' && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <label className={label}>
                    Microfone de entrada
                    <select
                      value={draft.audio.inputDeviceName ?? ''}
                      onChange={(event) => setDraft({ ...draft, audio: { ...draft.audio, inputDeviceName: event.target.value || null } })}
                      className={input}
                    >
                      <option value="">Padrão do sistema</option>
                      {devices.map((device) => (
                        <option key={device.name} value={device.name}>{device.name} · {device.channels}ch {device.sampleRate}Hz</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="mb-3 flex items-center gap-2 text-[12px] font-bold text-slate-300">
                    <SlidersHorizontal size={14} className="text-cyan-300" /> Sensibilidade do VAD
                  </div>
                  <label className="grid gap-1 text-[11px] font-semibold text-slate-500">
                    Limiar de fala: {draft.audio.vadThreshold.toFixed(2)}
                    <input
                      type="range"
                      min={0.15}
                      max={0.85}
                      step={0.01}
                      value={draft.audio.vadThreshold}
                      onChange={(event) => setDraft({ ...draft, audio: { ...draft.audio, vadThreshold: Number(event.target.value) } })}
                      className="accent-cyan-400"
                    />
                  </label>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className={label}>
                      Silêncio para fechar cláusula (s)
                      <input
                        type="number"
                        min={0.18}
                        max={1.2}
                        step={0.02}
                        value={draft.audio.minSilenceDurationSec}
                        onChange={(event) => setDraft({ ...draft, audio: { ...draft.audio, minSilenceDurationSec: Number(event.target.value) } })}
                        className={input}
                      />
                    </label>
                    <label className={label}>
                      Tick de parcial especulativo (ms)
                      <input
                        type="number"
                        min={250}
                        max={1200}
                        step={50}
                        value={draft.audio.partialTickMs}
                        onChange={(event) => setDraft({ ...draft, audio: { ...draft.audio, partialTickMs: Number(event.target.value) } })}
                        className={input}
                      />
                    </label>
                  </div>
                  <p className="mt-2 text-[10.5px] leading-relaxed text-slate-600">
                    Padrões recomendados: 0,45 · 0,28 s · 400 ms. O parcial torna a reação quase instantânea sem esperar o fim da frase.
                  </p>
                </div>
              </div>
            )}

            {tab === 'models' && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[13px] font-bold text-white">Silero VAD v5</p>
                      <p className="text-[11px] text-slate-500">Obrigatório · ~2,2 MB · detecção local de fala</p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${models.sileroInstalled ? 'bg-emerald-400/15 text-emerald-300' : 'bg-amber-400/15 text-amber-300'}`}>
                      {models.sileroInstalled ? 'instalado' : 'pendente'}
                    </span>
                  </div>
                </div>
                {models.models.map((model) => {
                  const progress = downloads[model.id];
                  const busy = progress && (progress.phase === 'downloading' || progress.phase === 'extracting');
                  return (
                    <div key={model.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[13px] font-bold leading-tight text-white">{model.displayName}</p>
                          <p className="mt-1 text-[11px] text-slate-500">{formatBytes(model.approxBytes)} · {model.path ?? 'ainda não instalado'}</p>
                        </div>
                        <button
                          type="button"
                          disabled={model.installed || Boolean(busy)}
                          onClick={async () => {
                            setError(null);
                            try {
                              await download(model.id);
                            } catch (e) {
                              setError(e instanceof Error ? e.message : String(e));
                            }
                          }}
                          className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-2.5 text-[11px] font-bold text-cyan-200 hover:bg-cyan-400/15 disabled:opacity-40"
                        >
                          {busy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                          {model.installed ? <><Check size={12} /> Instalado</> : busy ? 'Baixando…' : 'Baixar'}
                        </button>
                      </div>
                      {progress && progress.phase !== 'ready' && (
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400"
                            style={{ width: `${progress.totalBytes ? Math.round((progress.downloadedBytes / progress.totalBytes) * 100) : 4}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
                <p className="text-[10.5px] leading-relaxed text-slate-600">
                  Os modelos ONNX são extraídos de forma atômica: se o download cair, nenhum arquivo corrompido é carregado.
                </p>
              </div>
            )}

            {tab === 'brain' && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-1.5">
                  {LLM_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setDraft({ ...draft, llm: { ...draft.llm, baseUrl: preset.baseUrl, model: preset.model } })}
                      className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:border-cyan-400/30 hover:text-white"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <label className={label}>
                  Base URL OpenAI-compatível
                  <input value={draft.llm.baseUrl} onChange={(event) => setDraft({ ...draft, llm: { ...draft.llm, baseUrl: event.target.value } })} className={`${input} font-mono`} />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={label}>
                    Modelo
                    <input list="settings-models" value={draft.llm.model} onChange={(event) => setDraft({ ...draft, llm: { ...draft.llm, model: event.target.value } })} className={input} />
                    <datalist id="settings-models">{availableModels.map((model) => <option key={model} value={model} />)}</datalist>
                  </label>
                  <label className={label}>
                    API Key
                    <input type="password" value={draft.llm.apiKey} onChange={(event) => setDraft({ ...draft, llm: { ...draft.llm, apiKey: event.target.value } })} className={`${input} font-mono`} placeholder="opcional" />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={label}>
                    Temperatura: {draft.llm.temperature.toFixed(2)}
                    <input type="range" min={0} max={1} step={0.05} value={draft.llm.temperature} onChange={(event) => setDraft({ ...draft, llm: { ...draft.llm, temperature: Number(event.target.value) } })} className="accent-cyan-400" />
                  </label>
                  <label className={label}>
                    Máximo de tokens
                    <input type="number" min={128} max={2048} step={64} value={draft.llm.maxTokens} onChange={(event) => setDraft({ ...draft, llm: { ...draft.llm, maxTokens: Number(event.target.value) } })} className={input} />
                  </label>
                </div>
                <label className="flex items-center gap-2 text-[12px] text-slate-300">
                  <input type="checkbox" checked={draft.llm.disableThinking} onChange={(event) => setDraft({ ...draft, llm: { ...draft.llm, disableThinking: event.target.checked } })} className="accent-cyan-400" />
                  Suprimir raciocínio oculto ({'<think>'}) para responder mais rápido
                </label>
                <button
                  type="button"
                  onClick={() => void testBrain()}
                  disabled={testing}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-400/10 text-[12.5px] font-bold text-cyan-200 hover:bg-cyan-400/15 disabled:opacity-50"
                >
                  {testing ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
                  {testing ? 'Medindo…' : 'Testar conexão'}
                </button>
                {probe && (
                  <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-[12px] text-emerald-200">
                    TTFT {probe.ttftMs}ms · primeira op {probe.firstOpMs}ms · {availableModels.length} modelos listados
                  </div>
                )}
              </div>
            )}

            {tab === 'canvas' && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <label className={label}>
                    Tema padrão ao abrir uma aula
                    <select
                      value={draft.canvas.defaultTheme}
                      onChange={(event) => setDraft({ ...draft, canvas: { ...draft.canvas, defaultTheme: event.target.value as AppConfig['canvas']['defaultTheme'] } })}
                      className={input}
                    >
                      {THEME_IDS.map((theme) => (
                        <option key={theme} value={theme}>{THEME_DESCRIPTORS[theme].label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="mt-3 flex items-center gap-2 text-[12px] text-slate-300">
                    <input type="checkbox" checked={draft.canvas.autoDetectTheme} onChange={(event) => setDraft({ ...draft, canvas: { ...draft.canvas, autoDetectTheme: event.target.checked } })} className="accent-cyan-400" />
                    Detectar automaticamente o estilo da aula
                  </label>
                  <label className="mt-3 flex items-center gap-2 text-[12px] text-slate-300">
                    <input type="checkbox" checked={draft.canvas.projectorTransparent} onChange={(event) => setDraft({ ...draft, canvas: { ...draft.canvas, projectorTransparent: event.target.checked } })} className="accent-cyan-400" />
                    Fundo transparente nativo na janela Projetor (OBS)
                  </label>
                  <label className="mt-2 flex items-center gap-2 text-[12px] text-slate-300">
                    <input type="checkbox" checked={draft.canvas.showMascotInProjector} onChange={(event) => setDraft({ ...draft, canvas: { ...draft.canvas, showMascotInProjector: event.target.checked } })} className="accent-cyan-400" />
                    Mostrar o mascote Gizmo na janela Projetor
                  </label>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-[12px] font-bold text-slate-300">Fundo da janela Projetor / OBS</p>
                  <select
                    value={draft.canvas.projectorChromaBg ?? ''}
                    onChange={(event) => setDraft({ ...draft, canvas: { ...draft.canvas, projectorChromaBg: event.target.value || null } })}
                    className={`${input} mt-2`}
                  >
                    <option value="">Tema normal</option>
                    <option value="#00FF00">Chroma Key verde (#00FF00)</option>
                    <option value="#0000FF">Chroma Key azul (#0000FF)</option>
                  </select>
                  <p className="mt-2 text-[10.5px] leading-relaxed text-slate-600">
                    Use a opção de transparência acima para o fundo alpha nativo ou escolha um chroma key capturável pelo OBS.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-[11px] leading-relaxed text-slate-500">
                  <p className="font-bold text-slate-400">Atalhos globais</p>
                  <p className="mt-1 font-mono">{draft.shortcuts.toggleMute} · mutar</p>
                  <p className="font-mono">{draft.shortcuts.clearCanvas} · limpar</p>
                  <p className="font-mono">{draft.shortcuts.openProjector} · projetor</p>
                  <p className="mt-2">Alt+0..6 troca o tema; Alt+←/→ navega pelos beats.</p>
                </div>
              </div>
            )}

            {error && <div className="mt-3 rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-[12px] text-rose-200">{error}</div>}
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-white/10 px-5 py-4">
            <button type="button" onClick={onClose} className="h-9 rounded-lg px-3 text-[12px] font-semibold text-slate-500 hover:text-slate-300">
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void saveAll()}
              disabled={saving}
              className="flex h-9 items-center gap-2 rounded-lg bg-cyan-400 px-4 text-[12px] font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-50"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Salvar ajustes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
