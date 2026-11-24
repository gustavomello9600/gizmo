import React from 'react';
import type { RendererProps } from '../../../types/scene';

interface Quadrant {
  title?: string;
  items?: string[];
  highlight?: boolean;
}

export const Matrix2x2Renderer: React.FC<RendererProps> = React.memo(({ node }) => {
  const data = node.data as {
    x_axis?: [string, string];
    y_axis?: [string, string];
    quadrants?: { tl?: Quadrant; tr?: Quadrant; bl?: Quadrant; br?: Quadrant };
  };
  const xAxis = data.x_axis ?? ['Baixo', 'Alto'];
  const yAxis = data.y_axis ?? ['Baixo', 'Alto'];
  const quadrants = data.quadrants ?? {};
  const cells = [
    { key: 'tl', label: '↖', data: quadrants.tl },
    { key: 'tr', label: '↗', data: quadrants.tr },
    { key: 'bl', label: '↙', data: quadrants.bl },
    { key: 'br', label: '↘', data: quadrants.br },
  ];

  return (
    <div className="flex h-full w-full gap-2 px-4 py-3">
      <div className="flex shrink-0 flex-col items-center justify-center gap-2" style={{ color: 'var(--fg-muted)' }}>
        <span className="text-[11px] font-bold uppercase tracking-wider [writing-mode:vertical-rl] rotate-180">{yAxis[1]}</span>
        <div className="h-full w-px" style={{ background: 'color-mix(in srgb, var(--fg-muted) 26%, transparent)' }} />
        <span className="text-[11px] font-bold uppercase tracking-wider [writing-mode:vertical-rl] rotate-180">{yAxis[0]}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-2">
          {cells.map(({ key, data: quadrant }) => (
            <div
              key={key}
              className="flex min-h-0 flex-col overflow-hidden rounded-lg p-3 transition-colors"
              style={{
                background: quadrant?.highlight ? 'color-mix(in srgb, var(--color-accent) 16%, var(--bg-elevated))' : 'var(--bg-elevated)',
                border: quadrant?.highlight ? '1px solid var(--color-accent)' : '1px solid color-mix(in srgb, var(--fg-muted) 16%, transparent)',
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-[16px] font-bold leading-tight" style={{ color: quadrant?.highlight ? 'var(--color-accent)' : 'var(--fg-primary)' }}>
                  {quadrant?.title ?? '—'}
                </h4>
                <span className="text-[10px]" style={{ color: 'var(--fg-muted)' }}>{key.toUpperCase()}</span>
              </div>
              <ul className="mt-1.5 min-h-0 overflow-hidden text-[14px] leading-snug" style={{ color: 'var(--fg-secondary)' }}>
                {(quadrant?.items ?? []).slice(0, 4).map((item, index) => (
                  <li key={index} className="mb-0.5 flex gap-1.5">
                    <span style={{ color: 'var(--color-primary)' }}>•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex shrink-0 items-center justify-between px-1 text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--fg-muted)' }}>
          <span>{xAxis[0]}</span>
          <span>{xAxis[1]}</span>
        </div>
      </div>
    </div>
  );
});
Matrix2x2Renderer.displayName = 'Matrix2x2Renderer';
