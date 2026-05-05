/**
 * Integration tests for Java call graph — end-to-end edge extraction.
 *
 * From: features/java-call-graph.feature
 * Scenario: Multi-layer call chain produces correct edges
 *
 * These tests run buildJavaCallEdges on the integration fixture
 * (java-project/) and verify the full Service → Repository → Util chain.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildJavaCallEdges } from './callGraphBuild';

const JAVA_PROJECT = join(__dirname, '../../test/fixtures/cli/java-project/src/main/java/com/example');

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
