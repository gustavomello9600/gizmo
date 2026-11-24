# 00 — Índice Mestre, Glossário Ubíquo e Decisões Arquiteturais (ADRs)

## 1. Visão Geral do Sistema

**Gizmo** é um aplicativo nativo local multiplataforma (**Windows 10/11, macOS 13+ Apple Silicon & Intel, Linux x64/ARM64**) que opera como um **ilustrador pedagógico ao vivo**. Enquanto o usuário ministra uma aula ou palestra, o Gizmo:

1. Escuta o microfone localmente sem enviar áudio para a nuvem;
2. Transcreve trechos curtos e parciais em **dezenas de idiomas** com baixíssima latência usando modelos ONNX quantizados (`Parakeet TDT 0.6B v3 INT8`, `Whisper Turbo INT8` ou `SenseVoice Small INT8`) precedidos por **Silero VAD v5**;
3. Aciona reflexos locais imediatos (`< 10ms`) para destaques e comandos diretos;
4. Envia incrementos textuais enxutos para qualquer **API compatível com OpenAI** (`Ollama`, `LM Studio`, `llama.cpp`, `vLLM`, `Groq`, `OpenRouter`, `OpenAI`, etc.) recebendo de volta **operações incrementais NDJSON em streaming SSE**;
5. Mantém um **SceneGraph semântico** que calcula posições sem colisões em `< 1.5ms` e desenha/anima ilustrações em **6 estilos automáticos de aula** (`3b1b`, `whiteboard`, `flipchart`, `ted`, `blueprint`, `chalkboard`), com suporte a **Janela Projetor/OBS dedicada**.

---

## 2. Índice Completo da Documentação

| Arquivo | Escopo Detalhado |
| :--- | :--- |
| [`AGENTS.md`](../AGENTS.md) | Regras de ouro inegociáveis, versões exatas de dependências e protocolo de trabalho do agente construtor. |
| [`specs/01-LOW-LATENCY-ARCHITECTURE.md`](./01-LOW-LATENCY-ARCHITECTURE.md) | Pipeline de sub-segundo, threads dedicadas, filas SPSC/MPSC, IPC Tauri, coalescência e cancelamento seguro. |
| [`specs/02-AUDIO-VAD-ASR-PIPELINE.md`](./02-AUDIO-VAD-ASR-PIPELINE.md) | Captura `cpal`, ring buffer `rtrb`, reamostrador `rubato`, Silero VAD v5, modelos `sherpa-onnx` e download manager. |
| [`specs/03-BRAIN-LLM-STREAMING-ENGINE.md`](./03-BRAIN-LLM-STREAMING-ENGINE.md) | Cliente SSE OpenAI-compatível, layout de KV-Cache, Reflexo Tier-0, agendador semântico e System Prompts completos. |
| [`specs/04-SCENE-GRAPH-AND-NDJSON-DSL.md`](./04-SCENE-GRAPH-AND-NDJSON-DSL.md) | Gramática NDJSON linha-a-linha, as 10 operações de mutação e os 14 tipos de nós visuais com exemplos JSON reais. |
| [`specs/05-THEMES-AND-STYLE-ENGINE.md`](./05-THEMES-AND-STYLE-ENGINE.md) | Tokens CSS, fontes offline, filtros SVG, seeds Rough.js, animações e classificador automático dos 6 estilos de aula. |
| [`specs/06-LAYOUT-AND-RENDERING-ENGINE.md`](./06-LAYOUT-AND-RENDERING-ENGINE.md) | Solver de *Semantic Zones* + Dagre, 3 camadas GPU, KaTeX, plotador seguro de funções `f(x)` e morphing visual. |
| [`specs/07-UI-UX-AND-PRESENTER-MODE.md`](./07-UI-UX-AND-PRESENTER-MODE.md) | Wireframes ASCII, Janela Studio vs. Janela Projetor/OBS, atalhos globais, gravação/replay de aulas e mascote vivo. |
| [`specs/08-EXACT-SCAFFOLD-AND-CONTRACTS.md`](./08-EXACT-SCAFFOLD-AND-CONTRACTS.md) | Árvore completa do repositório + arquivos de configuração e contratos de tipos Rust/TS prontos para copiar. |
| [`specs/09-STEP-BY-STEP-BUILD-PLAN.md`](./09-STEP-BY-STEP-BUILD-PLAN.md) | Plano sequencial em 10 fases com comandos de verificação, testes obrigatórios e armadilhas evitadas. |
| [`schemas/ndjson-ops.schema.json`](../schemas/ndjson-ops.schema.json) | JSON Schema formal das linhas NDJSON emitidas pelo LLM. |
| [`schemas/scene-graph.schema.json`](../schemas/scene-graph.schema.json) | JSON Schema formal do `SceneGraph` completo em memória/disco. |
| [`schemas/app-config.schema.json`](../schemas/app-config.schema.json) | JSON Schema formal da configuração persistida do usuário. |

---

## 3. Glossário Ubíquo (Use Exatamente Estes Nomes no Código)

Para evitar divergência entre Rust e TypeScript, **todos os módulos, structs e interfaces devem usar esta nomenclatura exata**:

- **`AudioFrame`**: Bloco fixo de `512` amostras `f32` mono a `16_000 Hz` (exatamente `32 ms` de áudio), unidade atômica consumida pelo Silero VAD.
- **`UtteranceId`**: Identificador monotônico (`u_0001`, `u_0002`, ...) atribuído a cada segmento contínuo de fala detectado pelo VAD.
- **`RollingPartial`**: Transcrição especulativa gerada a cada `400 ms` enquanto o usuário ainda está falando (`is_final: false`).
- **`MicroPauseCommit`**: Fechamento rápido de um `Utterance` após `280 ms` de silêncio ou ao atingir `8.0 s` contínuos num vale de energia (`is_final: true`).
- **`Tier0Reflex`**: Ação visual determinística disparada localmente em `< 10 ms` (sem LLM) por correspondência léxica/deítica com nós já visíveis ou comandos verbais explícitos.
- **`SemanticTurn`**: Pacote despachado ao LLM contendo o delta de transcrição nova + resumo compacto do `SceneGraph` atual.
- **`SceneOp`**: Uma instrução atômica de mutação visual serializada como **uma única linha JSON** no protocolo NDJSON (`theme`, `title`, `upsert`, `patch`, `connect`, `highlight`, `remove`, `camera`, `clear`, `noop`).
- **`SceneNode`**: Um elemento visual posicionado no canvas, identificado por um `id` estável curto (ex.: `eq_pitagoras`, `plot_seno`, `step_1`) e um `kind` dentre os 14 suportados.
- **`SemanticZone`**: Região lógica da tela atribuída pelo LLM (`hero`, `center`, `left`, `right`, `top`, `bottom`, `split_tl`, `split_tr`, `split_bl`, `split_br`, `footer`), convertida em retângulo `(x, y, w, h)` pelo `LayoutEngine`.
- **`CanvasArchetype` (`ThemeId`)**: Um dos 6 estilos visuais completos: `'3b1b' | 'whiteboard' | 'flipchart' | 'ted' | 'blueprint' | 'chalkboard'`.
- **`BeatSnapshot`**: Ponto salvo automaticamente na linha do tempo da aula sempre que uma batida semântica termina, permitindo voltar no tempo (*scrubbing*) ou exportar slides PDF/SVG/Markdown ao final da aula.
- **`StudioWindow` & `ProjectorWindow`**: As duas janelas do Tauri — `StudioWindow` mostra barra de controle discreta, transcrição ao vivo e mini-controles para o professor; `ProjectorWindow` mostra **exclusivamente o Canvas limpo** (para projetor de sala, compartilhamento de tela no Zoom/Meet ou captura OBS).

---

## 4. Metas Rígidas de Performance e Latência (SLAs)

O agente construtor deve tratar estes números como **requisitos funcionais testáveis**:

| Métrica | Limite Máximo Aceitável | Como Medir no Código (`tracing` / `performance.now()`) |
| :--- | :---: | :--- |
| **Uso de CPU em Silêncio (VAD ativo)** | `< 2.5%` de 1 core | Apenas captura `cpal` + Silero VAD (`32ms` frame leva `< 0.3ms`). Parakeet **não** roda durante silêncio. |
| **Latência de Áudio -> Evento `audio:level`** | `<= 35 ms` | Emitido a ~30Hz direto da thread de VAD para animar o mascote Gizmo sem atraso. |
| **Inferência Parakeet TDT 0.6B INT8 (4s áudio)** | `<= 90 ms` em CPU 4-threads | Logar `asr_decode_ms` em cada execução de `OfflineRecognizer::decode`. |
| **Reflexo Local `Tier0Reflex`** | `<= 12 ms` | Tempo entre `asr:partial`/`asr:final` e emissão de `scene:op` de `highlight`. |
| **Parser NDJSON Incremental por Linha** | `<= 0.5 ms` | Assim que `\n` chega do socket TCP/TLS, deserializar e emitir IPC na mesma task. |
| **Cálculo Completo do `LayoutEngine`** | `<= 2.0 ms` (até 25 nós) | Medido em teste unitário Vitest sobre cenas complexas. |
| **Taxa de Quadros da Animação no Canvas** | `60 fps` cravados (`16.6ms`/frame) | Sem *long tasks* `> 12ms` na main thread do WebView. |
| **Memória RAM Total do App (com Parakeet INT8)** | `< 950 MB` RSS | Parakeet INT8 ocupa ~640MB; WebView + Rust state ~220MB. |

---

## 5. Registros de Decisão Arquitetural (ADRs)

### ADR-001: Tauri v2 (Rust + WebView) em vez de Electron ou Python/Qt
- **Contexto:** Precisamos rodar captura de áudio em tempo real, inferência ONNX multithread (`sherpa-onnx`), streaming HTTP SSE sem CORS e renderização vetorial rica (SVG + KaTeX + Rough.js + animações 60fps) em Windows, macOS e Linux com binário leve.
- **Decisão:** Usar **Tauri v2** com toda a pipeline pesada (Áudio, VAD, ASR, Cliente LLM, Parser NDJSON, Persistência SQLite) em **Rust nativo**, e apenas Layout + Renderização Visual em **React + TypeScript + SVG/Canvas**.
- **Consequência:** Zero overhead do Chromium/Node embutido do Electron, acesso nativo à crate `sherpa-onnx` sem FFI manual em JS, e zero bloqueio da thread de UI de 60fps.

### ADR-002: `sherpa-onnx` com Parakeet TDT 0.6B v3 INT8 como Ouvido Padrão
- **Contexto:** O usuário pediu modelos abertos, bons, leves e multilíngues a exemplo do **Parakeet**, com foco em velocidade.
- **Decisão:** Adotar a crate oficial `sherpa-onnx` com suporte a 3 perfis selecionáveis na UI:
  1. **Padrão Recomendado:** `sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8` (~640 MB) — modelo **Token-and-Duration Transducer (TDT)** da NVIDIA com detecção automática de **25 idiomas** (incluindo **Português, Inglês, Espanhol, Francês, Alemão, Italiano**, etc.) e velocidade absurda (`RTF ~ 0.015`, até 6x mais rápido que Whisper de porte equivalente em CPU!).
  2. **Universal 99 Idiomas:** `sherpa-onnx-whisper-turbo` (INT8) — fallback para Japonês, Chinês, Árabe, Coreano, Hindi, etc.
  3. **Ultra-Leve Ásia/Inglês:** `sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17` (~230 MB, `RTF ~ 0.01`).
- **Consequência:** Uma única engine C++/Rust (`OfflineRecognizer` + `VoiceActivityDetector`) serve todos os modelos sem precisar instalar Python, PyTorch ou CUDA no computador do professor!

### ADR-003: Streaming Simulado por Micro-Janela Deslizante (`400ms` Tick + `280ms` VAD)
- **Contexto:** Modelos `OfflineRecognizer` como Parakeet TDT v3 e Whisper Turbo têm qualidade multilíngue muito superior a modelos streaming antigos, mas uma integração ingênua espera o usuário parar de falar por 1–2s.
- **Decisão:** Como o Parakeet TDT 0.6B INT8 decodifica 4 segundos de áudio em ~50ms, executamos **decodificação parcial especulativa a cada `400ms`** sobre o buffer da fala corrente (limitado aos últimos `6.0s` para manter tempo constante `O(1)`!), além de fechar segmentos em micro-pausas respiratórias de `280ms`.
- **Consequência:** Temos simultaneamente **legendas/gatilhos em tempo real enquanto a frase está sendo dita** E **precisão estado-da-arte** ao fechar cada cláusula.

### ADR-004: Protocolo NDJSON de Operações Incrementais em vez de Tool Calling Completo ou Full-Scene JSON
- **Contexto:** Em várias APIs OpenAI-compatíveis locais (`Ollama`, `llama.cpp`, `LM Studio`), `tool_calls` em streaming sofrem bufferização interna ou variações de formato entre modelos abertos; já um JSON único da cena inteira exige esperar o fechamento `}` final para validar com segurança.
- **Decisão:** O LLM responde em texto puro onde **cada linha terminada em `\n` é um objeto JSON independente e autocontido (`SceneOp`)**.
- **Consequência:** Funciona em **100% dos modelos OpenAI-compatíveis** (mesmo modelos locais de 3B/7B sem suporte nativo a *function calling*!), permite parsear e renderizar a 1ª operação com apenas ~25 tokens gerados (`~150–250ms`), e isola falhas (se 1 linha vier malformada, o parser repara ou descarta só aquela linha sem perder o resto da cena!).

### ADR-005: Layout por Zonas Semânticas + Dagre em vez de Coordenadas Geradas por LLM
- **Contexto:** Pedir `(x, y)` para um LLM gera textos cortados e sobreposição de diagramas.
- **Decisão:** O LLM declara **o quê** mostrar e **em qual zona lógica** (`left`, `right`, `center`, `hero`, etc.). O `LayoutEngine` do frontend resolve matematicamente os retângulos exatos, escalas responsivas e rotas de setas em `< 1.5ms`.
- **Consequência:** Zero sobreposição garantida por construção, adaptação automática a qualquer resolução (1080p, 4K, janela dividida) e ~40% menos tokens gerados pelo LLM (menor latência!).

### ADR-006: Estilização Guiada por CSS Custom Properties + Strategy de Renderização de Traço
- **Contexto:** Mudar de "Matemática (`3b1b`)" para "Negócios (`flipchart`)" ou "Palestra (`ted`)" não é só trocar cor de fundo — muda a família tipográfica, a espessura e imperfeição do traço, os filtros SVG e a curva de animação.
- **Decisão:** Cada `CanvasArchetype` define um pacote declarativo `ThemeDescriptor` contendo: (a) variáveis CSS de cor e tipografia, (b) `strokeMode: 'crisp' | 'marker' | 'rough' | 'chalk'`, (c) `animationPreset`, e (d) `maxNodesPerScene` (ex.: `ted` limita a tela a no máximo 3 elementos gigantes; `blueprint` permite até 12 nós conectados).
- **Consequência:** Trocar o estilo da aula em tempo real transforma instantaneamente toda a personalidade do canvas em `< 16ms` sem recriar o `SceneGraph`.
