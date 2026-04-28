# DDP Development TODO

## Call Graph Visualization (ADR-003)

**Status**: Designed, ready for implementation  
**Docs**: [ADR-003](../architecture/ADR-003-call-graph-visualization.md), [Implementation Guide](../guides/IMPLEMENTATION_GUIDE_CALL_GRAPH.md)

### Phase 1: Core Domain Logic (TDD)
- [ ] Create `src/core/graphTraversal.ts` with `indexEdges()` function
  - [ ] Tests for empty edges
  - [ ] Tests for single/multiple callers and callees
- [ ] Implement `buildCallerTree()` and `buildCalleeTree()`
  - [ ] Tests for single-level trees
  - [ ] Tests for multi-level trees
  - [ ] Tests for cycle detection
  - [ ] Tests for maxDepth limiting
- [ ] Update `AnalysisResult` type to include `edges: ReadonlyArray<CallEdge>`
- [ ] Update `AnalysisOrchestrator` to preserve edges in result
- [ ] Update all test fixtures to include edges

### Phase 2: VS Code UI (Lightweight MVP)
- [ ] Create `src/adapter/vscode/showCallGraphCommand.ts`
  - [ ] Tests with no analysis
  - [ ] Tests with symbol not found
  - [ ] Tests with callers and callees
- [ ] Register `ddp.showCallGraph` command in `register.ts`
- [ ] Add context menu to Risk Tree View for symbols
- [ ] Update `package.json` contributions (menus, commands)
- [ ] Set `contextValue = "ddpSymbol"` on symbol tree items

### Phase 3: CLI Output  
- [ ] Create `src/core/formatCallGraph.ts` for ASCII tree formatting
  - [ ] Tests for empty trees
  - [ ] Tests for single/multi-level formatting
  - [ ] Tests for recursive call markers
- [ ] Add `--show-graph <symbol-id>` flag to CLI
- [ ] Integrate with CLI orchestrator
- [ ] Add JSON format output option

### Phase 4: Advanced Features (Future)
- [ ] Full Tree View panel (replace QuickPick)
- [ ] Graphviz DOT export format
- [ ] Mermaid diagram export format
- [ ] Risk-based filtering (show only high-F paths)
- [ ] Impact analysis ("changing this affects N symbols")
- [ ] Configuration: `ddp.callGraph.maxDepth`

---

## Other Planned Features

- [ ] ddp config file in repo to overwrite vscode settings (`.ddprc.json` or similar)
- [ ] ability to feed call graphs back into AI and edit claude.md with instructions to check them before making changes and warning users when editing files with high risk score
- [ ] test against python code (integration tests with sample Python projects)
- [ ] test against Java code (integration tests with sample Java projects)
- [ ] auto load/update symbol setting on code change