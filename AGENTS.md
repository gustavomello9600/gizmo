# AGENTS.md — Manual Mestre Obrigatório para o Agente Construtor

> **ATENÇÃO AGENTE DE CÓDIGO:** Leia este arquivo **INTEIRO** antes de criar qualquer pasta, instalar qualquer pacote ou escrever uma única linha de código. Você **NÃO** tem permissão para improvisar a arquitetura, trocar bibliotecas principais ou "simplificar" mecanismos de baixa latência. Toda decisão já foi tomada e detalhada matematicamente em `specs/`.

---

## 1. Missão do Projeto

Construir o **Gizmo**, um aplicativo desktop local multiplataforma (**Windows, macOS e Linux**) em **Tauri v2 (Rust + React 19 + TypeScript + Vite)** que escuta a voz do professor/palestrante localmente em tempo real e desenha/atualiza ilustrações vivas (gráficos, equações matemáticas, diagramas, bullet points, matrizes, código, animações) com **latência sub-segundo**, adaptando automaticamente a estética do canvas ao tipo de aula (`3b1b`, `whiteboard`, `flipchart`, `ted`, `blueprint`, `chalkboard`).

---

## 2. As 12 Regras de Ouro Inegociáveis (Proibido Violar!)

1. **PROIBIDO usar captura de microfone via navegador (`navigator.mediaDevices.getUserMedia`) para o pipeline principal de ASR.**  
   A captura de áudio **DEVE** acontecer em Rust nativo via `cpal` + ring buffer lock-free `rtrb` + reamostrador `rubato` para `16000 Hz mono f32`. Isso evita diálogos repetidos de permissão de WebView, *drift* de *sample rate* e cópias caras JS->Rust.
2. **PROIBIDO bloquear a thread de callback de áudio do `cpal`.**  
   Dentro do callback do `cpal`, você **NUNCA** pode usar `Mutex::lock()`, alocar `Vec`, fazer log (`println!`) ou rodar inferência ONNX. Apenas empurre amostras no `rtrb::Producer<f32>`.
3. **PROIBIDO esperar 1 ou 2 segundos de silêncio para transcrever.**  
   Use os parâmetros exatos de baixa latência de `specs/02-AUDIO-VAD-ASR-PIPELINE.md`: `min_silence_duration = 0.28s` no Silero VAD **MAIS** decodificação parcial especulativa a cada `400ms` durante fala contínua, com corte automático suave em `max_speech_duration = 8.0s`.
4. **PROIBIDO pedir ao LLM para regerar o JSON inteiro da tela a cada frase.**  
   O LLM emite **exclusivamente linhas NDJSON (JSON Lines)** — uma operação atômica por linha terminada em `\n` (`upsert`, `patch`, `remove`, `highlight`, `connect`, `theme`, `title`, `camera`, `clear`, `noop`). Assim que `\n` chega no stream SSE em Rust, aquela linha já é validada e enviada imediatamente ao frontend via evento Tauri!
5. **PROIBIDO pedir ao LLM para calcular coordenadas em pixels (`x`, `y`, `width`, `height`).**  
   LLMs são lentos e péssimos em aritmética de pixels, gerando caixas sobrepostas. O LLM só informa `zone` (`center`, `left`, `right`, `top`, `bottom`, `hero`, `split_tl`, `split_tr`, `split_bl`, `split_br`, `footer`) e relações (`from`, `to`). O cálculo de coordenadas exatas é feito em `< 1.5ms` pelo motor determinístico em TypeScript (`specs/06-LAYOUT-AND-RENDERING-ENGINE.md`).
6. **PROIBIDO fazer chamadas HTTP ao LLM pelo frontend (browser `fetch`).**  
   Todo tráfego SSE OpenAI-compatível **DEVE** rodar no backend Rust (`reqwest` com `stream`), eliminando 100% de erros de CORS com `Ollama`, `LM Studio`, `llama.cpp` e servidores locais.
7. **PROIBIDO mutar o `system` prompt a cada turno.**  
   A mensagem `messages[0]` (`role: "system"`) deve ser **100% estática byte-a-byte** durante toda a sessão para preservar o **KV-Cache** em servidores locais (`llama.cpp`/`Ollama`/`vLLM`), reduzindo o TTFT de ~1000ms para ~80ms. O estado atual resumido da cena vai no final da última mensagem `user`.
8. **PROIBIDO deixar modelos "thinking" gastarem segundos pensando ocultamente.**  
   Envie os campos opcionais de supressão de raciocínio longo documentados em `specs/03-BRAIN-LLM-STREAMING-ENGINE.md` (ex.: `reasoning_effort: "none"` quando suportado / `chat_template_kwargs: { "enable_thinking": false }` para Qwen3/vLLM/llama.cpp, com fallback transparente caso a API rejeite campos extras).
9. **PROIBIDO usar `eval()` ou `new Function()` para plotar funções matemáticas do LLM.**  
   Use exclusivamente o parser matemático seguro `expr-eval` (`Parser`) compilado uma única vez por expressão e amostrado em 200 pontos SVG (`specs/06-LAYOUT-AND-RENDERING-ENGINE.md`).
10. **PROIBIDO renderizar Rough.js sem `seed` fixo.**  
    Em temas `flipchart` e `whiteboard`, todo nó renderizado com `roughjs` **DEVE** usar `seed: fnv1aHash(node.id)` e memorizar os caminhos SVG com `useMemo`. Sem `seed` fixo, o desenho treme freneticamente a cada atualização de estado!
11. **PROIBIDO animar propriedades CSS que disparam *Layout/Reflow* (`top`, `left`, `width`, `height`).**  
    Posicione nós usando `transform: translate3d(x, y, 0)` e anime apenas `transform`, `opacity` e `stroke-dashoffset`.
12. **PROIBIDO pular fases ou avançar com erros de compilação (`cargo check` / `tsc --noEmit`).**  
    Siga estritamente `specs/09-STEP-BY-STEP-BUILD-PLAN.md` da Fase 1 à Fase 10, validando cada fase antes de iniciar a próxima.

---

## 3. Stack Tecnológica Fixada (Use Exatamente Estas Versões/Pacotes)

### Backend Nativo (`src-tauri/` — Rust Edition 2021, MSRV 1.80+)
- **Framework:** `tauri = "2"` + `tauri-plugin-shell = "2"` + `tauri-plugin-dialog = "2"` + `tauri-plugin-fs = "2"`
- **Runtime Async & Concorrência:** `tokio` (full), `parking_lot`, `rtrb` (ring buffer SPSC lock-free para áudio), `tokio-util` (`CancellationToken`)
- **Áudio & Reamostragem:** `cpal`, `rubato`, `hound` (gravação/teste WAV opcional)
- **VAD & ASR Local:** `sherpa-onnx = "2"` (suporta Silero VAD + Parakeet TDT 0.6B v3 INT8 + Whisper Turbo INT8 + SenseVoice Small INT8)
- **Rede & Streaming SSE + Download de Modelos:** `reqwest` (`json`, `stream`, `rustls-tls`), `eventsource-stream`, `futures-util`, `bzip2`, `tar`, `sha2`
- **Persistência & Serialização:** `serde`, `serde_json`, `rusqlite` (`bundled` — para histórico local de aulas e replay instantâneo), `dirs`, `uuid`, `thiserror`, `tracing`, `tracing-subscriber`

### Frontend (`src/` — Node 20+, pnpm 9+)
- **Build & UI:** `vite ^6`, `react ^19`, `react-dom ^19`, `typescript ~5.7`
- **Tauri API:** `@tauri-apps/api ^2`
- **Estado Reativo de Baixa Latência:** `zustand ^5` (com seletores granulares `useShallow` para evitar re-renders globais!)
- **Estilização:** `tailwindcss ^3.4` + Variáveis CSS Dinâmicas de Tema (`specs/05-THEMES-AND-STYLE-ENGINE.md`) + `lucide-react`
- **Matemática, Gráficos & Traço:**
  - `katex ^0.16` (equações LaTeX síncronas em `< 0.5ms` — empacote as fontes `.woff2` localmente para funcionar 100% offline!)
  - `expr-eval ^2.0` (avaliação segura de funções `f(x)` em `plot_2d`)
  - `roughjs ^4.6` (traços orgânicos estilo flipchart/sketch com `seed` determinístico)
  - `@dagrejs/dagre ^1.1` (posicionamento automático de nós e arestas em diagramas/fluxogramas em `< 1ms`)
- **Animação GPU:** `motion ^12` (`framer-motion`) + Web Animations API nativa para `stroke-dashoffset`
- **Testes:** `vitest ^3`, `@testing-library/react`, `cargo test`

---

## 4. Ordem Obrigatória de Leitura Antes de Codificar

Leia os documentos abaixo na ordem indicada conforme avançar pelas fases:

1. [`specs/00-INDEX-AND-GLOSSARY.md`](./specs/00-INDEX-AND-GLOSSARY.md) — Entenda os conceitos, ADRs e SLAs.
2. [`specs/08-EXACT-SCAFFOLD-AND-CONTRACTS.md`](./specs/08-EXACT-SCAFFOLD-AND-CONTRACTS.md) — Copie a estrutura exata de pastas, `Cargo.toml`, `package.json`, `tauri.conf.json` e contratos de tipos.
3. [`specs/09-STEP-BY-STEP-BUILD-PLAN.md`](./specs/09-STEP-BY-STEP-BUILD-PLAN.md) — Seu checklist operacional fase a fase.
4. Para cada subsistema específico durante a implementação:
   - Threads, filas, IPC e latência -> [`specs/01-LOW-LATENCY-ARCHITECTURE.md`](./specs/01-LOW-LATENCY-ARCHITECTURE.md)
   - Microfone, Silero VAD, Parakeet e download de modelos -> [`specs/02-AUDIO-VAD-ASR-PIPELINE.md`](./specs/02-AUDIO-VAD-ASR-PIPELINE.md)
   - Cliente LLM SSE, Reflexo Tier-0, prompts e agendador -> [`specs/03-BRAIN-LLM-STREAMING-ENGINE.md`](./specs/03-BRAIN-LLM-STREAMING-ENGINE.md)
   - Operações NDJSON e os 14 tipos de nós visuais -> [`specs/04-SCENE-GRAPH-AND-NDJSON-DSL.md`](./specs/04-SCENE-GRAPH-AND-NDJSON-DSL.md) + [`schemas/`](./schemas/)
   - Os 6 temas visuais e detecção automática -> [`specs/05-THEMES-AND-STYLE-ENGINE.md`](./specs/05-THEMES-AND-STYLE-ENGINE.md)
   - Layout sem sobreposição e renderizadores SVG/KaTeX/Rough -> [`specs/06-LAYOUT-AND-RENDERING-ENGINE.md`](./specs/06-LAYOUT-AND-RENDERING-ENGINE.md)
   - Interface Studio, Modo Projetor/OBS, atalhos e mascote -> [`specs/07-UI-UX-AND-PRESENTER-MODE.md`](./specs/07-UI-UX-AND-PRESENTER-MODE.md)

---

## 5. Critério de "Pronto" (Definition of Done)

O projeto **SÓ** está concluído quando:
- `cargo test --manifest-path src-tauri/Cargo.toml` passa com 0 falhas.
- `pnpm typecheck` (`tsc --noEmit`) e `pnpm test` (`vitest run`) passam com 0 erros.
- `pnpm tauri build --debug` compila o aplicativo nativo sem erros.
- O **Modo Simulador Embutido** (`Demo Lecture Runner` especificado na Fase 9) consegue reproduzir um roteiro de aula falada (Matemática -> Negócios -> Arquitetura -> Keynote) exercitando todos os 14 tipos de nós visuais e os 6 temas de canvas a 60fps mesmo em máquinas de CI sem microfone físico.
- Com microfone ativo + modelo Parakeet baixado + endpoint OpenAI-compatível (ex.: Ollama local ou Groq/OpenAI), falar ao microfone produz reação visual em `< 500ms` e ilustrações completas em `< 1.2s`.
