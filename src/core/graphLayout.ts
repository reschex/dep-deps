import type { CallerNode } from "./callerTree";
import type { SymbolMetrics } from "./analyze";

const NODE_SPACING_X = 220;
const LAYER_SPACING_Y = 140;
const PADDING = 100;

export type GraphNode = {
  readonly id: string;
  readonly label: string;
  readonly f: number;
  readonly file: string;
  readonly depth: number;
  readonly recursive: boolean;
  readonly x: number;
  readonly y: number;
};

export type GraphEdge = {
  readonly from: string;
  readonly to: string;
};

export type FileGroup = {
  readonly file: string;
  readonly nodeIds: readonly string[];
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type GraphLayout = {
  readonly nodes: GraphNode[];
  readonly edges: GraphEdge[];
  readonly fileGroups: FileGroup[];
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
        file: metrics ? fileNameFromUri(metrics.uri) : "",
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

  const fileGroups = computeFileGroups(nodes);

  return { nodes, edges, fileGroups, width, height };
}

/** Extract the file name from a URI string (e.g. "file:///src/foo/bar.ts" → "bar.ts"). */
function fileNameFromUri(uri: string): string {
  const lastSlash = Math.max(uri.lastIndexOf("/"), uri.lastIndexOf("\\"));
  return lastSlash >= 0 ? uri.slice(lastSlash + 1) : uri;
}

const FILE_GROUP_PADDING = 30;

// Groups by basename only; files with identical names in different directories
// will be merged into the same group. Full-path grouping can be added when needed.
function computeFileGroups(nodes: readonly GraphNode[]): FileGroup[] {
  const byFile = new Map<string, GraphNode[]>();
  for (const node of nodes) {
    if (!node.file) continue;
    let group = byFile.get(node.file);
    if (!group) {
      group = [];
      byFile.set(node.file, group);
    }
    group.push(node);
  }

  const groups: FileGroup[] = [];
  for (const [file, fileNodes] of byFile) {
    if (fileNodes.length < 2) continue;
    const xs = fileNodes.map((n) => n.x);
    const ys = fileNodes.map((n) => n.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    groups.push({
      file,
      nodeIds: fileNodes.map((n) => n.id),
      x: minX - FILE_GROUP_PADDING,
      y: minY - FILE_GROUP_PADDING,
      width: maxX - minX + FILE_GROUP_PADDING * 2,
      height: maxY - minY + FILE_GROUP_PADDING * 2,
    });
  }
  return groups;
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
