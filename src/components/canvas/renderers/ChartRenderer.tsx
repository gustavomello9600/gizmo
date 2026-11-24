import React from 'react';
import type { RendererProps } from '../../../types/scene';
import { semanticColor } from '../../../themes/themeDescriptors';

interface SeriesPoint {
  x: string | number;
  y: number;
}

interface Series {
  name: string;
  color?: string;
  points: SeriesPoint[];
}

const CHART_COLORS = ['primary', 'accent', 'secondary', 'warning', 'danger'];

export const ChartRenderer: React.FC<RendererProps> = React.memo(({ node, rect }) => {
  const data = node.data as {
    chart_type?: 'bar' | 'line' | 'area' | 'donut' | 'scatter';
    x_label?: string;
    y_label?: string;
    unit?: string;
    series?: Series[];
  };
  const type = data.chart_type ?? 'bar';
  const series = data.series ?? [];
  const w = Math.max(220, rect.w);
  const h = Math.max(150, rect.h);
  const margin = { left: 58, right: 26, top: 26, bottom: 62 };
  const plotW = Math.max(60, w - margin.left - margin.right);
  const plotH = Math.max(60, h - margin.top - margin.bottom);
  const labels = Array.from(
    new Set(series.flatMap((item) => item.points.map((point) => String(point.x)))),
  );
  const maxY = Math.max(1, ...series.flatMap((item) => item.points.map((point) => Number(point.y) || 0)));
  const mapX = (index: number) => margin.left + (labels.length <= 1 ? plotW / 2 : (index / (labels.length - 1)) * plotW);
  const mapY = (value: number) => margin.top + plotH - (Math.max(0, value) / maxY) * plotH;

  if (type === 'donut') {
    const values = series[0]?.points?.map((point) => Math.max(0, Number(point.y) || 0)) ?? [];
    const total = values.reduce((sum, value) => sum + value, 0) || 1;
    const radius = Math.min(plotW, plotH) * 0.31;
    const circumference = 2 * Math.PI * radius;
    let cursor = 0;
    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-full" role="img" aria-label={node.title ?? 'Gráfico'}>
        <g transform={`translate(${margin.left + plotW * 0.3} ${h / 2}) rotate(-90)`}>
          <circle r={radius} fill="none" stroke="var(--bg-elevated)" strokeWidth={radius * 0.42} />
          {values.map((value, index) => {
            const fraction = value / total;
            const dash = fraction * circumference;
            const element = (
              <circle
                key={index}
                r={radius}
                fill="none"
                stroke={semanticColor(series[0]?.color && index === 0 ? series[0].color : CHART_COLORS[index % CHART_COLORS.length])}
                strokeWidth={radius * 0.42}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-cursor}
                strokeLinecap="butt"
              />
            );
            cursor += dash;
            return element;
          })}
        </g>
        <g transform={`translate(${margin.left + plotW * 0.64} ${h / 2 - (values.length * 20) / 2})`}>
          {values.map((value, index) => (
            <g key={index} transform={`translate(0 ${index * 20})`}>
              <circle cx={0} cy={0} r={4} fill={semanticColor(CHART_COLORS[index % CHART_COLORS.length])} />
              <text x={12} y={4} fontSize={13} fill="var(--fg-secondary)" fontFamily="var(--font-body)">
                {String(series[0]?.points[index]?.x ?? '')} · {value} ({Math.round((value / total) * 100)}%)
              </text>
            </g>
          ))}
        </g>
      </svg>
    );
  }

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-full" role="img" aria-label={node.title ?? 'Gráfico de dados'}>
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const y = margin.top + plotH * (1 - ratio);
        return (
          <g key={ratio}>
            <line x1={margin.left} y1={y} x2={margin.left + plotW} y2={y} stroke="var(--grid-color)" strokeWidth={1} />
            <text x={margin.left - 8} y={y + 3} textAnchor="end" fontSize={12} fill="var(--fg-muted)" fontFamily="var(--font-mono)">
              {Math.round(maxY * ratio)}
            </text>
          </g>
        );
      })}

      {type === 'bar' &&
        series.map((item, seriesIndex) => {
          const groupWidth = plotW / Math.max(1, labels.length);
          const barGroup = groupWidth * 0.68;
          const barWidth = barGroup / Math.max(1, series.length) - 3;
          return item.points.map((point, pointIndex) => {
            const labelIndex = labels.indexOf(String(point.x));
            const x = margin.left + labelIndex * groupWidth + groupWidth * 0.16 + seriesIndex * (barWidth + 3);
            const y = mapY(Number(point.y) || 0);
            return (
              <rect
                key={`${seriesIndex}-${pointIndex}`}
                x={x}
                y={y}
                width={Math.max(2, barWidth)}
                height={margin.top + plotH - y}
                rx={3}
                fill={semanticColor(item.color ?? CHART_COLORS[seriesIndex])}
                opacity={0.86}
                className="gizmo-bar-grow"
                style={{ transformOrigin: `${x}px ${margin.top + plotH}px`, animationDelay: `${pointIndex * 35}ms` }}
              />
            );
          });
        })}

      {type !== 'bar' &&
        series.map((item, seriesIndex) => {
          const color = semanticColor(item.color ?? CHART_COLORS[seriesIndex]);
          const points = item.points.map((point, index) => {
            const labelIndex = labels.indexOf(String(point.x));
            return [mapX(labelIndex < 0 ? index : labelIndex), mapY(Number(point.y) || 0)] as [number, number];
          });
          if (points.length === 0) return null;
          const line = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
          return (
            <g key={seriesIndex}>
              {type === 'area' && (
                <path
                  d={`${line} L ${points[points.length - 1][0]} ${margin.top + plotH} L ${points[0][0]} ${margin.top + plotH} Z`}
                  fill={color}
                  opacity={0.16}
                />
              )}
              {(type === 'line' || type === 'area') && (
                <path d={line} fill="none" stroke={color} strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round" pathLength={1} className="gizmo-curve-draw" />
              )}
              {type === 'scatter' && points.map(([x, y], pointIndex) => <circle key={pointIndex} cx={x} cy={y} r={4.5} fill={color} opacity={0.9} />)}
              {(type === 'line' || type === 'area') &&
                points.map(([x, y], pointIndex) => <circle key={pointIndex} cx={x} cy={y} r={3.2} fill={color} stroke="var(--bg-surface)" strokeWidth={1.5} />)}
            </g>
          );
        })}

      {labels.map((label, index) => (
        <text
          key={label}
          x={type === 'bar' ? margin.left + (plotW / labels.length) * (index + 0.5) : mapX(index)}
          y={margin.top + plotH + 20}
          textAnchor="middle"
          fontSize={12}
          fill="var(--fg-muted)"
          fontFamily="var(--font-body)"
        >
          {label.length > 12 ? `${label.slice(0, 11)}…` : label}
        </text>
      ))}

      {data.x_label && (
        <text x={margin.left + plotW} y={h - 14} textAnchor="end" fontSize={13} fill="var(--fg-secondary)" fontFamily="var(--font-body)">
          {data.x_label}
        </text>
      )}
      {data.y_label && (
        <text x={margin.left - 8} y={margin.top - 10} textAnchor="start" fontSize={13} fill="var(--fg-secondary)" fontFamily="var(--font-body)">
          {data.y_label}{data.unit ? ` (${data.unit})` : ''}
        </text>
      )}

      {series.length > 1 && (
        <g transform={`translate(${margin.left} ${margin.top - 14})`}>
          {series.map((item, index) => (
            <g key={item.name} transform={`translate(${index * 108} 0)`}>
              <rect x={0} y={-6} width={10} height={10} rx={3} fill={semanticColor(item.color ?? CHART_COLORS[index])} />
              <text x={15} y={3} fontSize={12} fill="var(--fg-secondary)" fontFamily="var(--font-body)">
                {item.name.slice(0, 13)}
              </text>
            </g>
          ))}
        </g>
      )}
    </svg>
  );
});
ChartRenderer.displayName = 'ChartRenderer';
