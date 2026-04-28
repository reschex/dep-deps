/**
 * Tests for NodeSymbolProvider - TypeScript Symbol Extraction
 * 
 * Scenario: Extract function declarations
 * From: features/symbol-extraction.feature
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { NodeSymbolProvider } from './nodeSymbol';

describe('NodeSymbolProvider - Function Extraction', () => {
  let tempDir: string;
  let provider: NodeSymbolProvider;

  beforeAll(async () => {
    // Create temporary directory for test files
    tempDir = join(tmpdir(), `ddp-symbol-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
    provider = new NodeSymbolProvider();
  });

  afterAll(async () => {
    // Clean up temporary directory
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('Scenario: Extract function declarations', () => {
    it('should extract 1 symbol from function declaration', async () => {
      // Given a TypeScript file with content:
      const content = `function processData(input: string): number {
  if (input.length > 0) {
    return input.length;
  }
  return 0;
}`;
      const filePath = join(tempDir, 'processData.ts');
      await writeFile(filePath, content, 'utf-8');

      // When I extract symbols from the file
      const symbols = await provider.getFunctionSymbols(filePath);

      // Then 1 symbol should be found
      expect(symbols.length).toBe(1);
    });

    it('should extract symbol name "processData"', async () => {
      // Given a TypeScript file with function processData
      const content = `function processData(input: string): number {
  if (input.length > 0) {
    return input.length;
  }
  return 0;
}`;
      const filePath = join(tempDir, 'processData2.ts');
      await writeFile(filePath, content, 'utf-8');

      // When I extract symbols from the file
      const symbols = await provider.getFunctionSymbols(filePath);

      // Then the symbol name should be "processData"
      expect(symbols[0].name).toBe('processData');
    });

    it('should identify correct body start and end lines', async () => {
      // Given a TypeScript file with function processData
      const content = `function processData(input: string): number {
  if (input.length > 0) {
    return input.length;
  }
  return 0;
}`;
      const filePath = join(tempDir, 'processData3.ts');
      await writeFile(filePath, content, 'utf-8');

      // When I extract symbols from the file
      const symbols = await provider.getFunctionSymbols(filePath);

      // Then the symbol body should start at line 1 (0-indexed: line 0)
      expect(symbols[0].bodyStartLine).toBe(0);
      
      // And the symbol body should end at line 6 (0-indexed: line 5)
      expect(symbols[0].bodyEndLine).toBe(5);
    });
  });

  describe('Scenario: Extract method declarations from classes', () => {
    it('should extract 2 symbols from class methods', async () => {
      // Given a TypeScript file with content:
      const content = `class DataProcessor {
  process(data: string): void {
    console.log(data);
  }
  
  validate(input: string): boolean {
    return input.length > 0;
  }
}`;
      const filePath = join(tempDir, 'DataProcessor.ts');
      await writeFile(filePath, content, 'utf-8');

      // When I extract symbols from the file
      const symbols = await provider.getFunctionSymbols(filePath);

      // Then 2 symbols should be found
      expect(symbols.length).toBe(2);
    });

    it('should extract method names "process" and "validate"', async () => {
      // Given a TypeScript file with class containing process and validate methods
      const content = `class DataProcessor {
  process(data: string): void {
    console.log(data);
  }
  
  validate(input: string): boolean {
    return input.length > 0;
  }
}`;
      const filePath = join(tempDir, 'DataProcessor2.ts');
      await writeFile(filePath, content, 'utf-8');

      // When I extract symbols from the file
      const symbols = await provider.getFunctionSymbols(filePath);

      // Then symbol names should include "process"
      const names = symbols.map(s => s.name);
      expect(names).toContain('process');
      
      // And symbol names should include "validate"
      expect(names).toContain('validate');
    });
  });

  describe('Scenario: Extract arrow functions with names', () => {
    it('should extract 1 symbol from arrow function', async () => {
      // Given a TypeScript file with content:
      const content = `const calculateRisk = (cc: number, coverage: number): number => {
  return cc * (1 - coverage);
};`;
      const filePath = join(tempDir, 'calculateRisk.ts');
      await writeFile(filePath, content, 'utf-8');

      // When I extract symbols from the file
      const symbols = await provider.getFunctionSymbols(filePath);

      // Then 1 symbol should be found
      expect(symbols.length).toBe(1);
    });

    it('should extract symbol name "calculateRisk"', async () => {
      // Given a TypeScript file with arrow function
      const content = `const calculateRisk = (cc: number, coverage: number): number => {
  return cc * (1 - coverage);
};`;
      const filePath = join(tempDir, 'calculateRisk2.ts');
      await writeFile(filePath, content, 'utf-8');

      // When I extract symbols from the file
      const symbols = await provider.getFunctionSymbols(filePath);

      // Then the symbol name should be "calculateRisk"
      expect(symbols[0].name).toBe('calculateRisk');
    });
  });

  describe('Scenario: Accept file:// URIs', () => {
    it('returns symbols when given a file:// URI', async () => {
      const content = `function hello() { return 1; }`;
      const filePath = join(tempDir, 'uriTest.ts');
      await writeFile(filePath, content, 'utf-8');

      const uri = `file://${filePath}`;
      const symbols = await provider.getFunctionSymbols(uri);

      expect(symbols.length).toBe(1);
      expect(symbols[0].name).toBe('hello');
    });

    it('returns symbols when given a file:// URI with Windows drive letter', async () => {
      const content = `function greet() { return 'hi'; }`;
      const filePath = join(tempDir, 'uriWinTest.ts');
      await writeFile(filePath, content, 'utf-8');

      // Simulate the Windows URI form: file:///C:/path
      const uri = `file:///${filePath.replace(/\\/g, '/')}`;
      const symbols = await provider.getFunctionSymbols(uri);

      expect(symbols.length).toBe(1);
      expect(symbols[0].name).toBe('greet');
    });
  });

  describe('Scenario: Extract function expression assignments', () => {
    it('returns symbol for const assigned function expression', async () => {
      /*
       * BUG: Function expressions assigned to variables are not extracted.
       *
       * ROOT CAUSE: The visit() function only checks isArrowFunction on
       * VariableDeclaration initializers (line 65), but does not check
       * isFunctionExpression. `const fn = function() {}` uses a FunctionExpression
       * node, not an ArrowFunction node.
       *
       * CODE LOCATION: src/cli/adapters/nodeSymbol.ts:64-67
       *
       * CURRENT CODE:
       *   if (node.initializer && ts.isArrowFunction(node.initializer)) {
       *
       * PROPOSED FIX:
       *   if (node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
       *
       * EXPECTED: 1 symbol named "transform"
       * ACTUAL:   0 symbols
       */
      const content = `const transform = function(x: number): number {
  return x * 2;
};`;
      const filePath = join(tempDir, 'funcExpr.ts');
      await writeFile(filePath, content, 'utf-8');

      const symbols = await provider.getFunctionSymbols(filePath);

      expect(symbols.length).toBe(1);
      expect(symbols[0].name).toBe('transform');
    });
  });

  describe('Scenario: Extract class property arrow functions', () => {
    it('returns symbol for class property assigned arrow function', async () => {
      /*
       * BUG: Class properties with arrow function initializers are not extracted.
       *
       * ROOT CAUSE: The visit() function checks VariableDeclaration for arrow
       * functions but does not check PropertyDeclaration. Class properties like
       * `handleClick = () => {}` are PropertyDeclaration nodes, not VariableDeclaration.
       *
       * CODE LOCATION: src/cli/adapters/nodeSymbol.ts:62-67
       *
       * CURRENT CODE:
       *   } else if (ts.isVariableDeclaration(node)) {
       *     if (node.initializer && ts.isArrowFunction(node.initializer)) {
       *
       * PROPOSED FIX: Add a PropertyDeclaration check:
       *   } else if (ts.isPropertyDeclaration(node)) {
       *     if (node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
       *       const name = ts.isIdentifier(node.name) ? node.name.text : node.name.getText(sourceFile);
       *       symbols.push(createSymbol(name, node.initializer));
       *     }
       *   }
       *
       * EXPECTED: 1 symbol named "handleClick"
       * ACTUAL:   0 symbols
       */
      const content = `class Controller {
  handleClick = () => {
    console.log('clicked');
  };
}`;
      const filePath = join(tempDir, 'classPropArrow.ts');
      await writeFile(filePath, content, 'utf-8');

      const symbols = await provider.getFunctionSymbols(filePath);

      expect(symbols.length).toBe(1);
      expect(symbols[0].name).toBe('handleClick');
    });
  });

  describe('Scenario: Extract async functions', () => {
    it('returns symbol named "fetchData" from async function', async () => {
      const content = `async function fetchData(): Promise<string> {
  return await fetch('/api/data');
}`;
      const filePath = join(tempDir, 'asyncFn.ts');
      await writeFile(filePath, content, 'utf-8');

      const symbols = await provider.getFunctionSymbols(filePath);

      expect(symbols.length).toBe(1);
      expect(symbols[0].name).toBe('fetchData');
    });
  });

  describe('Scenario: Extract generator functions', () => {
    it('returns symbol named "generateValues" from generator function', async () => {
      const content = `function* generateValues() {
  yield 1;
  yield 2;
}`;
      const filePath = join(tempDir, 'generator.ts');
      await writeFile(filePath, content, 'utf-8');

      const symbols = await provider.getFunctionSymbols(filePath);

      expect(symbols.length).toBe(1);
      expect(symbols[0].name).toBe('generateValues');
    });
  });

  describe('Scenario: Handle anonymous function declarations', () => {
    it('returns 0 symbols for export default function without name', async () => {
      const content = `export default function() {
  return 42;
}`;
      const filePath = join(tempDir, 'anonExport.ts');
      await writeFile(filePath, content, 'utf-8');

      const symbols = await provider.getFunctionSymbols(filePath);

      expect(symbols.length).toBe(0);
    });
  });

  describe('Scenario: Extract nested functions', () => {
    it('returns symbols for both "outer" and "inner" nested functions', async () => {
      const content = `function outer() {
  function inner() {
    return 1;
  }
  return inner();
}`;
      const filePath = join(tempDir, 'nested.ts');
      await writeFile(filePath, content, 'utf-8');

      const symbols = await provider.getFunctionSymbols(filePath);
      const names = symbols.map(s => s.name);

      expect(symbols.length).toBe(2);
      expect(names).toContain('outer');
      expect(names).toContain('inner');
    });
  });

  describe('Scenario: Skip non-function symbols', () => {
    it('returns 0 symbols for const, interface, type, and enum', async () => {
      const content = `const VALUE = 42;
interface Config { }
type Handler = () => void;
enum Status { Active, Inactive }`;
      const filePath = join(tempDir, 'nonFunction.ts');
      await writeFile(filePath, content, 'utf-8');

      const symbols = await provider.getFunctionSymbols(filePath);

      expect(symbols.length).toBe(0);
    });
  });

  describe('Scenario: Mixed declarations in one file', () => {
    it('returns 3 symbols from file with function, method, and arrow function', async () => {
      const content = `const VALUE = 42;

function standalone() { return 1; }

class Service {
  run() { return 2; }
}

const helper = (x: number) => x + 1;

interface Config { key: string; }`;
      const filePath = join(tempDir, 'mixed.ts');
      await writeFile(filePath, content, 'utf-8');

      const symbols = await provider.getFunctionSymbols(filePath);
      const names = symbols.map(s => s.name);

      expect(symbols.length).toBe(3);
      expect(names).toEqual(['standalone', 'run', 'helper']);
    });
  });

  describe('Scenario: Exported arrow functions', () => {
    it('returns symbol for export const arrow function', async () => {
      const content = `export const calculateRisk = (x: number): number => x * 2;`;
      const filePath = join(tempDir, 'exportedArrow.ts');
      await writeFile(filePath, content, 'utf-8');

      const symbols = await provider.getFunctionSymbols(filePath);

      expect(symbols.length).toBe(1);
      expect(symbols[0].name).toBe('calculateRisk');
    });
  });

  describe('Scenario: Arrow function body line range accuracy', () => {
    it('returns correct bodyStartLine and bodyEndLine for multi-line arrow', async () => {
      const content = `const compute = (a: number, b: number): number => {
  const sum = a + b;
  return sum * 2;
};`;
      const filePath = join(tempDir, 'arrowLines.ts');
      await writeFile(filePath, content, 'utf-8');

      const symbols = await provider.getFunctionSymbols(filePath);

      expect(symbols[0].name).toBe('compute');
      expect(symbols[0].bodyStartLine).toBe(0);
      expect(symbols[0].bodyEndLine).toBe(3);
    });
  });

  describe('Scenario: Empty file', () => {
    it('returns empty array for file with no content', async () => {
      const filePath = join(tempDir, 'empty.ts');
      await writeFile(filePath, '', 'utf-8');

      const symbols = await provider.getFunctionSymbols(filePath);

      expect(symbols).toEqual([]);
    });
  });

  describe('Scenario: File with syntax errors', () => {
    it('returns symbols that were parseable despite syntax errors', async () => {
      const content = `function valid() { return 1; }
function broken( { // missing closing paren
  return 2;
}`;
      const filePath = join(tempDir, 'syntaxError.ts');
      await writeFile(filePath, content, 'utf-8');

      // TS compiler API is error-tolerant; it should at least find "valid"
      const symbols = await provider.getFunctionSymbols(filePath);
      const names = symbols.map(s => s.name);

      expect(names).toContain('valid');
    });
  });

  describe('Scenario: File not found', () => {
    it('rejects with error for non-existent file path', async () => {
      const filePath = join(tempDir, 'does-not-exist.ts');

      await expect(provider.getFunctionSymbols(filePath)).rejects.toThrow();
    });
  });

  describe('Scenario: Decorated methods', () => {
    it('returns symbol for method with decorator', async () => {
      const content = `function Log(target: any, key: string, desc: PropertyDescriptor) {}

class Service {
  @Log
  execute() {
    return true;
  }
}`;
      const filePath = join(tempDir, 'decorated.ts');
      await writeFile(filePath, content, 'utf-8');

      const symbols = await provider.getFunctionSymbols(filePath);
      const names = symbols.map(s => s.name);

      expect(names).toContain('execute');
      expect(names).toContain('Log');
    });
  });

  describe('Scenario: Computed method names', () => {
    it('returns symbol with computed name text for Symbol.iterator method', async () => {
      const content = `class Iterable {
  [Symbol.iterator]() {
    return this;
  }

  next() {
    return { done: true, value: undefined };
  }
}`;
      const filePath = join(tempDir, 'computed.ts');
      await writeFile(filePath, content, 'utf-8');

      const symbols = await provider.getFunctionSymbols(filePath);
      const names = symbols.map(s => s.name);

      // The computed name falls through to getText() branch
      expect(names).toContain('next');
      expect(symbols.length).toBe(2);
    });
  });
});

describe('bugmagnet session 2026-04-28', () => {
  let tempDir: string;
  let provider: NodeSymbolProvider;

  beforeAll(async () => {
    tempDir = join(tmpdir(), `ddp-bugmagnet-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
    provider = new NodeSymbolProvider();
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('complex interactions', () => {
    it('returns only the implementation for overloaded method signatures', async () => {
      /*
       * BUG: Overload signatures are extracted as separate symbols.
       *
       * ROOT CAUSE: extractSymbol() does not check whether a MethodDeclaration
       * has a body. TypeScript overload signatures are MethodDeclaration nodes
       * without a body property. All 3 parse declarations are extracted, but
       * only the implementation (the one with a body) has executable code.
       *
       * CODE LOCATION: src/cli/adapters/nodeSymbol.ts:52-56 (extractSymbol)
       *
       * PROPOSED FIX: Add a body check:
       *   function extractSymbol(node: ts.FunctionDeclaration | ts.MethodDeclaration): void {
       *     if (!node.name || !node.body) return;
       *
       * EXPECTED: ['parse'] (1 symbol — the implementation)
       * ACTUAL:   ['parse', 'parse', 'parse'] (3 symbols — includes 2 overload signatures)
       */
      const content = `class Parser {
  parse(input: string): number;
  parse(input: number): string;
  parse(input: string | number): string | number {
    return typeof input === 'string' ? input.length : String(input);
  }
}`;
      const filePath = join(tempDir, 'overloaded.ts');
      await writeFile(filePath, content, 'utf-8');

      const symbols = await provider.getFunctionSymbols(filePath);
      const names = symbols.map(s => s.name);

      expect(names).toEqual(['parse']);
    });

    it('returns symbols for getter and setter methods', async () => {
      /*
       * BUG: Getter and setter accessors are not extracted.
       *
       * ROOT CAUSE: The visit() function only checks isFunctionDeclaration and
       * isMethodDeclaration. Getters and setters are GetAccessorDeclaration and
       * SetAccessorDeclaration nodes, which are separate AST node types.
       * These can contain complex logic and are invisible to the risk pipeline.
       *
       * CODE LOCATION: src/cli/adapters/nodeSymbol.ts:58-60 (visit function)
       *
       * PROPOSED FIX: Add accessor checks:
       *   if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
       *     extractSymbol(node);
       *   } else if (ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
       *     if (node.name) {
       *       const name = ts.isIdentifier(node.name) ? node.name.text : node.name.getText(sourceFile);
       *       symbols.push(createSymbol(name, node));
       *     }
       *   }
       *
       * EXPECTED: at least 1 symbol named 'value'
       * ACTUAL:   0 symbols
       */
      const content = `class Config {
  private _value = 0;

  get value(): number {
    return this._value;
  }

  set value(v: number) {
    this._value = v;
  }
}`;
      const filePath = join(tempDir, 'getterSetter.ts');
      await writeFile(filePath, content, 'utf-8');

      const symbols = await provider.getFunctionSymbols(filePath);
      const names = symbols.map(s => s.name);

      expect(names).toContain('value');
      expect(symbols.length).toBeGreaterThanOrEqual(1);
    });

    it('returns symbol for static method', async () => {
      const content = `class Factory {
  static create(): Factory {
    return new Factory();
  }
}`;
      const filePath = join(tempDir, 'staticMethod.ts');
      await writeFile(filePath, content, 'utf-8');

      const symbols = await provider.getFunctionSymbols(filePath);

      expect(symbols.length).toBe(1);
      expect(symbols[0].name).toBe('create');
    });

    it('returns symbols from multiple classes in one file', async () => {
      const content = `class A {
  doA() { return 'a'; }
}

class B {
  doB() { return 'b'; }
}

class C {
  doC() { return 'c'; }
}`;
      const filePath = join(tempDir, 'multiClass.ts');
      await writeFile(filePath, content, 'utf-8');

      const symbols = await provider.getFunctionSymbols(filePath);
      const names = symbols.map(s => s.name);

      expect(names).toEqual(['doA', 'doB', 'doC']);
    });

    it('returns symbol for abstract method with body in subclass only', async () => {
      /*
       * BUG: Abstract method declarations (no body) are extracted as symbols.
       *
       * ROOT CAUSE: Same as overloads bug — extractSymbol() does not check
       * whether the node has a body. Abstract methods are MethodDeclarations
       * with no body, just a signature. Extracting them leads to meaningless
       * metrics (CC/coverage computed over a line range with no executable code).
       *
       * CODE LOCATION: src/cli/adapters/nodeSymbol.ts:52-56 (extractSymbol)
       *
       * PROPOSED FIX: Add a body check (same fix as overloads):
       *   function extractSymbol(node: ts.FunctionDeclaration | ts.MethodDeclaration): void {
       *     if (!node.name || !node.body) return;
       *
       * EXPECTED: ['run'] (1 symbol — the concrete implementation)
       * ACTUAL:   ['run', 'run'] (2 symbols — includes abstract declaration)
       */
      const content = `abstract class Base {
  abstract run(): void;
}

class Impl extends Base {
  run(): void {
    console.log('running');
  }
}`;
      const filePath = join(tempDir, 'abstract.ts');
      await writeFile(filePath, content, 'utf-8');

      const symbols = await provider.getFunctionSymbols(filePath);
      const names = symbols.map(s => s.name);

      expect(names).toEqual(['run']);
    });

    it('returns symbols for async generator function', async () => {
      const content = `async function* streamData() {
  yield 1;
  yield 2;
}`;
      const filePath = join(tempDir, 'asyncGen.ts');
      await writeFile(filePath, content, 'utf-8');

      const symbols = await provider.getFunctionSymbols(filePath);

      expect(symbols.length).toBe(1);
      expect(symbols[0].name).toBe('streamData');
    });

    it('returns correct line ranges when functions have leading blank lines', async () => {
      const content = `

function afterBlanks() {
  return 1;
}`;
      const filePath = join(tempDir, 'leadingBlanks.ts');
      await writeFile(filePath, content, 'utf-8');

      const symbols = await provider.getFunctionSymbols(filePath);

      expect(symbols[0].name).toBe('afterBlanks');
      expect(symbols[0].bodyStartLine).toBe(2);
      expect(symbols[0].bodyEndLine).toBe(4);
    });
  });

  describe('error handling edge cases', () => {
    it('rejects with ENOENT for non-existent file path', async () => {
      const filePath = join(tempDir, 'no-such-file.ts');

      await expect(provider.getFunctionSymbols(filePath)).rejects.toThrow(/ENOENT/);
    });

    it('returns empty array for whitespace-only file', async () => {
      const filePath = join(tempDir, 'whitespace.ts');
      await writeFile(filePath, '   \n\n\t  \n', 'utf-8');

      const symbols = await provider.getFunctionSymbols(filePath);

      expect(symbols).toEqual([]);
    });

    it('returns empty array for file containing only comments', async () => {
      const content = `// This is a comment
/* block comment */
/** JSDoc comment */`;
      const filePath = join(tempDir, 'comments.ts');
      await writeFile(filePath, content, 'utf-8');

      const symbols = await provider.getFunctionSymbols(filePath);

      expect(symbols).toEqual([]);
    });

    it('returns symbols despite multiple syntax errors', async () => {
      const content = `function a() { return 1; }
const = ;
function b() { return 2; }
class {
function c() { return 3; }`;
      const filePath = join(tempDir, 'manySyntaxErrors.ts');
      await writeFile(filePath, content, 'utf-8');

      const symbols = await provider.getFunctionSymbols(filePath);
      const names = symbols.map(s => s.name);

      expect(names).toContain('a');
      expect(names).toContain('b');
    });
  });

  describe('string edge cases in identifiers', () => {
    it('returns symbol with Unicode identifier name', async () => {
      const content = `function berechneWert() { return 42; }`;
      const filePath = join(tempDir, 'unicodeIdent.ts');
      await writeFile(filePath, content, 'utf-8');

      const symbols = await provider.getFunctionSymbols(filePath);

      expect(symbols[0].name).toBe('berechneWert');
    });

    it('returns symbol with dollar sign and underscore in name', async () => {
      const content = `function $_helper_fn$() { return true; }`;
      const filePath = join(tempDir, 'dollarUnderscore.ts');
      await writeFile(filePath, content, 'utf-8');

      const symbols = await provider.getFunctionSymbols(filePath);

      expect(symbols[0].name).toBe('$_helper_fn$');
    });

    it('returns symbol with very long function name', async () => {
      const longName = 'a'.repeat(200);
      const content = `function ${longName}() { return 1; }`;
      const filePath = join(tempDir, 'longName.ts');
      await writeFile(filePath, content, 'utf-8');

      const symbols = await provider.getFunctionSymbols(filePath);

      expect(symbols[0].name).toBe(longName);
    });

    it('returns symbol with single character name', async () => {
      const content = `function x() { return 1; }`;
      const filePath = join(tempDir, 'singleChar.ts');
      await writeFile(filePath, content, 'utf-8');

      const symbols = await provider.getFunctionSymbols(filePath);

      expect(symbols[0].name).toBe('x');
    });
  });

  describe('violated domain constraints', () => {
    it('returns symbol for let-declared arrow function', async () => {
      const content = `let mutable = () => 1;`;
      const filePath = join(tempDir, 'letArrow.ts');
      await writeFile(filePath, content, 'utf-8');

      const symbols = await provider.getFunctionSymbols(filePath);

      expect(symbols.length).toBe(1);
      expect(symbols[0].name).toBe('mutable');
    });

    it('returns symbol for var-declared arrow function', async () => {
      const content = `var legacy = () => 2;`;
      const filePath = join(tempDir, 'varArrow.ts');
      await writeFile(filePath, content, 'utf-8');

      const symbols = await provider.getFunctionSymbols(filePath);

      expect(symbols.length).toBe(1);
      expect(symbols[0].name).toBe('legacy');
    });

    it('returns correct selectionStartLine and selectionStartCharacter', async () => {
      const content = `const a = () => 1;
const b = () => 2;
const c = () => 3;`;
      const filePath = join(tempDir, 'selectionPos.ts');
      await writeFile(filePath, content, 'utf-8');

      const symbols = await provider.getFunctionSymbols(filePath);

      expect(symbols.length).toBe(3);
      expect(symbols[0].selectionStartLine).toBe(0);
      expect(symbols[1].selectionStartLine).toBe(1);
      expect(symbols[2].selectionStartLine).toBe(2);
    });

    it('returns symbols for deeply nested functions (5 levels)', async () => {
      const content = `function level1() {
  function level2() {
    function level3() {
      function level4() {
        function level5() {
          return 'deep';
        }
        return level5();
      }
      return level4();
    }
    return level3();
  }
  return level2();
}`;
      const filePath = join(tempDir, 'deepNest.ts');
      await writeFile(filePath, content, 'utf-8');

      const symbols = await provider.getFunctionSymbols(filePath);
      const names = symbols.map(s => s.name);

      expect(symbols.length).toBe(5);
      expect(names).toEqual(['level1', 'level2', 'level3', 'level4', 'level5']);
    });

    it('returns symbols for many functions in one file (100+)', async () => {
      const lines = Array.from({ length: 100 }, (_, i) =>
        `function fn${i}() { return ${i}; }`
      );
      const filePath = join(tempDir, 'manyFunctions.ts');
      await writeFile(filePath, lines.join('\n'), 'utf-8');

      const symbols = await provider.getFunctionSymbols(filePath);

      expect(symbols.length).toBe(100);
      expect(symbols[0].name).toBe('fn0');
      expect(symbols[99].name).toBe('fn99');
    });

    it('returns symbol for function with same name in different scopes', async () => {
      const content = `function doWork() { return 'top'; }

class A {
  doWork() { return 'A'; }
}

class B {
  doWork() { return 'B'; }
}`;
      const filePath = join(tempDir, 'sameName.ts');
      await writeFile(filePath, content, 'utf-8');

      const symbols = await provider.getFunctionSymbols(filePath);
      const names = symbols.map(s => s.name);

      expect(names).toEqual(['doWork', 'doWork', 'doWork']);
      // Verify they have distinct line positions (used for symbol ID uniqueness)
      const lines = symbols.map(s => s.selectionStartLine);
      expect(new Set(lines).size).toBe(3);
    });
  });

  describe('file path edge cases', () => {
    it('returns symbols for file in path with spaces', async () => {
      const spacedDir = join(tempDir, 'path with spaces');
      await mkdir(spacedDir, { recursive: true });
      const filePath = join(spacedDir, 'spaced.ts');
      await writeFile(filePath, 'function inSpacedPath() { return 1; }', 'utf-8');

      const symbols = await provider.getFunctionSymbols(filePath);

      expect(symbols.length).toBe(1);
      expect(symbols[0].name).toBe('inSpacedPath');
    });
  });

  describe('JavaScript file support', () => {
    it('returns symbols from a .js file', async () => {
      const content = `function jsFunc(x) { return x + 1; }

const jsArrow = (y) => y * 2;`;
      const filePath = join(tempDir, 'jsfile.js');
      await writeFile(filePath, content, 'utf-8');

      const symbols = await provider.getFunctionSymbols(filePath);
      const names = symbols.map(s => s.name);

      expect(names).toEqual(['jsFunc', 'jsArrow']);
    });

    it('returns symbols from a .jsx file', async () => {
      const content = `function App() {
  return <div>hello</div>;
}`;
      // Note: TS compiler can parse JSX if ScriptTarget allows it
      const filePath = join(tempDir, 'component.jsx');
      await writeFile(filePath, content, 'utf-8');

      const symbols = await provider.getFunctionSymbols(filePath);

      expect(symbols.length).toBe(1);
      expect(symbols[0].name).toBe('App');
    });
  });
});
