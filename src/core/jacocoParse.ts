import type { StatementCover } from "./coverageMap";

/**
 * Minimal JaCoCo XML parser — extracts line-level coverage from <sourcefile> elements.
 *
 * JaCoCo XML structure (relevant parts):
 *   <report>
 *     <package name="com/example">
 *       <sourcefile name="Foo.java">
 *         <line nr="10" mi="0" ci="3" mb="0" cb="0"/>
 *       </sourcefile>
 *     </package>
 *   </report>
 *
 * Line numbers in JaCoCo are 1-based; we emit 0-based for core/coverageMap.
 * A line is "executed" when ci (covered instructions) > 0.
 * File key: "packageName/sourceFileName" (e.g. "com/example/Foo.java").
 */
export function parseJacocoToStatementCovers(xml: string): Map<string, StatementCover[]> {
  const byFile = new Map<string, StatementCover[]>();
  const packageRe = /<package\s+name="([^"]*)"[^>]*>/g;
  const sourcefileRe = /<sourcefile\s+name="([^"]*)"[^>]*>([\s\S]*?)<\/sourcefile>/g;
  // NB: assumes JaCoCo's fixed attribute order (nr, mi, ci) — safe for generated XML.
  const lineRe = /<line\s+nr="(\d+)"\s+mi="(\d+)"\s+ci="(\d+)"[^/]*\/>/g;

  let pkgMatch: RegExpExecArray | null;
  while ((pkgMatch = packageRe.exec(xml)) !== null) {
    const pkgName = pkgMatch[1];
    const pkgStart = pkgMatch.index;
    // Find the end of this package element
    const pkgEndIdx = xml.indexOf("</package>", pkgStart);
    const pkgBody = pkgEndIdx > pkgStart ? xml.slice(pkgStart, pkgEndIdx) : xml.slice(pkgStart);

    let sfMatch: RegExpExecArray | null;
    sourcefileRe.lastIndex = 0;
    while ((sfMatch = sourcefileRe.exec(pkgBody)) !== null) {
      const sfName = sfMatch[1];
      const sfBody = sfMatch[2];
      const fileKey = pkgName ? `${pkgName}/${sfName}` : sfName;

      const stmts: StatementCover[] = [];
      let lineMatch: RegExpExecArray | null;
      lineRe.lastIndex = 0;
      while ((lineMatch = lineRe.exec(sfBody)) !== null) {
        const nr = parseInt(lineMatch[1], 10);
        const ci = parseInt(lineMatch[3], 10);
        if (Number.isNaN(nr) || Number.isNaN(ci) || nr < 1) {
          continue;
        }
        stmts.push({
          executed: ci > 0,
          startLine: nr - 1,
          endLine: nr - 1,
        });
      }

      if (stmts.length > 0) {
        byFile.set(fileKey, stmts);
      }
    }
  }

  return byFile;
}
