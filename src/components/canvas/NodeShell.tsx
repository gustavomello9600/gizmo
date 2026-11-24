import React, { Component, type ReactNode, useMemo } from 'react';
import type { ActiveHighlight, SceneNode, ThemeId } from '../../types/scene';
import { fnv1a32 } from '../../utils/hash';
import { roughRectPath } from '../../utils/roughHelper';
import { RenderNode } from './renderers';

interface NodeErrorBoundaryProps {
  children: ReactNode;
}

class NodeErrorBoundary extends Component<NodeErrorBoundaryProps, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    console.warn('Falha ao renderizar nó:', error);
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="flex h-full items-center justify-center p-6 text-center" style={{ color: 'var(--color-warning)' }}>
          <div>
            <p className="text-sm font-semibold">Este elemento ainda está sendo desenhado</p>
            <p className="mt-1 text-xs opacity-70">O restante da cena continua intacto.</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

interface RoughFrameProps {
  nodeId: string;
  width: number;
  height: number;
}

const RoughFrame: React.FC<RoughFrameProps> = ({ nodeId, width, height }) => {
  const seed = fnv1a32(nodeId);
  const path = useMemo(
    () => roughRectPath(seed, width, height, 2),
    [seed, width, height],
  );
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
      <path d={path} fill="none" stroke="var(--color-primary)" strokeWidth="1.5" opacity="0.42" />
    </svg>
  );
};

export interface NodeShellProps {
  node: SceneNode;
  rect: { x: number; y: number; w: number; h: number };
  theme: ThemeId;
  highlight?: ActiveHighlight;
}

export const NodeShell: React.FC<NodeShellProps> = React.memo(({ node, rect, theme, highlight }) => {
  const rounded = Math.round(rect.w);
  const roundedHeight = Math.round(rect.h);
  const highlighted = Boolean(highlight);
  const isRough = theme === 'flipchart';
  const isGlow = theme === '3b1b';

  return (
    <div
      className="absolute top-0 left-0 will-change-transform"
      style={{
        transform: `translate3d(${rect.x}px, ${rect.y}px, 0)`,
        width: rect.w,
        height: rect.h,
        zIndex: highlighted ? 20 : 10,
      }}
      data-node-id={node.id}
      data-zone={node.zone}
    >
      <div
        className="gizmo-node-enter relative flex h-full w-full flex-col overflow-hidden"
        style={{
          background: 'var(--bg-surface)',
          borderRadius: isRough ? 6 : `${Math.max(0, (theme === 'blueprint' ? 5 : theme === 'ted' ? 22 : theme === 'whiteboard' ? 16 : 11))}px`,
          border: highlighted ? '1px solid var(--highlight-color, var(--color-accent))' : 'var(--node-border)',
          boxShadow: highlighted
            ? '0 0 0 2px color-mix(in srgb, var(--highlight-color, var(--color-accent)) 40%, transparent), 0 24px 60px -30px rgba(0,0,0,0.55)'
            : 'var(--shadow-card)',
          backdropFilter: theme === 'ted' ? 'blur(6px)' : undefined,
          transition: 'border-color 180ms ease, box-shadow 220ms ease',
        }}
      >
        {isRough && <RoughFrame nodeId={node.id} width={rounded} height={roundedHeight} />}
        {isGlow && highlighted && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{ boxShadow: 'inset 0 0 30px color-mix(in srgb, var(--color-primary) 18%, transparent)' }}
          />
        )}

        {node.title && (
          <header
            className="relative z-10 shrink-0 px-5 pt-3 pb-1"
            style={{ fontFamily: 'var(--font-heading)', color: 'var(--fg-primary)' }}
          >
            <h3 className="truncate text-[19px] leading-tight font-semibold tracking-tight">{node.title}</h3>
          </header>
        )}

        <div className="relative z-10 min-h-0 flex-1 overflow-hidden">
          <NodeErrorBoundary>
            <RenderNode node={node} rect={rect} theme={theme} />
          </NodeErrorBoundary>
        </div>

        {highlighted && (
          <div
            className="gizmo-highlight-pulse pointer-events-none absolute inset-0"
            style={{
              borderRadius: 'inherit',
              boxShadow: '0 0 0 2px var(--highlight-color, var(--color-accent)), 0 0 46px color-mix(in srgb, var(--highlight-color, var(--color-accent)) 30%, transparent)',
            }}
          />
        )}
      </div>
    </div>
  );
});
NodeShell.displayName = 'NodeShell';
