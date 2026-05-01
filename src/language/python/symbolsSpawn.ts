import { spawnAndCollect } from '../../shared/spawnCollect';

const EXTRACT_SCRIPT = `
import ast, json, sys

def extract(path):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            source = f.read()
    except Exception:
        print('[]')
        return

    try:
        tree = ast.parse(source, filename=path)
    except SyntaxError:
        print('[]')
        return

    symbols = []

    def visit(node):
        for child in ast.iter_child_nodes(node):
            if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                symbols.append({
                    'name': child.name,
                    'selectionStartLine': child.lineno - 1,
                    'selectionStartCharacter': child.col_offset,
                    'bodyStartLine': child.lineno - 1,
                    'bodyEndLine': (child.end_lineno or child.lineno) - 1
                })
            visit(child)

    visit(tree)
    print(json.dumps(symbols))

extract(sys.argv[1])
`.trim();

export async function runPythonSymbolExtraction(
  pythonPath: string,
  filePath: string,
  cwd: string,
  timeoutMs: number
): Promise<string> {
  return spawnAndCollect(
    pythonPath,
    ['-c', EXTRACT_SCRIPT, filePath],
    cwd,
    timeoutMs
  );
}
