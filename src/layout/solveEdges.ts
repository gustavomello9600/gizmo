import type { SceneEdge } from '../types/scene';
import type { PositionedNode, Rect } from './solveLayout';

export interface SolvedEdge {
  edge: SceneEdge;
  path: string;
  labelX: number;
  labelY: number;
  angle: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

function facePoint(from: Rect, to: Rect): { x: number; y: number; horizontal: boolean } {
  const fromCx = from.x + from.w / 2;
  const fromCy = from.y + from.h / 2;
  const toCx = to.x + to.w / 2;
  const toCy = to.y + to.h / 2;
  const horizontal = Math.abs(toCx - fromCx) >= Math.abs(toCy - fromCy);
  if (horizontal) {
    return {
      x: toCx > fromCx ? from.x + from.w : from.x,
      y: fromCy,
      horizontal: true,
    };
  }
  return {
    x: fromCx,
    y: toCy > fromCy ? from.y + from.h : from.y,
    horizontal: false,
  };
}

function oppositePoint(to: Rect, from: Rect): { x: number; y: number } {
  const fromCx = from.x + from.w / 2;
  const fromCy = from.y + from.h / 2;
  const toCx = to.x + to.w / 2;
  const toCy = to.y + to.h / 2;
  if (Math.abs(toCx - fromCx) >= Math.abs(toCy - fromCy)) {
    return {
      x: toCx > fromCx ? to.x : to.x + to.w,
      y: toCy,
    };
  }
  return {
    x: toCx,
    y: toCy > fromCy ? to.y : to.y + to.h,
  };
}

export function solveEdges(
  positioned: PositionedNode[],
  edges: Record<string, SceneEdge>,
): SolvedEdge[] {
  const rectById = new Map(positioned.map((entry) => [entry.node.id, entry.rect]));
  const result: SolvedEdge[] = [];
  for (const edge of Object.values(edges)) {
    const from = rectById.get(edge.from);
    const to = rectById.get(edge.to);
    if (!from || !to || edge.from === edge.to) continue;
    const start = facePoint(from, to);
    const end = oppositePoint(to, from);
    const horizontal = start.horizontal;
    let path: string;
    let labelX: number;
    let labelY: number;
    let angle: number;

    if (horizontal) {
      const midX = (start.x + end.x) / 2;
      path = `M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x} ${end.y}`;
      labelX = midX;
      labelY = (start.y + end.y) / 2;
      angle = Math.atan2(end.y - start.y, end.x - midX) * (180 / Math.PI);
    } else {
      const midY = (start.y + end.y) / 2;
      path = `M ${start.x} ${start.y} C ${start.x} ${midY}, ${end.x} ${midY}, ${end.x} ${end.y}`;
      labelX = (start.x + end.x) / 2;
      labelY = midY;
      angle = Math.atan2(end.y - midY, end.x - start.x) * (180 / Math.PI);
    }

    result.push({
      edge,
      path,
      labelX,
      labelY,
      angle,
      startX: start.x,
      startY: start.y,
      endX: end.x,
      endY: end.y,
    });
  }
  return result;
}
