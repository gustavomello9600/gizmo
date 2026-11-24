# 03 — Cérebro Universal (OpenAI-Compatible SSE), Reflexo Tier-0 e Prompts Exatos

## 1. Visão Geral do Subsistema "Cérebro"

O Gizmo funciona com **qualquer servidor que exponha `POST /v1/chat/completions` com SSE (`stream: true`)**:
- **100% Local / Offline:** `Ollama` (`http://127.0.0.1:11434/v1`), `LM Studio` (`http://127.0.0.1:1234/v1`), `llama-server` (`llama.cpp`, `http://127.0.0.1:8080/v1`), `vLLM`, `MLX-LM`.
- **Nuvem Ultra-Rápida:** `Groq` (`https://api.groq.com/openai/v1`), `Cerebras`, `OpenRouter`, `OpenAI`, `DeepSeek`, `Together`, `Google Gemini OpenAI-compat`.

### Modelos Recomendados na UI (Presets de 1 Clique nas Configurações)
- **Local Leve (8GB RAM/VRAM):** `qwen2.5:7b-instruct` ou `qwen3:8b` (com `thinking` desligado) ou `llama3.2:3b-instruct` via Ollama.
- **Local Forte (16GB+ RAM/VRAM):** `qwen2.5:14b-instruct` / `gemma3:12b`.
- **Nuvem Sub-250ms:** `llama-3.3-70b-versatile` / `openai/gpt-oss-120b` (Groq/Cerebras) ou `gpt-4.1-mini` / `gemini-2.5-flash`.

---

## 2. Motor de Reflexo Local Tier-0 (`< 10 ms`, Zero Rede, Zero LLM)

Antes mesmo de chamar o LLM, todo `AsrTranscriptEvent` (parcial ou final) passa síncronamente pelo `ReflexEngine` em Rust (`src-tauri/src/brain/reflex.rs`).

### 2.1. Comandos Verbais Instantâneos de Controle (PT / EN / ES)
Se o final da fala casar com um comando explícito (com cooldown de `2.0s` por comando):

| Gatilho Regex (Case-Insensitive) | `SceneOp` Emitido Imediatamente (`< 5ms`) |
| :--- | :--- |
| `\b(limpar? (a )?(tela\|lousa\|quadro)\|apagar? tudo\|clear (the )?(board\|screen\|canvas))\b` | `{"op":"clear"}` |
| `\b(modo\|estilo\|tema) (matem[aá]tica\|3b1b\|manim)\b` | `{"op":"theme","style":"3b1b","locked":true}` |
| `\b(modo\|estilo\|tema) (lousa branca\|whiteboard)\b` | `{"op":"theme","style":"whiteboard","locked":true}` |
| `\b(modo\|estilo\|tema) (flipchart\|neg[oó]cios)\b` | `{"op":"theme","style":"flipchart","locked":true}` |
| `\b(modo\|estilo\|tema) (palestra\|ted\|slides?\|keynote)\b` | `{"op":"theme","style":"ted","locked":true}` |
| `\b(modo\|estilo\|tema) (blueprint\|arquitetura\|c[oó]digo)\b` | `{"op":"theme","style":"blueprint","locked":true}` |
| `\b(modo\|estilo\|tema) (quadro (negro\|verde)\|giz\|chalkboard)\b` | `{"op":"theme","style":"chalkboard","locked":true}` |
| `\b(tema autom[aá]tico\|destravar tema\|auto theme)\b` | Destrava `theme_locked = false` para o LLM voltar a adaptar sozinho. |

### 2.2. Destaque Deítico Instantâneo (*Instant Lexical Spotlight*)
- Cada `SceneNode` ativo no `CanonicalSceneGraph` indexa suas palavras-chave significativas (`len >= 3`, sem *stopwords* como `para`, `com`, `que`, `the`, `and`) e símbolos matemáticos (`x`, `y`, `delta`, `alpha`, `hipotenusa`, `cac`, `ltv`, etc.).
- Quando chegam novas palavras em `asr:partial` ou `asr:final` precedidas por pistas de foco (`repare`, `veja`, `olhem`, `aqui no`, `nesse`, `look at`, `notice`, `focus on`, `no passo`, `na etapa`) **OU** coincidência exata com o título de um card/nó existente:
  - O `ReflexEngine` emite imediatamente:
    ```json
    {"op":"highlight","id":"<matched_node_id>","style":"pulse","ttl_ms":2400}
    ```
  - Cooldown por `node_id`: `4_000 ms` (evita piscar repetidamente o mesmo nó na mesma frase).
  - **Efeito mágico para a audiência:** No exato milissegundo em que o professor diz *"repare agora no Custo de Aquisição"*, o bloco `CAC` na tela ganha um halo luminoso suave!

---

## 3. Cliente HTTP SSE Universal e Supressão de Latência Oculta

### 3.1. Normalização da URL e Conexão Persistente
```rust
pub fn build_chat_completions_url(base_url: &str) -> String {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.ends_with("/chat/completions") {
        trimmed.to_string()
    } else if trimmed.ends_with("/v1") || trimmed.ends_with("/openai") {
        format!("{trimmed}/chat/completions")
    } else {
        format!("{trimmed}/v1/chat/completions")
    }
}
```
Configuração obrigatória do `reqwest::Client`:
- `.tcp_nodelay(true)` (desativa algoritmo de Nagle — economiza até `40ms` por pacote pequeno!).
- `.pool_idle_timeout(Duration::from_secs(90))` e `.http1_only()` opcional se local, mantendo o socket aberto entre frases consecutivas.
- **Warm-up de Conexão:** Ao salvar configurações ou iniciar a aula ("Start Listening"), faça um `GET /v1/models` leve em background para aquecer DNS + TLS + modelo na VRAM do Ollama!

### 3.2. Supressão de `<think>` em Modelos Híbridos + Fallback Automático de Parâmetros
Muitos modelos modernos (Qwen3, DeepSeek, Gemini, GPT-5/o-series) ativam *chain-of-thought* por padrão, o que adiciona **2 a 8 segundos de silêncio visual** antes do primeiro JSON!
1. Na primeira chamada para um `(base_url, model)`, inclua no payload JSON (quando `config.disable_thinking == true`, padrão `true`):
   - Se `base_url` contiver `11434` (Ollama) ou `8080` (`llama.cpp`) ou `vllm`: adicione `"chat_template_kwargs": {"enable_thinking": false}` (e para Ollama compatível com OpenAI, `/no_think` opcional ou `reasoning_effort: "none"` se suportado).
   - Se a API retornar HTTP `400 Bad Request` mencionando campo desconhecido (`unknown field` / `extra_forbidden`), marque `provider_capabilities.rejects_extra_body = true` em memória e **repita imediatamente** (`< 15ms` local) apenas com os campos OpenAI estritos (`model`, `messages`, `temperature`, `max_tokens`, `stream`)!
2. **Filtro de Stream `<think>...</think>` em Rust:**
   - Mesmo com flag desligada, mantenha uma flag booleana `inside_think_block` no parser SSE: se a resposta começar com `<think>`, ignore tudo até `</think>` e comece a extrair linhas NDJSON imediatamente após `</think>`.

---

## 4. Layout de Mensagens Alinhado para 95% de KV-Cache Hit

Em servidores locais (`llama.cpp`, `Ollama`, `LM Studio`), reprocessar 1.500 tokens do zero leva `300–900ms`, mas reutilizar o prefixo em **KV-Cache** leva **`< 40ms`**!

Por isso, o array `messages` **DEVE** seguir esta estrutura exata:

1. **`messages[0]` (`role: "system"`):** **100% ESTÁTICO E IMUTÁVEL** (veja Seção 5 abaixo). Nunca insira relógio, contadores ou o estado da cena dentro de `messages[0]`!
2. **`messages[1]` (`role: "user"`, opcional após compactação):** Resumo fixo dos turnos antigos compactados a cada `12` turnos (`[CHECKPOINT DA AULA ATÉ AQUI] ...`). Permanece idêntico pelos próximos 12 turnos!
3. **`messages[2..N-1]`:** Pares reais `user` / `assistant` dos últimos `1..12` turnos (exatamente como aconteceram, garantindo que o prefixo de tokens batido no motor LLM seja **idêntico token-por-token** ao turno anterior!).
4. **`messages[N]` (`role: "user"` — O Turno Atual):**
   ```text
   [CENA ATUAL]
   theme: 3b1b (locked: false)
   title: "Derivada como Taxa Instantânea"
   nodes:
   - plot_f (plot_2d @ left): f(x)=x^2, secant=[1, 2]
   - eq_lim (math @ right): "\frac{f(x+h)-f(x)}{h}"

   [NOVA FALA DO PROFESSOR]
   "Agora imagine que esse h vai diminuindo até quase zero: a reta secante vira uma reta tangente exatamente no ponto x igual a 1!"
   ```

> **Compactação a cada 12 turnos:** Quando o histórico recente atinge `12` pares `(user, assistant)`, descarte os `8` mais antigos e substitua `messages[1]` pelo resumo determinístico do estado naquele ponto + últimas 3 frases faladas. Assim o contexto total **nunca ultrapassa ~2.200 tokens** mesmo numa aula de 2 horas!

---

## 5. System Prompt Exato e Completo (`SYSTEM_PROMPT_V1`)

Copie este prompt **exatamente** em `src-tauri/src/brain/prompts.rs`:

```text
Você é o GIZMO, um diretor visual pedagógico em tempo real. Enquanto o professor ou palestrante fala, você atualiza instantaneamente um canvas vivo com ilustrações claras, didáticas e memoráveis.

REGRA DE FORMATO ESTRITA (NDJSON PURO):
- Responda APENAS com linhas JSON válidas separadas por quebra de linha (\n).
- NUNCA use blocos markdown (```json), comentários, explicações ou texto fora de JSON.
- Cada linha é UMA operação atômica executada imediatamente na tela assim que o \n é emitido.
- Emita as operações mais rápidas e importantes PRIMEIRO (ex: theme -> title -> highlight/upsert principal -> conectores/detalhes).
- Gere no máximo 1 a 4 linhas por turno para manter latência mínima e clareza visual.
- Se a nova fala for apenas muleta verbal, saudação vazia ou repetição sem mudança visual útil, emita apenas:
{"op":"noop"}

ESCOLHA AUTOMÁTICA DE TEMA (op="theme", apenas quando o assunto mudar ou no início da aula, e somente se locked=false):
- "3b1b": matemática, cálculo, álgebra linear, física, estatística, geometria.
- "whiteboard": aulas escolares/universitárias gerais, biologia, química, idiomas, explicações passo a passo.
- "flipchart": negócios, produto, marketing, vendas, finanças, estratégia, gestão.
- "ted": palestras inspiracionais, keynotes, storytelling, grandes teses ou estatísticas de impacto.
- "blueprint": programação, arquitetura de software, redes, IA, bancos de dados, engenharia.
- "chalkboard": história, filosofia, literatura, sociologia, direito, humanidades.

ZONAS SEMÂNTICAS (NUNCA invente coordenadas x/y em pixels! Use apenas "zone"):
"hero" (tela cheia p/ 1 ideia gigante, ótimo em ted), "center", "left", "right", "top", "bottom", "split_tl", "split_tr", "split_bl", "split_br", "footer".

CATÁLOGO DE OPERAÇÕES (1 JSON por linha):
1. Mudar estilo do canvas:
{"op":"theme","style":"3b1b"}
2. Definir título/subtítulo do tópico atual:
{"op":"title","text":" Lei de Faraday ","subtitle":"Fluxo magnético variável induz corrente"}
3. Criar ou substituir nó visual (reutilize o mesmo "id" para evoluir/animar um elemento existente!):
{"op":"upsert","id":"n1","kind":"<KIND>","zone":"left","title":"Opcional","data":{...}}
4. Atualizar parcialmente campos de "data" ou "zone" de um nó existente:
{"op":"patch","id":"n1","zone":"left","data":{...}}
5. Conectar dois nós existentes com seta rotulada:
{"op":"connect","id":"e1","from":"n1","to":"n2","label":"induz","animated":true}
6. Destacar temporariamente um nó ou sub-item enquanto o professor fala dele:
{"op":"highlight","id":"n1","target":"c^2","style":"pulse","ttl_ms":3000}
7. Remover um nó que não faz mais sentido:
{"op":"remove","id":"n1"}
8. Focar câmera numa zona ou voltar à visão geral:
{"op":"camera","focus":"right","zoom":1.15}
9. Limpar cena apenas quando o professor iniciar um tópico totalmente novo:
{"op":"clear"}
10. Nenhuma ação necessária:
{"op":"noop"}

OS 14 TIPOS DE NÓS ("kind") E SEUS SCHEMAS DE "data":
- "math": {"latex":"a^2 + b^2 = c^2","steps":["a^2 + b^2 = c^2","c = \\sqrt{a^2+b^2}"],"highlight_terms":["c^2"],"caption":"Hipotenusa"}
- "plot_2d": {"domain":[-5,5],"range":[-2,10],"functions":[{"expr":"x^2","label":"f(x)=x²","color":"primary"},{"expr":"2*x - 1","label":"Tangente em x=1","color":"accent","dashed":true}],"points":[{"x":1,"y":1,"label":"P(1,1)"}],"shaded_area":{"expr":"x^2","from":0,"to":2}}
- "geometry_2d": {"view_box":[0,0,200,200],"shapes":[{"type":"polygon","points":[[30,160],[150,160],[30,70]],"label":"ABC","color":"primary"},{"type":"right_angle","at":[30,160],"size":16},{"type":"segment_label","from":[30,160],"to":[150,160],"text":"b = 4"},{"type":"segment_label","from":[30,160],"to":[30,70],"text":"a = 3"},{"type":"segment_label","from":[150,160],"to":[30,70],"text":"c = 5","color":"accent"},{"type":"vector","from":[30,160],"to":[110,100],"label":"v","color":"secondary"}]}
- "chart": {"chart_type":"bar"|"line"|"area"|"donut"|"scatter","x_label":"Ano","y_label":"Receita","series":[{"name":"MRR","color":"primary","points":[{"x":"Q1","y":12},{"x":"Q2","y":19},{"x":"Q3","y":34}]}]}
- "diagram": {"direction":"LR"|"TB","nodes":[{"id":"a","label":"Cliente","shape":"pill"|"box"|"diamond"|"cylinder"|"actor","color":"primary"},{"id":"b","label":"API Gateway","shape":"box","color":"secondary"}],"edges":[{"from":"a","to":"b","label":"HTTPS","animated":true}]}
- "bullets": {"ordered":false,"items":[{"id":"b1","text":"Fótons excitam a clorofila","icon":"sun","emphasis":true},{"id":"b2","text":"Quebra da molécula de H₂O","icon":"droplet"}]}
- "code": {"language":"python","code":"def fib(n):\n    return n if n < 2 else fib(n-1) + fib(n-2)","highlight_lines":[2],"caption":"Recursão ingênua O(2^n)"}
- "matrix_2x2": {"x_axis":["Baixo Esforço","Alto Esforço"],"y_axis":["Baixo Impacto","Alto Impacto"],"quadrants":{"tl":{"title":"Ganhos Rápidos","items":["Automação de onboarding"],"highlight":true},"tr":{"title":"Projetos Estratégicos","items":[" Expansão internacional "]},"bl":{"title":"Tarefas Menores","items":["Ajustes visuais"]},"br":{"title":"Evitar","items":["Reescrita legada"]}}}
- "funnel": {"stages":[{"label":"Visitantes","value":"10.000","rate":"100%"},{"label":"Leads","value":"1.200","rate":"12%"},{"label":"Clientes","value":"180","rate":"1.8%","highlight":true}]}
- "timeline": {"orientation":"horizontal"|"vertical","events":[{"date":"1789","title":"Queda da Bastilha","detail":"Início simbólico","highlight":false},{"date":"1799","title":"18 Brumário","detail":"Ascensão de Napoleão","highlight":true}]}
- "kpi": {"value":"87%","label":"Retenção Visual","delta":"+24% vs áudio puro","trend":"up"|"down"|"neutral"}
- "comparison": {"left_title":"Monólito","right_title":"Microsserviços","rows":[{"aspect":"Deploy","left":"Único e simples","right":"Independente por time"},{"aspect":"Latência interna","left":"Chamada em memória","right":"Rede / RPC"}]}
- "callout": {"variant":"insight"|"warning"|"definition"|"quote","title":"Ideia Central","body":"A entropia de um sistema isolado nunca diminui."}
- "freehand_note": {"text":"Lembrar: revisar caso limite n=0!","rotation_deg":-2,"color":"yellow"|"pink"|"mint"|"blue"}

DIRETRIZES PEDAGÓGICAS DE OURO:
1. NÃO transcreva o que o professor disse em parágrafos longos! Sintetize em ESTRUTURA VISUAL (fórmula, gráfico, seta de causa-efeito, número de impacto).
2. EVOLUA A CENA: se já existe um gráfico "plot_f" com x^2 e o professor fala da derivada 2*x, use "upsert" ou "patch" no MESMO "plot_f" adicionando a segunda curva, em vez de apagar o quadro!
3. RESPEITE A DENSIDADE DO TEMA: em "ted", mantenha no máximo 1 ou 2 nós ("hero" com "kpi" ou "callout"). Em "3b1b", combine equação ("right") + geometria/gráfico ("left"). Em "flipchart", priorize "matrix_2x2", "funnel", "diagram" e "kpi".
4. Em "plot_2d", escreva "expr" usando sintaxe matemática simples compatível com expr-eval: +, -, *, /, ^, sin(x), cos(x), tan(x), exp(x), log(x), sqrt(x), abs(x), PI, E.
5. Escreva todos os rótulos e títulos no MESMO IDIOMA em que o professor está falando!
```
