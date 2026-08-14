import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../src/core/defaults.js";
import {
  enhancePromptWithH3PromptWriter,
  extractImageEditPromptFromWriter,
  promptWriterModelForSelection,
  releaseH3PromptWriter,
  validateH3PromptWriterRuntime
} from "../electron/services/h3-prompt-writer.js";
import { managedPromptModelDefinitions } from "../src/core/prompt-models.js";

afterEach(() => vi.unstubAllGlobals());

describe("ComfyUI H3 Prompt Writer adapter", () => {
  it("turns a native 0xC000001D diagnostic into an actionable repair message", () => {
    expect(() => validateH3PromptWriterRuntime({
      status: "crashed",
      return_code_hex: "0xC000001D",
      message: "The native runtime crashed during the isolated compatibility check."
    })).toThrow(/动态 CPU 后端/iu);
  });

  it("rewrites a model-load 0xC000001D response even when the lightweight probe passed", async () => {
    const settings = createDefaultState().settings;
    settings.promptModelId = "google/gemma-4-12b-q5";
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/h3studio/status")) return Response.json({ version: "0.3.1" });
      if (url.endsWith("/h3studio/models")) return Response.json({ models: [{
        id: "D:/ComfyUI/models/LLM/gemma-4-12b-it-Q5_K_M.gguf",
        path: "D:/ComfyUI/models/LLM/gemma-4-12b-it-Q5_K_M.gguf",
        runtime_ready: true
      }] });
      if (url.endsWith("/h3studio/runtime/gguf/diagnostics")) {
        return Response.json({ diagnostics: { status: "ok", gpu_offload: true } });
      }
      if (url.endsWith("/h3studio/generate")) {
        return Response.json({
          error: {
            message: "The GGUF model could not be loaded.",
            details: { exception: "[WinError -1073741795] Windows Error 0xc000001d" }
          }
        }, { status: 500 });
      }
      if (url.includes("/h3studio/media?session_id=")) return Response.json({ cleared: true });
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(enhancePromptWithH3PromptWriter({
      prompt: "让人物走向镜头",
      modelId: "minimax_h3_ref2va",
      imagePaths: []
    }, settings, new AbortController().signal)).rejects.toThrow(/动态 CPU 后端/iu);
  });

  it("uses the same Gemma loader for a plain image-edit Prompt and extracts only the edit field", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "h3-image-writer-"));
    const image = path.join(directory, "reference.png");
    await fs.writeFile(image, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const settings = createDefaultState().settings;
    settings.promptModelId = "google/gemma-4-12b-q5";
    let generateBody: Record<string, unknown> = {};
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/h3studio/status")) return Response.json({ version: "0.2.0" });
      if (url.endsWith("/h3studio/models")) return Response.json({ models: [{
        id: "D:/ComfyUI/models/LLM/gemma-4-12b-it-Q5_K_M.gguf",
        path: "D:/ComfyUI/models/LLM/gemma-4-12b-it-Q5_K_M.gguf",
        runtime_ready: true
      }] });
      if (url.endsWith("/h3studio/media/upload")) return Response.json({ session_id: "session", assets: [{ id: "asset" }] }, { status: 201 });
      if (url.endsWith("/h3studio/generate")) {
        generateBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return Response.json({ prompt: "detailed_description:\n把 Picture 2 的人物自然放入 Picture 1 的场景，保持原有构图。\noverall_soundscape:\nN/A\nnon_diegetic_music:\nN/A" });
      }
      if (url.includes("/h3studio/media?session_id=")) return Response.json({ cleared: true });
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const result = await enhancePromptWithH3PromptWriter({
        prompt: "把 Picture 2 的人物放到 Picture 1 的场景中。",
        modelId: "qwen-image-edit-2511",
        mode: "image-edit",
        imageEditEnhanceMode: "faithful",
        imageEditPresetText: "只保留用户明确意图。",
        imagePaths: [image, image],
        referenceContext: "Picture 1 = 基础画面\nPicture 2 = 人物"
      }, settings, new AbortController().signal);

      expect(result).toBe("把 Picture 2 的人物自然放入 Picture 1 的场景，保持原有构图。");
      expect(generateBody).toMatchObject({
        mode: "Reference",
        unload_after: true,
        model_id: "D:/ComfyUI/models/LLM/gemma-4-12b-it-Q5_K_M.gguf"
      });
      expect(String(generateBody.system_prompt_override)).toContain("Qwen-Image-Edit-2511");
      expect(String(generateBody.system_prompt_override)).toContain("detailed_description field");
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });

  it("extracts an image edit field without requiring the H3 response wrapper", () => {
    expect(extractImageEditPromptFromWriter("detailed_description:\nChange the sign.\noverall_soundscape:\nN/A")).toBe("Change the sign.");
    expect(extractImageEditPromptFromWriter("Change the sign.")).toBe("Change the sign.");
  });

  it("resolves every managed Gemma tier by its exact GGUF filename", () => {
    for (const definition of managedPromptModelDefinitions) {
      expect(promptWriterModelForSelection([
        {
          id: `D:/ComfyUI/models/LLM/${definition.modelFilename}`,
          path: `D:/ComfyUI/models/LLM/${definition.modelFilename}`,
          runtime_ready: true
        }
      ], definition.id).path).toContain(definition.modelFilename);
    }
  });

  it("maps the selected Gemma file, uploads references and unloads after generation", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "h3-writer-"));
    const image = path.join(directory, "reference.png");
    await fs.writeFile(image, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const settings = createDefaultState().settings;
    settings.promptModelId = "google/gemma-4-12b-q5";
    let generateBody: Record<string, unknown> = {};
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/h3studio/status")) return Response.json({ version: "0.2.0" });
      if (url.endsWith("/h3studio/models")) return Response.json({ models: [{
        id: "D:/ComfyUI/models/LLM/gemma/gemma-4-12b-it-Q5_K_M.gguf",
        path: "D:/ComfyUI/models/LLM/gemma/gemma-4-12b-it-Q5_K_M.gguf",
        runtime_ready: true
      }] });
      if (url.endsWith("/h3studio/media/upload")) {
        expect(init?.body).toBeInstanceOf(FormData);
        return Response.json({ session_id: "session", assets: [{ id: "asset" }] }, { status: 201 });
      }
      if (url.endsWith("/h3studio/generate")) {
        generateBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return Response.json({ prompt: "[0-5s] A continuous shot." });
      }
      if (url.includes("/h3studio/media?session_id=")) return Response.json({ cleared: true });
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const result = await enhancePromptWithH3PromptWriter({
        prompt: "让人物走向镜头",
        modelId: "minimax_h3_ref2va",
        h3PromptMode: "R2V",
        h3DurationSeconds: 5,
        h3AspectRatio: "16:9",
        referenceMediaPaths: [image]
      }, settings, new AbortController().signal);

      expect(result).toBe("[0-5s] A continuous shot.");
      expect(generateBody).toMatchObject({
        mode: "Reference",
        unload_after: true,
        model_id: "D:/ComfyUI/models/LLM/gemma/gemma-4-12b-it-Q5_K_M.gguf",
        duration_seconds: 5,
        aspect_ratio: "16:9"
      });
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });

  it("releases the in-process writer model through ComfyUI", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ unload_requested: true })));
    await expect(releaseH3PromptWriter(createDefaultState().settings)).resolves.toBe(true);
  });
});
