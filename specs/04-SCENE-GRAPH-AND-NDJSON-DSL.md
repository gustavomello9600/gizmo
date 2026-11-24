# 04 — Protocolo NDJSON em Streaming, Parser Resiliente e Grafo de Cena (`SceneGraph`)

## 1. Visão Geral do Protocolo NDJSON (Newline-Delimited JSON)

Toda resposta do LLM é um fluxo de texto onde **cada linha terminada em `\n` representa exatamente um `SceneOp` independente**.

Exemplo real de resposta em streaming gerada pelo LLM durante uma aula de Cálculo (4 linhas = 4 mutações progressivas na tela em menos de `850 ms`):

```ndjson
{"op":"theme","style":"3b1b"}
{"op":"title","text":"Integral Definida","subtitle":"Soma de Riemann até a área exata sob a curva"}
{"op":"upsert","id":"plot_area","kind":"plot_2d","zone":"left","title":"Gráfico de f(x) = x²","data":{"domain":[0,3],"range":[0,9],"functions":[{"expr":"x^2","label":"f(x) = x²","color":"primary"}],"shaded_area":{"expr":"x^2","from":0,"to":2}}}
{"op":"upsert","id":"eq_int","kind":"math","zone":"right","data":{"latex":"\\int_{0}^{2} x^2 \\, dx = \\left[ \\frac{x^3}{3} \\right]_{0}^{2} = \\frac{8}{3}","highlight_terms":["\\frac{8}{3}"],"caption":"Área exata = 2,67"}}
```

---

## 2. Parser Resiliente Linha-a-Linha em Rust (`NdjsonStreamParser`)

> **ARMADILHA MORTAL QUE VOCÊ DEVE TRATAR OBRIGATORIAMENTE:**  
> Modelos locais (especialmente 3B–8B) frequentemente geram LaTeX dentro de strings JSON com **barra invertida simples**, ex.: `"latex": "\frac{1}{2} + \tan(x) + \sqrt{2}"`.  
> Em JSON estrito (RFC 8259):
> - `\f` em `\frac` vira **Form Feed (`0x0C`)**, destruindo `\frac` -> `rac`!
> - `\t` em `\tan` ou `\theta` vira **TAB (`0x09`)**, destruindo `\tan` -> `an`!
> - `\b` em `\beta` ou `\binom` vira **Backspace (`0x08`)**, destruindo `\beta` -> `eta`!
> - `\s` em `\sqrt` ou `\sum` **NÃO é escape JSON válido** e faz `serde_json::from_str` falhar com `Error("invalid escape", ...)`!

### 2.1. Algoritmo Obrigatório `sanitize_ndjson_line(raw_line: &str) -> Option<String>`

Execute estes 5 passos em `< 0.1 ms` para cada linha `\n` recebida do SSE antes de `serde_json::from_str::<SceneOp>`:

1. **Limpeza de Envelopes Markdown e Lixo:**
   - Faça `trim()`.
   - Se a linha for vazia, começar com ```` ``` ```` ou `//`, ou for `[DONE]`, retorne `None`.
   - Se a linha começar com `- {` ou `1. {`, recorte a partir do primeiro `{` até o último `}`.
   - Remova vírgula final solta após o último `}` (ex.: `{"op":"clear"},` -> `{"op":"clear"}`).
2. **Máquina de Estados de Reparo de Escapes LaTeX Dentro de Strings JSON:**
   Percorra os caracteres controlando `in_string: bool` e `escaped: bool`:
   - Fora de string (`!in_string`): copie literalmente; ao ver `"`, entre em `in_string = true`.
   - Dentro de string (`in_string`), ao encontrar `\` seguido de `next_char`:
     - Se `next_char` for `"`, `\`, `/` ou `u` seguido de 4 dígitos hexadecimais: mantenha como escape JSON legítimo (`\"`, `\\`, `\/`, `\uXXXX`).
     - Se `next_char` for **`n`** seguido de caractere **não-alfabético** (ex.: `\n ` ou `\ndef` em código? Cuidado!):
       - Regra exata e infalível: rastreie o nome da chave JSON atual (`current_key`).
       - Quando `current_key` for `"latex"`, `"steps"`, `"highlight_terms"` ou `"caption"`: se `\` for seguido por uma sequência de letras ASCII formando comando LaTeX (`frac`, `fet...`, `beta`, `binom`, `boxed`, `bar`, `bf`, `begin`, `tan`, `theta`, `tau`, `times`, `text`, `to`, `top`, `triangle`, `rho`, `right`, `rightarrow`, `nu`, `neq`, `nabla`, `not`, `sqrt`, `sum`, `sin`, `int`, `infty`, `alpha`, `Delta`, `left`, `lim`, `cdot`, `cos`, `vec`, `partial`, `pi`, etc.), duplique a barra para `\\`!
       - Para **qualquer** chave JSON: se `\` for seguido de um caractere que **não** pertence ao conjunto JSON válido `["\\/bfnrtu]`, duplique automaticamente para `\\` (conserta `\sqrt`, `\int`, `\sum`, `\alpha`, `\Delta`, `\,` em qualquer campo!).
3. **Teste Unitário Obrigatório (`src-tauri/src/brain/ndjson_parser.rs`):**
   Teste explicitamente a entrada crua:
   `{"op":"upsert","id":"m1","kind":"math","zone":"center","data":{"latex":"\frac{\sqrt{a^2+b^2}}{\tan(\theta)} = \beta"}}`
   e garanta que `parsed.latex == r"\frac{\sqrt{a^2+b^2}}{\tan(\theta)} = \beta"` sem perder uma única letra!

---

## 3. Especificação Exata das 10 Operações (`SceneOp`)

```typescript
export type ThemeId = '3b1b' | 'whiteboard' | 'flipchart' | 'ted' | 'blueprint' | 'chalkboard';

export type SemanticZone =
  | 'hero'
  | 'center'
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'split_tl'
  | 'split_tr'
  | 'split_bl'
  | 'split_br'
  | 'footer';

export type SceneOp =
  | { op: 'theme'; style: ThemeId; locked?: boolean }
  | { op: 'title'; text: string; subtitle?: string }
  | { op: 'upsert'; id: string; kind: NodeKind; zone: SemanticZone; title?: string; pinned?: boolean; data: NodeData }
  | { op: 'patch'; id: string; zone?: SemanticZone; title?: string; data?: Partial<NodeData> }
  | { op: 'connect'; id: string; from: string; to: string; label?: string; animated?: boolean; style?: 'solid' | 'dashed' }
  | { op: 'highlight'; id: string; target?: string; style?: 'pulse' | 'box' | 'underline' | 'spotlight'; ttl_ms?: number }
  | { op: 'remove'; id: string }
  | { op: 'camera'; focus: SemanticZone | 'all' | string; zoom?: number }
  | { op: 'clear'; keep_title?: boolean }
  | { op: 'noop' };
```

### Regras Determinísticas do Reducer (`applySceneOp(scene, op) -> SceneGraph`)

1. **`theme`**: Se `scene.themeLocked === true` e `op.locked !== true` (ou seja, veio automaticamente do LLM enquanto o usuário travou manualmente o tema na UI), **ignore** a troca de tema. Caso contrário, atualize `scene.theme = op.style`.
2. **`title`**: Atualiza `scene.title` e `scene.subtitle` com transição suave.
3. **`upsert`**:
   - Se `scene.nodes[op.id]` já existe: preserva `createdAt` e `orderIndex`, atualiza `kind`, `zone`, `title`, `data` e incrementa `version` (permitindo ao componente React animar o *morph* em vez de desmontar/remontar quando `kind` é igual!).
   - Se não existe: insere com `version: 1`.
   - **Política Anti-Poluição Automática (`Auto-Eviction`):** Se o total de nós exceder `themeDescriptor.maxNodesPerScene` (ex.: `3` no tema `ted`, `6` em `3b1b`, `8` em `whiteboard`/`flipchart`, `10` em `blueprint`), remova automaticamente o nó mais antigo (`menor updatedAt`) que tenha `pinned !== true` e não esteja envolvido na operação atual, removendo também quaisquer `edges` ligadas a ele!
4. **`patch`**: Aplica *JSON Merge Patch* (RFC 7396) sobre `scene.nodes[op.id].data` (e atualiza `zone`/`title` se fornecidos). Se `op.id` não existir, ignora silenciosamente sem erro.
5. **`connect`**: Cria ou atualiza uma aresta inter-nós em `scene.edges[op.id]` se ambos `from` e `to` existirem em `scene.nodes`.
6. **`highlight`**: Registra em `scene.activeHighlights[op.id]` com `expiresAt = now + (op.ttl_ms ?? 2800)`. Um timer leve limpa highlights expirados.
7. **`remove`**: Remove `scene.nodes[op.id]` (ou `scene.edges[op.id]`) e limpa arestas órfãs conectadas a `op.id`.
8. **`camera`**: Define `scene.camera = { focus: op.focus, zoom: clamp(op.zoom ?? 1.0, 0.75, 1.6) }`. `focus: "all"` reseta `zoom = 1.0, pan = (0,0)`.
9. **`clear`**: Esvazia `nodes`, `edges`, `activeHighlights`, reseta `camera` e limpa `title`/`subtitle` (a menos que `keep_title == true`), salvando antes um `BeatSnapshot` na linha do tempo da aula!
10. **`noop`**: Nenhuma mutação visual.

---

## 4. Catálogo Completo dos 14 Tipos de Nós (`NodeKind`) e Contratos `data`

Todo renderizador de nó **DEVE** aplicar *defaults* defensivos caso um LLM menor omita campos opcionais!

### 4.1. `math` — Equações e Derivações Passo a Passo
```json
{
  "latex": "e^{i\\pi} + 1 = 0",
  "steps": [
    "e^{ix} = \\cos(x) + i\\sin(x)",
    "e^{i\\pi} = -1 + 0i",
    "e^{i\\pi} + 1 = 0"
  ],
  "highlight_terms": ["e^{i\\pi}", "-1"],
  "caption": "Identidade de Euler"
}
```
- Se `steps` tiver `>= 2` itens, renderiza uma pilha vertical numerada onde o último passo tem destaque principal e os anteriores ficam a `75%` de opacidade, animando a entrada de cada novo passo adicionado!

### 4.2. `plot_2d` — Plano Cartesiano e Funções `f(x)`
```json
{
  "domain": [-4, 4],
  "range": [-2, 10],
  "x_label": "x",
  "y_label": "f(x)",
  "show_grid": true,
  "functions": [
    { "expr": "x^2", "label": "f(x) = x²", "color": "primary", "dashed": false },
    { "expr": "2*x - 1", "label": "Tangente (x=1)", "color": "accent", "dashed": true }
  ],
  "points": [
    { "x": 1, "y": 1, "label": "P(1, 1)", "color": "accent" }
  ],
  "shaded_area": { "expr": "x^2", "from": 0, "to": 2, "color": "secondary" }
}
```

### 4.3. `geometry_2d` — Construções Geométricas, Triângulos, Círculos e Vetores
Coordenadas internas relativas a `view_box` (padrão `[0, 0, 240, 180]`):
- Formas suportadas em `shapes[]`:
  - `{ "type": "polygon", "points": [[x1,y1], [x2,y2], ...], "label"?: string, "color"?: SemanticColor, "fill"?: boolean }`
  - `{ "type": "circle", "center": [cx, cy], "radius": r, "label"?: string, "color"?: SemanticColor }`
  - `{ "type": "vector", "from": [x1, y1], "to": [x2, y2], "label"?: string, "color"?: SemanticColor }`
  - `{ "type": "line", "from": [x1, y1], "to": [x2, y2], "dashed"?: boolean, "color"?: SemanticColor }`
  - `{ "type": "arc_angle", "vertex": [vx, vy], "from_deg": 0, "to_deg": 45, "radius"?: 24, "label"?: "θ" }`
  - `{ "type": "right_angle", "at": [vx, vy], "size"?: 14 }`
  - `{ "type": "segment_label", "from": [x1, y1], "to": [x2, y2], "text": "c = 5", "color"?: SemanticColor }`

### 4.4. `chart` — Gráficos Estatísticos e de Negócios
- `chart_type`: `'bar' | 'line' | 'area' | 'donut' | 'scatter'`
- `x_label?: string`, `y_label?: string`, `unit?: string` (ex.: `"R$"`, `"%"`, `"ms"`)
- `series`: `Array<{ name: string; color?: SemanticColor; points: Array<{ x: string | number; y: number }> }>`

### 4.5. `diagram` — Fluxogramas, Arquitetura e Mapas de Conceitos Internos
- `direction`: `'LR' | 'TB'` (padrão `'LR'`)
- `nodes`: `Array<{ id: string; label: string; sublabel?: string; shape?: 'box' | 'pill' | 'diamond' | 'cylinder' | 'actor'; color?: SemanticColor }>`
- `edges`: `Array<{ from: string; to: string; label?: string; animated?: boolean; dashed?: boolean }>`

### 4.6. `bullets` — Tópicos Didáticos Estruturados
- `ordered`: `boolean`
- `items`: `Array<{ id?: string; text: string; subtext?: string; icon?: string; emphasis?: boolean; checked?: boolean }>`

### 4.7. `code` — Bloco de Código com Destaque de Linhas em Tempo Real
- `language`: `string` (`python`, `typescript`, `rust`, `sql`, `bash`, `pseudo`, etc.)
- `code`: `string`
- `highlight_lines?: number[]` (1-indexed; escurece suavemente as demais linhas a `55%` quando preenchido!)
- `caption?: string`

### 4.8. `matrix_2x2` — Matriz Estratégica 2x2 (SWOT, Esforço x Impacto, BCG)
- `x_axis`: `[string, string]` (ex.: `["Baixo Esforço", "Alto Esforço"]`)
- `y_axis`: `[string, string]` (ex.: `["Baixo Impacto", "Alto Impacto"]`)
- `quadrants`: `{ tl: QuadrantData, tr: QuadrantData, bl: QuadrantData, br: QuadrantData }` onde `QuadrantData = { title: string; items: string[]; highlight?: boolean }`.

### 4.9. `funnel` — Funil de Conversão / Filtragem por Etapas
- `stages`: `Array<{ label: string; value: string; rate?: string; highlight?: boolean }>`

### 4.10. `timeline` — Linha do Tempo Histórica ou de Processo
- `orientation`: `'horizontal' | 'vertical'`
- `events`: `Array<{ date: string; title: string; detail?: string; highlight?: boolean }>`

### 4.11. `kpi` — Grande Métrica de Impacto (Estrela do Tema `ted` e `flipchart`)
- `value`: `string` (ex.: `"87%"`, `"R$ 4,2M"`, `"10x"`, `"299.792 km/s"`)
- `label`: `string`
- `delta?: string` (ex.: `"+32% YoY"`)
- `trend?: 'up' | 'down' | 'neutral'`

### 4.12. `comparison` — Tabela Comparativa Lado a Lado (A vs. B)
- `left_title`: `string`, `right_title`: `string`
- `rows`: `Array<{ aspect: string; left: string; right: string; winner?: 'left' | 'right' | 'tie' }>`

### 4.13. `callout` — Cartão de Definição, Teorema, Alerta ou Citação
- `variant`: `'insight' | 'warning' | 'definition' | 'quote'`
- `title?: string`
- `body`: `string`
- `author?: string` (para `quote`)

### 4.14. `freehand_note` — Post-it / Lembrete Rápido de Canto
- `text`: `string`
- `color?: 'yellow' | 'pink' | 'mint' | 'blue'`
- `rotation_deg?: number` (limitado a `[-4, 4]`)
