/**
 * Integration tests for Java call graph — end-to-end edge extraction + full pipeline.
 *
 * From: features/java-call-graph.feature
 * Scenario: Multi-layer call chain produces correct edges
 * Scenario: R > 1 through full CLI pipeline
 *
 * These tests run buildJavaCallEdges on the integration fixture
 * (java-project/) and verify the full Service → Repository → Util chain,
 * then run the full CLI pipeline to verify R > 1 for called methods.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildJavaCallEdges } from './callGraphBuild';
import { runCliAnalysis } from '../../adapter/cli/cliAnalysis';

const JAVA_PROJECT_ROOT = join(__dirname, '../../test/fixtures/cli/java-project');
const JAVA_PROJECT = join(JAVA_PROJECT_ROOT, 'src/main/java/com/example');

function fixtureUri(name: string): string {
  return pathToFileURL(join(JAVA_PROJECT, name)).toString();
}

describe('Java Call Graph Integration', () => {
  let edges: Awaited<ReturnType<typeof buildJavaCallEdges>>;

  beforeAll(async () => {
    edges = await buildJavaCallEdges([
      fixtureUri('Service.java'),
      fixtureUri('Repository.java'),
      fixtureUri('Util.java'),
    ]);
  });

  it('should produce edges from the multi-layer fixture', () => {
    expect(edges.length).toBeGreaterThan(0);
  });

  it('should find Service.processOrder → Repository.save edge', () => {
    const edge = edges.find(
      (e) => e.caller.includes('Service.java') && e.callee.includes('Repository.java'),
    );
    expect(edge).toBeDefined();
  });

  it('should find Repository.save → Util.format edge', () => {
    const edge = edges.find(
      (e) => e.caller.includes('Repository.java') && e.callee.includes('Util.java'),
    );
    expect(edge).toBeDefined();
  });

  it('should have no outbound edges from Util (leaf node)', () => {
    const fromUtil = edges.filter((e) => e.caller.includes('Util.java'));
    expect(fromUtil).toHaveLength(0);
  });

  it('should produce symbol IDs matching JavaSymbolProvider format: uri#line:0', () => {
    for (const edge of edges) {
      expect(edge.caller).toMatch(/^file:\/\/\/.*\.java#\d+:0$/);
      expect(edge.callee).toMatch(/^file:\/\/\/.*\.java#\d+:0$/);
    }
  });
});

describe('Java Full Pipeline — R > 1', () => {
  let result: Awaited<ReturnType<typeof runCliAnalysis>>;

  beforeAll(async () => {
    result = await runCliAnalysis({
      rootPath: JAVA_PROJECT_ROOT,
      excludeTests: false,
    });
  });

  it('should find Java symbols via native provider (no PMD needed)', () => {
    const javaSymbols = result.symbols.filter((s) => s.uri.includes('.java'));
    expect(javaSymbols.length).toBeGreaterThanOrEqual(5);
    // Service: processOrder, validateOrder
    // Repository: save, delete
    // Util: format
  });

  it('should produce call graph edges for Java files', () => {
    const javaEdges = result.edges.filter(
      (e) => e.caller.includes('.java') && e.callee.includes('.java'),
    );
    expect(javaEdges.length).toBeGreaterThan(0);
  });

  it('should have R > 1 for Repository.save (called by Service)', () => {
    const save = result.symbols.find(
      (s) => s.name === 'save' && s.uri.includes('Repository.java'),
    );
    expect(save).toBeDefined();
    expect(save!.r).toBeGreaterThan(1);
  });

  it('should have R > 1 for Util.format (called by Repository)', () => {
    const format = result.symbols.find(
      (s) => s.name === 'format' && s.uri.includes('Util.java'),
    );
    expect(format).toBeDefined();
    expect(format!.r).toBeGreaterThan(1);
  });

  it('should have F scores that differ between symbols', () => {
    const javaSymbols = result.symbols.filter((s) => s.uri.includes('.java'));
    const fScores = new Set(javaSymbols.map((s) => s.f));
    // Not all F scores should be identical — R differences should create variation
    expect(fScores.size).toBeGreaterThan(1);
  });
});
