import React from 'react';
import type { RendererProps } from '../../../types/scene';

interface TimelineEvent {
  date: string;
  title: string;
  detail?: string;
  highlight?: boolean;
}

export const TimelineRenderer: React.FC<RendererProps> = React.memo(({ node, rect }) => {
  const data = node.data as { orientation?: 'horizontal' | 'vertical'; events?: TimelineEvent[] };
  const events = data.events ?? [];
  const horizontal = (data.orientation ?? 'horizontal') === 'horizontal';

  if (!horizontal) {
    return (
      <div className="flex h-full w-full flex-col justify-center gap-4 overflow-hidden px-8 py-6">
        {events.map((event, index) => (
          <div key={index} className="flex gap-3">
            <div className="flex shrink-0 flex-col items-center">
              <span
                className="mt-1 h-3 w-3 rounded-full border-2"
                style={{
                  borderColor: event.highlight ? 'var(--color-accent)' : 'var(--color-primary)',
                  background: event.highlight ? 'var(--color-accent)' : 'var(--bg-surface)',
                }}
              />
              {index < events.length - 1 && <span className="w-px flex-1" style={{ background: 'color-mix(in srgb, var(--fg-muted) 32%, transparent)' }} />}
            </div>
            <div className="min-w-0 flex-1 pb-1">
              <span className="font-mono text-[15px] font-bold" style={{ color: event.highlight ? 'var(--color-accent)' : 'var(--color-primary)' }}>{event.date}</span>
              <p className="text-[21px] font-semibold leading-tight" style={{ color: 'var(--fg-primary)' }}>{event.title}</p>
              {event.detail && <p className="text-[16px] leading-snug" style={{ color: 'var(--fg-muted)' }}>{event.detail}</p>}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const w = Math.max(220, rect.w);
  const h = Math.max(130, rect.h);
  const left = 38;
  const right = w - 38;
  const usable = right - left;
  const y = h * 0.52;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-full" role="img" aria-label={node.title ?? 'Linha do tempo'}>
      <line x1={left} y1={y} x2={right} y2={y} stroke="color-mix(in srgb, var(--fg-muted) 38%, transparent)" strokeWidth={2} strokeLinecap="round" />
      {events.map((event, index) => {
        const x = events.length <= 1 ? w / 2 : left + (index / (events.length - 1)) * usable;
        const above = index % 2 === 0;
        const color = event.highlight ? 'var(--color-accent)' : 'var(--color-primary)';
        return (
          <g key={index}>
            <line x1={x} y1={y} x2={x} y2={above ? y - 14 : y + 14} stroke={color} strokeWidth={1.4} opacity={0.5} />
            <circle cx={x} cy={y} r={event.highlight ? 7 : 5} fill={color} stroke="var(--bg-surface)" strokeWidth={2.5} />
            <text x={x} y={above ? y - 22 : y + 32} textAnchor="middle" fontSize={12.5} fontWeight={700} fill={color} fontFamily="var(--font-mono)">
              {event.date}
            </text>
            <text x={x} y={above ? y - 44 : y + 54} textAnchor="middle" fontSize={14} fontWeight={700} fill="var(--fg-primary)" fontFamily="var(--font-heading)">
              {event.title.length > 20 ? `${event.title.slice(0, 19)}…` : event.title}
            </text>
            {event.detail && (
              <text x={x} y={above ? y - 60 : y + 70} textAnchor="middle" fontSize={11} fill="var(--fg-muted)" fontFamily="var(--font-body)">
                {event.detail.length > 26 ? `${event.detail.slice(0, 25)}…` : event.detail}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
});
TimelineRenderer.displayName = 'TimelineRenderer';
