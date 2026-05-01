/**
 * Tests for parsePmdSymbolsXml — Java symbol extraction from PMD XML.
 *
 * From: features/java-symbol-extraction.feature
 */

import { describe, it, expect } from 'vitest';
import { parsePmdSymbolsXml } from './symbolsParse';

describe('parsePmdSymbolsXml', () => {
  describe('Scenario: Extract methods from PMD CyclomaticComplexity violations', () => {
    it('should extract a single method with 0-based line numbers', () => {
      const xml = `<pmd>
  <file name="/project/src/OrderProcessor.java">
    <violation beginline="15" endline="28" begincolumn="5" endcolumn="1"
               method="processOrder" class="OrderProcessor"
               rule="CyclomaticComplexity" priority="3">
      The method 'processOrder' has a cyclomatic complexity of 7.
    </violation>
  </file>
</pmd>`;

      const result = parsePmdSymbolsXml(xml);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: 'processOrder',
        selectionStartLine: 14,       // 15 - 1 = 14 (0-based)
        selectionStartCharacter: 0,
        bodyStartLine: 14,
        bodyEndLine: 27,               // 28 - 1 = 27 (0-based)
      });
    });
  });

  describe('Scenario: Extract multiple methods from the same file', () => {
    it('should extract two methods with correct names and line numbers', () => {
      const xml = `<pmd>
  <file name="Service.java">
    <violation beginline="5" endline="12" method="validate" class="Service"
               rule="CyclomaticComplexity" priority="3">
      The method 'validate' has a cyclomatic complexity of 4.
    </violation>
    <violation beginline="20" endline="35" method="execute" class="Service"
               rule="CyclomaticComplexity" priority="3">
      The method 'execute' has a cyclomatic complexity of 9.
    </violation>
  </file>
</pmd>`;

      const result = parsePmdSymbolsXml(xml);

      expect(result).toHaveLength(2);
      expect(result.map((s) => s.name)).toEqual(['validate', 'execute']);
      expect(result[0].bodyStartLine).toBe(4);   // 5 - 1
      expect(result[0].bodyEndLine).toBe(11);     // 12 - 1
      expect(result[1].bodyStartLine).toBe(19);   // 20 - 1
      expect(result[1].bodyEndLine).toBe(34);     // 35 - 1
    });
  });

  describe('Scenario: Deduplicate same method reported by multiple cyclomatic rules', () => {
    it('should produce one symbol when CyclomaticComplexity and StdCyclomaticComplexity both fire for the same method', () => {
      const xml = `<pmd>
  <file name="Calc.java">
    <violation beginline="10" endline="25" method="calc" class="Calc"
               rule="CyclomaticComplexity" priority="3">
      The method 'calc' has a cyclomatic complexity of 6.
    </violation>
    <violation beginline="10" endline="25" method="calc" class="Calc"
               rule="StdCyclomaticComplexity" priority="3">
      The method 'calc' has a cyclomatic complexity of 5.
    </violation>
  </file>
</pmd>`;

      const result = parsePmdSymbolsXml(xml);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('calc');
    });
  });

  describe('Scenario: Ignore non-cyclomatic violations', () => {
    it('should skip violations with non-cyclomatic rules', () => {
      const xml = `<pmd>
  <file name="Foo.java">
    <violation beginline="1" method="unused" class="Foo"
               rule="UnusedImports" priority="4">
      Unused import 'java.util.List'.
    </violation>
    <violation beginline="10" endline="20" method="process" class="Foo"
               rule="CyclomaticComplexity" priority="3">
      The method 'process' has a cyclomatic complexity of 5.
    </violation>
  </file>
</pmd>`;

      const result = parsePmdSymbolsXml(xml);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('process');
    });
  });

  describe('Scenario: Graceful degradation on empty PMD output', () => {
    it('should return [] for empty string', () => {
      expect(parsePmdSymbolsXml('')).toEqual([]);
    });

    it('should return [] for non-XML text', () => {
      expect(parsePmdSymbolsXml('not xml at all')).toEqual([]);
    });

    it('should return [] for XML with no violations', () => {
      const xml = `<pmd><file name="Clean.java"></file></pmd>`;
      expect(parsePmdSymbolsXml(xml)).toEqual([]);
    });
  });

  describe('Edge cases: missing attributes', () => {
    it('should skip violation without method attribute', () => {
      const xml = `<pmd>
  <file name="Foo.java">
    <violation beginline="10" endline="20" class="Foo"
               rule="CyclomaticComplexity" priority="3">
      The method 'x' has a cyclomatic complexity of 5.
    </violation>
  </file>
</pmd>`;

      expect(parsePmdSymbolsXml(xml)).toEqual([]);
    });

    it('should skip violation without beginline attribute', () => {
      const xml = `<pmd>
  <file name="Foo.java">
    <violation endline="20" method="x" class="Foo"
               rule="CyclomaticComplexity" priority="3">
      The method 'x' has a cyclomatic complexity of 5.
    </violation>
  </file>
</pmd>`;

      expect(parsePmdSymbolsXml(xml)).toEqual([]);
    });

    it('should use bodyStartLine as bodyEndLine when endline attribute is missing', () => {
      const xml = `<pmd>
  <file name="Foo.java">
    <violation beginline="10" method="noEnd" class="Foo"
               rule="CyclomaticComplexity" priority="3">
      The method 'noEnd' has a cyclomatic complexity of 3.
    </violation>
  </file>
</pmd>`;

      const result = parsePmdSymbolsXml(xml);

      expect(result).toHaveLength(1);
      expect(result[0].bodyStartLine).toBe(9);
      expect(result[0].bodyEndLine).toBe(9); // falls back to bodyStartLine
    });
  });

  describe('Edge cases: attribute ordering', () => {
    it('should handle rule attribute before method attribute', () => {
      const xml = `<pmd>
  <file name="Foo.java">
    <violation rule="CyclomaticComplexity" beginline="5" endline="10" method="ordered" class="Foo" priority="3">
      The method 'ordered' has a cyclomatic complexity of 4.
    </violation>
  </file>
</pmd>`;

      const result = parsePmdSymbolsXml(xml);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('ordered');
    });
  });
});
