# 07 — Interface do Usuário (UX), Modo Projetor/OBS, Mascote Vivo e Pós-Aula

## 1. Arquitetura de Duas Janelas Sincronizadas

O Gizmo separa claramente **quem controla a aula** de **quem assiste à aula**:

1. **`StudioWindow` (`label: "main"`, padrão `1440 × 900`, redimensionável):**
   - Usada pelo professor no monitor principal do notebook.
   - Contém a barra superior compacta, o palco `16:9` ao vivo, gaveta retrátil de transcrição + direção manual, linha do tempo de *beats* (momentos da aula) e telemetria de latência.
2. **`ProjectorWindow` (`label: "projector"`, `1280 × 720` / Fullscreen `F11`):**
   - Aberta com `Ctrl/Cmd+Shift+P` ou botão **[Projetar / OBS]**.
   - Renderiza **100% apenas o Canvas `16:9`** (e opcionalmente o mascote Gizmo pequenino no canto inferior direito), **sem nenhum botão, menu ou cursor de edição**.
   - **Modo Overlay Transparente / Chroma Key para OBS Studio e Aulas Gravadas:**
     - Nas configurações de projeção, o professor pode alternar o fundo da `ProjectorWindow` entre:
       - `Tema Normal` (padrão para projetor de sala / compartilhamento de janela no Meet/Zoom);
       - `Transparente Nativo (RGBA 0)` (`transparent: true` no Tauri v2 — permite capturar Window Capture com canal Alpha direto no OBS sobre a câmera do professor!);
       - `Chroma Key (#00FF00 ou #0000FF)`.

---

## 2. Wireframe Exato da `StudioWindow`

```text
+--------------------------------------------------------------------------------------------------+
| [Gizmo]  [🎙️ Ao Vivo ● ||||.. ] [✨ Tema: Auto (3b1b) ▾ 🔓]   [🧹 Limpar] [🖥️ Projetor] [⚙️]    |
+-----------------------------------------------------------------------+--------------------------+
|                                                                       | TRANSCRIÇÃO AO VIVO  [»] |
|   +---------------------------------------------------------------+   |--------------------------|
|   |  Integral Definida                                            |   | 10:14:02 (42ms)          |
|   |  Soma de Riemann até a área exata sob a curva                 |   | "Vamos calcular a área   |
|   |                                                               |   |  debaixo de x ao         |
|   |   +-------------------------+   +-------------------------+   |   |  quadrado entre 0 e 2."  |
|   |   |      y                  |   |                         |   |   |                          |
|   |   |    9 |        /         |   |    2                    |   |   | 10:14:09 [parcial...]    |
|   |   |      |      /           |   |   ⌠  2     ⎡ x³ ⎤²  8   |   |   | "Repare que quando..."   |
|   |   |    4 |    /▒▒▒          |   |   ⎮ x dx = ⎢────⎥ = ─   |   |   |                          |
|   |   |      |__/▒▒▒▒▒_____ x   |   |   ⌡        ⎣ 3  ⎦₀  3   |   |   |--------------------------|
|   |   |      0     1    2       |   |    0                    |   |   | DIREÇÃO RÁPIDA (Opcional)|
|   |   +-------------------------+   +-------------------------+   |   | [Ex: adicione y=2x... ↵] |
|   |                                                       [Gizmo] |   | [🎬 Demo] [📤 Exportar]  |
|   +---------------------------------------------------------------+   |                          |
+-----------------------------------------------------------------------+--------------------------+
| ◀ [1. Intro] [2. Parábola] [3. Soma Riemann] [4. Integral ● AO VIVO]   🎙️43ms · 🧠182ms · 60fps |
+--------------------------------------------------------------------------------------------------+
```

---

## 3. Fluxo de Onboarding de Primeira Execução (`< 60 segundos`)

Se `!sileroVadInstalled || !anyAsrModelInstalled` ao iniciar o app, exiba o modal `OnboardingWizard` em 3 passos simples:

### Passo 1: "Configure os Ouvidos Locais do Gizmo"
- Mostra os 3 cartões de modelos (`Parakeet TDT 0.6B v3 INT8 [Recomendado - 25 idiomas, PT/EN/ES]`, `Whisper Turbo INT8 [99 idiomas]`, `SenseVoice Small INT8 [Ultra-leve EN/Ásia]`).
- Botão primário: **[Baixar Parakeet + Silero VAD (~642 MB)]** com barra de progresso real (`MB/s`, porcentagem, fase `Baixando...` -> `Extraindo...` -> `Aquecendo ONNX...`).
- Seletor de Microfone com medidor de nível verde em tempo real para confirmar que o áudio está chegando.

### Passo 2: "Conecte o Cérebro (API OpenAI-Compatível)"
- Botões rápidos de Preset que preenchem `baseUrl` automaticamente:
  - **[Ollama Local]** -> `http://127.0.0.1:11434/v1` (faz auto-descoberta via `GET /v1/models` e popula um `<select>` com os modelos já instalados no Ollama do usuário!)
  - **[LM Studio]** -> `http://127.0.0.1:1234/v1`
  - **[llama.cpp]** -> `http://127.0.0.1:8080/v1`
  - **[Groq Ultra-Fast]** -> `https://api.groq.com/openai/v1`
  - **[OpenRouter]** -> `https://openrouter.ai/api/v1`
  - **[OpenAI]** -> `https://api.openai.com/v1`
  - **[Custom URL]** -> campo livre.
- Botão **[⚡ Testar Conexão e Medir Latência]**: envia um prompt mínimo de 1 linha NDJSON (`{"op":"noop"}`) e mostra um badge colorido:
  - Verde (`TTFT < 350ms`: *"Excelente para tempo real!"*)
  - Âmbar (`350ms..900ms`: *"Bom — recomendado usar modelos 7B/8B ou Groq para resposta instantânea"*)
  - Vermelho (`Erro de conexão / CORS / Modelo não encontrado` com instrução clara de como corrigir, ex.: `ollama pull qwen2.5:7b`).

### Passo 3: "Pronto para Começar!"
- Botão **[🎙️ Começar Aula ao Vivo]** e botão secundário **[🎬 Assistir Aula Demo de 30s]** (roda o simulador embutido passando por Matemática `3b1b`, Negócios `flipchart` e Palestra `ted` para encantar o usuário imediatamente!).

---

## 4. Estados Expresivos do Mascote `<GizmoMascot />` no HUD

O mascote Gizmo vive num canto discreto (`56 × 56 px`) e comunica o estado interno do sistema **sem distrair os alunos com textos técnicos**:

| Estado (`MascotState`) | Gatilho | Expressão Visual SVG (60fps) |
| :--- | :--- | :--- |
| **`idle`** | Microfone ativo, silêncio | Olhos abertos piscando suavemente a cada `4.5s`, flutuação senoidal leve (`translateY(±2px)`). |
| **`listening`** | `speaking == true` no VAD | Arcos acústicos laterais pulsam proporcionalmente a `audioLevelRef.current.rms` (`scale(1 + rms * 0.6)`), olhos atentos brilhantes. |
| **`thinking`** | `brain.state == 'streaming'` antes da 1ª op | Olhos olham levemente para cima, ponta do giz pulsa com brilho suave. |
| **`drawing`** | Nos `450ms` após cada `scene:op` aplicada | Inclina de `22°` para `28°` num *spring* rápido + exibe a faísca amarela de 4 pontas na ponta! |
| **`muted`** | Microfone mutado (`Ctrl+Shift+M`) | Olhos fechados tranquilos (`︶ ︶`), ondas acústicas ocultas, opacidade `65%`. |
| **`error`** | Falha de rede LLM / mic desconectado | Bochechas âmbar + pequeno ponto de exclamação flutuante (clicar abre o diagnóstico). |

> Além disso, a faixa colorida do colarinho e a ponta luminescente do `<GizmoMascot />` herdam `var(--color-primary)` do tema atual — então o Gizmo fica **ciano na aula de Cálculo**, **azul-caneta na Lousa Branca**, **âmbar no Flipchart** e **vermelho-coral no TED Talk**!

---

## 5. Linha do Tempo de *Beats* (Scrubbing) e Exportação Pós-Aula

Toda vez que ocorre uma batida semântica relevante (conclusão de um turno LLM que alterou nós, ou antes de um `clear`), o backend salva um `BeatSnapshot` em SQLite (`sessions.sqlite`):
- **Durante a aula:** Se um aluno perguntar *"Professor, pode voltar naquele gráfico de dois minutos atrás?"*, basta clicar no chip do Beat anterior na barra inferior (ou apertar `Alt + ←`). O Canvas entra em modo **`Revisitando Beat #3`** (pausando mutações visuais na tela enquanto continua gravando a transcrição em background!) até o professor clicar em **[Voltar ao Vivo ●]** (`Alt + →`).
- **Ao encerrar a aula (`[📤 Exportar Resumo Visual]`):**
  Gera localmente em `< 1 segundo` um arquivo autocontido **`Aula-YYYY-MM-DD.html`** (ou pasta `.md` + SVGs) contendo todos os *Beats* visuais da aula perfeitamente estilizados junto com a transcrição sincronizada de cada etapa, pronto para enviar em PDF/HTML aos alunos!

---

## 6. Atalhos de Teclado Globais e Locais

| Atalho | Escopo | Ação |
| :--- | :---: | :--- |
| `Cmd/Ctrl + Shift + M` | Global (mesmo fora de foco) | Mutar / Desmutar microfone instantaneamente. |
| `Cmd/Ctrl + Shift + K` | Global | Limpar o canvas (`{"op":"clear"}`) salvando snapshot anterior. |
| `Cmd/Ctrl + Shift + P` | Local | Abrir / Focar `ProjectorWindow`. |
| `Alt + 0` | Local | Ativar detecção **Automática** de tema (`themeLocked = false`). |
| `Alt + 1..6` | Local | Travar tema manualmente (`1: 3b1b`, `2: whiteboard`, `3: flipchart`, `4: ted`, `5: blueprint`, `6: chalkboard`). |
| `Alt + ←` / `Alt + →` | Local | Navegar para o *Beat* anterior / próximo (ou voltar ao vivo). |
| `F11` (na `ProjectorWindow`) | Janela Projetor | Alternar Tela Cheia sem bordas. |
