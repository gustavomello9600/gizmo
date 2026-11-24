import React from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  Code2,
  Droplet,
  Lightbulb,
  Sparkles,
  Star,
  Sun,
  Zap,
} from 'lucide-react';
import type { RendererProps } from '../../../types/scene';

const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>> = {
  sun: Sun,
  droplet: Droplet,
  bolt: Zap,
  zap: Zap,
  check: Check,
  arrow: ArrowRight,
  star: Star,
  book: BookOpen,
  code: Code2,
  idea: Lightbulb,
  sparkle: Sparkles,
};

interface BulletItem {
  id?: string;
  text: string;
  subtext?: string;
  icon?: string;
  emphasis?: boolean;
  checked?: boolean;
}

export const BulletsRenderer: React.FC<RendererProps> = React.memo(({ node }) => {
  const data = node.data as { ordered?: boolean; items?: BulletItem[] };
  const items = data.items ?? [];
  const ordered = Boolean(data.ordered);

  return (
    <div className="flex h-full w-full flex-col justify-center gap-2.5 overflow-hidden px-6 py-4">
      {items.map((item, index) => {
        const Icon = ICONS[(item.icon ?? '').toLowerCase()] ?? Sparkles;
        return (
          <div
            key={item.id ?? index}
            className="flex items-start gap-3 rounded-xl px-3 py-2 transition-colors"
            style={{
              background: item.emphasis ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'transparent',
              border: item.emphasis ? '1px solid color-mix(in srgb, var(--color-primary) 22%, transparent)' : '1px solid transparent',
            }}
          >
            <span
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
              style={{
                background: 'var(--bg-elevated)',
                color: item.checked ? 'var(--color-secondary)' : 'var(--color-primary)',
              }}
            >
              {ordered ? <span className="text-[12px] font-bold">{index + 1}</span> : <Icon size={15} strokeWidth={2.2} />}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className="block text-[20px] leading-snug"
                style={{
                  color: 'var(--fg-primary)',
                  fontWeight: item.emphasis ? 700 : 500,
                  opacity: item.checked ? 0.55 : 1,
                  textDecoration: item.checked ? 'line-through' : undefined,
                }}
              >
                {item.text}
              </span>
              {item.subtext && (
                <span className="mt-0.5 block text-[15px] leading-snug" style={{ color: 'var(--fg-muted)' }}>
                  {item.subtext}
                </span>
              )}
            </span>
          </div>
        );
      })}
      {items.length === 0 && (
        <div className="flex h-full items-center justify-center text-sm" style={{ color: 'var(--fg-muted)' }}>
          Tópicos sendo organizados…
        </div>
      )}
    </div>
  );
});
BulletsRenderer.displayName = 'BulletsRenderer';
