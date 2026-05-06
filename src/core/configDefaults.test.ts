/**
 * Drift-prevention tests: single source of truth for default configuration values.
 *
 * Both `DDP_CONFIG_DEFAULTS` (config-file view) and `DEFAULT_CONFIGURATION` (VS Code
 * runtime view) must agree on values for shared fields. These tests fail loudly
 * if either constant drifts away from the canonical defaults.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DDP_CONFIG_DEFAULTS } from './config';
import { DEFAULT_CONFIGURATION } from '../adapter/vscode/configuration';

const SCHEMA_PATH = join(__dirname, '../../docs/examples/ddprc.schema.json');

type SchemaNode = {
  type?: string;
  default?: unknown;
  properties?: Record<string, SchemaNode>;
};

/** Walk JSON-Schema `properties` tree, yielding every node that declares a `default`. */
function* walkSchemaDefaults(
  node: SchemaNode,
  path: readonly string[] = [],
): Generator<{ path: readonly string[]; value: unknown }> {
  if (node.default !== undefined && path.length > 0) {
    yield { path, value: node.default };
  }
  if (node.properties) {
    for (const [key, child] of Object.entries(node.properties)) {
      yield* walkSchemaDefaults(child, [...path, key]);
    }
  }
}

/** Read a nested value out of an object by string path; undefined if any segment missing. */
function getByPath(obj: unknown, path: readonly string[]): unknown {
  return path.reduce<unknown>(
    (acc, key) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined),
    obj,
  );
}

describe('default-configuration drift prevention', () => {
  it('maxFiles matches between DdpFileConfig and DdpConfiguration', () => {
    expect(DEFAULT_CONFIGURATION.maxFiles).toBe(DDP_CONFIG_DEFAULTS.maxFiles);
  });

  it('debugEnabled matches between DdpFileConfig and DdpConfiguration', () => {
    expect(DEFAULT_CONFIGURATION.debugEnabled).toBe(DDP_CONFIG_DEFAULTS.debug);
  });

  it('fileRollup matches', () => {
    expect(DEFAULT_CONFIGURATION.fileRollup).toBe(DDP_CONFIG_DEFAULTS.fileRollup);
  });

  it('coverage.lcovGlob matches', () => {
    expect(DEFAULT_CONFIGURATION.coverage.lcovGlob).toBe(DDP_CONFIG_DEFAULTS.coverage.lcovGlob);
  });

  it('coverage.jacocoGlob matches', () => {
    expect(DEFAULT_CONFIGURATION.coverage.jacocoGlob).toBe(DDP_CONFIG_DEFAULTS.coverage.jacocoGlob);
  });

  it('rank.maxIterations matches', () => {
    expect(DEFAULT_CONFIGURATION.rank.maxIterations).toBe(DDP_CONFIG_DEFAULTS.rank.maxIterations);
  });

  it('rank.epsilon matches', () => {
    expect(DEFAULT_CONFIGURATION.rank.epsilon).toBe(DDP_CONFIG_DEFAULTS.rank.epsilon);
  });

  it('cc.useEslintForTsJs matches', () => {
    expect(DEFAULT_CONFIGURATION.cc.useEslintForTsJs).toBe(DDP_CONFIG_DEFAULTS.cc.useEslintForTsJs);
  });

  it('cc.eslintPath matches', () => {
    expect(DEFAULT_CONFIGURATION.cc.eslintPath).toBe(DDP_CONFIG_DEFAULTS.cc.eslintPath);
  });

  it('cc.pythonPath matches', () => {
    expect(DEFAULT_CONFIGURATION.cc.pythonPath).toBe(DDP_CONFIG_DEFAULTS.cc.pythonPath);
  });

  it('cc.pmdPath matches', () => {
    expect(DEFAULT_CONFIGURATION.cc.pmdPath).toBe(DDP_CONFIG_DEFAULTS.cc.pmdPath);
  });

  it('churn.enabled matches', () => {
    expect(DEFAULT_CONFIGURATION.churn.enabled).toBe(DDP_CONFIG_DEFAULTS.churn.enabled);
  });

  it('churn.lookbackDays matches', () => {
    expect(DEFAULT_CONFIGURATION.churn.lookbackDays).toBe(DDP_CONFIG_DEFAULTS.churn.lookbackDays);
  });

  it('fileFilter.respectGitignore matches', () => {
    expect(DEFAULT_CONFIGURATION.fileFilter.respectGitignore).toBe(DDP_CONFIG_DEFAULTS.fileFilter.respectGitignore);
  });

  it('fileFilter.excludePatterns matches', () => {
    expect(DEFAULT_CONFIGURATION.fileFilter.excludePatterns).toEqual(DDP_CONFIG_DEFAULTS.fileFilter.excludePatterns);
  });
});

describe('reflection-based default-configuration drift prevention', () => {
  /**
   * Top-level sections of `DDP_CONFIG_DEFAULTS` that intentionally have no
   * mirror in `DEFAULT_CONFIGURATION` (VS Code runtime view). These sections
   * are config-file-only — agent integration thresholds and output formatting
   * options that the VS Code extension does not consume.
   *
   * Adding to this list is a deliberate decision: the reflection test below
   * will fail if a shared field is added to `DDP_CONFIG_DEFAULTS` without
   * mirroring on `DEFAULT_CONFIGURATION`, except for the explicit allow-list.
   */
  const DDP_ONLY_TOP_LEVEL = new Set(['agentIntegration', 'output']);

  /**
   * Field-name remapping between the two configurations. The two views use
   * different names for the same concept (`debug` ↔ `debugEnabled`) — the
   * reflection walker uses this map to compare semantically-equal fields.
   */
  const KEY_REMAP: Record<string, string> = {
    debug: 'debugEnabled',
  };

  type Leaf = { readonly path: readonly string[]; readonly value: unknown };

  /** Walk every leaf (non-object, non-null) under `obj`, yielding `{path, value}`. */
  function* walkLeaves(obj: unknown, path: readonly string[] = []): Generator<Leaf> {
    if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) {
      for (const [key, child] of Object.entries(obj)) {
        yield* walkLeaves(child, [...path, key]);
      }
      return;
    }
    if (path.length > 0) yield { path, value: obj };
  }

  /** Look up `path` in `obj`, applying `KEY_REMAP` to each segment. */
  function lookupRemapped(obj: unknown, path: readonly string[]): unknown {
    return path.reduce<unknown>((acc, key) => {
      if (acc && typeof acc === 'object') {
        const effectiveKey = KEY_REMAP[key] ?? key;
        return (acc as Record<string, unknown>)[effectiveKey];
      }
      return undefined;
    }, obj);
  }

  for (const { path, value } of walkLeaves(DDP_CONFIG_DEFAULTS)) {
    if (DDP_ONLY_TOP_LEVEL.has(path[0])) continue;
    const dottedPath = path.join('.');
    it(`DDP_CONFIG_DEFAULTS.${dottedPath} mirrored on DEFAULT_CONFIGURATION`, () => {
      const mirror = lookupRemapped(DEFAULT_CONFIGURATION, path);
      expect(mirror).not.toBeUndefined();
      expect(mirror).toEqual(value);
    });
  }
});

describe('schema-defaults drift prevention', () => {
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf-8')) as SchemaNode;

  // Generate one test per `default` declared in the schema. If the test name
  // appears in the failure list, the schema's documented default disagrees
  // with the canonical DDP_CONFIG_DEFAULTS.
  for (const { path, value } of walkSchemaDefaults(schema)) {
    const dottedPath = path.join('.');
    it(`schema default for "${dottedPath}" matches DDP_CONFIG_DEFAULTS`, () => {
      const actual = getByPath(DDP_CONFIG_DEFAULTS, path);
      expect(actual).toEqual(value);
    });
  }
});
