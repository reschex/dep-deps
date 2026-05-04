/**
 * Tests for buildTypeScriptCallEdges — pure call graph extraction from TS Compiler API.
 *
 * Scenario: Extract cross-file call edge
 * From: features/typescript-call-graph.feature
 */

import { describe, it, expect, beforeAll } from 'vitest';
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
    // Build the call graph once for the whole scenario — TypeScript compilation is expensive.
    let callerUri: string;
    let calleeUri: string;
    let edges: Awaited<ReturnType<typeof buildTypeScriptCallEdges>>;
    beforeAll(async () => {
      callerUri = fixtureUri('caller.ts');
      calleeUri = fixtureUri('callee.ts');
      edges = await buildTypeScriptCallEdges(FIXTURES, [callerUri, calleeUri]);
    });

    it('should produce exactly 1 call edge from caller.ts → callee.ts', () => {
      expect(edges).toHaveLength(1);
      // caller: run() at line 2, callee: greet() at line 0 — symbol IDs are uri#line:character
      expect(edges[0].caller).toContain('caller.ts#');
      expect(edges[0].callee).toContain('callee.ts#');
    });

    it('should produce symbol IDs in uri#line:character format (0-based)', () => {
      expect(edges).toHaveLength(1);
      // Verify format: file-uri#line:character — avoid hardcoding line numbers because
      // Stryker's TypeScript checker prepends // @ts-nocheck to non-instrumented fixture
      // files in its sandbox, shifting all declaration lines by 1.
      // Exact coordinate verification (matching NodeSymbolProvider) is covered by the
      // "Symbol IDs match NodeSymbolProvider format" scenario below.
      expect(edges[0].caller).toMatch(/^file:\/\/\/.*caller\.ts#\d+:0$/);
      expect(edges[0].callee).toMatch(/^file:\/\/\/.*callee\.ts#\d+:0$/);
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
      //   const helper = () => 42;           → arrow at char 15 ("const helper = " = 15 chars)
      //   export const main = () => helper() → arrow at char 20 ("export const main = " = 20 chars)
      // main calls helper. Line numbers are not hardcoded — Stryker's TypeScript checker
      // prepends // @ts-nocheck to non-instrumented fixture files, shifting lines by 1.
      // Character positions within each line are unaffected and are verified here.
      expect(edges).toHaveLength(1);
      expect(edges[0].caller).toMatch(/^file:\/\/\/.*arrows\.ts#\d+:20$/);
      expect(edges[0].callee).toMatch(/^file:\/\/\/.*arrows\.ts#\d+:15$/);
    });
  });

  describe('Scenario: Method calls within a class', () => {
    it('should resolve this.method() calls between class methods with exact symbol coordinates', async () => {
      const uri = fixtureUri('service.ts');

      const edges = await buildTypeScriptCallEdges(FIXTURES, [uri]);

      // service.ts:
      //   class Service {
      //     process() { ... }   → method name at char 2 (after 2-space indent)
      //     validate() {}       → method name at char 2
      //   }
      // process (earlier line) calls validate (later line). Line numbers are not
      // hardcoded — Stryker's TypeScript checker prepends // @ts-nocheck to
      // non-instrumented fixture files, shifting all lines by 1. Character positions
      // and declaration ordering are unaffected and are verified here.
      expect(edges).toHaveLength(1);
      expect(edges[0].caller).toMatch(/^file:\/\/\/.*service\.ts#\d+:2$/);
      expect(edges[0].callee).toMatch(/^file:\/\/\/.*service\.ts#\d+:2$/);
      // process() is declared before validate() — caller line must be lower
      const callerLine = parseInt(edges[0].caller.match(/#(\d+):/)![1]);
      const calleeLine = parseInt(edges[0].callee.match(/#(\d+):/)![1]);
      expect(callerLine).toBeLessThan(calleeLine);
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
