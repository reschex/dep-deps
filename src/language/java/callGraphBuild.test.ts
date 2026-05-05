/**
 * Tests for buildJavaCallEdges — call graph extraction from Java source files.
 *
 * From: features/java-call-graph.feature
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { buildJavaCallEdges } from './callGraphBuild';

const FIXTURES = join(__dirname, 'fixtures', 'callGraph');

function fixtureUri(name: string): string {
  return pathToFileURL(join(FIXTURES, name)).toString();
}

describe('buildJavaCallEdges', () => {
  describe('Scenario: Extract cross-file call edge via field reference', () => {
    let edges: Awaited<ReturnType<typeof buildJavaCallEdges>>;
    beforeAll(async () => {
      edges = await buildJavaCallEdges([
        fixtureUri('Service.java'),
        fixtureUri('Repository.java'),
      ]);
    });

    it('should find edge from Service.processOrder to Repository.save', () => {
      const edge = edges.find(
        (e) => e.caller.includes('Service.java') && e.callee.includes('Repository.java'),
      );
      expect(edge).toBeDefined();
    });

    it('should produce symbol IDs in uri#line:0 format (0-based)', () => {
      expect(edges.length).toBeGreaterThan(0);
      for (const edge of edges) {
        expect(edge.caller).toMatch(/^file:\/\/\/.*\.java#\d+:0$/);
        expect(edge.callee).toMatch(/^file:\/\/\/.*\.java#\d+:0$/);
      }
    });
  });

  describe('Scenario: this-qualified and unqualified intra-class calls', () => {
    let edges: Awaited<ReturnType<typeof buildJavaCallEdges>>;

    // Derive expected line numbers from the fixture so pin doesn't break on whitespace changes
    const intraClassLines = readFileSync(join(FIXTURES, 'IntraClass.java'), 'utf-8').split('\n');
    const processLine = intraClassLines.findIndex((l) => /public void process\(\)/.test(l));
    const validateLine = intraClassLines.findIndex((l) => /public void validate\(\)/.test(l));
    const checkLine = intraClassLines.findIndex((l) => /private void check\(\)/.test(l));

    // Guard: fail fast with a clear message if the fixture was renamed or reformatted
    if (processLine === -1 || validateLine === -1 || checkLine === -1) {
      throw new Error(
        `IntraClass.java fixture missing expected method signatures ` +
          `(process=${processLine}, validate=${validateLine}, check=${checkLine}). ` +
          `Update the findIndex patterns to match the current fixture.`,
      );
    }

    beforeAll(async () => {
      edges = await buildJavaCallEdges([fixtureUri('IntraClass.java')]);
    });

    it('should find this.validate() call from process', () => {
      const edge = edges.find(
        (e) =>
          e.caller.includes(`IntraClass.java#${processLine}:0`) &&
          e.callee.includes(`IntraClass.java#${validateLine}:0`),
      );
      expect(edge).toBeDefined();
    });

    it('should find unqualified check() call from validate', () => {
      const edge = edges.find(
        (e) =>
          e.caller.includes(`IntraClass.java#${validateLine}:0`) &&
          e.callee.includes(`IntraClass.java#${checkLine}:0`),
      );
      expect(edge).toBeDefined();
    });
  });

  describe('Scenario: Exclude self-calls (recursive methods)', () => {
    it('should produce 0 edges for a recursive method', async () => {
      const edges = await buildJavaCallEdges([fixtureUri('SelfCaller.java')]);

      expect(edges).toHaveLength(0);
    });
  });

  describe('Scenario: Deduplicate repeated calls', () => {
    it('should produce 1 edge when one method calls the same callee twice', async () => {
      // DuplicateCaller.processOrder calls repository.save() twice in its body
      // The seen-Set deduplication should collapse both to a single edge
      const edges = await buildJavaCallEdges([
        fixtureUri('DuplicateCaller.java'),
        fixtureUri('Repository.java'),
      ]);

      const dupeEdges = edges.filter(
        (e) => e.caller.includes('DuplicateCaller.java') && e.callee.includes('Repository.java'),
      );
      expect(dupeEdges).toHaveLength(1);
    });

    it('should produce distinct edges for two different callers each calling the same callee', async () => {
      // Repository.save() and Repository.delete() each call util.format() once
      // Two distinct caller→callee pairs — no deduplication applies
      const edges = await buildJavaCallEdges([
        fixtureUri('Repository.java'),
        fixtureUri('Util.java'),
      ]);

      const formatEdges = edges.filter((e) => e.callee.includes('Util.java'));
      expect(formatEdges).toHaveLength(2);
    });
  });

  describe('Scenario: Multi-layer call chain', () => {
    let edges: Awaited<ReturnType<typeof buildJavaCallEdges>>;
    beforeAll(async () => {
      edges = await buildJavaCallEdges([
        fixtureUri('Service.java'),
        fixtureUri('Repository.java'),
        fixtureUri('Util.java'),
      ]);
    });

    it('should find Service → Repository edges', () => {
      const sToR = edges.filter(
        (e) => e.caller.includes('Service.java') && e.callee.includes('Repository.java'),
      );
      expect(sToR.length).toBeGreaterThan(0);
    });

    it('should find Repository → Util edges', () => {
      const rToU = edges.filter(
        (e) => e.caller.includes('Repository.java') && e.callee.includes('Util.java'),
      );
      expect(rToU.length).toBeGreaterThan(0);
    });

    it('should have no edges from Util (leaf node)', () => {
      const fromUtil = edges.filter((e) => e.caller.includes('Util.java'));
      expect(fromUtil).toHaveLength(0);
    });
  });

  describe('Scenario: Empty file', () => {
    it('should produce 0 edges', async () => {
      const edges = await buildJavaCallEdges([fixtureUri('Empty.java')]);
      expect(edges).toHaveLength(0);
    });
  });

  describe('Scenario: Malformed source', () => {
    it('should produce 0 edges and not throw', async () => {
      const edges = await buildJavaCallEdges([fixtureUri('Malformed.java')]);
      expect(edges).toHaveLength(0);
    });
  });
});
