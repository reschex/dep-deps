/**
 * Tests for NativeCallGraphProvider — multi-language call graph dispatch.
 *
 * From: features/java-call-graph.feature, features/typescript-call-graph.feature
 */

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { NativeCallGraphProvider } from './nativeCallGraphProvider';

const TS_FIXTURES = join(__dirname, 'typescript', 'fixtures', 'callGraph');
const JAVA_FIXTURES = join(__dirname, 'java', 'fixtures', 'callGraph');
const MIXED_FIXTURES = join(__dirname, 'fixtures', 'mixed');

describe('NativeCallGraphProvider', () => {
  describe('Scenario: Dispatch to TypeScript call graph', () => {
    it('should find TS call edges from TypeScript fixtures', async () => {
      const provider = new NativeCallGraphProvider(TS_FIXTURES);
      const edges = await provider.collectCallEdges(100);

      // caller.ts → callee.ts edge should exist
      const crossFile = edges.find(
        (e) => e.caller.includes('caller.ts') && e.callee.includes('callee.ts'),
      );
      expect(crossFile).toBeDefined();
    });
  });

  describe('Scenario: Dispatch to Java call graph', () => {
    it('should find Java call edges from Java fixtures', async () => {
      const provider = new NativeCallGraphProvider(JAVA_FIXTURES);
      const edges = await provider.collectCallEdges(100);

      const serviceToRepo = edges.find(
        (e) => e.caller.includes('Service.java') && e.callee.includes('Repository.java'),
      );
      expect(serviceToRepo).toBeDefined();
    });
  });

  describe('Scenario: Combine edges from both languages', () => {
    it('should merge TS and Java edges when both exist in same root', async () => {
      // MIXED_FIXTURES contains caller.ts→callee.ts and Service.java→Repository.java
      // both in one directory — scoped root avoids picking up unrelated test files
      const provider = new NativeCallGraphProvider(MIXED_FIXTURES);
      const edges = await provider.collectCallEdges(50); // 50 >> 4 files in the fixture

      const tsEdges = edges.filter((e) => e.caller.includes('.ts#'));
      const javaEdges = edges.filter((e) => e.caller.includes('.java#'));
      expect(tsEdges.length).toBeGreaterThan(0);
      expect(javaEdges.length).toBeGreaterThan(0);
    });
  });
});
