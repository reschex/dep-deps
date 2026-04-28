# DDP Development TODO

## Impact Tree Visualization (ADR-003) - Caller Dependency Analysis

**Status**: ✅ MVP Complete (2026-04-28)  
**Docs**: [ADR-003](../architecture/ADR-003-call-graph-visualization.md), [Implementation Guide](../guides/IMPLEMENTATION_GUIDE_CALL_GRAPH.md)

**Focus**: Show who calls a symbol (direct and indirect callers) to understand impact radius of changes. Callees are NOT shown as they are irrelevant for impact analysis.

### Phase 1: Core Domain Logic (TDD) ✅
- [x] Create `src/core/callerTree.ts` with caller indexing (implemented as `buildCallerIndex`)
  - [x] Tests for empty edges
  - [x] Tests for indexing callers by callee
- [x] Implement `callerTree()` for impact analysis
  - [x] Tests for single-level caller trees
  - [x] Tests for multi-level caller trees (transitive dependencies)
  - [x] Tests for cycle detection (mutual/recursive calls)
  - [x] Tests for maxDepth limiting
- [x] Implement impact summary metrics
  - [x] Count direct callers
  - [x] Count total affected symbols (all depths)
  - [x] Find highest-risk caller (integrated into `flattenTree`)
- [x] Update `AnalysisResult` type to include `edges: ReadonlyArray<CallEdge>`
- [x] Update `AnalysisOrchestrator` to preserve edges in result
- [x] Update all test fixtures to include edges

### Phase 2: VS Code UI (Lightweight MVP) ✅
- [x] Create `src/adapter/vscode/impactTreeCommand.ts`
  - [x] Tests with no analysis
  - [x] Tests with symbol not found
  - [x] Tests with no callers (entry point)
  - [x] Tests with multi-level caller hierarchy
  - [x] Tests showing impact summary
- [x] Register `ddp.showImpactTree` command in `register.ts`
- [x] Add context menu to Risk Tree View for symbols
- [x] Update `package.json` contributions (menus, commands)
- [x] Set `contextValue = "ddpSymbol"` on symbol tree items

**Notes**:  
- Implementation uses `callerTree.ts` (domain logic) + `impactTreeCommand.ts` (VS Code adapter)
- Fixed: "R is always 1" defect - LSP call graph now uses `vscode.commands.executeCommand` API instead of direct language API (2026-04-28)
- Improved test quality: removed unsafe non-null assertions, fixed magic index access patterns

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
- [ ] right click context menu on symbol with ddp view call graph option