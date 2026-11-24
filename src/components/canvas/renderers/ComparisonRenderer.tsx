import React from 'react';
import type { RendererProps } from '../../../types/scene';

interface Row {
  aspect: string;
  left: string;
  right: string;
  winner?: 'left' | 'right' | 'tie';
}

export const ComparisonRenderer: React.FC<RendererProps> = React.memo(({ node }) => {
  const data = node.data as {
    left_title?: string;
    right_title?: string;
    rows?: Row[];
  };
  const rows = (data.rows ?? []).slice(0, 7);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden px-5 py-4">
      <div className="grid shrink-0 grid-cols-[0.8fr_1.1fr_1.1fr] gap-2 pb-2" style={{ borderBottom: '1px solid color-mix(in srgb, var(--fg-muted) 22%, transparent)' }}>
        <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--fg-muted)' }}>Aspecto</span>
        <span className="text-center text-[14px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-primary)' }}>
          {data.left_title ?? 'A'}
        </span>
        <span className="text-center text-[14px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-accent)' }}>
          {data.right_title ?? 'B'}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {rows.map((row, index) => (
          <div
            key={index}
            className="grid grid-cols-[0.8fr_1.1fr_1.1fr] items-center gap-2 py-2"
            style={{ borderBottom: index < rows.length - 1 ? '1px solid color-mix(in srgb, var(--fg-muted) 12%, transparent)' : undefined }}
          >
            <span className="text-[14px] font-semibold leading-tight" style={{ color: 'var(--fg-muted)' }}>{row.aspect}</span>
            <span
              className="rounded-lg px-2 py-1.5 text-center text-[15px] leading-tight"
              style={{
                color: 'var(--fg-primary)',
                background: row.winner === 'left' ? 'color-mix(in srgb, var(--color-primary) 16%, transparent)' : 'var(--bg-elevated)',
                fontWeight: row.winner === 'left' ? 700 : 500,
              }}
            >
              {row.left}
            </span>
            <span
              className="rounded-lg px-2 py-1.5 text-center text-[15px] leading-tight"
              style={{
                color: 'var(--fg-primary)',
                background: row.winner === 'right' ? 'color-mix(in srgb, var(--color-accent) 16%, transparent)' : 'var(--bg-elevated)',
                fontWeight: row.winner === 'right' ? 700 : 500,
              }}
            >
              {row.right}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
});
ComparisonRenderer.displayName = 'ComparisonRenderer';
