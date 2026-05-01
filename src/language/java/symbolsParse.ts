import type { FunctionSymbolInfo } from '../../core/ports';

/**
 * Extract FunctionSymbolInfo[] from PMD CyclomaticComplexity XML output.
 *
 * PMD reports one violation per method. The `beginline`, `endline`, and
 * `method` attributes give us everything we need for FunctionSymbolInfo.
 * Lines are converted from 1-based (PMD) to 0-based (port contract).
 *
 * **Limitation:** PMD only reports violations when a method has complexity
 * at or above the configured minimum threshold (default CC >= 2). Methods
 * with a single path (CC=1) may not appear in PMD output and will be
 * missed by this approach.
 */
export function parsePmdSymbolsXml(xmlText: string): FunctionSymbolInfo[] {
  const symbols: FunctionSymbolInfo[] = [];
  const seen = new Set<string>();

  const violationRe = /<violation\s([^>]*)>/gi;
  const beginlineRe = /\bbeginline="(\d+)"/i;
  const endlineRe = /\bendline="(\d+)"/i;
  const methodRe = /\bmethod="([^"]+)"/i;
  const ruleRe = /\brule="[a-z]*cyclomatic[a-z]*"/i;

  let match: RegExpExecArray | null;
  while ((match = violationRe.exec(xmlText)) !== null) {
    const attrs = match[1];
    if (!ruleRe.test(attrs)) continue;

    const methodMatch = methodRe.exec(attrs);
    const beginMatch = beginlineRe.exec(attrs);
    const endMatch = endlineRe.exec(attrs);

    if (!methodMatch || !beginMatch) continue;

    const name = methodMatch[1];
    const bodyStartLine = parseInt(beginMatch[1], 10) - 1; // 0-based
    const bodyEndLine = endMatch ? parseInt(endMatch[1], 10) - 1 : bodyStartLine;

    const key = `${name}:${bodyStartLine}`;
    if (seen.has(key)) continue;
    seen.add(key);

    symbols.push({
      name,
      selectionStartLine: bodyStartLine,
      selectionStartCharacter: 0,
      bodyStartLine,
      bodyEndLine,
    });
  }

  return symbols;
}
