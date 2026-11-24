import React, { useMemo } from 'react';
import type { RendererProps } from '../../../types/scene';

const TOKEN_RE = /(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b(?:fn|let|mut|const|return|if|else|for|while|match|struct|impl|pub|use|mod|async|await|def|class|import|from|export|function|type|interface|new|true|false|null|None|Some|Ok|Err|SELECT|FROM|WHERE|JOIN|GROUP|ORDER|INSERT|UPDATE|DELETE)\b)/g;

function tokenClass(token: string): string {
  if (token.startsWith('//') || token.startsWith('#') || token.startsWith('/*')) return 'gizmo-code-comment';
  if (/^["'`]/.test(token)) return 'gizmo-code-string';
  if (/^\d/.test(token)) return 'gizmo-code-number';
  return 'gizmo-code-keyword';
}

function TokenizedLine({ line }: { line: string }) {
  const parts = useMemo(() => {
    const result: Array<{ text: string; className?: string }> = [];
    let last = 0;
    for (const match of line.matchAll(TOKEN_RE)) {
      const index = match.index ?? 0;
      if (index > last) result.push({ text: line.slice(last, index) });
      result.push({ text: match[0], className: tokenClass(match[0]) });
      last = index + match[0].length;
    }
    if (last < line.length) result.push({ text: line.slice(last) });
    return result;
  }, [line]);

  return (
    <>
      {parts.map((part, index) =>
        part.className ? (
          <span key={index} className={part.className}>{part.text}</span>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}

export const CodeRenderer: React.FC<RendererProps> = React.memo(({ node }) => {
  const data = node.data as {
    language?: string;
    code?: string;
    highlight_lines?: number[];
    caption?: string;
  };
  const code = data.code ?? '';
  const lines = code.split('\n').slice(0, 36);
  const highlighted = new Set(data.highlight_lines ?? []);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between px-4 py-2" style={{ borderBottom: '1px solid color-mix(in srgb, var(--fg-muted) 16%, transparent)' }}>
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--color-primary)' }}>
          {data.language ?? 'texto'}
        </span>
        <span className="font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
          {lines.length} linhas
        </span>
      </div>
      <pre
        className="min-h-0 flex-1 overflow-hidden px-4 py-3 text-[16px] leading-[1.55]"
        style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-primary)' }}
      >
        {lines.map((line, index) => (
          <div
            key={index}
            className="flex gap-3 rounded px-1"
            style={{
              background: highlighted.has(index + 1) ? 'color-mix(in srgb, var(--color-accent) 22%, transparent)' : undefined,
              opacity: highlighted.size > 0 && !highlighted.has(index + 1) ? 0.78 : 1,
              color: highlighted.has(index + 1) ? 'var(--fg-primary)' : undefined,
            }}
          >
            <span className="w-6 shrink-0 select-none text-right text-[12px]" style={{ color: 'var(--fg-muted)' }}>{index + 1}</span>
            <span className="whitespace-pre-wrap break-words"><TokenizedLine line={line || ' '} /></span>
          </div>
        ))}
      </pre>
      {data.caption && (
        <p className="shrink-0 px-4 pb-2 text-[12px] italic" style={{ color: 'var(--fg-muted)' }}>
          {data.caption}
        </p>
      )}
    </div>
  );
});
CodeRenderer.displayName = 'CodeRenderer';
