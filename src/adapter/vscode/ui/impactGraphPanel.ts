import * as vscode from "vscode";
import type { ExtensionState } from "../extensionState";
import { callerTree, impactSummary } from "../../../core/callerTree";
import { layoutCallerGraph, type GraphLayout } from "../../../core/graphLayout";

const DEFAULT_MAX_DEPTH = 5;

/**
 * Open an interactive graph visualization of the caller impact tree.
 */
export function openImpactGraph(
  state: ExtensionState,
  symbolId: string,
  maxDepth = DEFAULT_MAX_DEPTH
): void {
  const analysis = state.lastAnalysis;
  if (!analysis) {
    return;
  }

  const rootMetrics = state.symbolById.get(symbolId);
  const rootName = rootMetrics?.name ?? symbolId;
  const tree = callerTree(symbolId, analysis.edges, maxDepth);
  const layout = layoutCallerGraph(symbolId, tree, state.symbolById);
  const summary = impactSummary(tree);

  const panel = vscode.window.createWebviewPanel(
    "ddp.impactGraph",
    `Impact: ${rootName}`,
    vscode.ViewColumn.Beside,
    { enableScripts: true }
  );

  panel.webview.html = renderGraphHtml(layout, rootName, summary);
}

type SummaryData = { readonly directCallers: number; readonly totalAffected: number };

function renderGraphHtml(layout: GraphLayout, rootName: string, summary: SummaryData): string {
  const graphJson = JSON.stringify(layout);
  const svgWidth = Math.max(layout.width, 400);
  const svgHeight = Math.max(layout.height, 300);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=DM+Sans:wght@400;500;700&display=swap');

  :root {
    --bg: #0c0e13;
    --bg-node: #161922;
    --bg-node-hover: #1e2230;
    --border-subtle: rgba(255,255,255,0.06);
    --text: #c8cdd8;
    --text-dim: #6b7280;
    --text-bright: #f0f2f7;
    --accent-cyan: #38bdf8;
    --accent-green: #34d399;
    --accent-amber: #fbbf24;
    --accent-red: #f87171;
    --glow-low: rgba(52, 211, 153, 0.15);
    --glow-mid: rgba(251, 191, 36, 0.15);
    --glow-high: rgba(248, 113, 113, 0.2);
    --edge-color: rgba(56, 189, 248, 0.3);
    --edge-color-active: rgba(56, 189, 248, 0.7);
    --grid-color: rgba(255,255,255,0.02);
    --root-ring: rgba(56, 189, 248, 0.4);
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: 'DM Sans', system-ui, sans-serif;
    overflow: auto;
    min-height: 100vh;
  }

  .graph-container {
    position: relative;
    width: ${svgWidth}px;
    height: ${svgHeight}px;
    margin: 24px auto;
    background:
      radial-gradient(circle at 50% 0%, rgba(56,189,248,0.04) 0%, transparent 60%),
      repeating-linear-gradient(0deg, var(--grid-color) 0px, var(--grid-color) 1px, transparent 1px, transparent 40px),
      repeating-linear-gradient(90deg, var(--grid-color) 0px, var(--grid-color) 1px, transparent 1px, transparent 40px),
      var(--bg);
  }

  .graph-title {
    text-align: center;
    padding: 20px 24px 0;
    font-family: 'DM Sans', system-ui, sans-serif;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-dim);
  }
  .graph-title span {
    color: var(--accent-cyan);
    font-weight: 700;
  }

  svg.edges {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  svg.edges path {
    fill: none;
    stroke: var(--edge-color);
    stroke-width: 1.5;
    transition: stroke 0.25s, stroke-width 0.25s;
  }

  svg.edges path.active {
    stroke: var(--edge-color-active);
    stroke-width: 2.5;
    filter: drop-shadow(0 0 4px rgba(56,189,248,0.3));
  }

  @keyframes dash-flow {
    to { stroke-dashoffset: -20; }
  }
  svg.edges path.active {
    stroke-dasharray: 8 12;
    animation: dash-flow 1s linear infinite;
  }

  .node {
    position: absolute;
    transform: translate(-50%, -50%);
    min-width: 150px;
    max-width: 220px;
    padding: 10px 14px;
    background: var(--bg-node);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s ease;
    z-index: 2;
  }

  .node:hover {
    background: var(--bg-node-hover);
    border-color: rgba(255,255,255,0.12);
    transform: translate(-50%, -50%) translateY(-2px);
    z-index: 10;
  }

  .node.risk-low {
    box-shadow: 0 0 0 1px rgba(52,211,153,0.1), 0 4px 20px rgba(0,0,0,0.3);
  }
  .node.risk-low:hover {
    box-shadow: 0 0 12px var(--glow-low), 0 4px 24px rgba(0,0,0,0.4);
  }

  .node.risk-mid {
    box-shadow: 0 0 0 1px rgba(251,191,36,0.15), 0 4px 20px rgba(0,0,0,0.3);
  }
  .node.risk-mid:hover {
    box-shadow: 0 0 14px var(--glow-mid), 0 4px 24px rgba(0,0,0,0.4);
  }

  .node.risk-high {
    box-shadow: 0 0 0 1px rgba(248,113,113,0.15), 0 4px 20px rgba(0,0,0,0.3);
    border-color: rgba(248,113,113,0.15);
  }
  .node.risk-high:hover {
    box-shadow: 0 0 16px var(--glow-high), 0 4px 24px rgba(0,0,0,0.4);
  }

  .node.root-node {
    border-color: var(--root-ring);
    box-shadow: 0 0 20px rgba(56,189,248,0.1), 0 0 0 1px var(--root-ring), 0 4px 20px rgba(0,0,0,0.4);
  }

  @keyframes root-pulse {
    0%, 100% { box-shadow: 0 0 20px rgba(56,189,248,0.1), 0 0 0 1px var(--root-ring), 0 4px 20px rgba(0,0,0,0.4); }
    50% { box-shadow: 0 0 28px rgba(56,189,248,0.18), 0 0 0 2px var(--root-ring), 0 4px 24px rgba(0,0,0,0.4); }
  }
  .node.root-node { animation: root-pulse 3s ease-in-out infinite; }

  .node.recursive-node {
    border-style: dashed;
    border-color: rgba(251,191,36,0.3);
    opacity: 0.7;
  }

  .node-name {
    font-family: 'JetBrains Mono', 'Cascadia Code', monospace;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-bright);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 4px;
  }

  .node-metrics {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .metric {
    font-family: 'JetBrains Mono', 'Cascadia Code', monospace;
    font-size: 10px;
    color: var(--text-dim);
    letter-spacing: 0.02em;
  }

  .metric-value {
    color: var(--text);
    font-weight: 600;
  }

  .metric-f .metric-value { color: var(--accent-green); }
  .node.risk-mid .metric-f .metric-value { color: var(--accent-amber); }
  .node.risk-high .metric-f .metric-value { color: var(--accent-red); }

  .node-badge {
    display: inline-block;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    padding: 1px 5px;
    border-radius: 3px;
    margin-left: auto;
  }

  .badge-root {
    background: rgba(56,189,248,0.15);
    color: var(--accent-cyan);
  }
  .badge-recursive {
    background: rgba(251,191,36,0.15);
    color: var(--accent-amber);
  }

  .node.dimmed {
    opacity: 0.25;
    transition: opacity 0.2s;
  }

  @keyframes node-enter {
    from { opacity: 0; transform: translate(-50%, -50%) translateY(12px); }
    to { opacity: 1; transform: translate(-50%, -50%) translateY(0); }
  }
  .node { animation: node-enter 0.4s ease-out backwards; }

  .legend {
    display: flex;
    justify-content: center;
    gap: 20px;
    padding: 12px;
    font-size: 10px;
    color: var(--text-dim);
    letter-spacing: 0.03em;
  }
  .legend-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 5px;
    vertical-align: middle;
  }
  .legend-dot.low { background: var(--accent-green); }
  .legend-dot.mid { background: var(--accent-amber); }
  .legend-dot.high { background: var(--accent-red); }

  .summary {
    text-align: center;
    padding: 6px 24px 0;
    font-family: 'JetBrains Mono', 'Cascadia Code', monospace;
    font-size: 11px;
    color: var(--text-dim);
    letter-spacing: 0.02em;
  }
  .summary .stat {
    color: var(--text);
    font-weight: 600;
  }
  .summary .sep {
    margin: 0 8px;
    opacity: 0.3;
  }
</style>
</head>
<body>

<div class="graph-title">Impact Analysis &mdash; <span>${escapeHtml(rootName)}</span></div>
<div class="summary"><span class="stat">${summary.directCallers}</span> direct callers<span class="sep">&middot;</span><span class="stat">${summary.totalAffected}</span> affected</div>

<div class="legend">
  <span><span class="legend-dot low"></span>F &lt; 50</span>
  <span><span class="legend-dot mid"></span>F 50&ndash;150</span>
  <span><span class="legend-dot high"></span>F &gt; 150</span>
</div>

<div class="graph-container" id="graph">
  <svg class="edges" id="edges" viewBox="0 0 ${svgWidth} ${svgHeight}"></svg>
</div>

<script>
(function() {
  const data = ${graphJson};
  const container = document.getElementById('graph');
  const svg = document.getElementById('edges');
  const nodeEls = {};

  // Render edges as bezier curves
  data.edges.forEach(function(edge, i) {
    var fromNode = data.nodes.find(function(n) { return n.id === edge.from; });
    var toNode = data.nodes.find(function(n) { return n.id === edge.to; });
    if (!fromNode || !toNode) return;

    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    var midY = (fromNode.y + toNode.y) / 2;
    var d = 'M ' + fromNode.x + ' ' + fromNode.y +
            ' C ' + fromNode.x + ' ' + midY +
            ', ' + toNode.x + ' ' + midY +
            ', ' + toNode.x + ' ' + toNode.y;
    path.setAttribute('d', d);
    path.dataset.from = edge.from;
    path.dataset.to = edge.to;
    svg.appendChild(path);
  });

  // Render nodes
  data.nodes.forEach(function(node, i) {
    var div = document.createElement('div');
    div.className = 'node';
    div.style.left = node.x + 'px';
    div.style.top = node.y + 'px';
    div.style.animationDelay = (i * 60) + 'ms';

    // Risk tier
    if (node.f >= 150) div.classList.add('risk-high');
    else if (node.f >= 50) div.classList.add('risk-mid');
    else div.classList.add('risk-low');

    // Root / recursive markers
    if (node.depth === 0) div.classList.add('root-node');
    if (node.recursive) div.classList.add('recursive-node');

    var badge = '';
    if (node.depth === 0) badge = '<span class="node-badge badge-root">target</span>';
    else if (node.recursive) badge = '<span class="node-badge badge-recursive">cycle</span>';

    div.innerHTML =
      '<div class="node-name">' + escapeHtml(node.label) + '</div>' +
      '<div class="node-metrics">' +
        '<span class="metric metric-f">F <span class="metric-value">' + node.f.toFixed(1) + '</span></span>' +
        badge +
      '</div>';

    div.dataset.id = node.id;
    nodeEls[node.id] = div;

    // Hover: highlight connected edges, dim unrelated nodes
    div.addEventListener('mouseenter', function() {
      var connectedIds = new Set();
      connectedIds.add(node.id);
      svg.querySelectorAll('path').forEach(function(p) {
        if (p.dataset.from === node.id || p.dataset.to === node.id) {
          p.classList.add('active');
          connectedIds.add(p.dataset.from);
          connectedIds.add(p.dataset.to);
        } else {
          p.classList.remove('active');
        }
      });
      Object.keys(nodeEls).forEach(function(id) {
        nodeEls[id].classList.toggle('dimmed', !connectedIds.has(id));
      });
    });

    div.addEventListener('mouseleave', function() {
      svg.querySelectorAll('path').forEach(function(p) { p.classList.remove('active'); });
      Object.keys(nodeEls).forEach(function(id) { nodeEls[id].classList.remove('dimmed'); });
    });

    container.appendChild(div);
  });

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
})();
</script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
