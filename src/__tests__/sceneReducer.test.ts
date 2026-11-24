import { describe, expect, it } from 'vitest';
import { createEmptyScene } from '../types/scene';
import { applySceneOp, pruneHighlights, setThemeLocked } from '../stores/sceneReducer';
import type { SceneOp } from '../types/scene';

const upsert = (id: string, zone: 'left' | 'right' | 'hero' = 'left'): SceneOp => ({
  op: 'upsert',
  id,
  kind: 'math',
  zone,
  title: id,
  data: { latex: 'x^2' },
});

describe('sceneReducer', () => {
  it('ignores automatic theme while locked', () => {
    let scene = createEmptyScene('3b1b');
    scene = setThemeLocked(scene, true);
    scene = applySceneOp(scene, { op: 'theme', style: 'flipchart' });
    expect(scene.theme).toBe('3b1b');
    scene = applySceneOp(scene, { op: 'theme', style: 'flipchart', locked: false }, { manual: true });
    expect(scene.theme).toBe('flipchart');
    expect(scene.themeLocked).toBe(false);
  });

  it('evicts the oldest unpinned node beyond the theme limit', () => {
    let scene = createEmptyScene('ted');
    scene = applySceneOp(scene, upsert('a', 'hero'), { now: 1 });
    scene = applySceneOp(scene, upsert('b', 'hero'), { now: 2 });
    scene = applySceneOp(scene, upsert('c', 'hero'), { now: 3 });
    scene = applySceneOp(scene, upsert('d', 'hero'), { now: 4 });
    expect(Object.keys(scene.nodes)).toHaveLength(3);
    expect(scene.nodes.a).toBeUndefined();
    expect(scene.nodes.d).toBeDefined();
  });

  it('applies JSON merge patch and preserves order index', () => {
    let scene = createEmptyScene('3b1b');
    scene = applySceneOp(scene, upsert('m', 'right'));
    const orderIndex = scene.nodes.m.orderIndex;
    scene = applySceneOp(scene, {
      op: 'patch',
      id: 'm',
      data: { caption: 'depois' },
    });
    expect(scene.nodes.m.data.latex).toBe('x^2');
    expect(scene.nodes.m.data.caption).toBe('depois');
    expect(scene.nodes.m.orderIndex).toBe(orderIndex);
    expect(scene.nodes.m.version).toBe(2);
  });

  it('connects only existing nodes and removes orphan edges', () => {
    let scene = createEmptyScene('blueprint');
    scene = applySceneOp(scene, upsert('a', 'left'));
    scene = applySceneOp(scene, upsert('b', 'right'));
    scene = applySceneOp(scene, { op: 'connect', id: 'e1', from: 'a', to: 'b', label: 'chama', animated: true });
    expect(scene.edges.e1).toBeDefined();
    scene = applySceneOp(scene, { op: 'remove', id: 'a' });
    expect(scene.edges.e1).toBeUndefined();
  });

  it('clears highlights after their ttl', () => {
    let scene = createEmptyScene('whiteboard');
    scene = applySceneOp(scene, upsert('a'), { now: 10 });
    scene = applySceneOp(scene, { op: 'highlight', id: 'a', ttl_ms: 1000 }, { now: 10 });
    expect(scene.activeHighlights.a).toBeDefined();
    scene = pruneHighlights(scene, 500);
    expect(scene.activeHighlights.a).toBeDefined();
    scene = pruneHighlights(scene, 1200);
    expect(scene.activeHighlights.a).toBeUndefined();
  });

  it('keeps the title on clear when asked', () => {
    let scene = createEmptyScene('whiteboard');
    scene = applySceneOp(scene, { op: 'title', text: 'Título', subtitle: 'Sub' });
    scene = applySceneOp(scene, { op: 'clear', keep_title: true });
    expect(scene.title).toBe('Título');
    expect(Object.keys(scene.nodes)).toHaveLength(0);
  });
});
