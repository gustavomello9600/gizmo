# 08 — Scaffold Exato de Arquivos, Configurações e Contratos de Código

> **INSTRUÇÃO AO AGENTE CONSTRUTOR:** Use exatamente os nomes de pastas, arquivos, pacotes e assinaturas definidos neste documento. Não invente nomes alternativos.

---

## 1. Árvore Completa do Código-Fonte a Construir

```text
gizmo/
├── assets/                          # (Já existente no repo — logos e previews SVG)
├── schemas/                         # (Já existente no repo — JSON Schemas formais)
├── specs/                           # (Já existente no repo — especificações 00..09)
├── index.html                       # Entrypoint HTML da StudioWindow e ProjectorWindow (?window=projector)
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── src/
│   ├── main.tsx                     # Detecta janela ('studio' vs 'projector') e monta a raiz apropriada
│   ├── styles/
│   │   ├── globals.css              # Tailwind + imports locais @fontsource + katex.min.css + variáveis de tema
│   │   └── animations.css           # Keyframes GPU (stroke-draw, pulse-halo, dashed-flow)
│   ├── types/
│   │   ├── scene.ts                 # ThemeId, SemanticZone, NodeKind, SceneOp, SceneNode, SceneGraph
│   │   ├── config.ts                # AppConfig, AsrModelInfo, AudioDeviceInfo, TelemetryMetrics
│   │   └── ipc.ts                   # Tipagem estrita dos comandos invoke() e eventos listen()
│   ├── stores/
│   │   ├── useSceneStore.ts         # SceneGraph, applySceneOp, activeHighlights, beatHistory
│   │   ├── useSessionStore.ts       # isListening, isMuted, partialTranscript, transcriptLog, brainStatus
│   │   └── useConfigStore.ts        # AppConfig sincronizada com backend Rust
│   ├── themes/
│   │   ├── themeDescriptors.ts      # Os 6 ThemeDescriptors completos + CSS custom properties applier
│   │   └── CanvasSvgDefs.tsx        # Filtros SVG globais (#gizmo-glow-3b1b, #gizmo-chalk-stroke)
│   ├── layout/
│   │   ├── solveLayout.ts           # Solver determinístico 1920x1080 (<1.5ms) + ZoneSubSplitter
│   │   ├── solveEdges.ts            # Curvas cúbicas Bezier inter-nós
│   │   └── solveDiagramDagre.ts     # Wrapper rápido @dagrejs/dagre para nós kind="diagram"
│   ├── utils/
│   │   ├── hash.ts                  # fnv1a32 determinístico para Rough.js
│   │   ├── safeMathParser.ts        # Wrapper expr-eval seguro + corte de assíntotas
│   │   └── roughHelper.ts           # Gerador puro de caminhos Rough.js memorizáveis
│   ├── components/
│   │   ├── canvas/
│   │   │   ├── CanvasViewport.tsx   # Escala uniforme 1920x1080 + 3 camadas GPU
│   │   │   ├── Layer0Background.tsx # Grade/textura específica de cada um dos 6 temas
│   │   │   ├── Layer2LiveOverlay.tsx# Loop requestAnimationFrame para áudio e foco sem re-render
│   │   │   ├── NodeShell.tsx        # Posicionamento translate3d + ErrorBoundary + animação de entrada/saída
│   │   │   ├── InterNodeEdges.tsx   # Renderizador das conexões op="connect"
│   │   │   └── renderers/           # Os 14 renderizadores isolados e puros:
│   │   │       ├── MathRenderer.tsx
│   │   │       ├── Plot2DRenderer.tsx
│   │   │       ├── Geometry2DRenderer.tsx
│   │   │       ├── ChartRenderer.tsx
│   │   │       ├── DiagramRenderer.tsx
│   │   │       ├── BulletsRenderer.tsx
│   │   │       ├── CodeRenderer.tsx
│   │   │       ├── Matrix2x2Renderer.tsx
│   │   │       ├── FunnelRenderer.tsx
│   │   │       ├── TimelineRenderer.tsx
│   │   │       ├── KpiRenderer.tsx
│   │   │       ├── ComparisonRenderer.tsx
│   │   │       ├── CalloutRenderer.tsx
│   │   │       └── FreehandNoteRenderer.tsx
│   │   ├── mascot/
│   │   │   └── GizmoMascot.tsx      # Mascote vetorial vivo com 6 estados e reação a RMS 60fps
│   │   ├── studio/
│   │   │   ├── StudioApp.tsx
│   │   │   ├── TopControlBar.tsx
│   │   │   ├── TranscriptDrawer.tsx
│   │   │   ├── BeatTimelineBar.tsx
│   │   │   ├── OnboardingWizard.tsx
│   │   │   └── SettingsModal.tsx
│   │   └── projector/
│   │       └── ProjectorApp.tsx     # Canvas puro 16:9 + suporte a fundo transparente/chroma OBS
│   └── __tests__/
│       ├── solveLayout.test.ts      # Garante 0 sobreposição em todas as combinações de zonas
│       ├── sceneReducer.test.ts     # Testa todas as 10 SceneOps e auto-eviction
│       └── safeMathParser.test.ts   # Testa x^2, sin(x), assíntotas 1/x e expressões inválidas
└── src-tauri/
    ├── Cargo.toml
    ├── build.rs
    ├── tauri.conf.json
    ├── capabilities/
    │   └── default.json             # Permissões Tauri v2 para janelas 'main' e 'projector'
    └── src/
        ├── main.rs
        ├── lib.rs                   # Registro de plugins, estado global AppState e todos os #[tauri::command]
        ├── config.rs                # Leitura/escrita atômica de config.json
        ├── error.rs                 # AppError serializável para IPC
        ├── audio/
        │   ├── mod.rs
        │   ├── capture.rs           # cpal + rtrb SPSC lock-free
        │   ├── vad_loop.rs          # rubato 16kHz + Silero VAD v5 + RollingUtteranceTracker (400ms/280ms)
        │   ├── asr_worker.rs        # Thread dedicada sherpa-onnx (Parakeet, Whisper Turbo, SenseVoice)
        │   ├── model_manifest.rs    # Catálogo oficial de modelos e URLs
        │   └── model_downloader.rs  # Streaming reqwest + bzip2 + tar + extração atômica
        ├── brain/
        │   ├── mod.rs
        │   ├── prompts.rs           # SYSTEM_PROMPT_V1 estático byte-a-byte + formatador de turno
        │   ├── reflex.rs            # Tier-0 Local Reflex (<10ms comandos de voz + spotlight léxico)
        │   ├── theme_classifier.rs  # Fallback léxico local para os 6 temas
        │   ├── scheduler.rs         # Single-Flight Coalescing Scheduler + CancellationToken
        │   ├── sse_client.rs        # Cliente OpenAI-compatível reqwest + TCP_NODELAY + filtro <think>
        │   └── ndjson_parser.rs     # Sanitizador de escapes LaTeX + parser incremental por '\n'
        ├── scene/
        │   ├── mod.rs
        │   ├── state.rs             # CanonicalSceneGraph em Rust + digest compacto (<400 tokens)
        │   └── exporter.rs          # Exportador pós-aula para HTML autocontido / Markdown
        ├── storage/
        │   └── sqlite.rs            # Persistência assíncrona de sessões, transcrições e BeatSnapshots
        └── demo/
            └── simulator.rs         # Roteiro de aula demonstrativa multi-tema p/ testes e onboarding
```

---

## 2. Arquivos de Configuração Exatos

### 2.1. `package.json`
```json
{
  "name": "gizmo",
  "private": true,
  "version": "0.1.0",
  "description": "Gizmo — Companion local de aulas com ilustrações vivas em tempo real",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "tauri": "tauri"
  },
  "dependencies": {
    "@dagrejs/dagre": "^1.1.4",
    "@fontsource/crimson-pro": "^5.1.0",
    "@fontsource/inter": "^5.1.0",
    "@fontsource/jetbrains-mono": "^5.1.0",
    "@fontsource/kalam": "^5.1.0",
    "@fontsource/outfit": "^5.1.0",
    "@fontsource/plus-jakarta-sans": "^5.1.0",
    "@tauri-apps/api": "^2.2.0",
    "@tauri-apps/plugin-dialog": "^2.2.0",
    "@tauri-apps/plugin-fs": "^2.2.0",
    "@tauri-apps/plugin-global-shortcut": "^2.2.0",
    "@tauri-apps/plugin-shell": "^2.2.0",
    "expr-eval": "^2.0.2",
    "katex": "^0.16.11",
    "lucide-react": "^0.468.0",
    "motion": "^11.15.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "roughjs": "^4.6.6",
    "zustand": "^5.0.2"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.2.0",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@types/katex": "^0.16.7",
    "@types/node": "^22.10.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "jsdom": "^25.0.1",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "typescript": "~5.7.2",
    "vite": "^6.0.5",
    "vitest": "^2.1.8"
  }
}
```

### 2.2. `src-tauri/Cargo.toml`
```toml
[package]
name = "gizmo"
version = "0.1.0"
description = "Gizmo — Real-time local lecture visual companion"
authors = ["Gizmo Contributors"]
edition = "2021"
rust-version = "1.80"

[lib]
name = "gizmo_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2.0", features = [] }

[dependencies]
tauri = { version = "2.2", features = ["macos-private-api"] }
tauri-plugin-dialog = "2.2"
tauri-plugin-fs = "2.2"
tauri-plugin-global-shortcut = "2.2"
tauri-plugin-shell = "2.2"

tokio = { version = "1.42", features = ["full"] }
tokio-util = "0.7"
futures-util = "0.3"
parking_lot = "0.12"
crossbeam-channel = "0.5"
rtrb = "0.3"

cpal = "0.15"
rubato = "0.16"
sherpa-onnx = "2.0"

reqwest = { version = "0.12", default-features = false, features = ["json", "stream", "rustls-tls"] }
eventsource-stream = "0.2"
bzip2 = "0.4"
tar = "0.4"
sha2 = "0.10"

serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
rusqlite = { version = "0.32", features = ["bundled"] }
dirs = "5.0"
uuid = { version = "1.11", features = ["v4"] }
regex = "1.11"
once_cell = "1.20"
thiserror = "2.0"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
```

### 2.3. `src-tauri/tauri.conf.json`
```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Gizmo",
  "version": "0.1.0",
  "identifier": "app.gizmo.companion",
  "build": {
    "beforeDevCommand": "pnpm dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "pnpm build",
    "frontendDist": "../dist"
  },
  "app": {
    "macOSPrivateApi": true,
    "windows": [
      {
        "label": "main",
        "title": "Gizmo — Studio",
        "url": "index.html?window=studio",
        "width": 1440,
        "height": 900,
        "minWidth": 1024,
        "minHeight": 680,
        "resizable": true
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```
*(A `ProjectorWindow` é criada dinamicamente sob demanda em Rust via `WebviewWindowBuilder::new(app, "projector", WebviewUrl::App("index.html?window=projector".into())).transparent(true)` para suportar transparência OBS opcional!)*

---

## 3. Tabela Completa de Comandos IPC (`#[tauri::command]`)

Todos os comandos abaixo devem ser expostos em `src-tauri/src/lib.rs` e tipados em `src/types/ipc.ts`:

| Comando Rust | Argumentos | Retorno | Descrição |
| :--- | :--- | :--- | :--- |
| `get_config` | `()` | `Result<AppConfig, String>` | Lê a configuração atual. |
| `save_config` | `config: AppConfig` | `Result<(), String>` | Salva `config.json` atomicamente e reconfigura clientes ativos. |
| `list_audio_devices` | `()` | `Result<Vec<AudioDeviceInfo>, String>` | Lista microfones disponíveis via `cpal`. |
| `get_models_status` | `()` | `Result<ModelsStatusReport, String>` | Informa quais modelos ASR + Silero VAD já estão baixados em disco. |
| `download_model` | `model_id: String` | `Result<(), String>` | Baixa Silero VAD (se ausente) + o modelo `model_id` emitindo `models:progress`. |
| `test_llm_connection` | `llm_cfg: LlmConfig` | `Result<LlmProbeResult, String>` | Mede `ttft_ms` real e valida geração de 1 linha NDJSON. |
| `list_llm_models` | `base_url: String, api_key: String` | `Result<Vec<String>, String>` | Consulta `GET {base_url}/models` (útil p/ Ollama / LM Studio / OpenRouter). |
| `start_session` | `title: Option<String>` | `Result<String, String>` | Inicia captura `cpal` + VAD + worker ASR + nova sessão SQLite (`session_id`). |
| `stop_session` | `()` | `Result<(), String>` | Para captura de áudio limpando threads com segurança. |
| `set_mute` | `muted: bool` | `Result<(), String>` | Pausa/retoma alimentação do VAD instantaneamente. |
| `get_scene_snapshot` | `()` | `Result<SceneGraph, String>` | Usado pela `ProjectorWindow` ao abrir para hidratar o estado atual imediatamente. |
| `dispatch_manual_prompt` | `text: String` | `Result<(), String>` | Envia instrução/fala manual digitada pelo professor direto ao Scheduler. |
| `apply_manual_op` | `op: SceneOp` | `Result<(), String>` | Permite UI disparar `clear`, travar `theme`, remover nó, etc. |
| `list_beats` | `session_id: String` | `Result<Vec<BeatSummary>, String>` | Lista os snapshots salvos na linha do tempo da aula atual. |
| `restore_beat_snapshot` | `beat_id: i64` | `Result<SceneGraph, String>` | Carrega snapshot histórico para revisão na tela. |
| `open_projector_window` | `transparent: bool` | `Result<(), String>` | Abre ou foca a janela limpa de projeção/OBS. |
| `run_demo_lecture` | `()` | `Result<(), String>` | Executa aula simulada multi-tema (Matemática -> Negócios -> Arquitetura -> TED). |
| `export_session_html` | `session_id: String, target_path: String` | `Result<(), String>` | Gera arquivo HTML offline autocontido com todos os quadros e transcrições. |

---

## 4. Componente React `<GizmoMascot />` Pronto para Uso (`src/components/mascot/GizmoMascot.tsx`)

Copie esta implementação base que anima a `60fps` via `requestAnimationFrame` lendo `audioLevelRef` sem causar re-renders na árvore React:

```tsx
import React, { useEffect, useRef } from 'react';

export type MascotState = 'idle' | 'listening' | 'thinking' | 'drawing' | 'muted' | 'error';

interface GizmoMascotProps {
  state: MascotState;
  audioLevelRef: React.RefObject<{ rms: number; speaking: boolean }>;
  size?: number;
  onClick?: () => void;
}

export const GizmoMascot: React.FC<GizmoMascotProps> = React.memo(({
  state,
  audioLevelRef,
  size = 56,
  onClick,
}) => {
  const leftEarRef = useRef<SVGPathElement>(null);
  const rightEarRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      const rms = state === 'muted' ? 0 : (audioLevelRef.current?.rms ?? 0);
      const boost = Math.min(1.45, 1 + rms * 4.2);
      const opacity = state === 'muted' ? 0.15 : Math.min(1, 0.35 + rms * 3.5);
      if (leftEarRef.current && rightEarRef.current) {
        leftEarRef.current.style.transform = `scale(${boost})`;
        leftEarRef.current.style.opacity = String(opacity);
        rightEarRef.current.style.transform = `scale(${boost})`;
        rightEarRef.current.style.opacity = String(opacity * 0.8);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [state, audioLevelRef]);

  const tilt = state === 'drawing' ? 28 : 20;

  return (
    <button
      type="button"
      onClick={onClick}
      title={`Gizmo (${state})`}
      className="select-none transition-transform duration-200 hover:scale-105 focus:outline-none"
      style={{ width: size, height: size, opacity: state === 'muted' ? 0.65 : 1 }}
    >
      <svg viewBox="0 0 128 128" width={size} height={size} fill="none">
        <g
          style={{
            transform: `rotate(${tilt}deg)`,
            transformOrigin: '64px 64px',
            transition: 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          {/* Arcos Acústicos Reativos */}
          <path
            ref={leftEarRef}
            d="M 30 38 A 18 18 0 0 0 30 64"
            stroke="var(--color-primary, #58C4DD)"
            strokeWidth="4"
            strokeLinecap="round"
            style={{ transformOrigin: '38px 51px' }}
          />
          <path
            ref={rightEarRef}
            d="M 98 38 A 18 18 0 0 1 98 64"
            stroke="var(--color-primary, #58C4DD)"
            strokeWidth="4"
            strokeLinecap="round"
            style={{ transformOrigin: '90px 51px' }}
          />

          {/* Topo Coral */}
          <rect x="47" y="16" width="34" height="16" rx="8" fill="#FB7185" />
          {/* Corpo do Giz */}
          <rect x="43" y="26" width="42" height="68" rx="12" fill="#F8FAFC" stroke="#0F172A" strokeWidth="3" />
          {/* Faixa Temática Dinâmica */}
          <rect x="44.5" y="80" width="39" height="6" fill="var(--color-primary, #58C4DD)" />
          {/* Ponta / Nib */}
          <path d="M 47 93 L 81 93 L 64 118 Z" fill="var(--color-primary, #38BDF8)" stroke="#0F172A" strokeWidth="2.5" strokeLinejoin="round" />

          {/* Visor Expressivo */}
          <rect x="39" y="40" width="50" height="28" rx="10" fill="#0F172A" />
          {state === 'muted' ? (
            <>
              <path d="M 48 54 Q 53 58 58 54" stroke="#94A3B8" strokeWidth="3" strokeLinecap="round" />
              <path d="M 70 54 Q 75 58 80 54" stroke="#94A3B8" strokeWidth="3" strokeLinecap="round" />
            </>
          ) : (
            <>
              <circle
                cx="53"
                cy={state === 'thinking' ? 50 : 53}
                r="4.5"
                fill={state === 'error' ? '#F59E0B' : 'var(--color-primary, #58C4DD)'}
              />
              <path
                d="M 68 55 Q 74 48 80 55"
                stroke={state === 'error' ? '#F59E0B' : 'var(--color-primary, #58C4DD)'}
                strokeWidth="3.2"
                strokeLinecap="round"
              />
            </>
          )}
        </g>

        {/* Faísca quando está desenhando */}
        {state === 'drawing' && (
          <path
            d="M 102 88 Q 102 98 112 98 Q 102 98 102 108 Q 102 98 92 98 Q 102 98 102 88 Z"
            fill="var(--color-accent, #FACC15)"
          />
        )}
      </svg>
    </button>
  );
});
```
