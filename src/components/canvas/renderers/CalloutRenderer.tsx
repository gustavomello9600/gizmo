import React from 'react';
import { AlertTriangle, BookOpen, Lightbulb, Quote } from 'lucide-react';
import type { RendererProps } from '../../../types/scene';

const VARIANTS = {
  insight: { icon: Lightbulb, color: 'var(--color-accent)', label: 'Insight' },
  warning: { icon: AlertTriangle, color: 'var(--color-warning)', label: 'Atenção' },
  definition: { icon: BookOpen, color: 'var(--color-primary)', label: 'Definição' },
  quote: { icon: Quote, color: 'var(--color-secondary)', label: 'Citação' },
} as const;

export const CalloutRenderer: React.FC<RendererProps> = React.memo(({ node }) => {
  const data = node.data as {
    variant?: keyof typeof VARIANTS;
    title?: string;
    body?: string;
    author?: string;
  };
  const variant = VARIANTS[data.variant ?? 'insight'] ?? VARIANTS.insight;
  const Icon = variant.icon;

  return (
    <div
      className="flex h-full w-full items-center gap-4 overflow-hidden px-6 py-5"
      style={{
        background: 'color-mix(in srgb, var(--bg-surface) 60%, transparent)',
        borderLeft: `4px solid ${variant.color}`,
      }}
    >
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
        style={{ background: `color-mix(in srgb, ${variant.color} 16%, transparent)`, color: variant.color }}
      >
        <Icon size={21} strokeWidth={2.1} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: variant.color }}>{variant.label}</span>
          {data.title && <h4 className="truncate text-[20px] font-bold" style={{ color: 'var(--fg-primary)' }}>{data.title}</h4>}
        </div>
        {data.body && (
          <p className="mt-1 text-[17px] leading-snug" style={{ color: 'var(--fg-secondary)' }}>
            {data.body}
          </p>
        )}
        {data.author && (
          <p className="mt-1 text-[13px] font-semibold" style={{ color: 'var(--fg-muted)' }}>— {data.author}</p>
        )}
      </div>
    </div>
  );
});
CalloutRenderer.displayName = 'CalloutRenderer';
