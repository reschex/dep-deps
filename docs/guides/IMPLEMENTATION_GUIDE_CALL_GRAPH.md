# Call Graph Visualization - Implementation Guide

**ADR**: [ADR-003: Call Graph Visualization](../architecture/ADR-003-call-graph-visualization.md)  
**Purpose**: Step-by-step guide for implementing call graph visualization for impact analysis

---

## Implementation Phases

This guide follows the TDD approach and hexagonal architecture principles established in the codebase.

---

## Phase 1: Core Domain Logic (Test-First)

**Goal**: Build graph traversal and tree construction logic with no infrastructure dependencies.

### 1.1 Create Edge Index Data Structure

**Test first** (`src/core/graphTraversal.test.ts`):

```typescript
import { describe, it, expect } from "vitest";
import { indexEdges, type EdgeIndex } from "./graphTraversal";
import type { CallEdge } from "./rank";

describe("indexEdges", () => {
  it("builds empty index for empty edges", () => {
    const index = indexEdges([]);
    expect(index.callersByCallee.size).toBe(0);
    expect(index.calleesByCaller.size).toBe(0);
  });

  it("indexes single edge correctly", () => {
    const edges: CallEdge[] = [
      { caller: "A", callee: "B" },
    ];
    const index = indexEdges(edges);
    
    expect(index.calleesByCaller.get("A")).toEqual(["B"]);
    expect(index.callersByCallee.get("B")).toEqual(["A"]);
  });

  it("groups multiple callees per caller", () => {
    const edges: CallEdge[] = [
      { caller: "A", callee: "B" },
      { caller: "A", callee: "C" },
    ];
    const index = indexEdges(edges);
    
    const callees = index.calleesByCaller.get("A") ?? [];
    expect(callees).toHaveLength(2);
    expect(callees).toContain("B");
    expect(callees).toContain("C");
  });

  it("groups multiple callers per callee", () => {
    const edges: CallEdge[] = [
      { caller: "A", callee: "C" },
      { caller: "B", callee: "C" },
    ];
    const index = indexEdges(edges);
    
    const callers = index.callersByCallee.get("C") ?? [];
    expect(callers).toHaveLength(2);
    expect(callers).toContain("A");
    expect(callers).toContain("B");
  });
});
```

**Implementation** (`src/core/graphTraversal.ts`):

```typescript
import type { CallEdge } from "./rank";

export type EdgeIndex = {
  readonly callersByCallee: ReadonlyMap<string, readonly string[]>;
  readonly calleesByCaller: ReadonlyMap<string, readonly string[]>;
};

export function indexEdges(edges: ReadonlyArray<CallEdge>): EdgeIndex {
  const callersByCallee = new Map<string, string[]>();
  const calleesByCaller = new Map<string, string[]>();

  for (const edge of edges) {
    // Index callers by callee (inbound edges)
    let callers = callersByCallee.get(edge.callee);
    if (!callers) {
      callers = [];
      callersByCallee.set(edge.callee, callers);
    }
    callers.push(edge.caller);

    // Index callees by caller (outbound edges)
    let callees = calleesByCaller.get(edge.caller);
    if (!callees) {
      callees = [];
      calleesByCaller.set(edge.caller, callees);
    }
    callees.push(edge.callee);
  }

  return { callersByCallee, calleesByCaller };
}
```

### 1.2 Build Caller Tree (Inbound Dependencies)

**Test first**:

```typescript
describe("buildCallerTree", () => {
  it("returns single node for symbol with no callers", () => {
    const edges: CallEdge[] = [];
    const index = indexEdges(edges);
    const tree = buildCallerTree("A", index, 3);
    
    expect(tree.symbolId).toBe("A");
    expect(tree.children).toHaveLength(0);
    expect(tree.depth).toBe(0);
    expect(tree.isRecursive).toBe(false);
  });

  it("builds tree with one level of callers", () => {
    const edges: CallEdge[] = [
      { caller: "B", callee: "A" },
      { caller: "C", callee: "A" },
    ];
    const index = indexEdges(edges);
    const tree = buildCallerTree("A", index, 3);
    
    expect(tree.children).toHaveLength(2);
    expect(tree.children.map(c => c.symbolId).sort()).toEqual(["B", "C"]);
    expect(tree.children[0].depth).toBe(1);
  });

  it("builds tree with multiple levels", () => {
    const edges: CallEdge[] = [
      { caller: "C", callee: "B" },
      { caller: "B", callee: "A" },
    ];
    const index = indexEdges(edges);
    const tree = buildCallerTree("A", index, 3);
    
    expect(tree.symbolId).toBe("A");
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0].symbolId).toBe("B");
    expect(tree.children[0].children).toHaveLength(1);
    expect(tree.children[0].children[0].symbolId).toBe("C");
    expect(tree.children[0].children[0].depth).toBe(2);
  });

  it("respects maxDepth limit", () => {
    const edges: CallEdge[] = [
      { caller: "D", callee: "C" },
      { caller: "C", callee: "B" },
      { caller: "B", callee: "A" },
    ];
    const index = indexEdges(edges);
    const tree = buildCallerTree("A", index, 2);
    
    // Should only go up to B (depth 1) and C (depth 2)
    expect(tree.children[0].symbolId).toBe("B");
    expect(tree.children[0].children[0].symbolId).toBe("C");
    expect(tree.children[0].children[0].children).toHaveLength(0); // D excluded
  });

  it("detects recursive calls (cycles)", () => {
    const edges: CallEdge[] = [
      { caller: "B", callee: "A" },
      { caller: "A", callee: "B" }, // cycle
    ];
    const index = indexEdges(edges);
    const tree = buildCallerTree("A", index, 5);
    
    expect(tree.children[0].symbolId).toBe("B");
    expect(tree.children[0].children).toHaveLength(1);
    expect(tree.children[0].children[0].symbolId).toBe("A");
    expect(tree.children[0].children[0].isRecursive).toBe(true);
    expect(tree.children[0].children[0].children).toHaveLength(0); // stop expansion
  });
});
```

**Implementation**:

```typescript
export type DependencyTree = {
  readonly symbolId: string;
  readonly children: ReadonlyArray<DependencyTree>;
  readonly depth: number;
  readonly isRecursive: boolean;
};

export function buildCallerTree(
  symbolId: string,
  index: EdgeIndex,
  maxDepth: number
): DependencyTree {
  const visited = new Set<string>();
  
  function build(id: string, depth: number, ancestors: Set<string>): DependencyTree {
    const isRecursive = ancestors.has(id);
    
    if (isRecursive || depth >= maxDepth) {
      return { symbolId: id, children: [], depth, isRecursive };
    }
    
    const callers = index.callersByCallee.get(id) ?? [];
    const newAncestors = new Set(ancestors).add(id);
    
    const children = callers.map(callerId => 
      build(callerId, depth + 1, newAncestors)
    );
    
    return { symbolId: id, children, depth, isRecursive: false };
  }
  
  return build(symbolId, 0, new Set());
}

export function buildCalleeTree(
  symbolId: string,
  index: EdgeIndex,
  maxDepth: number
): DependencyTree {
  const visited = new Set<string>();
  
  function build(id: string, depth: number, ancestors: Set<string>): DependencyTree {
    const isRecursive = ancestors.has(id);
    
    if (isRecursive || depth >= maxDepth) {
      return { symbolId: id, children: [], depth, isRecursive };
    }
    
    const callees = index.calleesByCaller.get(id) ?? [];
    const newAncestors = new Set(ancestors).add(id);
    
    const children = callees.map(calleeId => 
      build(calleeId, depth + 1, newAncestors)
    );
    
    return { symbolId: id, children, depth, isRecursive: false };
  }
  
  return build(symbolId, 0, new Set());
}
```

### 1.3 Update AnalysisResult to Include Edges

**Update type** (`src/adapter/vscode/analysisOrchestrator.ts`):

```typescript
export type AnalysisResult = {
  readonly symbols: SymbolMetrics[];
  readonly fileRollup: Map<string, number>;
  readonly edges: ReadonlyArray<CallEdge>;  // NEW
  readonly edgesCount: number;
};
```

**Update orchestrator** to preserve edges:

```typescript
// In AnalysisOrchestrator.analyze():
const edges = await callGraphProvider.collectCallEdges(maxFiles, rootUri);

// ... later, after computing symbol metrics ...

return {
  symbols: metricsWithChurn,
  fileRollup,
  edges,  // NEW: preserve edges
  edgesCount: edges.length,
};
```

**Update tests** to include edges in mock results.

---

## Phase 2: VS Code UI (Lightweight MVP)

**Goal**: Add a QuickPick command to show callers/callees for any symbol.

### 2.1 Create Command: `ddp.showCallGraph`

**Test first** (`src/adapter/vscode/showCallGraphCommand.test.ts`):

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import { ShowCallGraphCommand } from "./showCallGraphCommand";
import type { ExtensionState } from "./extensionState";
import type { AnalysisResult } from "./analysisOrchestrator";
import type { SymbolMetrics } from "../../core/analyze";

vi.mock("vscode");

describe("ShowCallGraphCommand", () => {
  let state: ExtensionState;
  let command: ShowCallGraphCommand;
  
  beforeEach(() => {
    state = new ExtensionState();
    command = new ShowCallGraphCommand(state);
  });
  
  it("shows error when no analysis exists", async () => {
    await command.execute("symbolA");
    
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      "No analysis results available. Run DDP analysis first."
    );
  });
  
  it("shows error when symbol not found", async () => {
    state.setAnalysis({
      symbols: [{ id: "symbolB", name: "foo", /* ... */ }],
      edges: [],
      fileRollup: new Map(),
      edgesCount: 0,
    });
    
    await command.execute("symbolA");
    
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      "Symbol not found in analysis results."
    );
  });
  
  it("shows QuickPick with callers and callees", async () => {
    state.setAnalysis({
      symbols: [
        { id: "A", name: "funcA", /* ... */ },
        { id: "B", name: "funcB", /* ... */ },
        { id: "C", name: "funcC", /* ... */ },
      ],
      edges: [
        { caller: "B", callee: "A" },
        { caller: "A", callee: "C" },
      ],
      fileRollup: new Map(),
      edgesCount: 2,
    });
    
    await command.execute("A");
    
    expect(vscode.window.showQuickPick).toHaveBeenCalled();
    const items = vi.mocked(vscode.window.showQuickPick).mock.calls[0][0];
    
    // Should show section headers and symbols
    expect(items).toContainEqual(expect.objectContaining({
      label: "$(call-incoming) Callers (who calls funcA)",
      kind: vscode.QuickPickItemKind.Separator,
    }));
    expect(items).toContainEqual(expect.objectContaining({
      label: "funcB",
    }));
    expect(items).toContainEqual(expect.objectContaining({
      label: "$(call-outgoing) Callees (what funcA calls)",
      kind: vscode.QuickPickItemKind.Separator,
    }));
    expect(items).toContainEqual(expect.objectContaining({
      label: "funcC",
    }));
  });
});
```

**Implementation** (`src/adapter/vscode/showCallGraphCommand.ts`):

```typescript
import * as vscode from "vscode";
import type { ExtensionState } from "./extensionState";
import { indexEdges, buildCallerTree, buildCalleeTree } from "../../core/graphTraversal";

export class ShowCallGraphCommand {
  constructor(private readonly state: ExtensionState) {}

  async execute(symbolId: string): Promise<void> {
    const analysis = this.state.lastAnalysis;
    if (!analysis) {
      void vscode.window.showErrorMessage("No analysis results available. Run DDP analysis first.");
      return;
    }

    const symbol = this.state.symbolById.get(symbolId);
    if (!symbol) {
      void vscode.window.showErrorMessage("Symbol not found in analysis results.");
      return;
    }

    const index = indexEdges(analysis.edges);
    const callerTree = buildCallerTree(symbolId, index, 1); // depth 1 for QuickPick
    const calleeTree = buildCalleeTree(symbolId, index, 1);

    const items: vscode.QuickPickItem[] = [];

    // Callers section
    items.push({
      label: `$(call-incoming) Callers (who calls ${symbol.name})`,
      kind: vscode.QuickPickItemKind.Separator,
    });

    for (const caller of callerTree.children) {
      const callerSymbol = this.state.symbolById.get(caller.symbolId);
      items.push({
        label: callerSymbol?.name ?? caller.symbolId,
        description: callerSymbol ? `F=${callerSymbol.f.toFixed(1)}` : undefined,
        detail: caller.symbolId,
      });
    }

    if (callerTree.children.length === 0) {
      items.push({
        label: "  (none)",
        description: "No callers found",
      });
    }

    // Callees section
    items.push({
      label: `$(call-outgoing) Callees (what ${symbol.name} calls)`,
      kind: vscode.QuickPickItemKind.Separator,
    });

    for (const callee of calleeTree.children) {
      const calleeSymbol = this.state.symbolById.get(callee.symbolId);
      items.push({
        label: calleeSymbol?.name ?? callee.symbolId,
        description: calleeSymbol ? `F=${calleeSymbol.f.toFixed(1)}` : undefined,
        detail: callee.symbolId,
      });
    }

    if (calleeTree.children.length === 0) {
      items.push({
        label: "  (none)",
        description: "No callees found",
      });
    }

    const selected = await vscode.window.showQuickPick(items, {
      title: `Call Graph: ${symbol.name}`,
      placeHolder: "Select a symbol to navigate",
    });

    if (selected?.detail) {
      // Navigate to selected symbol (trigger ddp.revealSymbol)
      await vscode.commands.executeCommand("ddp.revealSymbol", selected.detail);
    }
  }
}
```

### 2.2 Register Command

**Update** (`src/adapter/vscode/register.ts`):

```typescript
import { ShowCallGraphCommand } from "./showCallGraphCommand";

export function registerDdp(context: vscode.ExtensionContext): void {
  // ... existing code ...
  
  const showCallGraph = new ShowCallGraphCommand(state);
  
  context.subscriptions.push(
    vscode.commands.registerCommand("ddp.showCallGraph", (symbolId: string) => 
      showCallGraph.execute(symbolId)
    )
  );
}
```

### 2.3 Add Context Menu to Tree View

**Update** (`package.json` — contributes section):

```json
{
  "contributes": {
    "menus": {
      "view/item/context": [
        {
          "command": "ddp.showCallGraph",
          "when": "view == ddp.riskView && viewItem == ddpSymbol",
          "group": "navigation"
        }
      ]
    },
    "commands": [
      {
        "command": "ddp.showCallGraph",
        "title": "Show Call Graph",
        "category": "DDP",
        "icon": "$(graph)"
      }
    ]
  }
}
```

**Update tree item contextValue** (`src/adapter/vscode/ui/riskTreeProvider.ts`):

```typescript
// In getTreeItem():
if (element.type === "symbol") {
  // ...
  item.contextValue = "ddpSymbol";  // Enable context menu
  // ...
}
```

---

## Phase 3: CLI Output

**Goal**: Add `--show-graph <symbol-id>` flag to CLI for text-based visualization.

### 3.1 Create Graph Formatter

**Test first** (`src/core/formatCallGraph.test.ts`):

```typescript
import { describe, it, expect } from "vitest";
import { formatCallGraph, type CallGraphFormatOptions } from "./formatCallGraph";
import type { DependencyTree } from "./graphTraversal";
import type { SymbolMetrics } from "./analyze";

describe("formatCallGraph", () => {
  it("formats empty caller tree", () => {
    const tree: DependencyTree = {
      symbolId: "A",
      children: [],
      depth: 0,
      isRecursive: false,
    };
    const symbols = new Map([
      ["A", { id: "A", name: "funcA", f: 10, /* ... */ }],
    ]);
    
    const output = formatCallGraph(tree, symbols, { direction: "callers" });
    expect(output).toContain("CALLERS (who calls this):");
    expect(output).toContain("(none)");
  });

  it("formats single-level caller tree", () => {
    const tree: DependencyTree = {
      symbolId: "A",
      children: [
        { symbolId: "B", children: [], depth: 1, isRecursive: false },
      ],
      depth: 0,
      isRecursive: false,
    };
    const symbols = new Map([
      ["A", { id: "A", name: "funcA", uri: "file:///a.ts", f: 10, /* ... */ }],
      ["B", { id: "B", name: "funcB", uri: "file:///b.ts", f: 20, /* ... */ }],
    ]);
    
    const output = formatCallGraph(tree, symbols, { direction: "callers" });
    expect(output).toContain("└─ funcB");
    expect(output).toContain("F=20");
  });

  it("formats multi-level tree with proper indentation", () => {
    const tree: DependencyTree = {
      symbolId: "A",
      children: [
        {
          symbolId: "B",
          children: [
            { symbolId: "C", children: [], depth: 2, isRecursive: false },
          ],
          depth: 1,
          isRecursive: false,
        },
      ],
      depth: 0,
      isRecursive: false,
    };
    const symbols = new Map([
      ["A", { id: "A", name: "funcA", uri: "file:///a.ts", f: 10, /* ... */ }],
      ["B", { id: "B", name: "funcB", uri: "file:///b.ts", f: 20, /* ... */ }],
      ["C", { id: "C", name: "funcC", uri: "file:///c.ts", f: 30, /* ... */ }],
    ]);
    
    const output = formatCallGraph(tree, symbols, { direction: "callers" });
    expect(output).toMatch(/└─ funcB.*\n   └─ funcC/);
  });

  it("marks recursive calls", () => {
    const tree: DependencyTree = {
      symbolId: "A",
      children: [
        {
          symbolId: "B",
          children: [
            { symbolId: "A", children: [], depth: 2, isRecursive: true },
          ],
          depth: 1,
          isRecursive: false,
        },
      ],
      depth: 0,
      isRecursive: false,
    };
    const symbols = new Map([
      ["A", { id: "A", name: "funcA", uri: "file:///a.ts", f: 10, /* ... */ }],
      ["B", { id: "B", name: "funcB", uri: "file:///b.ts", f: 20, /* ... */ }],
    ]);
    
    const output = formatCallGraph(tree, symbols, { direction: "callers" });
    expect(output).toContain("funcA");
    expect(output).toContain("🔄 RECURSIVE");
  });
});
```

**Implementation** (`src/core/formatCallGraph.ts`):

```typescript
import type { DependencyTree } from "./graphTraversal";
import type { SymbolMetrics } from "./analyze";

export type CallGraphFormatOptions = {
  readonly direction: "callers" | "callees";
  readonly showRisk?: boolean;
};

export function formatCallGraph(
  tree: DependencyTree,
  symbols: ReadonlyMap<string, SymbolMetrics>,
  options: CallGraphFormatOptions
): string {
  const lines: string[] = [];
  const title = options.direction === "callers" 
    ? "CALLERS (who calls this):" 
    : "CALLEES (what this calls):";
  
  lines.push(title);
  
  if (tree.children.length === 0) {
    lines.push("(none)");
    return lines.join("\n");
  }
  
  function formatNode(node: DependencyTree, prefix: string, isLast: boolean): void {
    const symbol = symbols.get(node.symbolId);
    const name = symbol?.name ?? node.symbolId;
    const risk = symbol && options.showRisk !== false ? ` [F=${symbol.f.toFixed(1)}]` : "";
    const recursive = node.isRecursive ? " 🔄 RECURSIVE" : "";
    
    const connector = isLast ? "└─ " : "├─ ";
    lines.push(`${prefix}${connector}${name}${risk}${recursive}`);
    
    if (!node.isRecursive && node.children.length > 0) {
      const childPrefix = prefix + (isLast ? "   " : "│  ");
      node.children.forEach((child, i) => {
        formatNode(child, childPrefix, i === node.children.length - 1);
      });
    }
  }
  
  tree.children.forEach((child, i) => {
    formatNode(child, "", i === tree.children.length - 1);
  });
  
  return lines.join("\n");
}
```

### 3.2 CLI Integration

**(Deferred to CLI implementation phase — this guide focuses on architecture and core logic)**

---

## Testing Strategy

1. **Unit tests**: All core logic (`graphTraversal`, `formatCallGraph`) with 100% coverage
2. **Integration tests**: `ShowCallGraphCommand` with mocked VS Code APIs
3. **Manual testing**:
   - Run on DDP codebase itself (analyze `src/`)
   - Test with high-R symbols (e.g., `computeSymbolMetrics`)
   - Verify cycle detection with recursive functions
   - Test performance with large codebases (1000+ symbols)

---

## Configuration

Add settings to `package.json`:

```json
{
  "configuration": {
    "properties": {
      "ddp.callGraph.maxDepth": {
        "type": "number",
        "default": 3,
        "description": "Maximum depth for call graph traversal"
      },
      "ddp.callGraph.showRiskScores": {
        "type": "boolean",
        "default": true,
        "description": "Show risk scores (F, R) in call graph visualization"
      }
    }
  }
}
```

---

## Future Enhancements

- **Full Tree View Panel**: Replace QuickPick with dedicated tree view for deeper navigation
- **Export formats**: DOT, Mermaid, JSON
- **Risk-based filtering**: Show only paths with F > threshold
- **Webview visualization**: Interactive graph with D3.js/Cytoscape
- **Impact metrics**: "Changing this symbol affects N symbols (total F = X)"
- **Reverse lookup**: "Show all paths from root to this symbol"

---

## Related Files

- ADR: [ADR-003-call-graph-visualization.md](../architecture/ADR-003-call-graph-visualization.md)
- Core: `src/core/graphTraversal.ts`, `src/core/formatCallGraph.ts`
- VS Code: `src/adapter/vscode/showCallGraphCommand.ts`
- Tests: `src/core/graphTraversal.test.ts`, `src/adapter/vscode/showCallGraphCommand.test.ts`
