/**
 * Pure Java call graph builder — extracts CallEdge[] from Java source files.
 *
 * Reads Java source files, parses them for class/method/field declarations,
 * then resolves method call expressions to target declarations across files.
 *
 * Symbol IDs use the format `uri#line:0` (0-based line, character always 0)
 * to match JavaSymbolProvider (PMD) output.
 *
 * Implementation approach: Option B from ADR-005 — direct source parsing via regex.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { CallEdge } from '../../core/rank';
import { parseJavaSource, type JavaSourceInfo } from './callGraphParse';

/** Parsed file with its URI and source info. */
type ParsedFile = {
  readonly uri: string;
  readonly info: JavaSourceInfo;
};

/** Index entry for a method: class name → method name → symbol ID. */
type MethodIndex = Map<string, Map<string, string>>;

/**
 * Build call graph edges from Java source files.
 *
 * @param fileUris Source file URIs (file:// scheme or absolute paths)
 * @returns Deduplicated call edges with symbol IDs in `uri#line:0` format
 */
export async function buildJavaCallEdges(
  fileUris: string[],
): Promise<CallEdge[]> {
  // 1. Read and parse all files
  const parsed = await parseAllFiles(fileUris);

  // 2. Build method index: className → methodName → symbolId
  const methodIndex = buildMethodIndex(parsed);

  // 3. Extract edges by resolving calls in each method
  const edges: CallEdge[] = [];
  const seen = new Set<string>();

  for (const file of parsed) {
    for (const method of file.info.methods) {
      const callerId = makeSymbolId(file.uri, method.line);
      const calls = extractMethodCalls(method.bodyLines);

      for (const call of calls) {
        const calleeId = resolveCallee(call, file.info, methodIndex);
        if (!calleeId || calleeId === callerId) continue; // skip unresolved + self-calls

        const key = `${callerId}→${calleeId}`;
        if (seen.has(key)) continue;
        seen.add(key);

        edges.push({ caller: callerId, callee: calleeId });
      }
    }
  }

  return edges;
}

// ── File reading ─────────────────────────────────────────────────────────────

async function parseAllFiles(fileUris: string[]): Promise<ParsedFile[]> {
  const candidates = await Promise.all(
    fileUris.map(async (rawUri): Promise<ParsedFile | null> => {
      try {
        const filePath = rawUri.startsWith('file://') ? fileURLToPath(rawUri) : rawUri;
        const uri = rawUri.startsWith('file://') ? rawUri : pathToFileURL(rawUri).toString();
        const source = await readFile(filePath, 'utf-8');
        const info = parseJavaSource(source);
        return info.className ? { uri, info } : null;
      } catch {
        // Malformed or unreadable file — skip silently
        return null;
      }
    }),
  );

  return candidates.filter((r): r is ParsedFile => r !== null);
}

// ── Method index ─────────────────────────────────────────────────────────────

function buildMethodIndex(files: ParsedFile[]): MethodIndex {
  const index: MethodIndex = new Map();

  for (const file of files) {
    const className = file.info.className;
    if (!index.has(className)) {
      index.set(className, new Map());
    }
    const methods = index.get(className)!;

    for (const method of file.info.methods) {
      methods.set(method.name, makeSymbolId(file.uri, method.line));
    }
  }

  return index;
}

// ── Call extraction ──────────────────────────────────────────────────────────

/** A method call found in source: receiver (or null for unqualified) + method name. */
type MethodCall = {
  readonly receiver: string | null;
  readonly methodName: string;
};

/**
 * Extract method call expressions from method body lines.
 *
 * Patterns matched:
 * - `this.method(...)` → receiver="this"
 * - `variable.method(...)` → receiver=variable name
 * - `method(...)` → receiver=null (unqualified, same-class)
 */
const CALL_RE = /\b(?:(\w+)\.)?(\w+)\s*\(/g;

/** Keywords that look like method calls but aren't. */
const CALL_BLACKLIST = new Set([
  'if', 'else', 'for', 'while', 'do', 'switch', 'catch', 'return',
  'new', 'throw', 'class', 'interface', 'enum', 'super', 'assert',
  'synchronized', 'instanceof', 'try', 'finally',
]);

function extractMethodCalls(bodyLines: string[]): MethodCall[] {
  const calls: MethodCall[] = [];
  const body = bodyLines.join('\n');

  for (const match of body.matchAll(CALL_RE)) {
    const receiver = match[1] ?? null;
    const methodName = match[2];

    if (CALL_BLACKLIST.has(methodName)) continue;

    calls.push({ receiver, methodName });
  }

  return calls;
}

// ── Call resolution ──────────────────────────────────────────────────────────

/**
 * Resolve a method call to a target symbol ID.
 *
 * Resolution strategy:
 * 1. `this.method()` or unqualified `method()` → look in current class
 * 2. `variable.method()` → look up variable type from fields, find method in that class
 */
function resolveCallee(
  call: MethodCall,
  callerFile: JavaSourceInfo,
  methodIndex: MethodIndex,
): string | undefined {
  const { receiver, methodName } = call;

  // Unqualified or this-qualified: look in current class
  if (receiver === null || receiver === 'this') {
    return methodIndex.get(callerFile.className)?.get(methodName);
  }

  // Qualified call: resolve receiver type from fields
  const field = callerFile.fields.find((f) => f.name === receiver);
  if (field) {
    return methodIndex.get(field.typeName)?.get(methodName);
  }

  // Try receiver as a class name directly (static calls like Util.format())
  return methodIndex.get(receiver)?.get(methodName);
}

// ── Symbol ID ────────────────────────────────────────────────────────────────

/** Build symbol ID matching JavaSymbolProvider format: `uri#line:0` (0-based). */
function makeSymbolId(uri: string, line: number): string {
  return `${uri}#${line}:0`;
}
