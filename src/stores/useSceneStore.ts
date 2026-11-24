import { create } from 'zustand';
import type { SceneGraph, SceneOp } from '../types/scene';
import { createEmptyScene } from '../types/scene';
import { applySceneOp, pruneHighlights, setThemeLocked } from './sceneReducer';

interface SceneStore {
  scene: SceneGraph;
  lastOpAt: number;
  applyOp: (op: SceneOp, options?: { manual?: boolean }) => void;
  setScene: (scene: SceneGraph) => void;
  resetScene: (theme?: SceneGraph['theme'], sessionId?: string) => void;
  setThemeLocked: (locked: boolean) => void;
  prune: () => void;
}

export const useSceneStore = create<SceneStore>((set, get) => ({
  scene: createEmptyScene(),
  lastOpAt: 0,
  applyOp: (op, options) => {
    const current = get().scene;
    const next = applySceneOp(current, op, { manual: options?.manual, now: Date.now() });
    if (next === current) return;
    set({ scene: next, lastOpAt: Date.now() });
  },
  setScene: (scene) => set({ scene: { ...scene, nodes: scene.nodes ?? {}, edges: scene.edges ?? {}, activeHighlights: scene.activeHighlights ?? {} } }),
  resetScene: (theme = 'whiteboard', sessionId = 'local') =>
    set({ scene: createEmptyScene(theme, sessionId), lastOpAt: 0 }),
  setThemeLocked: (locked) => set({ scene: setThemeLocked(get().scene, locked) }),
  prune: () => {
    const current = get().scene;
    const next = pruneHighlights(current, Date.now());
    if (next !== current) set({ scene: next });
  },
}));
