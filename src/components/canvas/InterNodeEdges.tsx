import React, { useMemo } from 'react';
import type { SceneEdge } from '../../types/scene';
import { solveEdges } from '../../layout/solveEdges';
import type { PositionedNode } from '../../layout/solveLayout';

interface InterNodeEdgesProps {
  positioned: PositionedNode[];
  edges: Record<string, SceneEdge>;
}

export const InterNodeEdges: React.FC<InterNodeEdgesProps> = React.memo(({ positioned, edges }) => {
  const solved = useMemo(() => solveEdges(positioned, edges), [positioned, edges]);

  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1920 1080" aria-hidden="true">
      <defs>
        <marker id="gizmo-arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-primary)" opacity="0.9" />
        </marker>
        <filter id="gizmo-edge-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {solved.map(({ edge, path, labelX, labelY }) => (
        <g key={edge.id}>
          <path
            d={path}
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth={2.2}
            strokeOpacity={0.55}
            strokeLinecap="round"
            strokeDasharray={edge.style === 'dashed' ? '8 9' : undefined}
            markerEnd="url(#gizmo-arrow)"
            filter="url(#gizmo-edge-glow)"
          />
          {edge.animated && (
            <path
              d={path}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeDasharray="6 12"
              className="gizmo-edge-flow"
            />
          )}
          {edge.label && (
            <g transform={`translate(${labelX} ${labelY})`}>
              <rect
                x={-(edge.label.length * 4.2 + 12)}
                y={-13}
                width={edge.label.length * 8.4 + 24}
                height={26}
                rx={13}
                fill="var(--bg-elevated)"
                stroke="color-mix(in srgb, var(--color-primary) 25%, transparent)"
                strokeWidth={1}
                opacity={0.94}
              />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fill="var(--fg-secondary)"
                fontSize={13}
                fontFamily="var(--font-body)"
                fontWeight={600}
              >
                {edge.label}
              </text>
            </g>
          )}
        </g>
      ))}
    </svg>
  );
});
InterNodeEdges.displayName = 'InterNodeEdges';
