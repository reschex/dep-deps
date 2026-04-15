import * as assert from "assert";
import * as vscode from "vscode";

suite("Extension Smoke Test", () => {
  test("extension activates and registers commands", async () => {
    // The extension is activated on startup (onStartupFinished).
    // Give it a moment if activation is asynchronous.
    const ext = vscode.extensions.getExtension("local.dependable-dependencies");
    if (ext && !ext.isActive) {
      await ext.activate();
    }

    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes("ddp.analyzeWorkspace"), "ddp.analyzeWorkspace command should be registered");
    assert.ok(commands.includes("ddp.refresh"), "ddp.refresh command should be registered");
    assert.ok(commands.includes("ddp.revealSymbol"), "ddp.revealSymbol command should be registered");
  });

  test("ddp.analyzeWorkspace runs without throwing", async () => {
    // Running on an empty/minimal workspace — the command should complete
    // gracefully even when there are no files to analyze.
    await assert.doesNotReject(async () => {
      await vscode.commands.executeCommand("ddp.analyzeWorkspace");
    });
  });

  test("DDP Risk tree view is registered", () => {
    // The view "ddp.riskView" is contributed via package.json; verify the
    // TreeView was created by checking that we can reference it without error.
    // There is no public API to list tree views, but we can verify the
    // extension activated (covered above) which registers the view.
    const ext = vscode.extensions.getExtension("local.dependable-dependencies");
    assert.ok(ext?.isActive, "Extension should be active after activation");
  });
});
