import { describe, expect, it } from 'vitest';
import type { NodeKind, SceneGraph, SceneNode, SemanticZone } from '../types/scene';
import { createEmptyScene } from '../types/scene';
import { solveLayout, intersects } from '../layout/solveLayout';

function node(id: string, zone: SemanticZone, order: number, kind: NodeKind = 'math'): SceneNode {
  return {
    id,
    kind,
    zone,
    title: null,
    pinned: false,
    version: 1,
    orderIndex: order,
    createdAtMs: order,
    updatedAtMs: order,
    data: {},
  };
}

function sceneWith(nodes: SceneNode[], title: string | null = 'Aula de teste'): SceneGraph {
  const scene = createEmptyScene('whiteboard');
  scene.title = title;
  scene.nodes = Object.fromEntries(nodes.map((item) => [item.id, item]));
  return scene;
}

function expectNoOverlap(scene: SceneGraph) {
  const positioned = solveLayout(scene);
  for (let i = 0; i < positioned.length; i++) {
    for (let j = i + 1; j < positioned.length; j++) {
      expect(
        intersects(positioned[i].rect, positioned[j].rect),
        `${positioned[i].node.id} (${positioned[i].node.zone}) sobrepõe ${positioned[j].node.id} (${positioned[j].node.zone})`,
      ).toBe(false);
    }
  }
  for (const entry of positioned) {
    expect(entry.rect.x).toBeGreaterThanOrEqual(72);
    expect(entry.rect.y).toBeGreaterThanOrEqual(48);
    expect(entry.rect.x + entry.rect.w).toBeLessThanOrEqual(1848.01);
    expect(entry.rect.y + entry.rect.h).toBeLessThanOrEqual(1032.01);
  }
}

describe('solveLayout', () => {
  it('does not overlap for every single semantic zone', () => {
    const zones: SemanticZone[] = [
      'hero', 'center', 'left', 'right', 'top', 'bottom',
      'split_tl', 'split_tr', 'split_bl', 'split_br', 'footer',
    ];
    for (const zone of zones) {
      expectNoOverlap(sceneWith([node('a', zone, 0)]));
    }
  });

  it('handles three nodes in the same left zone', () => {
    expectNoOverlap(sceneWith([
      node('a', 'left', 0),
      node('b', 'left', 1),
      node('c', 'left', 2),
    ]));
  });

  it('handles left + center conflict', () => {
    expectNoOverlap(sceneWith([node('a', 'left', 0), node('b', 'center', 1)]));
  });

  it('handles left + right + center', () => {
    expectNoOverlap(sceneWith([
      node('a', 'left', 0),
      node('b', 'center', 1),
      node('c', 'right', 2),
    ]));
  });

  it('handles hero with other zones', () => {
    expectNoOverlap(sceneWith([
      node('hero', 'hero', 0, 'kpi'),
      node('left', 'left', 1, 'plot_2d'),
      node('right', 'right', 2),
    ]));
  });

  it('handles all zones with up to 8 nodes', () => {
    expectNoOverlap(sceneWith([
      node('top', 'top', 0, 'timeline'),
      node('bottom', 'bottom', 1, 'chart'),
      node('tl', 'split_tl', 2),
      node('tr', 'split_tr', 3),
      node('bl', 'split_bl', 4),
      node('br', 'split_br', 5),
      node('left', 'left', 6, 'plot_2d'),
      node('right', 'right', 7),
      node('footer', 'footer', 8, 'callout'),
    ]));
  });

  it('stays within budget for 12 nodes', () => {
    const nodes = Array.from({ length: 12 }, (_, index) =>
      node(`n${index}`, index % 2 === 0 ? 'left' : 'right', index, index % 3 === 0 ? 'plot_2d' : 'math'),
    );
    const scene = sceneWith(nodes);
    const started = performance.now();
    for (let i = 0; i < 20; i++) solveLayout(scene);
    const average = (performance.now() - started) / 20;
    expect(average).toBeLessThan(2);
    expectNoOverlap(scene);
  });

  it('adapts to scenes without a title', () => {
    expectNoOverlap(sceneWith([
      node('a', 'top', 0),
      node('b', 'center', 1),
    ], null));
  });
});
