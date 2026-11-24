import React, { useMemo } from 'react';
import type { RendererProps } from '../../../types/scene';
import { layoutDiagram, type DiagramEdgeInput, type DiagramNodeInput } from '../../../layout/solveDiagramDagre';
import { semanticColor } from '../../../themes/themeDescriptors';

const shapePath = (shape: string | undefined, width: number, height: number): React.ReactNode => {
  const inset = 2;
  switch (shape) {
    case 'pill':
      return <rect x={inset} y={inset} width={width - inset * 2} height={height - inset * 2} rx={height / 2} />;
    case 'diamond':
      return <polygon points={`${width / 2},${inset} ${width - inset},${height / 2} ${width / 2},${height - inset} ${inset},${height / 2}`} />;
    case 'cylinder': {
      const rx = width / 2 - inset;
      const ry = Math.min(12, height / 5);
      return (
        <path
          d={`M ${inset} ${ry + inset} A ${rx} ${ry} 0 0 1 ${width - inset} ${ry + inset} L ${width - inset} ${height - ry - inset} A ${rx} ${ry} 0 0 1 ${inset} ${height - ry - inset} Z`}
        />
      );
    }
    case 'actor':
      return (
        <g>
          <circle cx={width / 2} cy={height * 0.24} r={height * 0.14} />
          <path d={`M ${width / 2} ${height * 0.4} L ${width / 2} ${height * 0.68} M ${width / 2} ${height * 0.48} L ${width * 0.26} ${height * 0.62} M ${width / 2} ${height * 0.48} L ${width * 0.74} ${height * 0.62} M ${width / 2} ${height * 0.68} L ${width * 0.3} ${height * 0.94} M ${width / 2} ${height * 0.68} L ${width * 0.7} ${height * 0.94}`} />
        </g>
      );
    default:
      return <rect x={inset} y={inset} width={width - inset * 2} height={height - inset * 2} rx={8} />;
  }
};

export const DiagramRenderer: React.FC<RendererProps> = React.memo(({ node, rect, theme }) => {
  const data = node.data as {
    direction?: 'LR' | 'TB';
    nodes?: DiagramNodeInput[];
    edges?: DiagramEdgeInput[];
  };
  const layout = useMemo(
    () => layoutDiagram(data.nodes ?? [], data.edges ?? [], data.direction ?? 'LR'),
    [data.nodes, data.edges, data.direction],
  );
  const w = Math.max(220, rect.w);
  const h = Math.max(140, rect.h);

  if (!data.nodes?.length) {
    return (
      <div className="flex h-full items-center justify-center text-sm" style={{ color: 'var(--fg-muted)' }}>
        Diagrama sendo montado…
      </div>
    );
  }

  return (
    <svg viewBox={`0 0 ${layout.width} ${layout.height}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet" role="img" aria-label={node.title ?? 'Diagrama'}>
      <defs>
        <marker id="gizmo-diagram-arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-primary)" />
        </marker>
      </defs>

      {layout.edges.map((edge, index) => (
        <g key={`${edge.from}-${edge.to}-${index}`}>
          <path
            d={edge.path}
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth={1.9}
            strokeOpacity={0.55}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={edge.dashed ? '7 7' : undefined}
            markerEnd="url(#gizmo-diagram-arrow)"
          />
          {(edge.animated || theme === 'blueprint') && (
            <path
              d={edge.path}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth={1.9}
              strokeDasharray="5 10"
              className="gizmo-edge-flow"
            />
          )}
          {edge.label && (
            <g transform={`translate(${edge.labelX} ${edge.labelY})`}>
              <rect x={-(edge.label.length * 3.4 + 8)} y={-10} width={edge.label.length * 6.8 + 16} height={20} rx={10} fill="var(--bg-elevated)" stroke="var(--node-border)" />
              <text textAnchor="middle" dominantBaseline="central" fontSize={12} fill="var(--fg-secondary)" fontFamily="var(--font-body)">
                {edge.label}
              </text>
            </g>
          )}
        </g>
      ))}

      {layout.nodes.map((item) => {
        const color = semanticColor(item.color ?? 'primary');
        return (
          <g key={item.id} transform={`translate(${item.x} ${item.y})`}>
            <g fill="var(--bg-elevated)" stroke={color} strokeWidth={1.8} style={{ color }}>
              {shapePath(item.shape, item.width, item.height)}
            </g>
            <text
              x={item.width / 2}
              y={item.sublabel ? item.height / 2 - 7 : item.height / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={16}
              fontWeight={700}
              fill="var(--fg-primary)"
              fontFamily="var(--font-heading)"
            >
              {item.label.length > 22 ? `${item.label.slice(0, 21)}…` : item.label}
            </text>
            {item.sublabel && (
              <text
                x={item.width / 2}
                y={item.height / 2 + 12}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={12}
                fill="var(--fg-muted)"
                fontFamily="var(--font-mono)"
              >
                {item.sublabel.slice(0, 24)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
});
DiagramRenderer.displayName = 'DiagramRenderer';
