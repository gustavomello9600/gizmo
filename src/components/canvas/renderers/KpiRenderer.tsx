import React, { useEffect, useRef, useState } from 'react';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import type { RendererProps } from '../../../types/scene';

function parseKpi(value: string): { prefix: string; number: number; suffix: string; decimals: number } | null {
  const match = value.match(/^(.*?)(-?\d+(?:[.,]\d+)?)(.*)$/s);
  if (!match) return null;
  const numeric = Number(match[2].replace(',', '.'));
  if (!Number.isFinite(numeric)) return null;
  const decimals = match[2].includes(',') || match[2].includes('.') ? (match[2].split(/[.,]/)[1]?.length ?? 0) : 0;
  return { prefix: match[1], number: numeric, suffix: match[3], decimals };
}

function useAnimatedNumber(target: number, decimals: number): string {
  const [display, setDisplay] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    const from = current.current;
    const started = performance.now();
    const duration = 620;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = from + (target - from) * eased;
      current.current = value;
      setDisplay(value);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return display.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export const KpiRenderer: React.FC<RendererProps> = React.memo(({ node, rect }) => {
  const data = node.data as {
    value?: string;
    label?: string;
    delta?: string;
    trend?: 'up' | 'down' | 'neutral';
  };
  const raw = data.value ?? '—';
  const parsed = parseKpi(raw);
  const animated = useAnimatedNumber(parsed?.number ?? 0, parsed?.decimals ?? 0);
  const trend = data.trend ?? 'neutral';
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-8 py-6 text-center">
      <div
        className="font-bold leading-none tracking-[-0.055em]"
        style={{
          fontFamily: 'var(--font-heading)',
          color: 'var(--fg-primary)',
          fontSize: `clamp(34px, ${Math.min(9, Math.max(4, rect.w / 150))}vw, ${Math.max(42, Math.min(120, rect.w / 4.6))}px)`,
        }}
      >
        {parsed ? `${parsed.prefix}${animated}${parsed.suffix}` : raw}
      </div>
      {data.label && (
        <p className="mt-2 max-w-[85%] text-[20px] font-medium leading-snug" style={{ color: 'var(--fg-secondary)' }}>
          {data.label}
        </p>
      )}
      {data.delta && (
        <div
          className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[14px] font-bold"
          style={{
            background: 'color-mix(in srgb, var(--color-secondary) 14%, transparent)',
            color: trend === 'down' ? 'var(--color-danger)' : trend === 'up' ? 'var(--color-secondary)' : 'var(--fg-muted)',
          }}
        >
          <TrendIcon size={14} strokeWidth={2.4} />
          {data.delta}
        </div>
      )}
    </div>
  );
});
KpiRenderer.displayName = 'KpiRenderer';
