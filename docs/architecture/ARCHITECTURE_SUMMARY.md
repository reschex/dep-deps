# GitHub Actions DDP Analysis - Implementation Roadmap

## Executive Summary

This document provides the implementation roadmap for enabling DDP (Dependable Dependencies) risk analysis in GitHub Actions CI/CD pipelines.

> **Architecture Decision**: See [ADR-001](./ADR-001-cli-analysis-architecture.md) for the architecture rationale and technical decisions.

**Status:** Implementation In Progress  
**Complexity:** Medium (estimated 2-3 weeks for MVP)  
**Risk Level:** Low (reuses existing tested domain logic)

---

## What You Get

### User-Facing Features

1. **Headless CLI Analysis**
   - Run DDP analysis without VS Code
   - Command-line interface with flexible configuration
   - Multiple output formats (JSON, GitHub markdown)

2. **GitHub Actions Integration**
   - Automated risk analysis on every PR/push
   - Sortable HTML tables in GitHub Actions summary
   - Color-coded risk indicators (red/yellow/green)
   - Historical tracking via artifacts

3. **Risk Metrics Dashboard**
   - File-level rollup (max/avg/sum of symbol risks)
   - Symbol-level detail (CC, coverage, CRAP, rank)
   - Trend analysis (compare PR vs base branch)
   - Threshold enforcement (fail builds on high risk)

4. **AI Agent Integration**
   - PreToolUse hook: automatic risk warnings before any file edit
   - `ddp callers` command: caller tree output in JSON and human-readable text
   - MCP server: four tools for active agent querying (`ddp_analyze_file`, `ddp_caller_tree`, `ddp_high_risk_symbols`, `ddp_workspace_hotspots`)
   - Configurable warn/block thresholds per project via `.ddprc.json`
   - See [ADR-002](./ADR-004-ai-agent-integration.md) for architecture rationale

### Technical Benefits

- **Architecture validation:** Proves ports/adapters design works
- **Code reuse:** Zero duplication of domain logic
- **Test coverage:** Maintains >95% coverage
- **Future-proof:** Easy to add new output formats (SARIF, CodeClimate, etc.)

---

## Architecture

See [ADR-001-cli-analysis-architecture.md](./ADR-001-cli-analysis-architecture.md) for complete architecture details, including:
- Component stack diagram
- Symbol extraction strategy
- Call graph strategy
- Coverage integration approach
- Output format specifications

**Key Principles:**
1. **Separation of Concerns:** VS Code adapters ≠ Node.js adapters
2. **Single Responsibility:** CLI only orchestrates, doesn't compute
3. **Dependency Inversion:** Domain depends on ports, not infrastructure
4. **Open/Closed:** Easy to add new output formats without changing core

---

## Implementation Plan

### Phase 1: MVP (TypeScript/JavaScript Only)

**Goal:** Get basic analysis working in CI with simplified ranking (R=1)

**Deliverables:**
- [ ] Node.js adapters (document, symbol, coverage)
- [ ] CLI entry point with arg parsing
- [ ] JSON output formatter
- [ ] GitHub Actions summary formatter
- [ ] Example workflow file
- [ ] Documentation + README update

**Estimated Effort:** 1-2 weeks  
**Test Coverage Target:** >95%

### Phase 2: Full Call Graph Analysis

**Goal:** Calculate proper PageRank (R) for accurate failure risk (F)

**Deliverables:**
- [ ] NodeCallGraphProvider using TS Compiler API
- [ ] Call edge extraction (caller → callee)
- [ ] Cross-file reference resolution
- [ ] Validation: CLI results match VS Code extension

**Estimated Effort:** 1 week  
**Test Coverage Target:** >95%

### Phase 3: Multi-Language Support

**Goal:** Extend to Python and Java codebases

**Deliverables:**
- [ ] Python symbol extraction (ast module or tree-sitter)
- [ ] Java symbol extraction (javaparser or tree-sitter)
- [ ] Language-specific call graph providers
- [ ] Multi-language test fixtures

**Estimated Effort:** 2 weeks  
**Test Coverage Target:** >90%

### Phase 4: Advanced Features

**Goal:** Production-ready enhancements

**Deliverables:**
- [ ] GitHub Action package (Docker-based)
- [ ] PR comment bot (risk delta)
- [ ] Trend tracking (risk over time charts)
- [ ] SARIF output format
- [ ] Performance optimization (parallel processing)

**Estimated Effort:** 2-3 weeks

### Phase 5: AI Agent Integration

**Goal:** Surface DDP risk data to AI coding agents at the point of code modification

**Deliverables:**
- [ ] `ddp callers` sub-command with `--format json|text|markdown`
- [ ] Risk level classification (LOW / MEDIUM / HIGH / CRITICAL)
- [ ] `.claude/hooks/ddp-pre-edit-check.js` (PreToolUse hook)
- [ ] `.claude/settings.json` hook registration
- [ ] MCP server (`mcp-server/index.ts`) with four DDP tools
- [ ] CLAUDE.md Code Modification Safety Protocol

**Estimated Effort:** 9–13 hours  
**Architecture:** See [ADR-002](./ADR-004-ai-agent-integration.md)

---

## Implementation Details

> **Technical Decisions**: See [ADR-001](./ADR-001-cli-analysis-architecture.md) for approved decisions, rejected alternatives, and detailed rationale.

---

## File Structure

```
dep-deps/
├── src/
│   ├── core/              # Domain logic (unchanged)
│   ├── ddp/               # VS Code adapters (unchanged)
│   └── cli/               # CLI infrastructure
│       ├── adapters/
│       │   ├── nodeDocument.ts
│       │   ├── nodeSymbol.ts
│       │   ├── nodeCoverage.ts
│       │   ├── nodeCallGraph.ts
│       │   ├── nodeLogger.ts
│       │   └── index.ts
│       ├── formatters/
│       │   ├── json.ts
│       │   ├── callersText.ts   # NEW (Phase 5): LLM-readable caller tree
│       │   ├── callersJson.ts   # NEW (Phase 5): MCP-ready JSON output
│       │   ├── githubSummary.ts
│       │   └── index.ts
│       ├── analyze.ts       # CLI entry point (ddp analyze)
│       ├── callers.ts       # NEW (Phase 5): ddp callers sub-command
│       └── types.ts
├── mcp-server/              # NEW (Phase 5): MCP server
│   └── index.ts             # Four DDP tools over stdio
├── .claude/                 # NEW (Phase 5): Claude Code integration
│   ├── settings.json        # Hook registration + MCP server registration
│   └── hooks/
│       └── ddp-pre-edit-check.js   # PreToolUse hook script
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── ddp-analysis-example.yml
├── .ddprc.json              # Configuration (agentIntegration thresholds)
├── docs/
│   └── examples/
│       ├── ddprc.example.json
│       └── ddprc.schema.json
└── package.json

```

---

## Dependencies to Add

```json
{
  "dependencies": {
    "commander": "^12.0.0",
    "glob": "^10.3.10",
    "typescript": "^5.3.3"  // Already present
  },
  "devDependencies": {
    "@types/node": "^20.10.0"  // Already present
  },
  "bin": {
    "ddp-analyze": "./out/cli/analyze.js"
  },
  "scripts": {
    "cli": "node out/cli/analyze.js",
    "cli:example": "npm run compile && npm run cli -- --root . --format github-summary"
  }
}
```

---

## Configuration

### CLI Arguments

```bash
# Analysis command (existing)
ddp analyze [options]

Options:
  --root <path>           Workspace root directory (default: cwd)
  --config <path>         Config file path (default: .ddprc.json)
  --output <path>         Output file (default: stdout)
  --format <type>         Output format: json|github-summary (default: json)
  --max-files <n>         Max files to analyze (default: 1000)
  --exclude-tests         Exclude test files (default: true)
  --lcov-glob <pattern>   LCOV file glob (default: **/coverage/lcov.info)
  --jacoco-glob <pattern> JaCoCo file glob
  --verbose, -v           Enable verbose logging
  --help, -h              Show help
  --version, -V           Show version

# Caller tree command (Phase 5 — AI agent integration)
ddp callers [options]

Options:
  --file <path>           Source file containing the symbol (required)
  --symbol <name>         Symbol name to trace callers for (required)
  --depth <n>             Maximum caller depth (default: 5)
  --format <type>         Output format: text|json|markdown (default: text)
                            text     — LLM-readable indented tree with risk header
                            json     — CallersResult schema for MCP / programmatic use
                            markdown — GitHub PR comment format
```

### Configuration File (.ddprc.json)

See [docs/examples/ddprc.example.json](../../examples/ddprc.example.json) for full schema.

---

## Output Formats

### JSON Output

**Schema:**
```typescript
interface AnalysisOutput {
  timestamp: string;
  config: DdpConfiguration;
  summary: {
    filesAnalyzed: number;
    symbolsAnalyzed: number;
    edgesCount: number;
    averageCC: number;
    averageCoverage: number;
  };
  files: FileRisk[];
}

interface FileRisk {
  uri: string;
  path: string;  // Relative to workspace root
  rollupScore: number;
  symbols: SymbolRisk[];
}

interface SymbolRisk {
  id: string;
  name: string;
  line: number;
  cc: number;
  t: number;
  crap: number;
  r: number;
  f: number;
  g: number;
  fPrime: number;
}
```

### GitHub Actions Summary Output

Markdown with embedded HTML:
- Summary statistics (files, symbols, averages)
- Top 20 riskiest files (sortable table)
- Top 20 riskiest symbols (expandable)
- Color coding (red >20, yellow >10, green ≤10)
- Inline sorting JavaScript

**Example:**
```markdown
# DDP Analysis Report

## Summary
- **Files Analyzed:** 45
- **Symbols Analyzed:** 423
- **Average CC:** 3.2
- **Average Coverage:** 78%

## Top Risky Files

<table id="ddp-files">
  <thead>
    <tr>
      <th onclick="sortTable(0)">File ⇅</th>
      <th onclick="sortTable(1)">Max F' ⇅</th>
      <!-- ... -->
    </tr>
  </thead>
  <tbody>
    <!-- rows with class="risk-high|medium|low" -->
  </tbody>
</table>

<script>/* sorting logic */</script>
<style>/* color coding */</style>
```

---

## Testing Strategy

### Unit Tests

Each new component has comprehensive unit tests:

- **NodeDocumentProvider:** File discovery, exclusion, document loading
- **NodeSymbolProvider:** Function extraction, line ranges, edge cases
- **NodeCoverageProvider:** LCOV/JaCoCo parsing, URI mapping
- **JSON Formatter:** Schema validation, URI normalization
- **GitHub Summary Formatter:** Table generation, sorting, color coding

**Coverage Target:** >95%

### Integration Tests

End-to-end CLI testing:

- Prepare fixture workspace (small TS project with coverage)
- Run CLI with various configurations
- Validate JSON output schema
- Compare metrics against expected values

### Validation Tests

**Comparison test:**
1. Run same codebase through VS Code extension
2. Run same codebase through CLI
3. Assert results match (symbol count, CC, coverage, CRAP)

---

## Performance Targets

| Workspace Size | Expected Time | Memory |
|----------------|---------------|--------|
| 100 files      | <5s           | <100MB |
| 500 files      | <30s          | <500MB |
| 1000 files     | <60s          | <1GB   |

**Optimization opportunities (later):**
- Parallel file processing (worker threads)
- AST caching
- Incremental analysis

---

## Rollout Plan

### Week 1-2: MVP Implementation

**Owner:** software-engineer agent

1. Implement NodeDocumentProvider (TDD)
2. Implement NodeCoverageProvider (TDD)
3. Implement NodeSymbolProvider (TDD)
4. Implement NodeCallGraphProvider stub (TDD)
5. Implement CLI entry point (TDD)
6. Implement JSON formatter (TDD)
7. Implement GitHub summary formatter (TDD)

**Milestone:** CLI produces JSON output for TS/JS projects

### Week 2: GitHub Actions Integration

**Owner:** software-engineer agent

1. Create example workflow file
2. Test in CI environment
3. Validate summary rendering
4. Document usage in README

**Milestone:** Working GitHub Actions workflow with sortable tables

### Week 3+: Enhancements

**Owner:** software-engineer agent (Phase 2+)

1. Implement full call graph provider
2. Add multi-language support
3. Add advanced features (PR comments, trend tracking)

---

## Success Metrics

### Technical Metrics

- [ ] CLI analysis matches VS Code extension results (±1% variance)
- [ ] Test coverage >95% for all new code
- [ ] CI execution time <30s for 500-file workspace
- [ ] Zero regression in existing VS Code extension functionality

### User Experience Metrics

- [ ] GitHub Actions summary is readable and sortable
- [ ] Users can identify top risky files at a glance
- [ ] Color coding helps parse risk levels quickly
- [ ] Workflow integration requires <10 lines of YAML

### Business Metrics

- [ ] Enables risk-driven test prioritization in CI
- [ ] Provides historical risk trend data
- [ ] Supports code review decisions (PR risk delta)
- [ ] Validates architecture investment (ports/adapters ROI)

---

## Risk Assessment

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| TS Compiler API complexity | Medium | Medium | Start simple, iterate |
| Performance issues (large repos) | Low | Medium | Profile early, optimize if needed |
| GitHub Actions rendering quirks | Low | Low | Test in real CI environment |
| Coverage file parsing edge cases | Medium | Low | Reuse tested parsers |

### Project Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Scope creep (multi-language) | Medium | Medium | Strict phase boundaries |
| Maintenance burden (two adapter sets) | Low | Medium | Shared test fixtures |
| Breaking changes in TS Compiler API | Low | Low | Pin version, test upgrades |

---

## Next Steps

### Immediate Actions (Before Implementation)

1. **Review and approve ADR-001**
   - Stakeholder: Architect (you)
   - Decision: Approve/request changes
   - Deliverable: Signed-off ADR

2. **Create implementation epic/issues**
   - Stakeholder: Project manager
   - Deliverable: GitHub issues for each component

3. **Assign to software-engineer agent**
   - Stakeholder: Architect
   - Deliverable: Clear handoff with documentation

### Implementation Phase

4. **Week 1-2: MVP development** (software-engineer agent)
   - Follow TDD discipline (Red-Green-Refactor)
   - Maintain >95% test coverage
   - Daily progress updates

5. **Week 2: Integration testing** (qa-engineer agent)
   - Validate CLI in CI environment
   - Test various configurations
   - Document edge cases

6. **Week 3: Documentation** (software-engineer agent)
   - Update README with CLI usage
   - Add examples and troubleshooting
   - Create video tutorial (optional)

---

## Documentation References

- **[ADR-001: CLI Analysis Architecture](./ADR-001-cli-analysis-architecture.md)** — CLI/CI architectural decisions and trade-offs
- **[ADR-002: AI Agent Integration](./ADR-004-ai-agent-integration.md)** — PreToolUse hook, MCP server, and caller-tree output decisions
- **[Implementation Guide: CLI](../guides/IMPLEMENTATION_GUIDE_CLI.md)** — Step-by-step CLI implementation guide
- **[Implementation Guide: AI Agent Integration](../guides/AI_AGENT_INTEGRATION_GUIDE.md)** — Hook and MCP server implementation
- **[Example Workflow](./.github/workflows/ddp-analysis-example.yml)** — GitHub Actions workflow template
- **[Configuration Schema](../../examples/ddprc.schema.json)** — JSON schema for .ddprc.json
- **[Example Configuration](../../examples/ddprc.example.json)** — Sample configuration file

---

## Questions & Answers

### Q: Why not use VS Code headless mode?
**A:** Too heavy for CI (requires X11/Xvfb), slow startup (~20s), fragile extension host. Node.js adapters are faster, lighter, more reliable.

### Q: Why start with simplified ranking (R=1)?
**A:** Delivers 80% value (identifies complex untested code) with 20% effort. Full call graph analysis is complex and can be added in Phase 2 without changing architecture.

### Q: How do we keep CLI and extension in sync?
**A:** They share the same domain logic (AnalysisOrchestrator). Only adapters differ. Comparison tests validate results match.

### Q: Can we use this for Python/Java projects?
**A:** Yes, but not in MVP. Phase 3 adds multi-language support. Architecture supports it via language-specific adapters.

### Q: What if coverage files are missing?
**A:** Analysis continues with T=0 (no coverage). CRAP = CC² + CC. Risk is still computed, but less accurate.

### Q: How does this compare to SonarQube/CodeClimate?
**A:** Different focus. Those are general code quality tools. DDP is specialized for failure risk based on Gorman's research (rank × CRAP). Can complement each other.

---

## Approval

**Prepared by:** Architect Agent  
**Date:** 2026-04-27  
**Status:** Approved

**Approvers:**
- [x] Technical Lead
- [x] Software Engineer (implementer)
- [x] QA Engineer (validator)

**Approved:** ___REschenburg__  **Date:** __27/4/2026__

---

**Ready to implement?** Proceed to [Implementation Guide](./IMPLEMENTATION_GUIDE_CLI.md) for detailed technical specifications.
