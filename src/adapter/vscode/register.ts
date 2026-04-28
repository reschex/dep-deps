import * as vscode from "vscode";
import { AnalysisService } from "./analysisService";
import { ExtensionState } from "./extensionState";
import { RiskTreeProvider } from "./ui/riskTreeProvider";
import { DecorationManager } from "./ui/decorationManager";
import { DdpCodeLensProvider } from "./ui/codeLensProvider";
import { DdpHoverProvider } from "./ui/hoverProvider";
import { revealSymbolById } from "./ui/revealSymbol";
import { openDocument } from "./ui/editor";
import { AnalyzeCommand } from "./analyzeCommand";
import { showImpactTree } from "./impactTreeCommand";
import { buildConfiguration, type AnalysisScope } from "./configuration";

const selector: vscode.DocumentSelector = [
  { scheme: "file", language: "typescript" },
  { scheme: "file", language: "javascript" },
  { scheme: "file", language: "typescriptreact" },
  { scheme: "file", language: "javascriptreact" },
  { scheme: "file", language: "python" },
  { scheme: "file", language: "java" },
];

export function registerDdp(context: vscode.ExtensionContext): void {
  const state = new ExtensionState();
  const analysisService = new AnalysisService();
  const tree = new RiskTreeProvider(state);
  const getConfig = () => {
    const raw = vscode.workspace.getConfiguration("ddp");
    return buildConfiguration(<T>(key: string, def: T) => raw.get<T>(key, def));
  };
  const deco = new DecorationManager(state, () => getConfig().decoration);
  const codeLens = new DdpCodeLensProvider(state, getConfig);
  const hover = new DdpHoverProvider(state);

  const treeView = vscode.window.createTreeView("ddp.riskView", {
    treeDataProvider: tree,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  const analyzeCmd = new AnalyzeCommand(
    (token, scope) => analysisService.analyze(token, scope),
    state,
    {
      refreshTree: () => tree.refresh(),
      invalidateCodeLens: () => codeLens.invalidate(),
      applyDecorations: () => {
        for (const ed of vscode.window.visibleTextEditors) {
          deco.applyActiveEditor(ed);
        }
      },
    }
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("ddp.analyzeWorkspace", () => analyzeCmd.execute()),
    vscode.commands.registerCommand("ddp.analyzeFolder", async () => {
      const folders = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: "Analyze Folder",
        defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
      });
      if (!folders?.length) {
        return;
      }
      const scope: AnalysisScope = { rootUri: folders[0].toString() };
      return analyzeCmd.execute(scope);
    }),
    vscode.commands.registerCommand("ddp.refresh", () => analyzeCmd.execute(state.lastScope)),
    vscode.commands.registerCommand("ddp.riskView.refresh", () => analyzeCmd.execute(state.lastScope)),
    vscode.commands.registerCommand("ddp.revealSymbol", (id: string) => revealSymbolById(id)),
    vscode.commands.registerCommand("ddp.riskView.openFile", (uri: vscode.Uri) => openDocument(uri)),
    vscode.commands.registerCommand("ddp.riskView.sortByF", () => tree.setSortField("f")),
    vscode.commands.registerCommand("ddp.riskView.sortByFPrime", () => tree.setSortField("fPrime")),
    vscode.commands.registerCommand("ddp.riskView.sortByG", () => tree.setSortField("g")),
    vscode.commands.registerCommand("ddp.riskView.sortByCC", () => tree.setSortField("cc")),
    vscode.commands.registerCommand("ddp.riskView.sortByCRAP", () => tree.setSortField("crap")),
    vscode.commands.registerCommand("ddp.showImpactTree", async (node?: { type: string; symbol?: { id: string } }) => {
      if (node?.type === "symbol" && node.symbol) {
        const selectedId = await showImpactTree(state, node.symbol.id);
        if (selectedId) {
          await revealSymbolById(selectedId);
        }
      }
    }),
    vscode.languages.registerCodeLensProvider(selector, codeLens),
    vscode.languages.registerHoverProvider(selector, hover),
    deco,
    vscode.window.onDidChangeActiveTextEditor((ed) => {
      deco.applyActiveEditor(ed);
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("ddp")) {
        deco.applyActiveEditor(vscode.window.activeTextEditor);
      }
    })
  );

  deco.applyActiveEditor(vscode.window.activeTextEditor);
}
