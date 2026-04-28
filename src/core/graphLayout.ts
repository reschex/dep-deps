import type { CallerNode } from "./callerTree";
import type { SymbolMetrics } from "./analyze";

const NODE_SPACING_X = 220;
const LAYER_SPACING_Y = 140;
const PADDING = 100;

export type GraphNode = {
  readonly id: string;
  readonly label: string;
  readonly f: number;
  readonly depth: number;
  readonly recursive: boolean;
  readonly x: number;
  readonly y: number;
};

export type GraphEdge = {
  readonly from: string;
  readonly to: string;
};

export type GraphLayout = {
  readonly nodes: GraphNode[];
  readonly edges: GraphEdge[];
  readonly width: number;
  readonly height: number;
};

/**
 * Lay out a caller tree as a positioned graph.
 *
 * Root (target symbol) sits at the top center. Callers cascade downward
 * by depth, showing the "blast radius" of a change.
 */
export function layoutCallerGraph(
  rootId: string,
  callers: readonly CallerNode[],
  metricsById: ReadonlyMap<string, SymbolMetrics>
): GraphLayout {
  const layers = new Map<number, { id: string; recursive: boolean }[]>();
  const edges: GraphEdge[] = [];

  // Root at depth 0
  layers.set(0, [{ id: rootId, recursive: false }]);

  // Collect nodes and edges from the caller tree
  collectNodes(callers, rootId, layers, edges);

  // Position nodes
  const nodes: GraphNode[] = [];
  let maxLayerWidth = 0;

  for (const [, layerNodes] of layers) {
    maxLayerWidth = Math.max(maxLayerWidth, layerNodes.length);
  }

  for (const [depth, layerNodes] of layers) {
    const totalWidth = (layerNodes.length - 1) * NODE_SPACING_X;
    const startX = PADDING + (maxLayerWidth - 1) * NODE_SPACING_X / 2 - totalWidth / 2;
    const y = PADDING + depth * LAYER_SPACING_Y;

    for (let i = 0; i < layerNodes.length; i++) {
      const { id, recursive } = layerNodes[i]!;
      const metrics = metricsById.get(id);
      nodes.push({
        id,
        label: metrics?.name ?? id,
        f: metrics?.f ?? 0,
        depth,
        recursive,
        x: startX + i * NODE_SPACING_X,
        y,
      });
    }
  }

  const maxDepth = Math.max(...[...layers.keys()]);
  const width = PADDING * 2 + (maxLayerWidth - 1) * NODE_SPACING_X;
  const height = PADDING * 2 + maxDepth * LAYER_SPACING_Y;

  return { nodes, edges, width, height };
}

function collectNodes(
  callerNodes: readonly CallerNode[],
  parentId: string,
  layers: Map<number, { id: string; recursive: boolean }[]>,
  edges: GraphEdge[]
): void {
  for (const node of callerNodes) {
    let layer = layers.get(node.depth);
    if (!layer) {
      layer = [];
      layers.set(node.depth, layer);
    }
    layer.push({ id: node.id, recursive: node.recursive });
    edges.push({ from: node.id, to: parentId });
    collectNodes(node.children, node.id, layers, edges);
  }
}
