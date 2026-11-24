import dagre from '@dagrejs/dagre';

export interface DiagramNodeInput {
  id: string;
  label: string;
  sublabel?: string;
  shape?: 'box' | 'pill' | 'diamond' | 'cylinder' | 'actor';
  color?: string;
}

export interface DiagramEdgeInput {
  from: string;
  to: string;
  label?: string;
  animated?: boolean;
  dashed?: boolean;
}

export interface LaidOutDiagramNode extends DiagramNodeInput {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LaidOutDiagramEdge extends DiagramEdgeInput {
  path: string;
  labelX: number;
  labelY: number;
}

export interface DiagramLayout {
  nodes: LaidOutDiagramNode[];
  edges: LaidOutDiagramEdge[];
  width: number;
  height: number;
}

function nodeSize(node: DiagramNodeInput): { width: number; height: number } {
  const labelLength = (node.label ?? '').length;
  const width = Math.min(260, Math.max(120, labelLength * 10 + 44));
  const height = node.sublabel ? 68 : 50;
  return { width, height };
}

function smoothPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    path += ` L ${points[i].x} ${points[i].y}`;
  }
  return path;
}

export function layoutDiagram(
  nodes: DiagramNodeInput[],
  edges: DiagramEdgeInput[],
  direction: 'LR' | 'TB' = 'LR',
): DiagramLayout {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({
    rankdir: direction,
    nodesep: 36,
    ranksep: 56,
    marginx: 12,
    marginy: 12,
  });
  graph.setDefaultEdgeLabel(() => ({}));

  for (const node of nodes) {
    const { width, height } = nodeSize(node);
    graph.setNode(node.id, { label: node.label, width, height });
  }
  for (const edge of edges) {
    if (graph.hasNode(edge.from) && graph.hasNode(edge.to)) {
      graph.setEdge(edge.from, edge.to);
    }
  }

  dagre.layout(graph);

  const laidOutNodes: LaidOutDiagramNode[] = nodes.map((node) => {
    const position = graph.node(node.id) as { x: number; y: number; width: number; height: number } | undefined;
    const size = nodeSize(node);
    return {
      ...node,
      x: position ? position.x - position.width / 2 : 0,
      y: position ? position.y - position.height / 2 : 0,
      width: position?.width ?? size.width,
      height: position?.height ?? size.height,
    };
  });

  const laidOutEdges: LaidOutDiagramEdge[] = edges
    .map((edge) => {
      const value = graph.edge(edge.from, edge.to) as { points?: Array<{ x: number; y: number }> } | undefined;
      const points = value?.points ?? [];
      if (points.length < 2) return null;
      const middle = points[Math.floor(points.length / 2)];
      return {
        ...edge,
        path: smoothPath(points),
        labelX: middle.x,
        labelY: middle.y,
      };
    })
    .filter((value): value is LaidOutDiagramEdge => value !== null);

  const graphInfo = graph.graph() as { width?: number; height?: number };
  return {
    nodes: laidOutNodes,
    edges: laidOutEdges,
    width: Math.max(1, graphInfo.width ?? 1),
    height: Math.max(1, graphInfo.height ?? 1),
  };
}
