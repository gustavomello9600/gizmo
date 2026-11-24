# 09 — Plano de Execução Passo a Passo em 10 Fases Atômicas (Guia para o Agente Construtor)

> **REGRA DE EXECUÇÃO:** Trabalhe **uma fase por vez**, na ordem exata de `Fase 1` até `Fase 10`. Ao terminar cada fase, rode **todos os comandos de verificação** listados nela. Só avance para a próxima fase quando a atual compilar e passar nos testes com **zero erros**.

---

## Fase 1 — Inicialização do Projeto Tauri v2, Persistência de Config e Casca Dual-Window

### Objetivo
Criar a estrutura base Rust + Vite/React/TS, copiando os assets existentes em `assets/`, configurando `Cargo.toml`, `package.json` e `tauri.conf.json` de `specs/08`, persistência atômica de `AppConfig` e roteamento entre `StudioApp` (`?window=studio`) e `ProjectorApp` (`?window=projector`).

### Arquivos a Criar
- `package.json`, `tsconfig.json`, `vite.config.ts`, `tailwind.config.js`, `postcss.config.js`, `index.html`
- `src/main.tsx`, `src/types/config.ts`, `src/types/ipc.ts`, `src/stores/useConfigStore.ts`
- `src-tauri/Cargo.toml`, `src-tauri/build.rs`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`
- `src-tauri/src/main.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/error.rs`, `src-tauri/src/config.rs`
- Gerar ícones PNG/ICO/ICNS em `src-tauri/icons/` a partir de `assets/logo.svg` usando `pnpm tauri icon assets/logo.svg`!

### Verificação Obrigatória da Fase 1
```bash
pnpm install
pnpm tauri icon assets/logo.svg
pnpm typecheck
cargo check --manifest-path src-tauri/Cargo.toml
```
- **Armadilha a evitar:** Esquecer de registrar permissões de criação e eventos da janela `"projector"` em `src-tauri/capabilities/default.json`! Inclua `"windows": ["main", "projector"]` e `"core:event:default"`, `"core:window:default"`.

---

## Fase 2 — `SceneGraph` Canônico, Parser Resiliente NDJSON (Reparo LaTeX) e SQLite em Rust

### Objetivo
Implementar todo o núcleo determinístico de estado da cena, sanitizador de linhas NDJSON e histórico SQLite em Rust **com testes unitários abrangentes** antes de conectar rede ou áudio.

### Arquivos a Criar
- `src-tauri/src/scene/mod.rs`, `src-tauri/src/scene/state.rs`
- `src-tauri/src/brain/ndjson_parser.rs` (conforme `specs/04` Seção 2 — reparo obrigatório de `\frac`, `\tan`, `\beta`, `\sqrt`, cercas markdown e vírgulas extras!)
- `src-tauri/src/storage/sqlite.rs` (tabelas `sessions`, `utterances`, `beats`)

### Testes Unitários Obrigatórios (`cargo test`)
1. `test_latex_single_backslash_repair`: Valida que `\frac{\sqrt{x}}{\tan(\theta)} = \beta` dentro de JSON cru é parseado intacto.
2. `test_markdown_fence_and_trailing_comma_ignored`: Linhas ```` ```json ```` retornam `None` sem erro.
3. `test_auto_eviction_respects_pinned_and_theme_limit`: No tema `ted` (`max=3`), inserir um 4º nó remove o mais antigo não-fixado.
4. `test_theme_lock_ignores_auto_theme_op`: Quando `theme_locked == true`, `{"op":"theme","style":"flipchart"}` sem `locked: true` não troca o tema.

### Verificação Obrigatória da Fase 2
```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

---

## Fase 3 — Motor dos 6 Temas (`StyleEngine`) e Solver Determinístico de Layout (`< 1.5ms`)

### Objetivo
Construir no frontend os 6 `ThemeDescriptor`s (`specs/05`), as fontes empacotadas offline (`@fontsource/*`), o `useSceneStore` e o `LayoutEngine` (`1920 × 1080` + `ZoneSubSplitter` + roteamento Bezier de conectores + `@dagrejs/dagre` de `specs/06`).

### Arquivos a Criar
- `src/types/scene.ts`, `src/stores/useSceneStore.ts`
- `src/themes/themeDescriptors.ts`, `src/themes/CanvasSvgDefs.tsx`, `src/styles/globals.css`, `src/styles/animations.css`
- `src/layout/solveLayout.ts`, `src/layout/solveEdges.ts`, `src/layout/solveDiagramDagre.ts`
- `src/utils/hash.ts`, `src/utils/roughHelper.ts`, `src/utils/safeMathParser.ts`
- `src/__tests__/solveLayout.test.ts`, `src/__tests__/sceneReducer.test.ts`, `src/__tests__/safeMathParser.test.ts`

### Testes Unitários Obrigatórios (`pnpm test`)
1. **Zero Sobreposição:** Para qualquer combinação de 1 a 8 nós distribuídos nas 11 zonas (incluindo 3 nós na mesma zona `"left"` ou conflito `"left"` + `"center"`), a interseção de área entre quaisquer dois retângulos `rectA` e `rectB` deve ser **exatamente `0`**!
2. **Orçamento de Performance:** `solveLayout` para uma cena de 12 nós deve terminar em `< 2.0ms`.
3. **Assíntotas em `safeMathParser`:** `1/x` em `[-2, 2]` deve gerar `>= 2` sub-caminhos SVG separados (`M ... M ...`) sem segmento cruzando `x = 0`.

### Verificação Obrigatória da Fase 3
```bash
pnpm typecheck && pnpm test
```

---

## Fase 4 — Canvas de 3 Camadas GPU, os 14 Renderizadores Visuais e `<GizmoMascot />`

### Objetivo
Construir `CanvasViewport.tsx`, `Layer0Background.tsx`, `NodeShell.tsx` (com `React.Component` ErrorBoundary isolado por nó!), `InterNodeEdges.tsx`, `Layer2LiveOverlay.tsx`, `<GizmoMascot />` e **todos os 14 renderizadores** de `specs/04` e `specs/06`.

### Regras Críticas Nesta Fase
- Todo renderizador **DEVE** ser envolvido em `React.memo`.
- Em `MathRenderer.tsx`, importe `'katex/dist/katex.min.css'` em `globals.css` e use `throwOnError: false`.
- Em `RoughHelper`, passe `seed: fnv1a32(node.id)` para zero tremor entre frames!
- Posicione `<NodeShell>` exclusivamente via `style={{ transform: \`translate3d(${rect.x}px, ${rect.y}px, 0)\`, width: rect.w, height: rect.h }}`.

### Verificação Obrigatória da Fase 4
```bash
pnpm typecheck && pnpm test && pnpm build
```

---

## Fase 5 — Gerenciador Local de Modelos ONNX (`.tar.bz2` Streaming) e Wizard de Onboarding

### Objetivo
Implementar em Rust o download resiliente, descompactação streaming `bzip2 + tar` e verificação atômica de `silero_vad.onnx` + `parakeet-tdt-0.6b-v3-int8` / `whisper-turbo-int8` / `sense-voice-small-int8` (`specs/02` Seção 2), conectado ao `OnboardingWizard.tsx` e `SettingsModal.tsx`.

### Arquivos a Criar
- `src-tauri/src/audio/model_manifest.rs`, `src-tauri/src/audio/model_downloader.rs`
- `src/components/studio/OnboardingWizard.tsx`, `src/components/studio/SettingsModal.tsx`

### Verificação Obrigatória da Fase 5
```bash
cargo test --manifest-path src-tauri/Cargo.toml && pnpm build
```

---

## Fase 6 — Pipeline Nativo Lock-Free de Áudio, Silero VAD v5 e `sherpa-onnx`

### Objetivo
Implementar as 3 threads nativas dedicadas (`cpal` -> `rtrb` -> `rubato` + `Silero VAD` -> `OfflineRecognizer` com warm-up de `0.5s` e filtro anti-alucinação) conforme `specs/01` e `specs/02`.

### Arquivos a Criar
- `src-tauri/src/audio/capture.rs`, `src-tauri/src/audio/vad_loop.rs`, `src-tauri/src/audio/asr_worker.rs`

### Pontos de Checagem Críticos
- Zero `Mutex`, zero `println!` e zero alocação dentro da closure de input do `cpal`!
- Tratar `SampleFormat::F32`, `I16` e `U16` e qualquer contagem de canais (`1`, `2`, `4+`).
- `min_silence_duration = 0.28`, `partial_tick = 400ms`, janela parcial truncada aos últimos `6.0s` (`96_000` samples).
- Emitir `audio:level` a no máximo `30Hz` direto para `audioLevelRef` (nunca dispare re-render global React a 30Hz!).

### Verificação Obrigatória da Fase 6
```bash
cargo test --manifest-path src-tauri/Cargo.toml && cargo check --manifest-path src-tauri/Cargo.toml
```

---

## Fase 7 — Reflexo Local Tier-0 (`< 10ms`), Agendador Coalescente e Cliente SSE OpenAI-Compatível

### Objetivo
Implementar o cérebro completo de `specs/03`: comandos de voz instantâneos, *spotlight* léxico local `< 10ms`, `LocalThemeClassifier`, `CoalescingScheduler` single-flight com `CancellationToken`, layout de mensagens estável para **KV-Cache** (`SYSTEM_PROMPT_V1` imutável + compactação a cada 12 turnos), supressão de `<think>` com fallback automático `HTTP 400` e conexão SSE com `tcp_nodelay(true)`.

### Arquivos a Criar
- `src-tauri/src/brain/prompts.rs`
- `src-tauri/src/brain/reflex.rs`
- `src-tauri/src/brain/theme_classifier.rs`
- `src-tauri/src/brain/scheduler.rs`
- `src-tauri/src/brain/sse_client.rs`

### Testes Unitários Obrigatórios (`cargo test`)
1. `test_reflex_voice_commands_pt_and_en`: Testa *"limpar a lousa"*, *"modo matemática"*, *"clear screen"*.
2. `test_reflex_deictic_spotlight`: Com nó `id="hip"` (`title="Hipotenusa"`), falar *"repare na hipotenusa"* emite `highlight` em `< 2ms`.
3. `test_think_block_stripping_in_sse`: Simula chunks SSE contendo `<think>\nraciocinando...\n</think>\n{"op":"clear"}\n` e garante que apenas `{"op":"clear"}` chega ao parser NDJSON.
4. `test_kv_cache_prefix_immutability`: Verifica que `messages[0]` é byte-a-byte idêntico no turno 1 e no turno 10.

### Verificação Obrigatória da Fase 7
```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

---

## Fase 8 — Studio Completo, Linha do Tempo de *Beats*, Modo Projetor/OBS Transparente e Exportador HTML

### Objetivo
Completar `StudioApp.tsx`, `TopControlBar.tsx`, `TranscriptDrawer.tsx`, `BeatTimelineBar.tsx`, `ProjectorApp.tsx` (incluindo fundo transparente RGBA / Chroma Key para OBS), atalhos globais (`tauri-plugin-global-shortcut`) e `src-tauri/src/scene/exporter.rs` (geração de resumo HTML autocontido pós-aula).

### Verificação Obrigatória da Fase 8
```bash
pnpm typecheck && pnpm test && cargo test --manifest-path src-tauri/Cargo.toml
```

---

## Fase 9 — Simulador de Aula Fim-a-Fim (`Demo Lecture Runner`)

### Objetivo
Implementar `src-tauri/src/demo/simulator.rs` acionado pelo botão **[🎬 Aula Demo]** (comando `run_demo_lecture`). O simulador injeta em tempo real um roteiro realista de **4 atos (~32 segundos)** passando pelo mesmo barramento de eventos (`asr:partial` -> `asr:final` -> `scene:op`):
1. **Ato 1 (`3b1b` — Cálculo):** Fala sobre derivada e reta tangente -> desenha `plot_2d` (`x^2` + tangente `2x-1`) + `math` + `highlight`.
2. **Ato 2 (`flipchart` — Produto/Negócios):** Muda assunto para priorização -> troca tema automaticamente para `flipchart`, desenha `matrix_2x2` + `funnel` em traço Rough.js.
3. **Ato 3 (`blueprint` — Engenharia):** Explica pipeline de baixa latência -> troca para `blueprint`, desenha `diagram` animado + `code` destacado.
4. **Ato 4 (`ted` — Encerramento de Palestra):** Frase final de impacto -> troca para `ted`, foco `hero` com `kpi` gigante `87%`.

*(Isso garante que tanto o usuário no onboarding quanto testes automatizados possam validar 100% da mágica visual do app mesmo sem microfone ou sem chave de API configurada!)*

### Verificação Obrigatória da Fase 9
```bash
cargo test --manifest-path src-tauri/Cargo.toml && pnpm test && pnpm build
```

---

## Fase 10 — Auditoria de Latência, Polimento e Build Nativo Multiplataforma

### Checklist Final de Qualidade Antes de Entregar
- [ ] **Nenhum `unwrap()` cego em dados externos** (JSON do LLM, rede SSE, dispositivos de áudio `cpal` ou arquivos `.onnx`) — use `?` / `match` com logs `tracing::warn!` para que o app **nunca sofra panic** ao vivo numa aula!
- [ ] **Verificação dos 12 Mandamentos do `AGENTS.md`:** Confirme que `audio:level` usa `useRef` + `rAF`, `Rough.js` usa `fnv1a32`, `Plot2D` usa `expr-eval` sem `eval()`, e `messages[0]` é estático.
- [ ] **Build Nativo Completo:**
  ```bash
  pnpm typecheck
  pnpm test
  cargo test --manifest-path src-tauri/Cargo.toml
  pnpm tauri build --debug
  ```
