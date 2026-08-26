import { describe, expect, it } from "vitest";
import {
  defaultStudioStatePath,
  parseHarnessArgs,
  summarizePromptWriterNode
} from "../scripts/local-runtime-harness.mjs";

describe("local runtime harness", () => {
  it("defaults to the read-only Prompt Writer probe", () => {
    expect(parseHarnessArgs([])).toEqual({
      action: "probe-prompt-writer",
      statePath: "",
      json: false,
      help: false
    });
  });

  it("accepts explicit state and JSON output", () => {
    expect(parseHarnessArgs([
      "restart-comfy",
      "--state",
      "D:\\state.json",
      "--json"
    ])).toEqual({
      action: "restart-comfy",
      statePath: "D:\\state.json",
      json: true,
      help: false
    });
  });

  it("rejects unknown operations", () => {
    expect(() => parseHarnessArgs(["delete-everything"]))
      .toThrow("未知操作");
  });

  it("uses the Windows application state path", () => {
    expect(defaultStudioStatePath({ APPDATA: "C:\\Users\\Alice\\AppData\\Roaming" }, "win32"))
      .toBe("C:\\Users\\Alice\\AppData\\Roaming\\ai-video-gen-tool\\studio-state.json");
  });

  it("summarizes the Prompt Writer without exposing the full environment scan", () => {
    expect(summarizePromptWriterNode({
      customNodes: [{
        id: "minimax-h3-prompt-writer",
        installed: true,
        loaded: false,
        runtimeVerified: true,
        version: "0.4.1",
        loadError: "HTTP 404",
        runtimeNotice: "",
        directory: "C:\\ComfyUI\\custom_nodes\\writer"
      }]
    })).toMatchObject({
      installed: true,
      loaded: false,
      version: "0.4.1",
      loadError: "HTTP 404"
    });
  });
});
