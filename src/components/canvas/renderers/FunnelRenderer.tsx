import React from 'react';
import type { RendererProps } from '../../../types/scene';
import { semanticColor } from '../../../themes/themeDescriptors';

interface Stage {
  label: string;
  value: string;
  rate?: string;
  highlight?: boolean;
}

export const FunnelRenderer: React.FC<RendererProps> = React.memo(({ node, rect }) => {
  const data = node.data as { stages?: Stage[] };
  const stages = data.stages ?? [];
  const w = Math.max(220, rect.w);
  const h = Math.max(150, rect.h);
  const paddingX = 30;
  const paddingY = 20;
  const stageHeight = (h - paddingY * 2) / Math.max(1, stages.length);
  const colors = ['primary', 'secondary', 'accent', 'warning'];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-full" role="img" aria-label={node.title ?? 'Funil'}>
      {stages.map((stage, index) => {
        const ratioTop = 1 - index / Math.max(1, stages.length);
        const ratioBottom = 1 - (index + 1) / Math.max(1, stages.length);
        const maxWidth = w - paddingX * 2;
        const topWidth = maxWidth * (0.42 + ratioTop * 0.58);
        const bottomWidth = maxWidth * (0.42 + ratioBottom * 0.58);
        const y = paddingY + index * stageHeight;
        const cx = w / 2;
        const color = semanticColor(stage.highlight ? 'accent' : colors[index % colors.length]);
        return (
          <g key={index}>
            <path
              d={`M ${cx - topWidth / 2} ${y + 2} L ${cx + topWidth / 2} ${y + 2} L ${cx + bottomWidth / 2} ${y + stageHeight - 4} L ${cx - bottomWidth / 2} ${y + stageHeight - 4} Z`}
              fill={color}
              fillOpacity={stage.highlight ? 0.27 : 0.13}
              stroke={color}
              strokeWidth={1.7}
            />
            <text x={cx} y={y + stageHeight / 2 - 2} textAnchor="middle" dominantBaseline="central" fontSize={17} fontWeight={700} fill="var(--fg-primary)" fontFamily="var(--font-heading)">
              {stage.label}
            </text>
            <text x={cx} y={y + stageHeight / 2 + 14} textAnchor="middle" dominantBaseline="central" fontSize={14} fill={color} fontFamily="var(--font-mono)" fontWeight={700}>
              {stage.value}{stage.rate ? ` · ${stage.rate}` : ''}
            </text>
          </g>
        );
      })}
    </svg>
  );
});
FunnelRenderer.displayName = 'FunnelRenderer';
