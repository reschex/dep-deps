/**
 * Integration report — surfaces which data sources were used during analysis.
 *
 * Built by the orchestrator after each analysis run, consumed by the
 * tree view to show a collapsible "Integrations" status section.
 */

/** Status of a single integration source. */
export type IntegrationStatus = "active" | "fallback" | "inactive";

/** One row in the integrations panel. */
export type IntegrationEntry = {
  /** Category label shown in the tree, e.g. "CC", "Coverage". */
  readonly category: string;
  /** Source name, e.g. "ESLint", "LCOV", "Native TS Compiler". */
  readonly source: string;
  /** Extra detail shown as description, e.g. "(42 files)", "(12 edges)". */
  readonly detail: string;
  /** Controls the icon: pass (green ✓), warning (yellow △), circle-slash (grey ∅). */
  readonly status: IntegrationStatus;
  /** Markdown text shown in the hover tooltip for this entry. */
  readonly tooltip?: string;
  /** VS Code settings search key opened when the user clicks this entry, e.g. "ddp.churn". */
  readonly settingsKey?: string;
};

/** Full integration report for one analysis run. */
export type IntegrationReport = {
  readonly entries: readonly IntegrationEntry[];
};
