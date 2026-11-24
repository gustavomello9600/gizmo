import type { SceneGraph, SceneNode, SceneOp, SemanticZone, ThemeId } from '../types/scene';
import { THEME_MAX_NODES } from '../types/scene';

export interface ApplyOptions {
  manual?: boolean;
  now?: number;
}

function mergePatch(target: unknown, patch: unknown): unknown {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  if (target === null || typeof target !== 'object' || Array.isArray(target)) target = {};
  const result: Record<string, unknown> = { ...(target as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    if (value === null) delete result[key];
    else result[key] = mergePatch(result[key], value);
  }
  return result;
}

function removeNode(scene: SceneGraph, id: string): SceneGraph {
  const nodes = { ...scene.nodes };
  delete nodes[id];
  const edges = Object.fromEntries(
    Object.entries(scene.edges).filter(([, edge]) => edge.from !== id && edge.to !== id),
  );
  const activeHighlights = { ...scene.activeHighlights };
  delete activeHighlights[id];
  return { ...scene, nodes, edges, activeHighlights };
}

export function applySceneOp(
  scene: SceneGraph,
  op: SceneOp,
  options: ApplyOptions = {},
): SceneGraph {
  const now = options.now ?? Date.now();
  const manual = options.manual ?? false;
  let next: SceneGraph = scene;
  let changed = true;

  switch (op.op) {
    case 'theme': {
      if (scene.themeLocked && !manual && op.locked !== true) return scene;
      let themeLocked = scene.themeLocked;
      if (manual && op.locked === false) themeLocked = false;
      if (op.locked === true) themeLocked = true;
      next = {
        ...scene,
        theme: op.style,
        themeLocked,
        themeAutoDetected: op.style !== scene.theme ? false : scene.themeAutoDetected,
      };
      changed = next.theme !== scene.theme || next.themeLocked !== scene.themeLocked;
      break;
    }
    case 'title': {
      next = { ...scene, title: op.text, subtitle: op.subtitle ?? null };
      changed = scene.title !== next.title || scene.subtitle !== next.subtitle;
      break;
    }
    case 'upsert': {
      const existing = scene.nodes[op.id];
      const node: SceneNode = existing
        ? {
            ...existing,
            kind: op.kind,
            zone: op.zone,
            title: op.title ?? null,
            pinned: op.pinned ?? existing.pinned,
            version: existing.version + 1,
            updatedAtMs: now,
            data: op.data ?? {},
          }
        : {
            id: op.id,
            kind: op.kind,
            zone: op.zone,
            title: op.title ?? null,
            pinned: op.pinned ?? false,
            version: 1,
            orderIndex: Object.values(scene.nodes).reduce((max, item) => Math.max(max, item.orderIndex), -1) + 1,
            createdAtMs: now,
            updatedAtMs: now,
            data: op.data ?? {},
          };
      next = { ...scene, nodes: { ...scene.nodes, [op.id]: node } };
      const limit = THEME_MAX_NODES[next.theme];
      while (Object.keys(next.nodes).length > limit) {
        const victim = Object.values(next.nodes)
          .filter((item) => !item.pinned && item.id !== op.id)
          .sort((a, b) => a.updatedAtMs - b.updatedAtMs || a.orderIndex - b.orderIndex)[0];
        if (!victim) break;
        next = removeNode(next, victim.id);
      }
      break;
    }
    case 'patch': {
      const existing = scene.nodes[op.id];
      if (!existing) return scene;
      const node: SceneNode = {
        ...existing,
        zone: op.zone ?? existing.zone,
        title: op.title ?? existing.title,
        version: existing.version + 1,
        updatedAtMs: now,
        data: op.data ? (mergePatch(existing.data, op.data) as SceneNode['data']) : existing.data,
      };
      next = { ...scene, nodes: { ...scene.nodes, [op.id]: node } };
      break;
    }
    case 'connect': {
      if (!scene.nodes[op.from] || !scene.nodes[op.to]) return scene;
      const edge = {
        id: op.id,
        from: op.from,
        to: op.to,
        label: op.label ?? null,
        animated: op.animated ?? false,
        style: op.style ?? ('solid' as const),
      };
      next = { ...scene, edges: { ...scene.edges, [op.id]: edge } };
      break;
    }
    case 'highlight': {
      const ttl = Math.max(300, Math.min(15_000, op.ttl_ms ?? 2800));
      next = {
        ...scene,
        activeHighlights: {
          ...scene.activeHighlights,
          [op.id]: {
            target: op.target ?? null,
            style: op.style ?? 'pulse',
            expiresAtMs: now + ttl,
          },
        },
      };
      break;
    }
    case 'remove': {
      const hasNode = Boolean(scene.nodes[op.id]);
      const hasEdge = Boolean(scene.edges[op.id]);
      if (!hasNode && !hasEdge && !scene.activeHighlights[op.id]) return scene;
      if (hasNode) next = removeNode(scene, op.id);
      else {
        const edges = { ...scene.edges };
        delete edges[op.id];
        const activeHighlights = { ...scene.activeHighlights };
        delete activeHighlights[op.id];
        next = { ...scene, edges, activeHighlights };
      }
      break;
    }
    case 'camera': {
      const zoom = op.focus === 'all' ? 1 : Math.max(0.75, Math.min(1.6, op.zoom ?? 1));
      next = { ...scene, camera: { focus: op.focus, zoom } };
      changed = scene.camera.focus !== op.focus || scene.camera.zoom !== zoom;
      break;
    }
    case 'clear': {
      next = {
        ...scene,
        nodes: {},
        edges: {},
        activeHighlights: {},
        camera: { focus: 'all', zoom: 1 },
        title: op.keep_title ? scene.title : null,
        subtitle: op.keep_title ? scene.subtitle : null,
      };
      break;
    }
    case 'noop':
      return scene;
    default:
      return scene;
  }

  if (!changed) return scene;
  return { ...next, revision: scene.revision + 1 };
}

export function pruneHighlights(scene: SceneGraph, now = Date.now()): SceneGraph {
  const entries = Object.entries(scene.activeHighlights).filter(([, value]) => value.expiresAtMs > now);
  if (entries.length === Object.keys(scene.activeHighlights).length) return scene;
  return {
    ...scene,
    activeHighlights: Object.fromEntries(entries),
    revision: scene.revision + 1,
  };
}

export function setThemeLocked(scene: SceneGraph, locked: boolean): SceneGraph {
  if (scene.themeLocked === locked) return scene;
  return { ...scene, themeLocked: locked, revision: scene.revision + 1 };
}

export function activeTheme(scene: SceneGraph): ThemeId {
  return scene.theme;
}

export function zoneOf(node: SceneNode): SemanticZone {
  return node.zone;
}
