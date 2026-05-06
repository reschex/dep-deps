/**
 * .ddprc.json configuration loader.
 *
 * Reads a project-level configuration file and deep-merges with defaults.
 * All fields are optional in the file — unspecified fields use defaults.
 * Unknown keys are ignored (forward-compatible).
 * Invalid JSON or missing file → defaults (never throws).
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// ── Types ────────────────────────────────────────────────────────────────────

export type FileFilterConfig = {
  readonly respectGitignore: boolean;
  readonly excludePatterns: readonly string[];
};

export type CoverageConfig = {
  readonly lcovGlob: string;
  readonly jacocoGlob: string;
};

export type CcConfig = {
  readonly useEslintForTsJs: boolean;
  readonly eslintPath: string;
  readonly pythonPath: string;
  readonly pmdPath: string;
};

export type RankConfig = {
  readonly maxIterations: number;
  readonly epsilon: number;
};

export type ChurnConfig = {
  readonly enabled: boolean;
  readonly lookbackDays: number;
};

export type AgentIntegrationConfig = {
  readonly warnThreshold: number;
  readonly blockThreshold: number;
  readonly skipTestFiles: boolean;
  readonly skipPatterns: readonly string[];
};

export type RiskThresholds = {
  readonly high: number;
  readonly medium: number;
};

/**
 * Output formatting options.
 *
 * **Status: reserved — not yet consumed.** These fields are accepted in
 * `.ddprc.json` and merged into the resolved configuration but no formatter
 * currently reads them. Setting these values has no effect today.
 *
 * Tracked in `docs/development/TODO.md` (section 4: "output config wiring").
 */
export type OutputConfig = {
  readonly topFilesCount: number;
  readonly topSymbolsCount: number;
  readonly riskThresholds: RiskThresholds;
};

/** Full resolved configuration (all fields present after merging with defaults). */
export type DdpFileConfig = {
  readonly maxFiles: number;
  readonly debug: boolean;
  readonly fileRollup: 'max' | 'sum';
  readonly fileFilter: FileFilterConfig;
  readonly coverage: CoverageConfig;
  readonly cc: CcConfig;
  readonly rank: RankConfig;
  readonly churn: ChurnConfig;
  readonly agentIntegration: AgentIntegrationConfig;
  readonly output: OutputConfig;
};

// ── Defaults ─────────────────────────────────────────────────────────────────

/**
 * Canonical defaults for all DDP configuration.
 *
 * **Single source of truth.** Any other defaults constant (e.g.
 * `DEFAULT_CONFIGURATION` in the VS Code adapter) MUST derive overlapping
 * fields from this constant — never duplicate values. A drift-prevention
 * test in `configDefaults.test.ts` enforces equality across overlapping fields.
 *
 * Priority order (highest to lowest):
 *   1. Explicit CLI args / VS Code workspace settings (user-set)
 *   2. `.ddprc.json` at project root
 *   3. These defaults
 */
export const DDP_CONFIG_DEFAULTS: DdpFileConfig = {
  maxFiles: 400,
  debug: false,
  fileRollup: 'max',
  fileFilter: {
    respectGitignore: false,
    excludePatterns: [],
  },
  coverage: {
    lcovGlob: '**/coverage/lcov.info',
    jacocoGlob: '**/jacoco.xml',
  },
  cc: {
    useEslintForTsJs: true,
    eslintPath: 'eslint',
    pythonPath: 'python',
    pmdPath: 'pmd',
  },
  rank: {
    maxIterations: 100,
    epsilon: 1e-6,
  },
  churn: {
    enabled: false,
    lookbackDays: 90,
  },
  agentIntegration: {
    warnThreshold: 100,
    blockThreshold: 500,
    skipTestFiles: true,
    skipPatterns: ['**/*.json', '**/*.md', '**/*.yml'],
  },
  output: {
    topFilesCount: 20,
    topSymbolsCount: 20,
    riskThresholds: {
      high: 20,
      medium: 10,
    },
  },
};

// ── Loader ───────────────────────────────────────────────────────────────────

/** No-op warning function (default when no logger passed). */
type WarnFn = (message: string) => void;
const noopWarn: WarnFn = () => {};

/**
 * Load `.ddprc.json` from `rootPath` and merge with defaults.
 *
 * - Missing file → defaults (silent)
 * - Invalid JSON → defaults + warning
 * - Permission error → defaults + warning
 * - Unknown keys → stripped
 * - Partial objects → deep-merged with defaults
 */
export async function loadDdpConfig(
  rootPath: string,
  warn: WarnFn = noopWarn,
): Promise<DdpFileConfig> {
  const configPath = join(rootPath, '.ddprc.json');

  const raw = await readConfigText(configPath, warn);
  if (raw === null) {
    return mergeConfig({});
  }

  const parsed = parseConfigJson(raw, warn);
  if (parsed === null) {
    return mergeConfig({});
  }

  return mergeConfig(parsed);
}

/**
 * Read the raw contents of `configPath`. Returns null when the file is
 * missing (silent) or unreadable (warns).
 */
async function readConfigText(configPath: string, warn: WarnFn): Promise<string | null> {
  try {
    return (await readFile(configPath, 'utf-8')) as string;
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === 'ENOENT') {
      return null;
    }
    warn(`.ddprc.json: could not read file — ${(err as Error).message}`);
    return null;
  }
}

/**
 * Parse `raw` as a JSON object. Returns null on invalid JSON or non-object
 * roots (arrays, primitives) and warns the caller in either case.
 */
function parseConfigJson(raw: string, warn: WarnFn): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    warn(`.ddprc.json: invalid JSON — ${(err as Error).message}`);
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    warn(`.ddprc.json: expected an object at root`);
    return null;
  }

  return parsed as Record<string, unknown>;
}

// ── Merge logic ──────────────────────────────────────────────────────────────

function mergeConfig(raw: Record<string, unknown>): DdpFileConfig {
  return {
    maxFiles: pickNumber(raw.maxFiles, DDP_CONFIG_DEFAULTS.maxFiles),
    debug: pickBoolean(raw.debug, DDP_CONFIG_DEFAULTS.debug),
    fileRollup: pickEnum(raw.fileRollup, ['max', 'sum'] as const, DDP_CONFIG_DEFAULTS.fileRollup),
    fileFilter: mergeObject(raw.fileFilter, DDP_CONFIG_DEFAULTS.fileFilter, {
      respectGitignore: pickBoolean,
      excludePatterns: pickStringArray,
    }),
    coverage: mergeObject(raw.coverage, DDP_CONFIG_DEFAULTS.coverage, {
      lcovGlob: pickString,
      jacocoGlob: pickString,
    }),
    cc: mergeObject(raw.cc, DDP_CONFIG_DEFAULTS.cc, {
      useEslintForTsJs: pickBoolean,
      eslintPath: pickString,
      pythonPath: pickString,
      pmdPath: pickString,
    }),
    rank: mergeObject(raw.rank, DDP_CONFIG_DEFAULTS.rank, {
      maxIterations: pickNumber,
      epsilon: pickNumber,
    }),
    churn: mergeObject(raw.churn, DDP_CONFIG_DEFAULTS.churn, {
      enabled: pickBoolean,
      lookbackDays: pickNumber,
    }),
    agentIntegration: mergeObject(raw.agentIntegration, DDP_CONFIG_DEFAULTS.agentIntegration, {
      warnThreshold: pickNumber,
      blockThreshold: pickNumber,
      skipTestFiles: pickBoolean,
      skipPatterns: pickStringArray,
    }),
    output: mergeOutput(raw.output, DDP_CONFIG_DEFAULTS.output),
  };
}

/** Merge an output section (has nested riskThresholds).
 *
 * Always returns a fresh object (no shared references with `defaults`).
 */
function mergeOutput(raw: unknown, defaults: OutputConfig): OutputConfig {
  const obj: Record<string, unknown> =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    topFilesCount: pickNumber(obj.topFilesCount, defaults.topFilesCount),
    topSymbolsCount: pickNumber(obj.topSymbolsCount, defaults.topSymbolsCount),
    riskThresholds: mergeObject(obj.riskThresholds, defaults.riskThresholds, {
      high: pickNumber,
      medium: pickNumber,
    }),
  };
}

// ── Merge helpers ────────────────────────────────────────────────────────────

type Picker<T> = (raw: unknown, fallback: T) => T;
type PickerMap<T extends Record<string, unknown>> = { [K in keyof T]: Picker<T[K]> };

/** Deep-merge a sub-object using a map of per-field pickers.
 *
 * Always constructs a fresh object — even when `raw` is missing — so callers
 * cannot mutate `defaults` (or any nested defaults arrays) via the returned
 * config. Each picker is responsible for its own defensive copy semantics.
 */
function mergeObject<T extends Record<string, unknown>>(
  raw: unknown,
  defaults: T,
  pickers: PickerMap<T>,
): T {
  const obj: Record<string, unknown> =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const result = {} as Record<string, unknown>;
  for (const key of Object.keys(defaults)) {
    const picker = pickers[key as keyof T];
    result[key] = picker(obj[key], defaults[key as keyof T]);
  }
  return result as T;
}

function pickNumber(raw: unknown, fallback: number): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback;
}

function pickBoolean(raw: unknown, fallback: boolean): boolean {
  return typeof raw === 'boolean' ? raw : fallback;
}

function pickString(raw: unknown, fallback: string): string {
  return typeof raw === 'string' ? raw : fallback;
}

function pickStringArray(raw: unknown, fallback: readonly string[]): readonly string[] {
  // Defensive copy in both branches: callers must not be able to mutate either
  // a parsed input or the canonical defaults via the returned array.
  if (Array.isArray(raw) && raw.every((v) => typeof v === 'string')) {
    return [...raw];
  }
  return [...fallback];
}

function pickEnum<T extends string>(
  raw: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof raw === 'string' && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

// ── Node error guard ─────────────────────────────────────────────────────────

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}
