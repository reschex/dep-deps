# DDP Development TODO

## Impact Tree Visualization (ADR-003) - Caller Dependency Analysis

**Status**: Designed, ready for implementation  
**Docs**: [ADR-003](../architecture/ADR-003-call-graph-visualization.md), [Implementation Guide](../guides/IMPLEMENTATION_GUIDE_CALL_GRAPH.md)

**Focus**: Show who calls a symbol (direct and indirect callers) to understand impact radius of changes. Callees are NOT shown as they are irrelevant for impact analysis.

### Phase 1: Core Domain Logic (TDD)
- [ ] Create `src/core/graphTraversal.ts` with `indexEdges()` function
  - [ ] Tests for empty edges
  - [ ] Tests for indexing callers by callee
- [ ] Implement `buildCallerTree()` for impact analysis
  - [ ] Tests for single-level caller trees
  - [ ] Tests for multi-level caller trees (transitive dependencies)
  - [ ] Tests for cycle detection (mutual/recursive calls)
  - [ ] Tests for maxDepth limiting
- [ ] Implement impact summary metrics
  - [ ] Count direct callers
  - [ ] Count total affected symbols (all depths)
  - [ ] Find highest-risk caller
- [ ] Update `AnalysisResult` type to include `edges: ReadonlyArray<CallEdge>`
- [ ] Update `AnalysisOrchestrator` to preserve edges in result
- [ ] Update all test fixtures to include edges

### Phase 2: VS Code UI (Lightweight MVP)
- [ ] Create `src/adapter/vscode/showImpactTreeCommand.ts`
  - [ ] Tests with no analysis
  - [ ] Tests with symbol not found
  - [ ] Tests with no callers (entry point)
  - [ ] Tests with multi-level caller hierarchy
  - [ ] Tests showing impact summary
- [ ] Register `ddp.showImpactTree` command in `register.ts`
- [ ] Add context menu to Risk Tree View for symbols
- [ ] Update `package.json` contributions (menus, commands)
- [ ] Set `contextValue = "ddpSymbol"` on symbol tree items

### Phase 3: CLI Output  
- [ ] Create `src/core/formatImpactTree.ts` for ASCII tree formatting
  - [ ] Tests for empty caller trees (entry points)
  - [ ] Tests for single/multi-level formatting with depth indicators
  - [ ] Tests for recursive caller markers
  - [ ] Tests for impact summary formatting
- [ ] Add `--show-impact <symbol-id>` flag to CLI
- [ ] Integrate with CLI orchestrator
- [ ] Add JSON format output option with impact summary

### Phase 4: Advanced Features (Future)
- [ ] Full TreeView panel (replace QuickPick) for better deep navigation
- [ ] Graphviz DOT export format (caller trees only)
- [ ] Mermaid diagram export format (caller trees only)
- [ ] Risk-based filtering (show only high-F caller paths)
- [ ] Impact metrics: "Changing this affects N symbols with combined F = X"
- [ ] Configuration: `ddp.impactTree.maxDepth`
- [ ] "Safe to change" indicator (no callers or all callers have low F)

---

## Other Planned Features

- [ ] ddp config file in repo to overwrite vscode settings (`.ddprc.json` or similar)
- [ ] ability to feed call graphs back into AI and edit claude.md with instructions to check them before making changes and warning users when editing files with high risk score
- [ ] test against python code (integration tests with sample Python projects)
- [ ] test against Java code (integration tests with sample Java projects)
- [ ] auto load/update symbol setting on code change