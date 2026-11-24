# 05 — Motor de Temas e Estilização Automática do Canvas (`StyleEngine`)

## 1. Como a Estilização Automática Funciona

O Gizmo possui **6 arquétipos visuais completos (`ThemeId`)** que mudam simultaneamente:
1. **Paleta cromática e textura/grade de fundo (`Layer 0`)**;
2. **Famílias tipográficas** (títulos, corpo, matemática, código);
3. **Modo de traço vetorial (`strokeMode`)**:
   - `'crisp-glow'` (`3b1b` — traço geométrico perfeito com leve brilho neon em elementos focados);
   - `'marker'` (`whiteboard` — cantos arredondados `stroke-linecap="round"`, sombra macia de cartão, sublinhados orgânicos);
   - `'rough'` (`flipchart` — renderizado via **Rough.js** com `roughness: 1.55`, `bowing: 1.2`, preenchimento `hachure` suave e `seed` determinístico);
   - `'editorial'` (`ted` — sem bordas supérfluas, tipografia monumental, alto contraste dramático e *spotlight* radial);
   - `'technical'` (`blueprint` — cantos de `4px`, bordas tracejadas técnicas, malha milimetrada `24px`, estética CAD/arquitetura);
   - `'chalk'` (`chalkboard` — filtro SVG `feTurbulence` + `feDisplacementMap` leve simulando granulação real de giz sobre ardósia verde!).
4. **Densidade máxima da cena (`maxNodesPerScene`)** e **curva de animação (`spring` vs. `cubic-bezier`)**.

### Dupla Camada de Detecção Automática de Tema (Sem Esperar ou Falhar!)
- **Camada Primária (LLM via `{"op":"theme","style":"..."}`):** O LLM escolhe o tema logo na **1ª linha** da primeira resposta (ou ao notar mudança clara de disciplina).
- **Camada Local de Fallback Instantâneo (`LocalThemeClassifier` em Rust):** Caso um modelo local muito pequeno esqueça de emitir `op:"theme"` nos primeiros 2 turnos da aula (enquanto `scene.themeAutoDetected == false` e `scene.themeLocked == false`), um pontuador léxico local analisa o vocabulário acumulado:
  - Termos `derivada, integral, matriz, teorema, hipotenusa, seno, cosseno, vetor, equação, função, probabilidade` -> `3b1b`
  - Termos `receita, funil, cac, ltv, mrr, cliente, mercado, vendas, produto, okr, trimestre, margem, roi` -> `flipchart`
  - Termos `api, servidor, banco de dados, latência, docker, kubernetes, função, algoritmo, array, microserviço, rust, python` -> `blueprint`
  - Termos `século, revolução, império, filosofia, constituição, literatura, guerra, idade média, iluminismo` -> `chalkboard`
  - Frases curtas de impacto motivacional / estatística isolada -> `ted`
  - Padrão inicial neutro ao abrir o app -> `whiteboard` (ou último favorito configurado pelo usuário).
- **Controle Total do Professor:** Na barra superior da `StudioWindow`, um seletor `[✨ Auto: 3b1b ▾] [🔓]` permite travar (`locked = true`) qualquer um dos 6 estilos com 1 clique ou atalho `Alt+1..6` (`Alt+0` volta ao Automático).

---

## 2. Tabela Exata de Tokens Visuais dos 6 Temas (`src/themes/themeDescriptors.ts`)

| Token / Propriedade | `3b1b` (Exatas) | `whiteboard` (Geral) | `flipchart` (Negócios) | `ted` (Palestras) | `blueprint` (Código/Eng) | `chalkboard` (Humanas) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `--bg-canvas` | `#070B14` | `#F8FAFC` | `#FAF6EE` | `#09090B` | `#0B1324` | `#163024` |
| `--bg-surface` | `#0F1729E6` | `#FFFFFF` | `#FFFDF8` | `#18181BCC` | `#0F1E36F2` | `#1D3D2EE6` |
| `--bg-elevated` | `#162238` | `#F1F5F9` | `#F5EFE2` | `#27272A` | `#162B4D` | `#244B39` |
| `--fg-primary` | `#F8FAFC` | `#0F172A` | `#1C1917` | `#FAFAFA` | `#E2E8F0` | `#F8FAFC` |
| `--fg-secondary` | `#CBD5E1` | `#334155` | `#44403C` | `#A1A1AA` | `#94A3B8` | `#DCE7E0` |
| `--fg-muted` | `#64748B` | `#64748B` | `#78716C` | `#52525B` | `#475569` | `#8FA89B` |
| `--color-primary` | `#58C4DD` *(Cyan 3b1b)* | `#1D4ED8` *(Azul Pincel)* | `#292524` *(Sharpie)* | `#E11D48` *(Vermelho TED)* | `#38BDF8` *(Cyan CAD)* | `#FEF08A` *(Giz Amarelo)* |
| `--color-secondary` | `#83C167` *(Verde 3b1b)* | `#15803D` *(Verde Pincel)* | `#0D9488` *(Teal)* | `#F97316` *(Âmbar)* | `#34D399` *(Emerald)* | `#93C5FD` *(Giz Azul)* |
| `--color-accent` | `#FFFF00` *(Amarelo Vivo)* | `#DC2626` *(Vermelho)* | `#F59E0B` *(Marca-texto)* | `#FB7185` *(Coral)* | `#A78BFA` *(Violeta)* | `#FCA5A5` *(Giz Rosa)* |
| `--color-warning` | `#FBBF24` | `#D97706` | `#EA580C` | `#FACC15` | `#F59E0B` | `#FDE047` |
| `--color-danger` | `#FC6255` *(Coral 3b1b)* | `#DC2626` | `#E11D48` | `#EF4444` | `#F87171` | `#F87171` |
| `--font-heading` | `'CMU Serif', 'Crimson Pro', Georgia, serif` | `'Plus Jakarta Sans', Inter, sans-serif` | `'Kalam', 'Caveat', system-ui, sans-serif` | `'Outfit', Inter, sans-serif` | `'JetBrains Mono', monospace` | `'Crimson Pro', Georgia, serif` |
| `--font-body` | `'Inter', system-ui, sans-serif` | `'Inter', system-ui, sans-serif` | `'Plus Jakarta Sans', sans-serif` | `'Inter', system-ui, sans-serif` | `'Inter', system-ui, sans-serif` | `'Crimson Pro', Georgia, serif` |
| `--font-mono` | `'JetBrains Mono', monospace` | `'JetBrains Mono', monospace` | `'JetBrains Mono', monospace` | `'JetBrains Mono', monospace` | `'JetBrains Mono', monospace` | `'JetBrains Mono', monospace` |
| `gridPattern` | `'cartesian-subtle'` (`60px` linhas + sub-grade) | `'dots'` (`24px` pontos `#CBD5E1`) | `'flipchart-pad'` (barra superior escura + pauta leve) | `'radial-spotlight'` (sem grade, vinheta palco) | `'blueprint-grid'` (`24px` sub + `120px` major `#1E3A5F`) | `'chalk-dust'` (textura sutil ardósia + borda madeira opcional) |
| `strokeMode` | `'crisp-glow'` | `'marker'` | `'rough'` | `'editorial'` | `'technical'` | `'chalk'` |
| `strokeWidth` | `2.8` | `2.6` | `2.4` | `2.0` | `1.8` | `2.8` |
| `borderRadiusPx` | `10` | `14` | `6` | `20` | `4` | `8` |
| `maxNodesPerScene` | `6` | `8` | `7` | `3` | `10` | `6` |
| `drawDurationMs` | `520` | `320` | `380` | `450` | `240` | `420` |

> **EMPACOTAMENTO OFFLINE OBRIGATÓRIO DE FONTES (`public/fonts/`):**  
> Não dependa de `<link href="https://fonts.googleapis.com/...">` em runtime, pois o app é **local-first** e deve funcionar sem internet (ex.: sala de aula sem Wi-Fi usando Ollama local!). Baixe e inclua os pacotes npm `@fontsource/inter`, `@fontsource/plus-jakarta-sans`, `@fontsource/outfit`, `@fontsource/crimson-pro`, `@fontsource/kalam`, `@fontsource/jetbrains-mono` e `katex/dist/katex.min.css` diretamente no bundle Vite!

---

## 3. Filtros SVG Globais (`<CanvasSvgDefs />`) e Determinismo do Rough.js

Renderize uma única vez dentro do `<svg>` mestre do Canvas os filtros abaixo (ativados apenas pelo tema correspondente para não custar GPU à toa):

```xml
<defs>
  <!-- 1. Brilho suave para vetores/curvas principais no tema 3b1b -->
  <filter id="gizmo-glow-3b1b" x="-20%" y="-20%" width="140%" height="140%">
    <feGaussianBlur stdDeviation="3.5" result="blur" />
    <feMerge>
      <feMergeNode in="blur" />
      <feMergeNode in="SourceGraphic" />
    </feMerge>
  </filter>

  <!-- 2. Granulação seca de giz para traços no tema chalkboard (leve, 1 oitava!) -->
  <filter id="gizmo-chalk-stroke" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="1" seed="7" result="noise" />
    <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.2" xChannelSelector="R" yChannelSelector="G" />
  </filter>
</defs>
```

### Seed Determinístico FNV-1a para Rough.js (Obrigatório no tema `flipchart`)

Implemente exatamente esta função em `src/utils/hash.ts` e passe `seed: fnv1a32(nodeId + subElementKey)` em **toda** chamada a `roughGenerator.rectangle(...)`, `roughGenerator.line(...)` ou `roughGenerator.path(...)`:

```typescript
export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 2147483647 || 1;
}
```
E use `rough.generator()` (modo puro que retorna `Drawable` -> converte para strings SVG `d` dentro de `useMemo([node.id, node.version, rect.w, rect.h, theme])`), **NUNCA** `rough.svg(domElement)` dentro de `useEffect` imperativo! Isso mantém o React 100% declarativo, puro e a 60fps.
