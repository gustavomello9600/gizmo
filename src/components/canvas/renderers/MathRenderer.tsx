import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import katex from 'katex';
import type { RendererProps } from '../../../types/scene';

function renderLatex(latex: string, highlightTerms: string[]): string {
  let source = latex;
  for (const term of highlightTerms) {
    if (!term || source.includes('\\htmlClass')) continue;
    if (source.includes(term)) {
      source = source.split(term).join(`\\htmlClass{gizmo-math-hl}{${term}}`);
    }
  }
  try {
    return katex.renderToString(source, {
      displayMode: true,
      throwOnError: false,
      strict: false,
      trust: (context: { command?: string }) => context.command === '\\htmlClass',
      output: 'html',
    });
  } catch {
    try {
      return katex.renderToString(latex, {
        displayMode: true,
        throwOnError: false,
        strict: false,
        trust: false,
      });
    } catch {
      return `<code>${latex.replace(/</g, '&lt;')}</code>`;
    }
  }
}

export const MathRenderer: React.FC<RendererProps> = React.memo(({ node, rect }) => {
  const data = node.data as {
    latex?: string;
    steps?: string[];
    highlight_terms?: string[];
    caption?: string;
  };
  const latex = data.latex ?? '';
  const terms = data.highlight_terms ?? [];
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const html = useMemo(() => renderLatex(latex, terms), [latex, terms]);
  const stepHtml = useMemo(
    () => (data.steps ?? []).map((step) => renderLatex(step, terms)),
    [data.steps, terms],
  );

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const available = Math.max(80, rect.w - 48);
    const natural = element.scrollWidth;
    setScale(natural > available ? Math.max(0.45, available / natural) : 1);
  }, [html, rect.w]);

  return (
    <div className="flex h-full w-full flex-col justify-center px-6 py-4">
      <div ref={containerRef} className="w-full overflow-hidden" style={{ textAlign: 'center' }}>
        <div
          className="gizmo-math"
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'center center',
            color: 'var(--fg-primary)',
            transition: 'transform 200ms ease',
          }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>

      {stepHtml.length >= 2 && (
        <ol className="mt-3 space-y-1.5 border-t pt-3" style={{ borderColor: 'color-mix(in srgb, var(--fg-muted) 22%, transparent)' }}>
          {stepHtml.map((step, index) => (
            <li
              key={index}
              className="flex items-start gap-2 text-[18px] transition-opacity"
              style={{ opacity: index === stepHtml.length - 1 ? 1 : 0.62 }}
            >
              <span
                className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                style={{ background: 'var(--bg-elevated)', color: 'var(--fg-muted)' }}
              >
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 [&_.katex]:text-left" dangerouslySetInnerHTML={{ __html: step }} />
            </li>
          ))}
        </ol>
      )}

      {data.caption && (
        <p className="mt-2 text-center text-[15px] italic" style={{ color: 'var(--fg-muted)' }}>
          {data.caption}
        </p>
      )}
    </div>
  );
});
MathRenderer.displayName = 'MathRenderer';
