# Impact Tree Visualization - Implementation Guide

**ADR**: [ADR-003: Call Graph Visualization](../architecture/ADR-003-call-graph-visualization.md)  
**Purpose**: Step-by-step guide for implementing caller tree visualization for impact analysis

**Key Principle**: When changing a function, you need to know **who calls it** (impact radius), not what it calls. This guide focuses exclusively on **caller trees** (inbound dependencies).

---

## Implementation Phases

This guide follows the TDD approach and hexagonal architecture principles established in the codebase.

---

## Phase 1: Core Domain Logic (Test-First)

**Goal**: Build graph traversal and tree construction logic with no infrastructure dependencies.

### 1.1 Create Edge Index Data Structure (Callers Only)

**Test first** (`src/core/graphTraversal.test.ts`):

```typescript
import { describe, it, expect } from "vitest";
import { indexEdges, type EdgeIndex } from "./graphTraversal";
import type { CallEdge } from "./rank";

describe("indexEdges", () => {
  it("builds empty index for empty edges", () => {
    const index = indexEdges([]);
    expect(index.callersByCallee.size).toBe(0);
  });

  it("indexes single edge correctly", () => {
    const edges: CallEdge[] = [
      { caller: "A", callee: "B" },
    ];
    const index = indexEdges(edges);
    
    expect(index.callersByCallee.get("B")).toEqual(["A"]);
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
};

export function indexEdges(edges: ReadonlyArray<CallEdge>): EdgeIndex {
  const callersByCallee = new Map<string, string[]>();

  for (const edge of edges) {
    // Index callers by callee (inbound edges for impact analysis)
    let callers = callersByCallee.get(edge.callee);
    if (!callers) {
      callers = [];
      callersByCallee.set(edge.callee, callers);
    }
    callers.push(edge.caller);
  }

  return { callersByCallee };
}
```

### 1.2 Build Caller Tree (Impact Analysis)

**Test first**:

```typescript
describe("buildCallerTree", () => {
  it("returns single node for symbol with no callers", () => {
    const edges: CallEdge[] = [];
    const index = indexEdges(edges);
    const tree = buildCallerTree("A", index, 3);
    
    expect(tree.symbolId).toBe("A");
    expect(tree.callers).toHaveLength(0);
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
    
    expect(tree.callers).toHaveLength(2);
    expect(tree.callers.map(c => c.symbolId).sort()).toEqual(["B", "C"]);
    expect(tree.callers[0].depth).toBe(1);
  });

  it("builds tree with multiple levels (transitive dependencies)", () => {
    const edges: CallEdge[] = [
      { caller: "C", callee: "B" },
      { caller: "B", callee: "A" },
    ];
    const index = indexEdges(edges);
    const tree = buildCallerTree("A", index, 3);
    
    expect(tree.symbolId).toBe("A");
    expect(tree.callers).toHaveLength(1);
    expect(tree.callers[0].symbolId).toBe("B");
    expect(tree.callers[0].callers).toHaveLength(1);
    expect(tree.callers[0].callers[0].symbolId).toBe("C");
    expect(tree.callers[0].callers[0].depth).toBe(2);
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
    expect(tree.callers[0].symbolId).toBe("B");
    expect(tree.callers[0].callers[0].symbolId).toBe("C");
    expect(tree.callers[0].callers[0].callers).toHaveLength(0); // D excluded
  });

  it("detects recursive calls (cycles)", () => {
    const edges: CallEdge[] = [
      { caller: "B", callee: "A" },
      { caller: "A", callee: "B" }, // cycle
    ];
    const index = indexEdges(edges);
    const tree = buildCallerTree("A", index, 5);
    
    expect(tree.callers[0].symbolId).toBe("B");
    expect(tree.callers[0].callers).toHaveLength(1);
    expect(tree.callers[0].callers[0].symbolId).toBe("A");
    expect(tree.callers[0].callers[0].isRecursive).toBe(true);
    expect(tree.callers[0].callers[0].callers).toHaveLength(0); // stop expansion
  });
});
```

**Implementation**:

```typescript
export type CallerTree = {
  readonly symbolId: string;
  readonly callers: ReadonlyArray<CallerTree>;  // who calls this symbol
  readonly depth: number;
  readonly isRecursive: boolean;
};

export function buildCallerTree(
  symbolId: string,
  index: EdgeIndex,
  maxDepth: number
): CallerTree {
  function build(id: string, depth: number, ancestors: Set<string>): CallerTree {
    const isRecursive = ancestors.has(id);
    
    if (isRecursive || depth >= maxDepth) {
      return { symbolId: id, callers: [], depth, isRecursive };
    }
    
    const callerIds = index.callersByCallee.get(id) ?? [];
    const newAncestors = new Set(ancestors).add(id);
    
    const callers = callerIds.map(callerId => 
      build(callerId, depth + 1, newAncestors)
    );
    
    return { symbolId: id, callers, depth, isRecursive: false };
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

**Goal**: Add a QuickPick command to show caller hierarchy for any symbol.

### 2.1 Create Command: `ddp.showImpactTree`

**Test first** (`src/adapter/vscode/showImpactTreeCommand.test.ts`):

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import { ShowImpactTreeCommand } from "./showImpactTreeCommand";
import type { ExtensionState } from "./extensionState";
import type { AnalysisResult } from "./analysisOrchestrator";
import type { SymbolMetrics } from "../../core/analyze";

vi.mock("vscode");

describe("ShowImpactTreeCommand", () => {
  let state: ExtensionState;
  let command: ShowImpactTreeCommand;
  
  beforeEach(() => {
    state = new ExtensionState();
    command = new ShowImpactTreeCommand(state);
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
  
  it("shows QuickPick with multi-level caller hierarchy", async () => {
    state.setAnalysis({
      symbols: [
        { id: "A", name: "funcA", f: 100, /* ... */ },
        { id: "B", name: "funcB", f: 80, /* ... */ },
        { id: "C", name: "funcC", f: 50, /* ... */ },
      ],
      edges: [
        { caller: "B", callee: "A" },
        { caller: "C", callee: "B" },
      ],
      fileRollup: new Map(),
      edgesCount: 2,
    });
    
    await command.execute("A");
    
    expect(vscode.window.showQuickPick).toHaveBeenCalled();
    const items = vi.mocked(vscode.window.showQuickPick).mock.calls[0][0];
    
    // Should show impact summary and hierarchical callers
    expect(items).toContainEqual(expect.objectContaining({
      label: expect.stringContaining("Impact:"),
    }));
    expect(items).toContainEqual(expect.objectContaining({
      label: "funcB",
      description: expect.stringContaining("F=80"),
    }));
    // funcC should appear nested under funcB (depth 2)
  });
  
  it("shows message for entry point (no callers)", async () => {
    state.setAnalysis({
      symbols: [{ id: "main", name: "main", /* ... */ }],
      edges: [],
      fileRollup: new Map(),
      edgesCount: 0,
    });
    
    await command.execute("main");
    
    const items = vi.mocked(vscode.window.showQuickPick).mock.calls[0][0];
    expect(items).toContainEqual(expect.objectContaining({
      label: expect.stringContaining("No callers (entry point)"),
    }));
  });
});
```

**Implementation** (`src/adapter/vscode/showImpactTreeCommand.ts`):

```typescript
import * as vscode from "vscode";
import type { ExtensionState } from "./extensionState";
import { indexEdges, buildCallerTree } from "../../core/graphTraversal";

export class ShowImpactTreeCommand {
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
    const maxDepth = vscode.workspace.getConfiguration("ddp").get<number>("impactTree.maxDepth", 3);
    const callerTree = buildCallerTree(symbolId, index, maxDepth);

    const items: vscode.QuickPickItem[] = [];

    // Impact summary
    const directCallers = callerTree.callers.length;
    const totalAffected = countAllNodes(callerTree) - 1; // exclude root
    
    items.push({
      label: directCallers === 0 
        ? "Impact: No callers (entry point)" 
        : `Impact: ${directCallers} direct caller(s), ${totalAffected} total affected`,
      kind: vscode.QuickPickItemKind.Separator,
    });

    if (callerTree.callers.length === 0) {
      items.push({
        label: "  No code depends on this symbol",
        description: "Safe to change (no impact)",
      });
    } else {
      // Build flattened list with depth indicators
      this.addCallersToList(callerTree.callers, items, 0);
    }

    const selected = await vscode.window.showQuickPick(items, {
      title: `Impact Tree: ${symbol.name} (F=${symbol.f.toFixed(1)})`,
      placeHolder: "Select a caller to navigate",
    });

    if (selected?.detail) {
      // Navigate to selected symbol
      await vscode.commands.executeCommand("ddp.revealSymbol", selected.detail);
    }
  }

  private addCallersToList(callers: readonly CallerTree[], items: vscode.QuickPickItem[], depth: number): void {
    const indent = "  ".repeat(depth);
    for (const caller of callers) {
      const callerSymbol = this.state.symbolById.get(caller.symbolId);
      const icon = caller.isRecursive ? "🔄 " : "";
      items.push({
        label: `${indent}${icon}${callerSymbol?.name ?? caller.symbolId}`,
        description: callerSymbol 
          ? `F=${callerSymbol.f.toFixed(1)} (depth ${caller.depth})`
          : `depth ${caller.depth}`,
        detail: caller.symbolId,
      });
      
      if (!caller.isRecursive && caller.callers.length > 0) {
        this.addCallersToList(caller.callers, items, depth + 1);
      }
    }
  }
}

function countAllNodes(tree: CallerTree): number {
  let count = 1;
  for (const caller of tree.callers) {
    if (!caller.isRecursive) {
      count += countAllNodes(caller);
    }
  }
  return count;
}
```

### 2.2 Register Command

**Update** (`src/adapter/vscode/register.ts`):

```typescript
import { ShowImpactTreeCommand } from "./showImpactTreeCommand";

export function registerDdp(context: vscode.ExtensionContext): void {
  // ... existing code ...
  
  const showImpactTree = new ShowImpactTreeCommand(state);
  
  context.subscriptions.push(
    vscode.commands.registerCommand("ddp.showImpactTree", (symbolId: string) => 
      showImpactTree.execute(symbolId)
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
          "command": "ddp.showImpactTree",
          "when": "view == ddp.riskView && viewItem == ddpSymbol",
          "group": "navigation"
        }
      ]
    },
    "commands": [
      {
        "command": "ddp.showImpactTree",
        "title": "Show Impact Tree",
        "category": "DDP",
        "icon": "$(graph)"
      }
    ]
  }
}
```
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

**Goal**: Add `--show-impact <symbol-id>` flag to CLI for text-based impact visualization.

###3.1 Create Impact Tree Formatter

**Test first** (`src/core/formatImpactTree.test.ts`):

```typescript
import { describe, it, expect } from "vitest";
import { formatImpactTree, formatImpactSummary } from "./formatImpactTree";
import type { CallerTree } from "./graphTraversal";
import type { SymbolMetrics } from "./analyze";

describe("formatImpactTree", () => {
  it("formats empty caller tree (entry point)", () => {
    const tree: CallerTree = {
      symbolId: "A",
      callers: [],
      depth: 0,
      isRecursive: false,
    };
    const symbols = new Map([
      ["A", { id: "A", name: "funcA", f: 10, /* ... */ }],
    ]);
    
    const output = formatImpactTree(tree, symbols);
    expect(output).toContain("IMPACT TREE (who calls this):");
    expect(output).toContain("(none - entry point)");
  });

  it("formats single-level caller tree", () => {
    const tree: CallerTree = {
      symbolId: "A",
      callers: [
        { symbolId: "B", callers: [], depth: 1, isRecursive: false },
      ],
      depth: 0,
      isRecursive: false,
    };
    const symbols = new Map([
      ["A", { id: "A", name: "funcA", uri: "file:///a.ts", f: 10, /* ... */ }],
      ["B", { id: "B", name: "funcB", uri: "file:///b.ts", f: 20, /* ... */ }],
    ]);
    
    const output = formatImpactTree(tree, symbols);
    expect(output).toContain("└─ funcB");
    expect(output).toContain("[F=20.0]");
    expect(output).toContain("(depth 1)");
  });

  it("formats multi-level tree with proper indentation", () => {
    const tree: CallerTree = {
      symbolId: "A",
      callers: [
        {
          symbolId: "B",
          callers: [
            { symbolId: "C", callers: [], depth: 2, isRecursive: false },
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
    
    const output = formatImpactTree(tree, symbols);
    expect(output).toMatch(/└─ funcB.*\n   └─ funcC/);
  });

  it("marks recursive calls", () => {
    const tree: CallerTree = {
      symbolId: "A",
      callers: [
        {
          symbolId: "B",
          callers: [
            { symbolId: "A", callers: [], depth: 2, isRecursive: true },
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
    
    const output = formatImpactTree(tree, symbols);
    expect(output).toContain("funcA");
    expect(output).toContain("🔄 RECURSIVE");
  });
});

describe("formatImpactSummary", () => {
  it("calculates impact metrics correctly", () => {
    const tree: CallerTree = {
      symbolId: "A",
      callers: [
        {
          symbolId: "B",
          callers: [
            { symbolId: "C", callers: [], depth: 2, isRecursive: false },
          ],
          depth: 1,
          isRecursive: false,
        },
      ],
      depth: 0,
      isRecursive: false,
    };
    const symbols = new Map([
      ["B", { id: "B", name: "funcB", f: 150, /* ... */ }],
      ["C", { id: "C", name: "funcC", f: 80, /* ... */ }],
    ]);
    
    const summary = formatImpactSummary(tree, symbols);
    expect(summary).toContain("Direct callers: 1");
    expect(summary).toContain("Total affected symbols: 2");
    expect(summary).toContain("Highest risk caller: funcB (F=150");
  });
});
```
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

**Implementation** (`src/core/formatImpactTree.ts`):

```typescript
import type { CallerTree } from "./graphTraversal";
import type { SymbolMetrics } from "./analyze";

export function formatImpactTree(
  tree: CallerTree,
  symbols: ReadonlyMap<string, SymbolMetrics>
): string {
  const lines: string[] = [];
  lines.push("IMPACT TREE (who calls this):");
  
  if (tree.callers.length === 0) {
    lines.push("(none - entry point)");
    return lines.join("\n");
  }
  
  function formatNode(node: CallerTree, prefix: string, isLast: boolean): void {
    const symbol = symbols.get(node.symbolId);
    const name = symbol?.name ?? node.symbolId;
    const risk = symbol ? ` [F=${symbol.f.toFixed(1)}]` : "";
    const depthInfo = ` (depth ${node.depth})`;
    const recursive = node.isRecursive ? " 🔄 RECURSIVE" : "";
    
    const connector = isLast ? "└─ " : "├─ ";
    lines.push(`${prefix}${connector}${name}${risk}${depthInfo}${recursive}`);
    
    if (!node.isRecursive && node.callers.length > 0) {
      const childPrefix = prefix + (isLast ? "   " : "│  ");
      node.callers.forEach((caller, i) => {
        formatNode(caller, childPrefix, i === node.callers.length - 1);
      });
    }
  }
  
  tree.callers.forEach((caller, i) => {
    formatNode(caller, "", i === tree.callers.length - 1);
  });
  
  return lines.join("\n");
}

export function formatImpactSummary(
  tree: CallerTree,
  symbols: ReadonlyMap<string, SymbolMetrics>
): string {
  const directCallers = tree.callers.length;
  let totalAffected = 0;
  let highestRisk = 0;
  let highestRiskSymbol = "";
  
  function countNodes(node: CallerTree): void {
    if (!node.isRecursive) {
      totalAffected++;
      const symbol = symbols.get(node.symbolId);
      if (symbol && symbol.f > highestRisk) {
        highestRisk = symbol.f;
        highestRiskSymbol = symbol.name;
      }
      node.callers.forEach(countNodes);
    }
  }
  
  tree.callers.forEach(countNodes);
  
  const lines: string[] = [];
  lines.push("");
  lines.push("IMPACT SUMMARY:");
  lines.push(`- Direct callers: ${directCallers}`);
  lines.push(`- Total affected symbols: ${totalAffected}`);
  if (highestRiskSymbol) {
    lines.push(`- Highest risk caller: ${highestRiskSymbol} (F=${highestRisk.toFixed(1)})`);
  }
  
  return lines.join("\n");
}
```
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
      "ddp.impactTree.maxDepth": {
        "type": "number",
        "default": 3,
        "description": "Maximum depth for impact tree traversal (caller hierarchy)"
      },
      "ddp.impactTree.showRiskScores": {
        "type": "boolean",
        "default": true,
        "description": "Show risk scores (F, R) in impact tree visualization"
      }
    }
  }
}
```

---

## Future Enhancements

- **Full Tree View Panel**: Replace QuickPick with dedicated tree view for deeper navigation
- **Export formats**: DOT, Mermaid, JSON (caller trees only)
- **Risk-based filtering**: Show only paths where callers have F > threshold
- **Impact quantification**: "Changing this symbol affects N symbols with combined F = X"
- **Reverse lookup**: "Show all paths from entry points to this symbol"
- **Safe-to-change indicator**: Highlight symbols with no callers or only low-F callers

---

## Related Files

- ADR: [ADR-003-call-graph-visualization.md](../architecture/ADR-003-call-graph-visualization.md)
- Core: `src/core/graphTraversal.ts`, `src/core/formatImpactTree.ts`
- VS Code: `src/adapter/vscode/showImpactTreeCommand.ts`
- Tests: `src/core/graphTraversal.test.ts`, `src/adapter/vscode/showImpactTreeCommand.test.ts`
