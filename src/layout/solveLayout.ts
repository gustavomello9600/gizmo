import type { SceneGraph, SceneNode, SemanticZone } from '../types/scene';
import { NODE_WEIGHTS } from '../themes/themeDescriptors';

export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1080;
export const CONTENT_LEFT = 72;
export const CONTENT_RIGHT = 1848;
export const CONTENT_BOTTOM = 1032;
export const HEADER_WITH_TITLE = 136;
export const HEADER_NO_TITLE = 48;
export const GAP = 22;
export const BAND_GAP = 28;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PositionedNode {
  node: SceneNode;
  rect: Rect;
}

export interface ZoneRect extends Rect {
  zone: SemanticZone;
}

const SPLIT_RANK: Partial<Record<SemanticZone, number>> = {
  split_tl: 0,
  split_tr: 0,
  left: 1,
  center: 1,
  hero: 1,
  right: 1,
  split_bl: 2,
  split_br: 2,
};

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function rect(x: number, y: number, w: number, h: number): Rect {
  return { x: round(x), y: round(y), w: round(Math.max(1, w)), h: round(Math.max(1, h)) };
}

function sortNodes(nodes: SceneNode[]): SceneNode[] {
  return [...nodes].sort(
    (a, b) =>
      (SPLIT_RANK[a.zone] ?? 1) - (SPLIT_RANK[b.zone] ?? 1) ||
      a.orderIndex - b.orderIndex,
  );
}

function splitHorizontal(nodes: SceneNode[], area: Rect, gap = BAND_GAP): PositionedNode[] {
  if (nodes.length === 0) return [];
  if (nodes.length === 1) return [{ node: nodes[0], rect: area }];
  const safeGap = Math.min(gap, Math.max(2, (area.w - nodes.length * 40) / (nodes.length - 1)));
  const width = (area.w - safeGap * (nodes.length - 1)) / nodes.length;
  return nodes.map((node, index) => ({
    node,
    rect: rect(area.x + index * (width + safeGap), area.y, width, area.h),
  }));
}

function stackVertical(nodes: SceneNode[], area: Rect, gap = GAP): PositionedNode[] {
  if (nodes.length === 0) return [];
  if (nodes.length === 1) return [{ node: nodes[0], rect: area }];
  const safeGap = Math.min(gap, Math.max(2, (area.h - nodes.length * 30) / (nodes.length - 1)));
  const available = area.h - safeGap * (nodes.length - 1);
  const totalWeight = nodes.reduce((sum, node) => sum + (NODE_WEIGHTS[node.kind] ?? 1), 0) || 1;
  let cursor = area.y;
  return nodes.map((node) => {
    const height = available * ((NODE_WEIGHTS[node.kind] ?? 1) / totalWeight);
    const placed = rect(area.x, cursor, area.w, height);
    cursor += height + safeGap;
    return { node, rect: placed };
  });
}

function splitColumnCells(nodes: SceneNode[], area: Rect, side: 'left' | 'right'): PositionedNode[] {
  const top = nodes.filter((node) => node.zone === (side === 'left' ? 'split_tl' : 'split_tr'));
  const bottom = nodes.filter((node) => node.zone === (side === 'left' ? 'split_bl' : 'split_br'));
  const others = nodes.filter((node) => !top.includes(node) && !bottom.includes(node));
  const result: PositionedNode[] = [];
  if (top.length > 0 && bottom.length > 0) {
    const half = (area.h - GAP) / 2;
    result.push(...stackVertical(top, { ...area, h: half }));
    result.push(...stackVertical(bottom, { ...area, y: area.y + half + GAP, h: half }));
  } else if (top.length > 0) {
    result.push(...stackVertical(top, { ...area, h: (area.h - GAP) / 2 }));
  } else if (bottom.length > 0) {
    result.push(...stackVertical(bottom, { ...area, y: area.y + (area.h - GAP) / 2, h: (area.h - GAP) / 2 }));
  }
  if (others.length > 0) result.push(...stackVertical(others, area));
  return result;
}

/**
 * Layout determinístico em 1920 × 1080. Bandas e colunas disjuntas garantem
 * interseção de área zero por construção, sem depender de ordem de chegada.
 */
export function solveLayout(scene: SceneGraph): PositionedNode[] {
  const nodes = Object.values(scene.nodes).sort((a, b) => a.orderIndex - b.orderIndex);
  if (nodes.length === 0) return [];

  const header = scene.title ? HEADER_WITH_TITLE : HEADER_NO_TITLE;
  const content: Rect = rect(CONTENT_LEFT, header, CONTENT_RIGHT - CONTENT_LEFT, CONTENT_BOTTOM - header);

  const byZone: Record<SemanticZone, SceneNode[]> = {
    hero: [], center: [], left: [], right: [], top: [], bottom: [],
    split_tl: [], split_tr: [], split_bl: [], split_br: [], footer: [],
  };
  for (const node of nodes) byZone[node.zone].push(node);

  const footerHeight = byZone.footer.length > 0 ? 96 : 0;
  const usableHeight = content.h - footerHeight;
  let topHeight = 0;
  let bottomHeight = 0;
  if (byZone.top.length > 0 && byZone.bottom.length > 0) {
    topHeight = Math.min(usableHeight * 0.36, (usableHeight - 240) / 2);
    bottomHeight = topHeight;
  } else if (byZone.top.length > 0) {
    topHeight = Math.min(usableHeight * 0.42, usableHeight - 240);
  } else if (byZone.bottom.length > 0) {
    bottomHeight = Math.min(usableHeight * 0.42, usableHeight - 240);
  }
  topHeight = Math.max(0, topHeight);
  bottomHeight = Math.max(0, bottomHeight);

  const topRect = topHeight > 0 ? rect(content.x, content.y, content.w, topHeight) : null;
  const footerRect = footerHeight > 0
    ? rect(content.x, CONTENT_BOTTOM - footerHeight, content.w, footerHeight)
    : null;
  const bottomRect = bottomHeight > 0
    ? rect(
        content.x,
        (footerRect ? footerRect.y : CONTENT_BOTTOM) - BAND_GAP - bottomHeight,
        content.w,
        bottomHeight,
      )
    : null;

  const result: PositionedNode[] = [];
  if (topRect) result.push(...splitHorizontal(sortNodes(byZone.top), topRect));
  if (bottomRect) result.push(...splitHorizontal(sortNodes(byZone.bottom), bottomRect));
  if (footerRect) result.push(...splitHorizontal(sortNodes(byZone.footer), footerRect, 18));

  const middleY = topRect ? topRect.y + topRect.h + BAND_GAP : content.y;
  const middleBottom = bottomRect
    ? bottomRect.y - BAND_GAP
    : footerRect
      ? footerRect.y - BAND_GAP
      : CONTENT_BOTTOM;
  const middle = rect(content.x, middleY, content.w, Math.max(80, middleBottom - middleY));

  const heroNodes = byZone.hero;
  const otherMiddleCount =
    byZone.left.length + byZone.right.length + byZone.center.length +
    byZone.split_tl.length + byZone.split_tr.length +
    byZone.split_bl.length + byZone.split_br.length;
  const heroAlone = heroNodes.length > 0 && otherMiddleCount === 0;
  if (heroAlone) {
    result.push(...splitHorizontal(heroNodes, middle, GAP));
    return result;
  }

  const leftGroup = sortNodes([
    ...byZone.left, ...byZone.split_tl, ...byZone.split_bl,
  ]);
  const rightGroup = sortNodes([
    ...byZone.right, ...byZone.split_tr, ...byZone.split_br,
  ]);
  const centerGroup = sortNodes([...byZone.center, ...heroNodes]);

  const splitsOnly =
    centerGroup.length === 0 &&
    byZone.left.length === 0 &&
    byZone.right.length === 0 &&
    leftGroup.length + rightGroup.length > 0;

  if (splitsOnly) {
    const leftWidth = (middle.w - GAP) / 2;
    if (leftGroup.length > 0) {
      result.push(...splitColumnCells(leftGroup, rect(middle.x, middle.y, leftWidth, middle.h), 'left'));
    }
    if (rightGroup.length > 0) {
      result.push(...splitColumnCells(
        rightGroup,
        rect(middle.x + leftWidth + GAP, middle.y, leftWidth, middle.h),
        'right',
      ));
    }
    return result;
  }

  const hasLeft = leftGroup.length > 0;
  const hasRight = rightGroup.length > 0;
  const hasCenter = centerGroup.length > 0;
  let leftWidth = 0;
  let centerWidth = 0;
  let rightWidth = 0;
  const columns = Number(hasLeft) + Number(hasCenter) + Number(hasRight);

  if (columns === 3) {
    leftWidth = middle.w * 0.30;
    centerWidth = middle.w * 0.40;
    rightWidth = middle.w * 0.30;
  } else if (columns === 2) {
    if (hasCenter) {
      const rest = middle.w * 0.5;
      if (hasLeft) leftWidth = rest;
      if (hasRight) rightWidth = rest;
      centerWidth = rest;
    } else {
      leftWidth = middle.w * 0.5;
      rightWidth = middle.w * 0.5;
    }
  } else if (columns === 1) {
    if (hasCenter) centerWidth = middle.w;
    else if (hasLeft) leftWidth = middle.w * 0.56;
    else if (hasRight) rightWidth = middle.w * 0.56;
  }

  const totalGaps = GAP * Math.max(0, columns - 1);
  const usableWidth = middle.w - totalGaps;
  if (columns === 3) {
    leftWidth = usableWidth * 0.3;
    centerWidth = usableWidth * 0.4;
    rightWidth = usableWidth * 0.3;
  } else if (columns === 2) {
    if (hasCenter) {
      const half = usableWidth / 2;
      centerWidth = half;
      if (hasLeft) leftWidth = half;
      if (hasRight) rightWidth = half;
    } else {
      leftWidth = usableWidth / 2;
      rightWidth = usableWidth / 2;
    }
  } else if (columns === 1) {
    if (hasCenter) centerWidth = usableWidth;
    else if (hasLeft) leftWidth = usableWidth * 0.56;
    else if (hasRight) rightWidth = usableWidth * 0.56;
  }

  let cursorX = middle.x;
  if (hasLeft) {
    result.push(...stackVertical(leftGroup, rect(cursorX, middle.y, leftWidth, middle.h)));
    cursorX += leftWidth + GAP;
  }
  if (hasCenter) {
    result.push(...stackVertical(centerGroup, rect(cursorX, middle.y, centerWidth, middle.h)));
    cursorX += centerWidth + GAP;
  }
  if (hasRight) {
    result.push(...stackVertical(
      rightGroup,
      rect(columns === 1 && hasRight ? middle.x + middle.w - rightWidth : cursorX, middle.y, rightWidth, middle.h),
    ));
  }

  return result;
}

export function solveLayoutWithZones(scene: SceneGraph): ZoneRect[] {
  return solveLayout(scene).map(({ node, rect: r }) => ({ ...r, zone: node.zone }));
}

export function intersects(a: Rect, b: Rect): boolean {
  const width = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return width > 0.0001 && height > 0.0001;
}
