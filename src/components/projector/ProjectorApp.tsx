import React, { useEffect } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { CanvasViewport } from '../canvas/CanvasViewport';
import { GizmoMascot } from '../mascot/GizmoMascot';
import { useSceneStore } from '../../stores/useSceneStore';
import { audioLevelRef } from '../../stores/useSessionStore';
import { useConfigStore } from '../../stores/useConfigStore';
import { getSceneSnapshot, isTauri } from '../../types/ipc';
import { themeStyle } from '../../themes/themeDescriptors';
import type { AppConfig } from '../../types/config';
import type { SceneGraph, SceneOp } from '../../types/scene';

export const ProjectorApp: React.FC = () => {
  const { scene, applyOp, setScene } = useSceneStore();
  const { config, load } = useConfigStore();
  const revisitingRef = React.useRef(false);
  const transparent = new URLSearchParams(window.location.search).get('transparent') === '1';
  const chroma = config.canvas.projectorChromaBg;
  const keyedBackground = transparent || Boolean(chroma);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    const unlisteners: UnlistenFn[] = [];

    void getSceneSnapshot().then((snapshot) => {
      if (snapshot) setScene(snapshot);
    });

    const register = async () => {
      const opUnlisten = await listen<SceneOp>('scene:op', (message) => {
        if (!revisitingRef.current) applyOp(message.payload);
      });
      const snapshotUnlisten = await listen<SceneGraph>('scene:snapshot', (message) => setScene(message.payload));
      const modeUnlisten = await listen<{ revisiting: boolean }>('beat:mode', (message) => {
        revisitingRef.current = message.payload.revisiting;
      });
      const configUnlisten = await listen<AppConfig>('config:updated', (message) => {
        useConfigStore.setState({ config: message.payload, loaded: true });
      });
      const levelUnlisten = await listen<{ rms: number; peak: number; speaking: boolean }>('audio:level', (message) => {
        audioLevelRef.current = message.payload;
      });
      for (const unlisten of [opUnlisten, snapshotUnlisten, modeUnlisten, configUnlisten, levelUnlisten]) {
        if (disposed) unlisten();
        else unlisteners.push(unlisten);
      }
    };
    void register();
    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [applyOp, setScene]);

  useEffect(() => {
    const chroma = config.canvas.projectorChromaBg;
    document.body.style.background = chroma ?? 'transparent';
    document.documentElement.style.background = 'transparent';
    return () => {
      document.body.style.background = '';
      document.documentElement.style.background = '';
    };
  }, [config.canvas.projectorChromaBg]);

  useEffect(() => {
    const handler = async (event: KeyboardEvent) => {
      if (event.key !== 'F11') return;
      event.preventDefault();
      if (isTauri()) {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const window = getCurrentWindow();
        const fullscreen = await window.isFullscreen();
        await window.setFullscreen(!fullscreen);
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div
      className="relative h-screen w-screen overflow-hidden"
      style={{
        ...themeStyle(scene.theme),
        background: chroma ?? (transparent ? 'transparent' : 'var(--bg-canvas)'),
      }}
    >
      <CanvasViewport showEmptyHint={false} transparent={keyedBackground} className="!rounded-none" />
      {config.canvas.showMascotInProjector && (
        <div className="absolute bottom-4 right-4 z-30 opacity-80">
          <GizmoMascot state="idle" audioLevelRef={audioLevelRef} size={46} />
        </div>
      )}
      {!scene.title && Object.keys(scene.nodes).length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-8 z-20 text-center">
          <p className="text-[13px] font-semibold tracking-[0.18em] uppercase" style={{ color: 'var(--fg-muted)', fontFamily: 'var(--font-body)' }}>
            Gizmo · Projetor aguardando a aula
          </p>
        </div>
      )}
    </div>
  );
};
