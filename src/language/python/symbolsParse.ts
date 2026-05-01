import type { FunctionSymbolInfo } from '../../core/ports';

type RawSymbol = {
  name: string;
  selectionStartLine: number;
  selectionStartCharacter: number;
  bodyStartLine: number;
  bodyEndLine: number;
};

export function parsePythonSymbolsJson(
  jsonText: string
): FunctionSymbolInfo[] {
  if (!jsonText.trim()) return [];
  try {
    const raw: unknown = JSON.parse(jsonText);
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(isRawSymbol)
      .map((r) => ({
        name: r.name,
        selectionStartLine: r.selectionStartLine,
        selectionStartCharacter: r.selectionStartCharacter,
        bodyStartLine: r.bodyStartLine,
        bodyEndLine: r.bodyEndLine,
      }));
  } catch {
    return [];
  }
}

function isRawSymbol(x: unknown): x is RawSymbol {
  if (typeof x !== 'object' || x === null) return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r['name'] === 'string' &&
    typeof r['selectionStartLine'] === 'number' &&
    typeof r['selectionStartCharacter'] === 'number' &&
    typeof r['bodyStartLine'] === 'number' &&
    typeof r['bodyEndLine'] === 'number'
  );
}
