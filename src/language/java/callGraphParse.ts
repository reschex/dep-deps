/**
 * Java source parser for call graph extraction.
 *
 * Parses Java source text to extract class declarations, method declarations,
 * field types, and method call expressions. Used by callGraphBuild.ts to
 * construct CallEdge[] across multiple files.
 *
 * Uses regex-based parsing (Option B from ADR-005). This is less accurate than
 * a full Java parser but requires no external dependencies and handles the
 * common layered patterns (Service → Repository → Util) well enough for
 * ranking purposes.
 */

/** A method declaration found in Java source. */
export type JavaMethodDecl = {
  readonly name: string;
  /** 0-based line number of the method signature. */
  readonly line: number;
  /** 0-based line number of the closing brace (or last line of body). */
  readonly endLine: number;
  /** Raw source lines of the method body (between opening and closing braces). */
  readonly bodyLines: string[];
};

/** A field or constructor parameter with its type. */
export type JavaFieldDecl = {
  readonly name: string;
  readonly typeName: string;
};

/** Parsed representation of a single Java source file. */
export type JavaSourceInfo = {
  readonly className: string;
  readonly methods: JavaMethodDecl[];
  readonly fields: JavaFieldDecl[];
};

/** Parse a Java source file into structured class/method/field data. */
export function parseJavaSource(source: string): JavaSourceInfo {
  const lines = source.split('\n');

  const className = extractClassName(lines);
  const methods = extractMethods(lines);
  const fields = extractFields(lines);

  return { className, methods, fields };
}

// ── Class name ───────────────────────────────────────────────────────────────

const CLASS_RE = /\bclass\s+(\w+)/;

function extractClassName(lines: string[]): string {
  for (const line of lines) {
    const m = CLASS_RE.exec(line);
    if (m) return m[1];
  }
  return '';
}

// ── Method declarations ──────────────────────────────────────────────────────

/**
 * Match method declarations: access modifier (optional), static (optional),
 * return type, method name, open paren.
 * Excludes constructors (return type is required) and class declarations.
 */
const METHOD_RE = /^\s*(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?(\w+)\s+(\w+)\s*\(/;

/**
 * Words that METHOD_RE may capture in the return-type position but which are not real
 * return types. Each entry documents the pattern that triggers the false match:
 *
 * - Type keywords:  `class Foo(` / `interface Foo(` / `enum Foo(`
 * - Constructors:   `public Foo(` / `private Foo(` / `protected Foo(`
 * - return:         `return format(id)` inside a method body
 * - throw:          `throw buildError()` inside a method body
 * - assert:         `assert check()` inside a method body
 * - else:           `else delete()` on its own line (braces-free else branch)
 */
const NON_RETURN_TYPE_KEYWORDS = new Set([
  'class', 'interface', 'enum',
  'public', 'private', 'protected',
  'return', 'throw', 'assert', 'else',
]);

function extractMethods(lines: string[]): JavaMethodDecl[] {
  const methods: JavaMethodDecl[] = [];

  for (let i = 0; i < lines.length; i++) {
    const m = METHOD_RE.exec(lines[i]);
    if (!m) continue;

    const returnType = m[1];
    const name = m[2];

    if (NON_RETURN_TYPE_KEYWORDS.has(returnType)) continue;

    const endLine = findClosingBrace(lines, i);
    const bodyLines = lines.slice(i + 1, endLine);

    methods.push({ name, line: i, endLine, bodyLines });
  }

  return methods;
}

/** Find the matching closing brace for a method starting at startLine. */
function findClosingBrace(lines: string[], startLine: number): number {
  let depth = 0;
  for (let i = startLine; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) return i;
      }
    }
  }
  return lines.length - 1;
}

// ── Field declarations ───────────────────────────────────────────────────────

/**
 * Match field declarations and constructor parameters.
 * Pattern: (optional modifiers) Type fieldName (= or ;)
 */
const FIELD_RE = /^\s*(?:private|protected|public)?\s*(?:final\s+)?(\w+)\s+(\w+)\s*[;=]/;

function extractFields(lines: string[]): JavaFieldDecl[] {
  const fields: JavaFieldDecl[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const m = FIELD_RE.exec(line);
    if (!m) continue;

    const typeName = m[1];
    const name = m[2];

    // Skip primitive types and common non-class types
    if (isPrimitiveOrKeyword(typeName)) continue;
    if (seen.has(name)) continue;
    seen.add(name);

    fields.push({ name, typeName });
  }

  return fields;
}

function isPrimitiveOrKeyword(type: string): boolean {
  return ['int', 'long', 'short', 'byte', 'float', 'double', 'boolean', 'char',
    'void', 'String', 'class', 'interface', 'enum', 'return', 'if', 'else',
    'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'throw',
    'try', 'catch', 'finally', 'new', 'this', 'super', 'import', 'package',
    'public', 'private', 'protected', 'static', 'final', 'abstract'].includes(type);
}
