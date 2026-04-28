import { parseComplexityFromMessage } from "../../parseComplexity";

/**
 * Parse PMD XML output for CyclomaticComplexity violations.
 *
 * PMD `pmd check -f xml` emits:
 * ```xml
 * <pmd>
 *   <file name="/abs/path/Foo.java">
 *     <violation beginline="10" rule="CyclomaticComplexity" ...>
 *       The method 'bar' has a cyclomatic complexity of 7.
 *     </violation>
 *   </file>
 * </pmd>
 * ```
 *
 * We also accept `ModifiedCyclomaticComplexity` and `StdCyclomaticComplexity`.
 * Returns Map<1-based line number, complexity>.
 */
export function parsePmdCyclomaticXml(xmlText: string): Map<number, number> {
  const byLine = new Map<number, number>();
  const violationRe = /<violation\s([^>]*)>([\s\S]*?)<\/violation>/gi;
  const beginlineRe = /\bbeginline="(\d+)"/i;
  const ruleRe = /\brule="[a-z]*cyclomatic[a-z]*"/i;

  let match: RegExpExecArray | null;
  while ((match = violationRe.exec(xmlText)) !== null) {
    const attrs = match[1];
    const body = match[2];
    if (!ruleRe.test(attrs)) {
      continue;
    }
    const lineMatch = beginlineRe.exec(attrs);
    if (!lineMatch) {
      continue;
    }
    const line = Number.parseInt(lineMatch[1], 10);
    const cc = parseComplexityFromMessage(body);
    if (!Number.isNaN(line) && cc !== undefined) {
      const prev = byLine.get(line) ?? 0;
      byLine.set(line, Math.max(prev, cc));
    }
  }
  return byLine;
}

export { parseComplexityFromMessage as extractComplexityFromMessage } from "../../parseComplexity";
