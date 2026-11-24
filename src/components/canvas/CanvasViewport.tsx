import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSceneStore } from '../../stores/useSceneStore';
import { useSessionStore } from '../../stores/useSessionStore';
import { solveLayout } from '../../layout/solveLayout';
import { themeStyle, THEME_DESCRIPTORS } from '../../themes/themeDescriptors';
import { CanvasSvgDefs } from '../../themes/CanvasSvgDefs';
import { Layer0Background } from './Layer0Background';
import { Layer2LiveOverlay } from './Layer2LiveOverlay';
import { NodeShell } from './NodeShell';
import { InterNodeEdges } from './InterNodeEdges';

interface CanvasViewportProps {
  className?: string;
  showEmptyHint?: boolean;
  transparent?: boolean;
}

export const CanvasViewport: React.FC<CanvasViewportProps> = ({ className = '', showEmptyHint = true, transparent = false }) => {
  const scene = useSceneStore((state) => state.scene);
  const setLayoutMs = useSessionStore((state) => state.setLayoutMs);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.6);

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      setScale(Math.min(width / 1920, height / 1080));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const { positioned, elapsed } = useMemo(() => {
    const started = performance.now();
    const result = solveLayout(scene);
    return { positioned: result, elapsed: performance.now() - started };
  }, [scene.nodes, scene.title, scene.theme]);

  useEffect(() => {
    setLayoutMs(elapsed);
  }, [elapsed, setLayoutMs]);

  const highlightMap = scene.activeHighlights;
  const camera = scene.camera;
  const cameraStyle = useMemo(() => {
    if (camera.focus === 'all' || camera.zoom === 1) return { transform: 'none', transformOrigin: '50% 50%' };
    const matching = positioned.filter((entry) => entry.node.id === camera.focus || entry.node.zone === camera.focus);
    if (matching.length === 0) return { transform: 'none', transformOrigin: '50% 50%' };
    const minX = Math.min(...matching.map((entry) => entry.rect.x));
    const minY = Math.min(...matching.map((entry) => entry.rect.y));
    const maxX = Math.max(...matching.map((entry) => entry.rect.x + entry.rect.w));
    const maxY = Math.max(...matching.map((entry) => entry.rect.y + entry.rect.h));
    const cx = (minX + maxX) / 2 / 1920;
    const cy = (minY + maxY) / 2 / 1080;
    return {
      transform: `scale(${camera.zoom})`,
      transformOrigin: `${cx * 100}% ${cy * 100}%`,
    };
  }, [camera.focus, camera.zoom, positioned]);

  const descriptor = THEME_DESCRIPTORS[scene.theme];

  return (
    <div
      ref={containerRef}
      className={`relative flex h-full w-full items-center justify-center overflow-hidden rounded-2xl ${className}`}
      style={{
        ...themeStyle(scene.theme),
        background: transparent ? 'transparent' : 'var(--bg-canvas, #070B14)',
      }}
    >
      <div
        className="gizmo-canvas-root relative shrink-0 overflow-hidden"
        style={{
          ...themeStyle(scene.theme),
          width: 1920,
          height: 1080,
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          borderRadius: 18,
          boxShadow: transparent ? 'none' : descriptor.dark ? '0 30px 90px -40px rgba(0,0,0,0.8)' : '0 30px 80px -48px rgba(15,23,42,0.5)',
        }}
        data-theme={scene.theme}
      >
        <CanvasSvgDefs />
        {!transparent && <Layer0Background theme={scene.theme} />}

        {scene.title && (
          <header
            className="absolute left-[72px] right-[72px] z-20"
            style={{ top: scene.theme === 'flipchart' ? 46 : 28 }}
          >
            <h1
              className="truncate text-[46px] font-bold leading-[1.06] tracking-[-0.035em]"
              style={{ color: 'var(--fg-primary)', fontFamily: 'var(--font-heading)' }}
            >
              {scene.title}
            </h1>
            {scene.subtitle && (
              <p className="mt-1 truncate text-[19px] leading-tight" style={{ color: 'var(--fg-muted)', fontFamily: 'var(--font-body)' }}>
                {scene.subtitle}
              </p>
            )}
          </header>
        )}

        <div className="absolute inset-0 z-10" style={cameraStyle}>
          <InterNodeEdges positioned={positioned} edges={scene.edges} />
          {positioned.map(({ node, rect }) => (
            <NodeShell
              key={node.id}
              node={node}
              rect={rect}
              theme={scene.theme}
              highlight={highlightMap[node.id]}
            />
          ))}
        </div>

        {positioned.length === 0 && !scene.title && showEmptyHint && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <div className="max-w-[620px] text-center">
              <div
                className="mx-auto mb-5 flex h-[86px] w-[86px] items-center justify-center rounded-[26px]"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--node-border)' }}
              >
                <img src="/assets/logo-icon.svg" alt="Gizmo" className="h-14 w-14" />
              </div>
              <h2 className="text-[30px] font-bold tracking-tight" style={{ color: 'var(--fg-primary)', fontFamily: 'var(--font-heading)' }}>
                A aula começa quando você fala
              </h2>
              <p className="mt-2 text-[16px] leading-relaxed" style={{ color: 'var(--fg-muted)' }}>
                O Gizmo escuta localmente, entende o assunto e desenha a primeira ideia em menos de meio segundo.
                Use <strong style={{ color: 'var(--fg-secondary)' }}>Aula Demo</strong> para ver os seis estilos em ação.
              </p>
            </div>
          </div>
        )}

        <Layer2LiveOverlay />
      </div>
    </div>
  );
};
