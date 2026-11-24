# 06 — Motor Determinístico de Layout (`< 1.5ms`) e Renderizadores Visuais a 60fps

## 1. Espaço Virtual Unificado `1920 × 1080` (Zero Divergência Entre Janelas!)

Tanto a `StudioWindow` (com barras laterais/inferiores) quanto a `ProjectorWindow` (tela cheia no projetor/OBS) renderizam o Canvas dentro de um contêiner `16:9` responsivo cujo espaço interno lógico é **sempre `1920 × 1080` unidades lógicas**:

- Um `ResizeObserver` mede o container pai `(containerW, containerH)` e calcula:
  ```typescript
  const scale = Math.min(containerW / 1920, containerH / 1080);
  ```
- O palco interno tem `width: 1920px; height: 1080px; transform: scale(${scale}); transform-origin: center center;`.
- **Vantagens gigantescas para o agente construtor:**
  1. Todos os tamanhos de fonte, espessuras de seta, paddings e retângulos de zona têm números fixos e previsíveis!
  2. O que o professor vê na miniatura do seu notebook é **pixel-por-pixel idêntico** ao que os alunos veem no projetor 4K ou na transmissão do OBS!

---

## 2. Geometria Exata das `SemanticZone`s (Sem Sobreposição por Construção!)

Reserva de cabeçalho:
- Se `scene.title` estiver presente: `HEADER_BOTTOM = 136` (título renderizado em `x: 72..1848, y: 32..120`).
- Se `scene.title` estiver vazio: `HEADER_BOTTOM = 48`.
- Margem inferior segura: `CANVAS_BOTTOM = 1032` (reserva `48px` inferiores).
- Área útil de conteúdo: `X = [72, 1848]` (`W = 1776`), `Y = [HEADER_BOTTOM, 1032]` (`H = 1032 - HEADER_BOTTOM`, tipicamente `896px`).

### 2.1. Tabela Matemática de Retângulos por Zona (com `HEADER_BOTTOM = 136`, `GAP = 28`)

| `SemanticZone` | `x` | `y` | `w` | `h` | Uso Típico |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **`hero`** | `160` | `168` | `1600` | `800` | 1 grande ideia/KPI/equação centralizada (padrão `ted`). |
| **`center`** | `320` | `156` | `1280` | `840` | 1 diagrama, gráfico ou quadro principal. |
| **`left`** | `72` | `148` | `874` | `860` | Metade esquerda (ex.: gráfico `plot_2d` ao lado de `math` na direita). |
| **`right`** | `974` | `148` | `874` | `860` | Metade direita. |
| **`top`** | `72` | `148` | `1776` | `416` | Faixa horizontal superior (ex.: `timeline` horizontal). |
| **`bottom`** | `72` | `592` | `1776` | `416` | Faixa horizontal inferior. |
| **`split_tl`** | `72` | `148` | `874` | `416` | Quadrante superior esquerdo. |
| **`split_tr`** | `974` | `148` | `874` | `416` | Quadrante superior direito. |
| **`split_bl`** | `72` | `592` | `874` | `416` | Quadrante inferior esquerdo. |
| **`split_br`** | `974` | `592` | `874` | `416` | Quadrante inferior direito. |
| **`footer`** | `160` | `924` | `1600` | `96` | Resumo/conclusão curta ou `callout` de rodapé. |

### 2.2. Resolução Automática de Conflitos e Empilhamento na Mesma Zona (`ZoneSubSplitter`)

O que acontece se o LLM colocar **2 ou 3 nós na mesma zona** (ex.: dois `math` ou um `math` + um `callout` ambos em `"right"`), ou misturar `"center"` com `"left"`?

Implemente estas 2 regras determinísticas em `src/layout/solveLayout.ts`:

1. **Promoção de Conflito `center`/`hero` vs. `left`/`right`:**
   - Se existir pelo menos um nó em `left` (e nenhum em `right`) e outro nó em `center`: mova virtualmente o nó `center` para `right`! (E vice-versa se `right` estiver ocupado e `left` livre). Isso impede 100% que um nó `center` cubra um nó `left`!
2. **Subdivisão Limpa Intra-Zona (`k` nós na mesma zona `Z`):**
   - Ordene os `k` nós de `Z` por `(orderIndex ASC)`.
   - Se `Z` for uma zona larga (`top`, `bottom`, `footer`, `hero` com `k == 2`): divida **horizontalmente** em `k` colunas iguais separadas por `GAP = 24px`.
   - Caso contrário (`left`, `right`, `center`, `split_*`): divida **verticalmente** em `k` fatias proporcionais ao peso natural do `kind` (`plot_2d`/`diagram`/`chart`/`matrix_2x2` têm peso `2.0`; `math`/`bullets`/`code`/`comparison` têm peso `1.4`; `callout`/`kpi`/`freehand_note` têm peso `0.9`), separadas por `GAP = 22px`, com altura mínima `140px`!

### 2.3. Roteamento de Conectores Inter-Nós (`op: "connect"`)
Para cada aresta `edge` conectando `nodeA` (`rectA`) e `nodeB` (`rectB`):
1. Compare centros `(cxA, cyA)` e `(cxB, cyB)`:
   - Se `|cxB - cxA| >= |cyB - cyA|`: saia da face direita de `A` (se `cxB > cxA`, senão esquerda) até a face oposta de `B`, com curva cúbica suave `M x1 y1 C mx y1, mx y2, x2 y2` onde `mx = (x1 + x2) / 2`.
   - Caso contrário: saia da face inferior/superior com `M x1 y1 C x1 my, x2 my, x2 y2` onde `my = (y1 + y2) / 2`.
2. Desenhe ponta de seta orientada na tangente final e caixa de `label` centralizada em `(mx, my)`.

---

## 3. Arquitetura de Renderização em 3 Camadas GPU (60/120fps)

```text
<CanvasViewport> (1920x1080 escalado)
 ├── <Layer0Background theme={theme} />          // React.memo: só re-renderiza se theme mudar!
 ├── <CameraRig camera={camera}>                 // CSS transform: scale() translate3d() com spring suave
 │    ├── <InterNodeEdgesSvg edges={edges} />    // SVG 1920x1080 de setas entre zonas
 │    └── {positionedNodes.map(node => (
 │          <NodeShell key={node.id} rect={node.rect} highlight={highlights[node.id]}>
 │            <NodeRenderer node={node} theme={theme} />
 │          </NodeShell>
 │        ))}
 │   </CameraRig>
 └── <Layer2LiveOverlay audioRef={audioLevelRef} /> // Canvas/SVG leve via requestAnimationFrame (0 React renders!)
```

---

## 4. Detalhes Obrigatórios de Implementação dos Renderizadores Críticos

### 4.1. `Plot2DRenderer` (`kind: "plot_2d"`) — Seguro, Rápido e Sem Assíntotas Quebradas!
1. **Parser Seguro:** Use `import { Parser } from 'expr-eval'`.
   - Pré-processe sinônimos comuns emitidos por LLMs antes de `Parser.evaluate`:
     - Substitua `^` por `^` (suportado nativamente em `expr-eval`), `ln(` por `log(`, `sen(` por `sin(`, `tg(` por `tan(`, `π` ou `pi` (word boundary) por `PI`.
   - Envolva o `parser.parse(expr)` num `try / catch`: se uma expressão vier inválida durante digitação, ignore apenas aquela curva e nunca quebre a árvore React (use também um `<NodeErrorBoundary>` em volta de cada `<NodeShell>`!).
2. **Amostragem de `240` Pontos + Corte de Descontinuidade (Assíntotas):**
   - Para `i = 0..240`, calcule `x = xMin + (i / 240) * (xMax - xMin)` e `y = fn.evaluate({ x })`.
   - Se `!Number.isFinite(y)` **OU** `Math.abs(y - prevY) > (yMax - yMin) * 1.8` (salto abrupto como em `1/x` em `x=0` ou `tan(x)` em `π/2`): **quebre o sub-caminho SVG** iniciando um novo comando `M` em vez de `L`! Isso evita aquela linha vertical horrível cruzando o gráfico!
3. **Animação de Desenho tipo 3Blue1Brown:**
   - Aplique `pathLength="1"` no `<path>` da função e anime `strokeDasharray="1"` + `strokeDashoffset` de `1 -> 0` em `520ms` (`cubic-bezier(0.22, 1, 0.36, 1)`) quando uma nova função surge!

### 4.2. `MathRenderer` (`kind: "math"`) — KaTeX Síncrono `< 0.5ms` + Highlight de Termos
1. Chame `katex.renderToString(latex, { displayMode: true, throwOnError: false, strict: false, trust: false })` memorizado com `useMemo`.
2. **Escala Automática (`Auto-Fit`):** Se a fórmula for muito comprida e `scrollWidth > rect.w - 48`, aplique automaticamente `transform: scale(${(rect.w - 48) / scrollWidth})` para **jamais** cortar equações ou mostrar barra de rolagem horizontal numa aula!
3. **Destaque de Sub-Termos (`highlight_terms`):** Para cada `term` em `highlight_terms` (que ainda não esteja envolvido em `\bbox` ou `\textcolor`), envolva ocorrências seguras na string LaTeX com `\htmlClass{gizmo-math-hl}{<term>}` (habilitando `trust: (ctx) => ctx.command === '\\htmlClass'`) estilizado com sublinhado/halo pulsante na cor `--color-accent`! Se a substituição falhar na validação KaTeX, faça fallback automático para a string `latex` original sem `\htmlClass`.

### 4.3. `DiagramRenderer` (`kind: "diagram"`) — Sub-Layout `@dagrejs/dagre`
1. Crie `new dagre.graphlib.Graph()`, configure `rankdir: data.direction ?? 'LR'`, `nodesep: 36`, `ranksep: 56`.
2. Estime largura/altura de cada nó pelo comprimento de `label`: `w = clamp(label.length * 10 + 44, 120, 260)`, `h = sublabel ? 68 : 50`.
3. Rode `dagre.layout(g)` (`< 0.6ms` para 15 nós!), calcule o `boundingBox` resultante `(graphW, graphH)` e centralize/escale dentro do `rect` da zona usando `<svg viewBox="0 0 ${graphW} ${graphH}">`.
4. Quando `edge.animated === true` (ou no tema `blueprint`), renderize um segundo `<path>` sobreposto com `stroke-dasharray="6 10"` e animação CSS leve `stroke-dashoffset` contínua mostrando o fluxo de dados/causa!

### 4.4. Demais Renderizadores (Todos Nativos em SVG/HTML Leve, Sem Dependências Pesadas)
- **`ChartRenderer`**: Barras com altura animada (`scaleY`), linhas/áreas suaves Catmull-Rom, rosca (`donut` com `stroke-dasharray` circular) e `scatter` — tudo em `< 180` linhas de SVG puro compatível com `strokeMode === 'rough'` e `'crisp-glow'`.
- **`CodeRenderer`**: Tokenizador regex leve para palavras-chave/strings/comentários/números em 10 linguagens + numeração de linhas + faixa iluminada nas linhas de `highlight_lines`.
- **`KpiRenderer`**: Detector numérico que extrai prefixo (`"R$ "`), número (`4.2`) e sufixo (`"M"` ou `"%"`) e interpola suavemente o número quando atualizado via `upsert`/`patch`!
- **`Matrix2x2Renderer`, `FunnelRenderer`, `TimelineRenderer`, `BulletsRenderer`, `ComparisonRenderer`, `CalloutRenderer`, `Geometry2DRenderer`, `FreehandNoteRenderer`**: Todos seguem os tokens CSS do tema ativo e respeitam `rect.w × rect.h` sem overflow (`overflow: hidden` + tipografia fluida `clamp()`).
