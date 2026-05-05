/**
 * Tests for JavaCallGraphProvider — adapts buildJavaCallEdges to CallGraphProvider port.
 *
 * From: features/java-call-graph.feature
 */

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { JavaCallGraphProvider } from './callGraph';

const FIXTURES = join(__dirname, 'fixtures', 'callGraph');

describe('JavaCallGraphProvider', () => {
  describe('Scenario: Collect call edges from Java files', () => {
    it('should discover .java files and return call edges', async () => {
      const provider = new JavaCallGraphProvider(FIXTURES);
      const edges = await provider.collectCallEdges(100);

      // Service → Repository, Repository → Util, IntraClass self calls
      expect(edges.length).toBeGreaterThan(0);
    });

    it('should exclude non-Java files', async () => {
      const provider = new JavaCallGraphProvider(FIXTURES);
      const edges = await provider.collectCallEdges(100);

      for (const edge of edges) {
        expect(edge.caller).toMatch(/\.java#/);
        expect(edge.callee).toMatch(/\.java#/);
      }
    });

    it('should produce edges with correct cross-file relationships', async () => {
      const provider = new JavaCallGraphProvider(FIXTURES);
      const edges = await provider.collectCallEdges(100);

      const serviceToRepo = edges.find(
        (e) => e.caller.includes('Service.java') && e.callee.includes('Repository.java'),
      );
      expect(serviceToRepo).toBeDefined();
    });
  });
});
