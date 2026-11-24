import React from 'react';
import type { RendererProps } from '../../../types/scene';
import { semanticColor } from '../../../themes/themeDescriptors';

type Point = [number, number];

interface Shape {
  type: string;
  points?: Point[];
  center?: Point;
  radius?: number;
  from?: Point;
  to?: Point;
  at?: Point;
  size?: number;
  radius_px?: number;
  from_deg?: number;
  to_deg?: number;
  vertex?: Point;
  text?: string;
  label?: string;
  color?: string;
  fill?: boolean;
  dashed?: boolean;
}

function midpoint(a: Point, b: Point): Point {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

function centroid(points: Point[]): Point {
  const x = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const y = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  return [x, y];
}

function polar(vertex: Point, radius: number, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180;
  return [vertex[0] + Math.cos(radians) * radius, vertex[1] + Math.sin(radians) * radius];
}

export const Geometry2DRenderer: React.FC<RendererProps> = React.memo(({ node, rect }) => {
  const data = node.data as { view_box?: [number, number, number, number]; shapes?: Shape[] };
  const view = data.view_box ?? [0, 0, 240, 180];
  const [vx, vy, vw, vh] = view;
  const w = Math.max(160, rect.w);
  const h = Math.max(120, rect.h);
  const padding = 26;
  const scale = Math.min((w - padding * 2) / vw, (h - padding * 2) / vh);
  const offsetX = (w - vw * scale) / 2;
  const offsetY = (h - vh * scale) / 2;
  const map = (point: Point): Point => [offsetX + (point[0] - vx) * scale, offsetY + (point[1] - vy) * scale];
  const shapes = data.shapes ?? [];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-full" role="img" aria-label={node.title ?? 'Construção geométrica'}>
      <defs>
        <marker id="gizmo-geo-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
        </marker>
      </defs>
      {shapes.map((shape, index) => {
        const color = semanticColor(shape.color);
        switch (shape.type) {
          case 'polygon': {
            const points = (shape.points ?? []).map(map);
            const center = points.length ? centroid(points) : [w / 2, h / 2];
            return (
              <g key={index}>
                <polygon
                  points={points.map((p) => `${p[0]},${p[1]}`).join(' ')}
                  fill={shape.fill ? color : 'transparent'}
                  fillOpacity={shape.fill ? 0.14 : 0}
                  stroke={color}
                  strokeWidth={2.4}
                  strokeLinejoin="round"
                />
                {shape.label && (
                  <text x={center[0]} y={center[1]} textAnchor="middle" dominantBaseline="central" fontSize={18} fontWeight={700} fill={color} fontFamily="var(--font-heading)">
                    {shape.label}
                  </text>
                )}
              </g>
            );
          }
          case 'circle': {
            const center = map(shape.center ?? [0, 0]);
            const radius = (shape.radius ?? 20) * scale;
            return (
              <g key={index}>
                <circle cx={center[0]} cy={center[1]} r={radius} fill="transparent" stroke={color} strokeWidth={2.4} />
                {shape.label && (
                  <text x={center[0]} y={center[1] - radius - 8} textAnchor="middle" fontSize={15} fontWeight={700} fill={color} fontFamily="var(--font-heading)">
                    {shape.label}
                  </text>
                )}
              </g>
            );
          }
          case 'vector': {
            const from = map(shape.from ?? [0, 0]);
            const to = map(shape.to ?? [0, 0]);
            const mid = midpoint(from, to);
            return (
              <g key={index} style={{ color }}>
                <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} stroke={color} strokeWidth={2.6} markerEnd="url(#gizmo-geo-arrow)" />
                {shape.label && (
                  <text x={mid[0] + 8} y={mid[1] - 8} fontSize={15} fontWeight={700} fill={color} fontFamily="var(--font-heading)">
                    {shape.label}
                  </text>
                )}
              </g>
            );
          }
          case 'line': {
            const from = map(shape.from ?? [0, 0]);
            const to = map(shape.to ?? [0, 0]);
            return (
              <line key={index} x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} stroke={color} strokeWidth={2} strokeDasharray={shape.dashed ? '8 7' : undefined} opacity={0.85} />
            );
          }
          case 'arc_angle': {
            const vertex = map(shape.vertex ?? shape.at ?? [0, 0]);
            const radius = (shape.radius ?? 24) * scale;
            const from = polar(vertex, radius, shape.from_deg ?? 0);
            const to = polar(vertex, radius, shape.to_deg ?? 45);
            const large = Math.abs((shape.to_deg ?? 45) - (shape.from_deg ?? 0)) > 180 ? 1 : 0;
            return (
              <g key={index}>
                <path
                  d={`M ${vertex[0]} ${vertex[1]} L ${from[0]} ${from[1]} A ${radius} ${radius} 0 ${large} 1 ${to[0]} ${to[1]} Z`}
                  fill={color}
                  fillOpacity={0.12}
                  stroke={color}
                  strokeWidth={1.6}
                />
                {shape.label && (
                  <text x={vertex[0] + radius * 0.75} y={vertex[1] - radius * 0.45} fontSize={15} fontWeight={700} fill={color} fontFamily="var(--font-heading)">
                    {shape.label}
                  </text>
                )}
              </g>
            );
          }
          case 'right_angle': {
            const at = map(shape.at ?? [0, 0]);
            const size = (shape.size ?? 14) * scale;
            return (
              <path
                key={index}
                d={`M ${at[0] + size} ${at[1]} L ${at[0] + size} ${at[1] - size} L ${at[0]} ${at[1] - size}`}
                fill="none"
                stroke={color}
                strokeWidth={1.8}
              />
            );
          }
          case 'segment_label': {
            const from = map(shape.from ?? [0, 0]);
            const to = map(shape.to ?? [0, 0]);
            const mid = midpoint(from, to);
            const dx = to[0] - from[0];
            const dy = to[1] - from[1];
            const length = Math.hypot(dx, dy) || 1;
            const offset = 14;
            return (
              <g key={index}>
                <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} stroke="var(--fg-muted)" strokeWidth={1.2} strokeDasharray="4 4" opacity={0.5} />
                <text
                  x={mid[0] - (dy / length) * offset}
                  y={mid[1] + (dx / length) * offset}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={15}
                  fontWeight={600}
                  fill={color}
                  fontFamily="var(--font-body)"
                  paintOrder="stroke"
                  stroke="var(--bg-surface)"
                  strokeWidth={4}
                >
                  {shape.text ?? shape.label}
                </text>
              </g>
            );
          }
          default:
            return null;
        }
      })}
    </svg>
  );
});
Geometry2DRenderer.displayName = 'Geometry2DRenderer';
