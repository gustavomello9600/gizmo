import React, { useMemo } from 'react';
import type { RendererProps } from '../../../types/scene';
import { sampleCurveSegments, segmentsToSvgPath } from '../../../utils/safeMathParser';
import { semanticColor } from '../../../themes/themeDescriptors';

interface FunctionSpec {
  expr: string;
  label?: string;
  color?: string;
  dashed?: boolean;
}

interface PointSpec {
  x: number;
  y: number;
  label?: string;
  color?: string;
}

function ticks(min: number, max: number, count = 6): number[] {
  const step = (max - min) / count;
  return Array.from({ length: count + 1 }, (_, index) => min + index * step);
}

function formatTick(value: number): string {
  if (Math.abs(value) < 1e-9) return '0';
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export const Plot2DRenderer: React.FC<RendererProps> = React.memo(({ node, rect, theme }) => {
  const data = node.data as {
    domain?: [number, number];
    range?: [number, number];
    x_label?: string;
    y_label?: string;
    show_grid?: boolean;
    functions?: FunctionSpec[];
    points?: PointSpec[];
    shaded_area?: { expr?: string; from?: number; to?: number; color?: string };
  };
  const domain = (data.domain ?? [-4, 4]) as [number, number];
  const range = (data.range ?? [-2, 10]) as [number, number];
  const w = Math.max(220, rect.w);
  const h = Math.max(150, rect.h);
  const margin = { left: 58, right: 28, top: 28, bottom: 52 };
  const plotW = Math.max(80, w - margin.left - margin.right);
  const plotH = Math.max(70, h - margin.top - margin.bottom);
  const mapX = (x: number) => margin.left + ((x - domain[0]) / (domain[1] - domain[0])) * plotW;
  const mapY = (y: number) => margin.top + plotH - ((y - range[0]) / (range[1] - range[0])) * plotH;
  const clipId = `plot-clip-${node.id.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const curves = useMemo(
    () =>
      (data.functions ?? []).map((fn, index) => ({
        ...fn,
        path: segmentsToSvgPath(sampleCurveSegments(fn.expr, domain, range, 240), (x, y) => ({
          x: mapX(x),
          y: mapY(y),
        })),
        index,
      })),
    [data.functions, domain, range, plotW, plotH],
  );

  const shaded = useMemo(() => {
    const area = data.shaded_area;
    if (!area?.expr) return null;
    const from = area.from ?? domain[0];
    const to = area.to ?? domain[1];
    const segments = sampleCurveSegments(area.expr, [from, to], range, 120);
    if (segments.length === 0) return null;
    const baseY = mapY(Math.max(range[0], Math.min(range[1], 0)));
    const points = segments.flat();
    if (points.length < 2) return null;
    const top = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${mapX(point.x).toFixed(2)} ${mapY(point.y).toFixed(2)}`).join(' ');
    return `${top} L ${mapX(points[points.length - 1].x).toFixed(2)} ${baseY.toFixed(2)} L ${mapX(points[0].x).toFixed(2)} ${baseY.toFixed(2)} Z`;
  }, [data.shaded_area, domain, range, plotW, plotH]);

  const xTicks = ticks(domain[0], domain[1], 6);
  const yTicks = ticks(range[0], range[1], 5);
  const xAxisY = mapY(Math.max(range[0], Math.min(range[1], 0)));
  const yAxisX = mapX(Math.max(domain[0], Math.min(domain[1], 0)));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-full" role="img" aria-label={node.title ?? 'Gráfico de função'}>
      <defs>
        <clipPath id={clipId}>
          <rect x={margin.left} y={margin.top} width={plotW} height={plotH} />
        </clipPath>
      </defs>

      {data.show_grid !== false && (
        <g opacity={0.55}>
          {xTicks.map((tick) => (
            <line key={`xg-${tick}`} x1={mapX(tick)} y1={margin.top} x2={mapX(tick)} y2={margin.top + plotH} stroke="var(--grid-color)" strokeWidth={1} />
          ))}
          {yTicks.map((tick) => (
            <line key={`yg-${tick}`} x1={margin.left} y1={mapY(tick)} x2={margin.left + plotW} y2={mapY(tick)} stroke="var(--grid-color)" strokeWidth={1} />
          ))}
        </g>
      )}

      <g clipPath={`url(#${clipId})`}>
        {shaded && <path d={shaded} fill={semanticColor(data.shaded_area?.color)} opacity={0.18} />}
        {curves.map((curve) => (
          <path
            key={`${curve.expr}-${curve.index}`}
            d={curve.path}
            fill="none"
            stroke={semanticColor(curve.color)}
            strokeWidth={theme === 'blueprint' ? 2 : 2.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={curve.dashed ? '9 7' : undefined}
            pathLength={1}
            className={curve.dashed ? undefined : 'gizmo-curve-draw'}
            style={{ animationDuration: `${theme === 'blueprint' ? 320 : 520}ms` }}
          />
        ))}
      </g>

      <g>
        <line x1={margin.left} y1={xAxisY} x2={margin.left + plotW} y2={xAxisY} stroke="var(--fg-secondary)" strokeWidth={1.6} opacity={0.8} />
        <line x1={yAxisX} y1={margin.top} x2={yAxisX} y2={margin.top + plotH} stroke="var(--fg-secondary)" strokeWidth={1.6} opacity={0.8} />
        <path d={`M ${margin.left + plotW} ${xAxisY} l -8 -4 l 0 8 z`} fill="var(--fg-secondary)" opacity={0.8} />
        <path d={`M ${yAxisX} ${margin.top} l -4 8 l 8 0 z`} fill="var(--fg-secondary)" opacity={0.8} />
        {xTicks.map((tick) => (
          <text key={`xt-${tick}`} x={mapX(tick)} y={xAxisY + 19} textAnchor="middle" fontSize={13} fill="var(--fg-muted)" fontFamily="var(--font-mono)">
            {formatTick(tick)}
          </text>
        ))}
        {yTicks.map((tick) => (
          <text key={`yt-${tick}`} x={yAxisX - 10} y={mapY(tick) + 3} textAnchor="end" fontSize={13} fill="var(--fg-muted)" fontFamily="var(--font-mono)">
            {formatTick(tick)}
          </text>
        ))}
        <text x={margin.left + plotW} y={margin.top + plotH + 40} textAnchor="end" fontSize={14} fill="var(--fg-secondary)" fontFamily="var(--font-heading)">
          {data.x_label ?? 'x'}
        </text>
        <text x={margin.left - 8} y={margin.top - 8} textAnchor="start" fontSize={14} fill="var(--fg-secondary)" fontFamily="var(--font-heading)">
          {data.y_label ?? 'f(x)'}
        </text>
      </g>

      {(data.points ?? []).map((point, index) => (
        <g key={`p-${index}`}>
          <circle cx={mapX(point.x)} cy={mapY(point.y)} r={5} fill={semanticColor(point.color ?? 'accent')} stroke="var(--bg-surface)" strokeWidth={2} />
          {point.label && (
            <text x={mapX(point.x) + 9} y={mapY(point.y) - 9} fontSize={13} fontWeight={600} fill={semanticColor(point.color ?? 'accent')} fontFamily="var(--font-body)">
              {point.label}
            </text>
          )}
        </g>
      ))}

      {(data.functions ?? []).some((fn) => fn.label) && (
        <g transform={`translate(${margin.left + 10} ${margin.top + 8})`}>
          {(data.functions ?? []).map((fn, index) => (
            <g key={`legend-${index}`} transform={`translate(0 ${index * 18})`}>
              <line x1={0} y1={0} x2={18} y2={0} stroke={semanticColor(fn.color)} strokeWidth={3} strokeDasharray={fn.dashed ? '5 4' : undefined} />
              <text x={24} y={4} fontSize={13} fill="var(--fg-secondary)" fontFamily="var(--font-body)">
                {(fn.label ?? fn.expr).slice(0, 40)}
              </text>
            </g>
          ))}
        </g>
      )}
    </svg>
  );
});
Plot2DRenderer.displayName = 'Plot2DRenderer';
