/**
 * Tests for buildTypeScriptCallEdges — pure call graph extraction from TS Compiler API.
 *
 * Scenario: Extract cross-file call edge
 * From: features/typescript-call-graph.feature
 */

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildTypeScriptCallEdges } from './callGraphBuild';
import { NodeSymbolProvider } from './symbols';

const FIXTURES = join(__dirname, 'fixtures', 'callGraph');

function fixtureUri(name: string): string {
  return pathToFileURL(join(FIXTURES, name)).toString();
}

describe('buildTypeScriptCallEdges', () => {
  describe('Scenario: Extract cross-file call edge', () => {
    it('should produce exactly 1 call edge from caller.ts → callee.ts', async () => {
      const callerUri = fixtureUri('caller.ts');
      const calleeUri = fixtureUri('callee.ts');

      const edges = await buildTypeScriptCallEdges(FIXTURES, [callerUri, calleeUri]);

      expect(edges).toHaveLength(1);
      // caller: run() at line 2, callee: greet() at line 0 — symbol IDs are uri#line:character
      expect(edges[0].caller).toContain('caller.ts#');
      expect(edges[0].callee).toContain('callee.ts#');
    });

    it('should produce symbol IDs in uri#line:character format (0-based)', async () => {
      const callerUri = fixtureUri('caller.ts');
      const calleeUri = fixtureUri('callee.ts');

      const edges = await buildTypeScriptCallEdges(FIXTURES, [callerUri, calleeUri]);

      // run() is "export function run()" at line 2, char 0 (declaration start, matching NodeSymbolProvider)
      expect(edges[0].caller).toBe(`${callerUri}#2:0`);
      // greet() is "export function greet(..." at line 0, char 0 (declaration start)
      expect(edges[0].callee).toBe(`${calleeUri}#0:0`);
    });
  });

  describe('Scenario: Deduplicate repeated calls', () => {
    it('should produce only 1 edge even when function called multiple times', async () => {
      const callerUri = fixtureUri('repeatedCalls.ts');
      const calleeUri = fixtureUri('callee.ts');

      const edges = await buildTypeScriptCallEdges(FIXTURES, [callerUri, calleeUri]);

      expect(edges).toHaveLength(1);
    });
  });

  describe('Scenario: Exclude self-calls (recursive functions)', () => {
    it('should produce 0 edges for a recursive function calling itself', async () => {
      const uri = fixtureUri('recursive.ts');

      const edges = await buildTypeScriptCallEdges(FIXTURES, [uri]);

      expect(edges).toHaveLength(0);
    });
  });

  describe('Scenario: Skip declaration files', () => {
    it('should not produce edges from .d.ts files', async () => {
      const callerUri = fixtureUri('caller.ts');
      const calleeUri = fixtureUri('callee.ts');
      const declUri = fixtureUri('types.d.ts');

      const edges = await buildTypeScriptCallEdges(FIXTURES, [callerUri, calleeUri, declUri]);

      // Only the caller→callee edge should exist, not anything from the .d.ts
      for (const edge of edges) {
        expect(edge.caller).not.toContain('.d.ts');
        expect(edge.callee).not.toContain('.d.ts');
      }
    });
  });

  describe('Scenario: Arrow function calls', () => {
    it('should resolve arrow function caller and callee with exact symbol coordinates', async () => {
      const uri = fixtureUri('arrows.ts');

      const edges = await buildTypeScriptCallEdges(FIXTURES, [uri]);

      // arrows.ts:
      //   line 0: const helper = () => 42;          → arrow at char 15 ("const helper = " = 15 chars)
      //   line 1: export const main = () => helper() → arrow at char 20 ("export const main = " = 20 chars)
      // main (line 1) calls helper (line 0)
      expect(edges).toHaveLength(1);
      expect(edges[0].caller).toBe(`${uri}#1:20`);
      expect(edges[0].callee).toBe(`${uri}#0:15`);
    });
  });

  describe('Scenario: Method calls within a class', () => {
    it('should resolve this.method() calls between class methods with exact symbol coordinates', async () => {
      const uri = fixtureUri('service.ts');

      const edges = await buildTypeScriptCallEdges(FIXTURES, [uri]);

      // service.ts:
      //   line 0: class Service {
      //   line 1:   process() { ... }   → method name at char 2 (after 2-space indent)
      //   line 2:   validate() {}       → method name at char 2
      // process (line 1) calls validate (line 2)
      expect(edges).toHaveLength(1);
      expect(edges[0].caller).toBe(`${uri}#1:2`);
      expect(edges[0].callee).toBe(`${uri}#2:2`);
    });
  });

  describe('Scenario: Empty file', () => {
    it('should produce 0 edges for a file with no calls', async () => {
      const uri = fixtureUri('empty.ts');

      const edges = await buildTypeScriptCallEdges(FIXTURES, [uri]);

      expect(edges).toHaveLength(0);
    });
  });

  describe('Scenario: Symbol IDs match NodeSymbolProvider format', () => {
    it('should produce callee IDs that match NodeSymbolProvider symbol IDs', async () => {
      const callerUri = fixtureUri('caller.ts');
      const calleeUri = fixtureUri('callee.ts');

      const edges = await buildTypeScriptCallEdges(FIXTURES, [callerUri, calleeUri]);
      expect(edges).toHaveLength(1);

      // Get symbols from NodeSymbolProvider for both files
      const symbolProvider = new NodeSymbolProvider();
      const callerSymbols = await symbolProvider.getFunctionSymbols(callerUri);
      const calleeSymbols = await symbolProvider.getFunctionSymbols(calleeUri);

      // Build expected symbol IDs in the same format NodeSymbolProvider + makeSymbolId would produce
      const runSymbol = callerSymbols.find(s => s.name === 'run');
      const greetSymbol = calleeSymbols.find(s => s.name === 'greet');
      expect(runSymbol).toBeDefined();
      expect(greetSymbol).toBeDefined();

      const expectedCallerId = `${callerUri}#${runSymbol!.selectionStartLine}:${runSymbol!.selectionStartCharacter}`;
      const expectedCalleeId = `${calleeUri}#${greetSymbol!.selectionStartLine}:${greetSymbol!.selectionStartCharacter}`;

      expect(edges[0].caller).toBe(expectedCallerId);
      expect(edges[0].callee).toBe(expectedCalleeId);
    });
  });
});
