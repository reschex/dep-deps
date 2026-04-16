import { describe, it, expect, vi, beforeEach } from "vitest";

// ── vscode mock ──────────────────────────────────────────────────────
const mockDispose1 = vi.fn();
const mockDispose2 = vi.fn();
let decoTypeCounter = 0;

vi.mock("vscode", () => {
  class Range {
    constructor(
      public startLine: number,
      public startChar: number,
      public endLine: number,
      public endChar: number,
    ) {}
  }
  return {
    window: {
      createTextEditorDecorationType: vi.fn(() => {
        decoTypeCounter++;
        // First call = warnDeco, second = errorDeco
        return { dispose: decoTypeCounter % 2 === 1 ? mockDispose1 : mockDispose2 };
      }),
    },
    Range,
  };
});

// ── mock decorationTier ──────────────────────────────────────────────
vi.mock("../core/viewModel", () => ({
  decorationTier: vi.fn(),
}));

import { DecorationManager } from "./decorationManager";
import { decorationTier } from "../core/viewModel";
import type { DecorationConfig } from "./configuration";

// ── helpers ──────────────────────────────────────────────────────────
function fakeState(fileRollup?: Map<string, number>) {
  if (!fileRollup) {
    return { lastAnalysis: undefined } as any;
  }
  return {
    lastAnalysis: { fileRollup, symbols: [], edgesCount: 0 },
  } as any;
}

const defaultDecoConfig: DecorationConfig = {
  warnThreshold: 50,
  errorThreshold: 150,
};

function fakeEditor(
  uriStr = "file:///a.ts",
  lineCount = 10,
  lastLineLength = 20,
) {
  return {
    document: {
      uri: { toString: () => uriStr },
      lineCount,
      lineAt: (n: number) => ({ text: "x".repeat(n === lineCount - 1 ? lastLineLength : 10) }),
    },
    setDecorations: vi.fn(),
  } as any;
}

// ═════════════════════════════════════════════════════════════════════
// DecorationManager
// ═════════════════════════════════════════════════════════════════════
describe("DecorationManager", () => {
  beforeEach(() => {
    vi.mocked(decorationTier).mockReset();
    decoTypeCounter = 0;
    mockDispose1.mockReset();
    mockDispose2.mockReset();
  });

  // ─── applyActiveEditor: early returns ──────────────────────────────
  describe("applyActiveEditor — early returns", () => {
    it("returns without setting decorations when editor is undefined", () => {
      const mgr = new DecorationManager(fakeState(), () => defaultDecoConfig);

      mgr.applyActiveEditor(undefined);

      // No error thrown, decorationTier not called
      expect(decorationTier).not.toHaveBeenCalled();
    });

    it("returns without setting decorations when editor.document is undefined", () => {
      const mgr = new DecorationManager(fakeState(), () => defaultDecoConfig);
      const editor = { document: undefined, setDecorations: vi.fn() } as any;

      mgr.applyActiveEditor(editor);

      expect(editor.setDecorations).not.toHaveBeenCalled();
      expect(decorationTier).not.toHaveBeenCalled();
    });
  });

  // ─── applyActiveEditor: clears decorations ────────────────────────
  describe("applyActiveEditor — clears decorations", () => {
    it("clears both decorations when lastAnalysis is undefined", () => {
      const mgr = new DecorationManager(fakeState(), () => defaultDecoConfig);
      const editor = fakeEditor("file:///a.ts");

      mgr.applyActiveEditor(editor);

      expect(editor.setDecorations).toHaveBeenCalledTimes(2);
      expect(editor.setDecorations).toHaveBeenCalledWith(expect.anything(), []);
      expect(decorationTier).not.toHaveBeenCalled();
    });

    it("clears both decorations when file URI is not in fileRollup", () => {
      const rollup = new Map([["file:///other.ts", 100]]);
      const mgr = new DecorationManager(fakeState(rollup), () => defaultDecoConfig);
      const editor = fakeEditor("file:///a.ts");

      mgr.applyActiveEditor(editor);

      expect(editor.setDecorations).toHaveBeenCalledTimes(2);
      expect(editor.setDecorations).toHaveBeenCalledWith(expect.anything(), []);
      expect(decorationTier).not.toHaveBeenCalled();
    });
  });

  // ─── applyActiveEditor: tier-based decoration ─────────────────────
  describe("applyActiveEditor — applies tier-based decoration", () => {
    it("sets error decoration and clears warn when tier is error", () => {
      const rollup = new Map([["file:///a.ts", 200]]);
      const mgr = new DecorationManager(fakeState(rollup), () => defaultDecoConfig);
      const editor = fakeEditor("file:///a.ts");
      vi.mocked(decorationTier).mockReturnValue("error");

      mgr.applyActiveEditor(editor);

      // Called twice: clear warn, set error
      expect(editor.setDecorations).toHaveBeenCalledTimes(2);
      // First call clears warn with []
      expect(editor.setDecorations.mock.calls[0][1]).toEqual([]);
      // Second call sets error with a range array of length 1
      expect(editor.setDecorations.mock.calls[1][1]).toHaveLength(1);
    });

    it("sets warn decoration and clears error when tier is warn", () => {
      const rollup = new Map([["file:///a.ts", 100]]);
      const mgr = new DecorationManager(fakeState(rollup), () => defaultDecoConfig);
      const editor = fakeEditor("file:///a.ts");
      vi.mocked(decorationTier).mockReturnValue("warn");

      mgr.applyActiveEditor(editor);

      expect(editor.setDecorations).toHaveBeenCalledTimes(2);
      // First call clears error with []
      expect(editor.setDecorations.mock.calls[0][1]).toEqual([]);
      // Second call sets warn with a range array of length 1
      expect(editor.setDecorations.mock.calls[1][1]).toHaveLength(1);
    });

    it("clears both decorations when tier is none", () => {
      const rollup = new Map([["file:///a.ts", 5]]);
      const mgr = new DecorationManager(fakeState(rollup), () => defaultDecoConfig);
      const editor = fakeEditor("file:///a.ts");
      vi.mocked(decorationTier).mockReturnValue("none");

      mgr.applyActiveEditor(editor);

      expect(editor.setDecorations).toHaveBeenCalledTimes(2);
      expect(editor.setDecorations.mock.calls[0][1]).toEqual([]);
      expect(editor.setDecorations.mock.calls[1][1]).toEqual([]);
    });
  });

  // ─── applyActiveEditor: full document range ────────────────────────
  describe("applyActiveEditor — full document range", () => {
    it("passes range spanning entire document to setDecorations", () => {
      const rollup = new Map([["file:///a.ts", 200]]);
      const mgr = new DecorationManager(fakeState(rollup), () => defaultDecoConfig);
      const editor = fakeEditor("file:///a.ts", 5, 30);
      vi.mocked(decorationTier).mockReturnValue("error");

      mgr.applyActiveEditor(editor);

      // The range passed for error decoration (second call, index 1)
      const range = editor.setDecorations.mock.calls[1][1][0];
      expect(range.startLine).toBe(0);
      expect(range.startChar).toBe(0);
      expect(range.endLine).toBe(4);   // lineCount - 1
      expect(range.endChar).toBe(30);  // lastLineLength
    });
  });

  // ─── applyActiveEditor: threshold boundaries ──────────────────────
  describe("applyActiveEditor — threshold boundaries", () => {
    it("calls decorationTier with the fileRollup value and config thresholds", () => {
      const rollup = new Map([["file:///a.ts", 50]]);
      const config: DecorationConfig = { warnThreshold: 50, errorThreshold: 150 };
      const mgr = new DecorationManager(fakeState(rollup), () => config);
      const editor = fakeEditor("file:///a.ts");
      vi.mocked(decorationTier).mockReturnValue("warn");

      mgr.applyActiveEditor(editor);

      expect(decorationTier).toHaveBeenCalledWith(50, 50, 150);
    });

    it("calls decorationTier with value exactly equal to errorThreshold", () => {
      const rollup = new Map([["file:///a.ts", 150]]);
      const config: DecorationConfig = { warnThreshold: 50, errorThreshold: 150 };
      const mgr = new DecorationManager(fakeState(rollup), () => config);
      const editor = fakeEditor("file:///a.ts");
      vi.mocked(decorationTier).mockReturnValue("error");

      mgr.applyActiveEditor(editor);

      expect(decorationTier).toHaveBeenCalledWith(150, 50, 150);
    });
  });

  // ─── applyActiveEditor: config freshness ──────────────────────────
  describe("applyActiveEditor — config freshness", () => {
    it("reads getDecoConfig on each call so config changes are respected", () => {
      const rollup = new Map([["file:///a.ts", 100]]);
      const configFn = vi.fn<() => DecorationConfig>();
      configFn
        .mockReturnValueOnce({ warnThreshold: 50, errorThreshold: 150 })
        .mockReturnValueOnce({ warnThreshold: 200, errorThreshold: 300 });
      const mgr = new DecorationManager(fakeState(rollup), configFn);
      vi.mocked(decorationTier).mockReturnValueOnce("warn").mockReturnValueOnce("none");

      mgr.applyActiveEditor(fakeEditor("file:///a.ts"));
      mgr.applyActiveEditor(fakeEditor("file:///a.ts"));

      expect(configFn).toHaveBeenCalledTimes(2);
      expect(decorationTier).toHaveBeenNthCalledWith(1, 100, 50, 150);
      expect(decorationTier).toHaveBeenNthCalledWith(2, 100, 200, 300);
    });
  });

  // ─── applyActiveEditor: consecutive calls ─────────────────────────
  describe("applyActiveEditor — consecutive calls", () => {
    it("replaces previous decoration on second call to same editor", () => {
      const rollup = new Map([["file:///a.ts", 100]]);
      const mgr = new DecorationManager(fakeState(rollup), () => defaultDecoConfig);
      const editor = fakeEditor("file:///a.ts");
      vi.mocked(decorationTier).mockReturnValueOnce("warn").mockReturnValueOnce("error");

      mgr.applyActiveEditor(editor);
      mgr.applyActiveEditor(editor);

      // 4 total setDecorations calls (2 per applyActiveEditor)
      expect(editor.setDecorations).toHaveBeenCalledTimes(4);
    });
  });

  // ─── fullDocumentRange edge cases (tested via applyActiveEditor) ──
  describe("fullDocumentRange — edge cases", () => {
    it("returns Range(0,0,0,0) when document has lineCount 0", () => {
      const rollup = new Map([["file:///a.ts", 200]]);
      const mgr = new DecorationManager(fakeState(rollup), () => defaultDecoConfig);
      vi.mocked(decorationTier).mockReturnValue("error");
      const editor = {
        document: {
          uri: { toString: () => "file:///a.ts" },
          lineCount: 0,
          lineAt: () => ({ text: "" }),
        },
        setDecorations: vi.fn(),
      } as any;

      mgr.applyActiveEditor(editor);

      const range = editor.setDecorations.mock.calls[1][1][0];
      expect(range.startLine).toBe(0);
      expect(range.startChar).toBe(0);
      expect(range.endLine).toBe(0);
      expect(range.endChar).toBe(0);
    });

    it("returns correct range for single-line document", () => {
      const rollup = new Map([["file:///a.ts", 200]]);
      const mgr = new DecorationManager(fakeState(rollup), () => defaultDecoConfig);
      vi.mocked(decorationTier).mockReturnValue("error");
      const editor = {
        document: {
          uri: { toString: () => "file:///a.ts" },
          lineCount: 1,
          lineAt: () => ({ text: "hello world" }),
        },
        setDecorations: vi.fn(),
      } as any;

      mgr.applyActiveEditor(editor);

      const range = editor.setDecorations.mock.calls[1][1][0];
      expect(range.startLine).toBe(0);
      expect(range.startChar).toBe(0);
      expect(range.endLine).toBe(0);
      expect(range.endChar).toBe(11); // "hello world".length
    });
  });

  // ─── URI matching ─────────────────────────────────────────────────
  describe("applyActiveEditor — URI matching", () => {
    it("uses editor.document.uri.toString() to look up fileRollup", () => {
      const rollup = new Map([["file:///exact/path.ts", 200]]);
      const mgr = new DecorationManager(fakeState(rollup), () => defaultDecoConfig);
      vi.mocked(decorationTier).mockReturnValue("error");
      const editor = fakeEditor("file:///exact/path.ts");

      mgr.applyActiveEditor(editor);

      expect(decorationTier).toHaveBeenCalledWith(200, 50, 150);
    });

    it("does not match when URI differs by case or encoding", () => {
      const rollup = new Map([["file:///a.ts", 200]]);
      const mgr = new DecorationManager(fakeState(rollup), () => defaultDecoConfig);
      const editor = fakeEditor("file:///A.ts");

      mgr.applyActiveEditor(editor);

      // URI not found → clears both, decorationTier not called
      expect(decorationTier).not.toHaveBeenCalled();
      expect(editor.setDecorations).toHaveBeenCalledTimes(2);
      expect(editor.setDecorations.mock.calls[0][1]).toEqual([]);
      expect(editor.setDecorations.mock.calls[1][1]).toEqual([]);
    });
  });

  // ─── dispose ───────────────────────────────────────────────────────
  describe("dispose", () => {
    it("disposes both warn and error decoration types", () => {
      const mgr = new DecorationManager(fakeState(), () => defaultDecoConfig);

      mgr.dispose();

      expect(mockDispose1).toHaveBeenCalledOnce();
      expect(mockDispose2).toHaveBeenCalledOnce();
    });
  });

  // ═════════════════════════════════════════════════════════════════
  // bugmagnet session 2026-04-16
  // ═════════════════════════════════════════════════════════════════
  describe("bugmagnet session 2026-04-16", () => {
    // ── numeric edge cases for fileRollup values ───────────────────
    describe("numeric edge cases for fileRollup values", () => {
      it("passes zero fileRollup value to decorationTier", () => {
        const rollup = new Map([["file:///a.ts", 0]]);
        const mgr = new DecorationManager(fakeState(rollup), () => defaultDecoConfig);
        const editor = fakeEditor("file:///a.ts");
        vi.mocked(decorationTier).mockReturnValue("none");

        mgr.applyActiveEditor(editor);

        expect(decorationTier).toHaveBeenCalledWith(0, 50, 150);
      });

      it("passes negative fileRollup value to decorationTier", () => {
        const rollup = new Map([["file:///a.ts", -5]]);
        const mgr = new DecorationManager(fakeState(rollup), () => defaultDecoConfig);
        const editor = fakeEditor("file:///a.ts");
        vi.mocked(decorationTier).mockReturnValue("none");

        mgr.applyActiveEditor(editor);

        expect(decorationTier).toHaveBeenCalledWith(-5, 50, 150);
      });

      it("passes very large fileRollup value to decorationTier", () => {
        const rollup = new Map([["file:///a.ts", Number.MAX_SAFE_INTEGER]]);
        const mgr = new DecorationManager(fakeState(rollup), () => defaultDecoConfig);
        const editor = fakeEditor("file:///a.ts");
        vi.mocked(decorationTier).mockReturnValue("error");

        mgr.applyActiveEditor(editor);

        expect(decorationTier).toHaveBeenCalledWith(Number.MAX_SAFE_INTEGER, 50, 150);
      });

      it("passes NaN fileRollup value to decorationTier", () => {
        const rollup = new Map([["file:///a.ts", NaN]]);
        const mgr = new DecorationManager(fakeState(rollup), () => defaultDecoConfig);
        const editor = fakeEditor("file:///a.ts");
        vi.mocked(decorationTier).mockReturnValue("none");

        mgr.applyActiveEditor(editor);

        expect(decorationTier).toHaveBeenCalledWith(NaN, 50, 150);
      });

      it("passes Infinity fileRollup value to decorationTier", () => {
        const rollup = new Map([["file:///a.ts", Infinity]]);
        const mgr = new DecorationManager(fakeState(rollup), () => defaultDecoConfig);
        const editor = fakeEditor("file:///a.ts");
        vi.mocked(decorationTier).mockReturnValue("error");

        mgr.applyActiveEditor(editor);

        expect(decorationTier).toHaveBeenCalledWith(Infinity, 50, 150);
      });

      it("passes fractional fileRollup value to decorationTier", () => {
        const rollup = new Map([["file:///a.ts", 49.999]]);
        const mgr = new DecorationManager(fakeState(rollup), () => defaultDecoConfig);
        const editor = fakeEditor("file:///a.ts");
        vi.mocked(decorationTier).mockReturnValue("none");

        mgr.applyActiveEditor(editor);

        expect(decorationTier).toHaveBeenCalledWith(49.999, 50, 150);
      });
    });

    // ── complex interactions ───────────────────────────────────────
    describe("complex interactions", () => {
      it("applies error then switches to warn on tier change between calls", () => {
        const rollup = new Map([["file:///a.ts", 200]]);
        const mgr = new DecorationManager(fakeState(rollup), () => defaultDecoConfig);
        const editor = fakeEditor("file:///a.ts");
        vi.mocked(decorationTier)
          .mockReturnValueOnce("error")
          .mockReturnValueOnce("warn");

        mgr.applyActiveEditor(editor);

        // First call: error tier → clear warn (call 0), set error (call 1)
        expect(editor.setDecorations.mock.calls[0][1]).toEqual([]);
        expect(editor.setDecorations.mock.calls[1][1]).toHaveLength(1);

        mgr.applyActiveEditor(editor);

        // Second call: warn tier → clear error (call 2), set warn (call 3)
        expect(editor.setDecorations.mock.calls[2][1]).toEqual([]);
        expect(editor.setDecorations.mock.calls[3][1]).toHaveLength(1);
      });

      it("applies decorations to different editors with different URIs independently", () => {
        const rollup = new Map([
          ["file:///a.ts", 200],
          ["file:///b.ts", 5],
        ]);
        const mgr = new DecorationManager(fakeState(rollup), () => defaultDecoConfig);
        const editorA = fakeEditor("file:///a.ts");
        const editorB = fakeEditor("file:///b.ts");
        vi.mocked(decorationTier)
          .mockReturnValueOnce("error")
          .mockReturnValueOnce("none");

        mgr.applyActiveEditor(editorA);
        mgr.applyActiveEditor(editorB);

        // editorA got error decoration (one range)
        expect(editorA.setDecorations.mock.calls[1][1]).toHaveLength(1);
        // editorB got cleared (none tier)
        expect(editorB.setDecorations.mock.calls[0][1]).toEqual([]);
        expect(editorB.setDecorations.mock.calls[1][1]).toEqual([]);
      });

      it("handles state going from analysis to undefined between calls", () => {
        const rollup = new Map([["file:///a.ts", 200]]);
        const mutableState = {
          lastAnalysis: { fileRollup: rollup, symbols: [], edgesCount: 0 } as any,
        };
        const mgr = new DecorationManager(mutableState as any, () => defaultDecoConfig);
        const editor = fakeEditor("file:///a.ts");
        vi.mocked(decorationTier).mockReturnValue("error");

        mgr.applyActiveEditor(editor);
        expect(editor.setDecorations.mock.calls[1][1]).toHaveLength(1);

        // State becomes undefined (analysis cleared)
        mutableState.lastAnalysis = undefined;
        mgr.applyActiveEditor(editor);

        // Calls 2 and 3: both clear decorations
        expect(editor.setDecorations.mock.calls[2][1]).toEqual([]);
        expect(editor.setDecorations.mock.calls[3][1]).toEqual([]);
      });

      it("handles analysis updating with new fileRollup between calls", () => {
        const rollup1 = new Map([["file:///a.ts", 200]]);
        const rollup2 = new Map([["file:///a.ts", 10]]);
        const mutableState = {
          lastAnalysis: { fileRollup: rollup1, symbols: [], edgesCount: 0 } as any,
        };
        const mgr = new DecorationManager(mutableState as any, () => defaultDecoConfig);
        const editor = fakeEditor("file:///a.ts");
        vi.mocked(decorationTier)
          .mockReturnValueOnce("error")
          .mockReturnValueOnce("none");

        mgr.applyActiveEditor(editor);

        // Update analysis in place
        mutableState.lastAnalysis = { fileRollup: rollup2, symbols: [], edgesCount: 0 };
        mgr.applyActiveEditor(editor);

        expect(decorationTier).toHaveBeenNthCalledWith(1, 200, 50, 150);
        expect(decorationTier).toHaveBeenNthCalledWith(2, 10, 50, 150);
      });
    });

    // ── stateful operations ────────────────────────────────────────
    describe("stateful operations", () => {
      it("applies same editor three times in a row without error", () => {
        const rollup = new Map([["file:///a.ts", 100]]);
        const mgr = new DecorationManager(fakeState(rollup), () => defaultDecoConfig);
        const editor = fakeEditor("file:///a.ts");
        vi.mocked(decorationTier).mockReturnValue("warn");

        mgr.applyActiveEditor(editor);
        mgr.applyActiveEditor(editor);
        mgr.applyActiveEditor(editor);

        expect(editor.setDecorations).toHaveBeenCalledTimes(6); // 2 per call × 3
      });

      it("alternates between defined editor and undefined without error", () => {
        const rollup = new Map([["file:///a.ts", 100]]);
        const mgr = new DecorationManager(fakeState(rollup), () => defaultDecoConfig);
        const editor = fakeEditor("file:///a.ts");
        vi.mocked(decorationTier).mockReturnValue("warn");

        mgr.applyActiveEditor(editor);
        mgr.applyActiveEditor(undefined);
        mgr.applyActiveEditor(editor);

        expect(editor.setDecorations).toHaveBeenCalledTimes(4); // 2 + 0 + 2
      });

      it("can still apply decorations after dispose (no guard)", () => {
        // Verifying current behavior: dispose doesn't prevent future applyActiveEditor
        const rollup = new Map([["file:///a.ts", 100]]);
        const mgr = new DecorationManager(fakeState(rollup), () => defaultDecoConfig);
        const editor = fakeEditor("file:///a.ts");
        vi.mocked(decorationTier).mockReturnValue("warn");

        mgr.dispose();
        mgr.applyActiveEditor(editor);

        // setDecorations is still called — dispose doesn't set a "disposed" flag
        expect(editor.setDecorations).toHaveBeenCalledTimes(2);
      });

      it("dispose can be called multiple times without error", () => {
        const mgr = new DecorationManager(fakeState(), () => defaultDecoConfig);

        mgr.dispose();
        mgr.dispose();

        expect(mockDispose1).toHaveBeenCalledTimes(2);
        expect(mockDispose2).toHaveBeenCalledTimes(2);
      });
    });

    // ── decoration type identity ───────────────────────────────────
    describe("decoration type identity", () => {
      it("passes distinct decoration types for warn and error to setDecorations", () => {
        const rollup = new Map([["file:///a.ts", 200]]);
        const mgr = new DecorationManager(fakeState(rollup), () => defaultDecoConfig);
        const editor = fakeEditor("file:///a.ts");
        vi.mocked(decorationTier).mockReturnValue("error");

        mgr.applyActiveEditor(editor);

        // Two distinct decoration type objects passed in the two setDecorations calls
        const decoType0 = editor.setDecorations.mock.calls[0][0];
        const decoType1 = editor.setDecorations.mock.calls[1][0];
        expect(decoType0).not.toBe(decoType1);
      });

      it("reuses same decoration type objects across multiple applyActiveEditor calls", () => {
        const rollup = new Map([["file:///a.ts", 200]]);
        const mgr = new DecorationManager(fakeState(rollup), () => defaultDecoConfig);
        const editor = fakeEditor("file:///a.ts");
        vi.mocked(decorationTier).mockReturnValue("error");

        mgr.applyActiveEditor(editor);
        mgr.applyActiveEditor(editor);

        // Same decoration type objects used in both calls
        expect(editor.setDecorations.mock.calls[0][0]).toBe(editor.setDecorations.mock.calls[2][0]);
        expect(editor.setDecorations.mock.calls[1][0]).toBe(editor.setDecorations.mock.calls[3][0]);
      });
    });

    // ── violated domain constraints ────────────────────────────────
    describe("violated domain constraints", () => {
      it("treats fileRollup value of 0 as defined and calls decorationTier", () => {
        // 0 is falsy but explicitly stored in the map — should NOT be treated as missing
        const rollup = new Map([["file:///a.ts", 0]]);
        const mgr = new DecorationManager(fakeState(rollup), () => defaultDecoConfig);
        const editor = fakeEditor("file:///a.ts");
        vi.mocked(decorationTier).mockReturnValue("none");

        mgr.applyActiveEditor(editor);

        // Critically: decorationTier IS called (0 !== undefined)
        expect(decorationTier).toHaveBeenCalledOnce();
        expect(decorationTier).toHaveBeenCalledWith(0, 50, 150);
      });

      it("handles empty fileRollup map as no data for any URI", () => {
        const rollup = new Map<string, number>();
        const mgr = new DecorationManager(fakeState(rollup), () => defaultDecoConfig);
        const editor = fakeEditor("file:///a.ts");

        mgr.applyActiveEditor(editor);

        expect(decorationTier).not.toHaveBeenCalled();
        expect(editor.setDecorations).toHaveBeenCalledTimes(2);
        expect(editor.setDecorations.mock.calls[0][1]).toEqual([]);
        expect(editor.setDecorations.mock.calls[1][1]).toEqual([]);
      });

      it("handles fileRollup with many entries and only matches the correct URI", () => {
        const rollup = new Map<string, number>();
        for (let i = 0; i < 100; i++) {
          rollup.set(`file:///file${i}.ts`, i * 10);
        }
        rollup.set("file:///target.ts", 999);
        const mgr = new DecorationManager(fakeState(rollup), () => defaultDecoConfig);
        const editor = fakeEditor("file:///target.ts");
        vi.mocked(decorationTier).mockReturnValue("error");

        mgr.applyActiveEditor(editor);

        expect(decorationTier).toHaveBeenCalledWith(999, 50, 150);
      });
    });

    // ── fullDocumentRange edge cases ───────────────────────────────
    describe("fullDocumentRange — advanced", () => {
      it("returns correct range for large document with 10000 lines", () => {
        const rollup = new Map([["file:///a.ts", 200]]);
        const mgr = new DecorationManager(fakeState(rollup), () => defaultDecoConfig);
        vi.mocked(decorationTier).mockReturnValue("error");
        const editor = {
          document: {
            uri: { toString: () => "file:///a.ts" },
            lineCount: 10000,
            lineAt: (n: number) => ({ text: n === 9999 ? "last line content!" : "x" }),
          },
          setDecorations: vi.fn(),
        } as any;

        mgr.applyActiveEditor(editor);

        const range = editor.setDecorations.mock.calls[1][1][0];
        expect(range.startLine).toBe(0);
        expect(range.startChar).toBe(0);
        expect(range.endLine).toBe(9999);
        expect(range.endChar).toBe(18); // "last line content!".length
      });

      it("returns correct range when last line is empty", () => {
        const rollup = new Map([["file:///a.ts", 200]]);
        const mgr = new DecorationManager(fakeState(rollup), () => defaultDecoConfig);
        vi.mocked(decorationTier).mockReturnValue("error");
        const editor = {
          document: {
            uri: { toString: () => "file:///a.ts" },
            lineCount: 3,
            lineAt: (n: number) => ({ text: n === 2 ? "" : "content" }),
          },
          setDecorations: vi.fn(),
        } as any;

        mgr.applyActiveEditor(editor);

        const range = editor.setDecorations.mock.calls[1][1][0];
        expect(range.endLine).toBe(2);
        expect(range.endChar).toBe(0); // empty last line
      });
    });

    // ── error handling: decoration config edge cases ───────────────
    describe("decoration config edge cases", () => {
      it("passes zero thresholds to decorationTier", () => {
        const rollup = new Map([["file:///a.ts", 0]]);
        const config: DecorationConfig = { warnThreshold: 0, errorThreshold: 0 };
        const mgr = new DecorationManager(fakeState(rollup), () => config);
        const editor = fakeEditor("file:///a.ts");
        vi.mocked(decorationTier).mockReturnValue("error");

        mgr.applyActiveEditor(editor);

        expect(decorationTier).toHaveBeenCalledWith(0, 0, 0);
      });

      it("passes equal warn and error thresholds to decorationTier", () => {
        const rollup = new Map([["file:///a.ts", 100]]);
        const config: DecorationConfig = { warnThreshold: 100, errorThreshold: 100 };
        const mgr = new DecorationManager(fakeState(rollup), () => config);
        const editor = fakeEditor("file:///a.ts");
        vi.mocked(decorationTier).mockReturnValue("error");

        mgr.applyActiveEditor(editor);

        expect(decorationTier).toHaveBeenCalledWith(100, 100, 100);
      });

      it("passes negative thresholds to decorationTier", () => {
        const rollup = new Map([["file:///a.ts", -10]]);
        const config: DecorationConfig = { warnThreshold: -20, errorThreshold: -5 };
        const mgr = new DecorationManager(fakeState(rollup), () => config);
        const editor = fakeEditor("file:///a.ts");
        vi.mocked(decorationTier).mockReturnValue("warn");

        mgr.applyActiveEditor(editor);

        expect(decorationTier).toHaveBeenCalledWith(-10, -20, -5);
      });

      it("passes warn threshold greater than error threshold to decorationTier", () => {
        const rollup = new Map([["file:///a.ts", 100]]);
        const config: DecorationConfig = { warnThreshold: 200, errorThreshold: 50 };
        const mgr = new DecorationManager(fakeState(rollup), () => config);
        const editor = fakeEditor("file:///a.ts");
        vi.mocked(decorationTier).mockReturnValue("error");

        mgr.applyActiveEditor(editor);

        expect(decorationTier).toHaveBeenCalledWith(100, 200, 50);
      });
    });
  });
});
