import { describe, it, expect, vi, beforeEach } from "vitest";

const mockOpenTextDocument = vi.fn();
const mockShowTextDocument = vi.fn();

vi.mock("vscode", () => ({
  workspace: { openTextDocument: (...args: unknown[]) => mockOpenTextDocument(...args) },
  window: { showTextDocument: (...args: unknown[]) => mockShowTextDocument(...args) },
}));

import { openDocument } from "./editor";

function fakeUri(str: string) {
  return { toString: () => str, scheme: "file" };
}

function fakeDoc() {
  return { uri: fakeUri("file:///a.ts") };
}

describe("openDocument", () => {
  beforeEach(() => {
    mockOpenTextDocument.mockReset();
    mockShowTextDocument.mockReset();
  });

  it("opens the text document for the given URI", async () => {
    const uri = fakeUri("file:///x.ts");
    const doc = fakeDoc();
    mockOpenTextDocument.mockResolvedValue(doc);

    await openDocument(uri as any);

    expect(mockOpenTextDocument).toHaveBeenCalledWith(uri);
    expect(mockShowTextDocument).toHaveBeenCalledWith(doc, {});
  });

  it("passes selection to showTextDocument when provided", async () => {
    const uri = fakeUri("file:///x.ts");
    const doc = fakeDoc();
    const selection = { start: { line: 5, character: 3 }, end: { line: 5, character: 3 } };
    mockOpenTextDocument.mockResolvedValue(doc);

    await openDocument(uri as any, selection as any);

    expect(mockShowTextDocument).toHaveBeenCalledWith(doc, { selection });
  });

  it("propagates rejection from openTextDocument and does not call showTextDocument", async () => {
    mockOpenTextDocument.mockRejectedValue(new Error("not found"));

    await expect(openDocument(fakeUri("file:///x.ts") as any)).rejects.toThrow("not found");
    expect(mockShowTextDocument).not.toHaveBeenCalled();
  });

  it("propagates rejection from showTextDocument", async () => {
    mockOpenTextDocument.mockResolvedValue(fakeDoc());
    mockShowTextDocument.mockRejectedValue(new Error("editor unavailable"));

    await expect(openDocument(fakeUri("file:///x.ts") as any)).rejects.toThrow("editor unavailable");
  });
});
