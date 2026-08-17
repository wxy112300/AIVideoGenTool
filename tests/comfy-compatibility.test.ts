import { describe, expect, it } from "vitest";
import {
  evaluateMiniMaxH3CoreSupport,
  evaluateMiniMaxH3CompatibilityState,
  evaluatePromptCoreSupport,
  versionAtLeast
} from "../electron/services/comfy-compatibility";

describe("ComfyUI compatibility rules", () => {
  it("compares semantic versions without accepting unknown values", () => {
    expect(versionAtLeast("v0.31.0", "0.31.0")).toBe(true);
    expect(versionAtLeast("ComfyUI 0.32.1", "0.31.0")).toBe(true);
    expect(versionAtLeast("0.30.9", "0.31.0")).toBe(false);
    expect(versionAtLeast("unknown", "0.31.0")).toBe(false);
  });

  it("keeps H3 and prompt node groups independently evaluable", () => {
    const h3 = evaluateMiniMaxH3CoreSupport({
      MiniMaxH3ImageToVideo: {},
      MiniMaxH3ReferenceToVideo: {},
      MiniMaxH3SigmaShift: {}
    });
    const prompt = evaluatePromptCoreSupport({ CLIPLoader: {}, TextGenerate: {} });

    expect(h3.every((node) => node.available)).toBe(true);
    expect(prompt.find((node) => node.id === "CLIPLoader")?.available).toBe(true);
    expect(prompt.find((node) => node.id === "PreviewAny")?.available).toBe(false);
  });

  it("keeps known community risks advisory while rejecting a core below minimum", () => {
    expect(evaluateMiniMaxH3CompatibilityState("0.33.1", "bdcb886", "api")).toMatchObject({
      compatibilityState: "warning",
      compatibilityNotice: expect.stringContaining("H3 Cache")
    });
    expect(evaluateMiniMaxH3CompatibilityState("0.30.9", "", "source")).toMatchObject({
      compatibilityState: "error",
      compatibilityNotice: expect.stringContaining("最低支持版本")
    });
    expect(evaluateMiniMaxH3CompatibilityState("", "", "").compatibilityState).toBe("unknown");
  });
});
