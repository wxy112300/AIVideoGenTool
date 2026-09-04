import { describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import { createDefaultSettings } from "../src/core/defaults.js";
import {
  buildLmStudioChatRequest,
  lmStudioNativeApiBase,
  loadedLmStudioInstanceIds,
  selectLmStudioModel,
  unloadLmStudioModels
} from "../electron/services/lm-studio.js";
import { H3_FACIAL_REALISM_CLOSEUP_LORA } from "../src/core/video-loras.js";

describe("LM Studio model selection", () => {
  it("keeps an explicitly configured model", () => {
    expect(
      selectLmStudioModel("my-chat-model", [
        "other-model",
        "text-embedding-nomic-embed-text-v1.5"
      ])
    ).toBe("my-chat-model");
  });

  it("selects a generation model when the setting is blank", () => {
    expect(
      selectLmStudioModel("", [
        "text-embedding-nomic-embed-text-v1.5",
        "sulphur-2-base"
      ])
    ).toBe("sulphur-2-base");
  });

  it("reports no selection when LM Studio has no loaded models", () => {
    expect(selectLmStudioModel("", [])).toBe("");
  });

  it("does not use the Sulphur creative enhancer for faithful mode", () => {
    expect(
      selectLmStudioModel(
        "",
        ["sulphur-2-base", "qwen-instruct"],
        "faithful"
      )
    ).toBe("qwen-instruct");
    expect(selectLmStudioModel("", ["sulphur-2-base"], "faithful")).toBe("");
  });

  it("selects a vision model for H3 visual mode", () => {
    expect(
      selectLmStudioModel(
        "",
        ["sulphur-2-base", "qwen/qwen3.5-9b", "text-embedding-model"],
        "h3-vision"
      )
    ).toBe("qwen/qwen3.5-9b");
    expect(selectLmStudioModel("", ["sulphur-2-base"], "h3-vision")).toBe("");
  });

  it("recognizes Gemma 4 as a visual H3 prompt model", () => {
    expect(selectLmStudioModel(
      "",
      ["text-embedding-model", "gemma-4-26B-A4B-it-Q4"],
      "h3-vision"
    )).toBe("gemma-4-26B-A4B-it-Q4");
  });

  it("selects a vision model for image-edit mode", () => {
    expect(
      selectLmStudioModel(
        "",
        ["sulphur-2-base", "qwen/qwen3.5-9b"],
        "image-edit"
      )
    ).toBe("qwen/qwen3.5-9b");
  });
});

describe("LM Studio prompt enhancement requests", () => {
  it("uses the official text-only message shape for Sulphur native mode", async () => {
    const body = await buildLmStudioChatRequest(
      {
        prompt: "A woman turns toward the camera",
        modelId: "sulphur2",
        mode: "sulphur-native"
      },
      createDefaultSettings(),
      "sulphur-2-base"
    );

    expect(body.messages).toEqual([
      { role: "user", content: "A woman turns toward the camera" }
    ]);
    expect(body.temperature).toBe(0.7);
  });

  it("uses strict low-temperature instructions in faithful mode", async () => {
    const body = await buildLmStudioChatRequest(
      {
        prompt: "一个女孩站在窗边",
        modelId: "sulphur2",
        mode: "faithful"
      },
      createDefaultSettings(),
      "sulphur-2-base"
    );

    expect(body.temperature).toBe(0.2);
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0]?.role).toBe("system");
    expect(body.messages[0]?.content).toContain("绝对禁止新增");
    expect(body.messages[1]?.role).toBe("user");
    expect(body.messages[1]?.content).toContain("请使用中文输出");
    expect(body.messages[1]?.content).toContain("一个女孩站在窗边");
  });

  it("passes the selected H3 LoRA context to the legacy LM Studio vision path", async () => {
    const body = await buildLmStudioChatRequest(
      {
        prompt: "一位女性看向镜头",
        modelId: "minimax_h3_fl2va",
        mode: "h3-vision",
        h3PromptMode: "I2VA",
        videoLoras: [H3_FACIAL_REALISM_CLOSEUP_LORA]
      },
      createDefaultSettings(),
      "qwen/qwen3.5-9b"
    );

    expect(body.messages[1]?.content).toContain("minimax-h3-facial-realism-closeup");
    expect(body.messages[1]?.content).toContain("canonical trigger: Facial Realism");
  });

  it("sends multiple reference images with H3-specific visual instructions", async () => {
    const readFile = vi.spyOn(fs, "readFile").mockResolvedValue(Buffer.from("image"));
    const body = await buildLmStudioChatRequest(
      {
        prompt: "人物向镜头走来",
        modelId: "minimax_h3_fl2va",
        mode: "h3-vision",
        h3PromptMode: "FL2VA",
        h3DurationSeconds: 5,
        referenceContext: "<Picture 1> = 首帧人物; <Picture 2> = 尾帧构图",
        imagePaths: ["first.png", "last.png"]
      },
      createDefaultSettings(),
      "qwen/qwen3.5-9b"
    );

    expect(body.temperature).toBe(0.35);
    expect(body.messages[0]?.content).toContain("physically grounded audiovisual timeline");
    expect(body.messages[0]?.content).toContain("User-intent priority");
    expect(body.messages[0]?.content).toContain("Final user-intent lock");
    expect(body.messages[0]?.content).toContain("Factual boundary");
    expect(body.messages[0]?.content).toContain("Endpoint grounding");
    expect(body.messages[1]?.content).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "text",
        text: expect.stringContaining("Camera disambiguation and preservation lock")
      })
    ]));
    expect(body.messages[1]?.content).toEqual([
      expect.objectContaining({ type: "text" }),
      expect.objectContaining({ type: "image_url" }),
      expect.objectContaining({ type: "image_url" })
    ]);
    expect(readFile).toHaveBeenCalledTimes(2);
    readFile.mockRestore();
  });

  it("passes the scale semantics lock to the direct H3 vision backend", async () => {
    const body = await buildLmStudioChatRequest(
      {
        prompt: "A tiny person walks through a full-size room.",
        modelId: "minimax_h3_fl2va",
        mode: "h3-vision",
        h3PromptMode: "I2VA"
      },
      createDefaultSettings(),
      "qwen/qwen3.6-27b"
    );

    expect(body.messages[1]?.content).toContain("Scale semantics lock");
    expect(body.messages[1]?.content).toContain("For I2VA");
  });

  it("sends an empty reference-auto request as a varied H3 visual instruction", async () => {
    const readFile = vi.spyOn(fs, "readFile").mockResolvedValue(Buffer.from("image"));
    const body = await buildLmStudioChatRequest(
      {
        prompt: "",
        modelId: "minimax_h3_fl2va",
        mode: "h3-vision",
        promptStrategy: "reference-auto",
        autoPromptSeedId: "material-response",
        autoPromptVariationId: "variation-11",
        h3PromptMode: "I2VA",
        h3DurationSeconds: 5,
        imagePaths: ["reference.png"]
      },
      createDefaultSettings(),
      "qwen/qwen3.5-9b"
    );

    expect(body.messages[1]?.content).toEqual([
      expect.objectContaining({ type: "text", text: expect.stringContaining("Reference-driven H3 auto-creation mode") }),
      expect.objectContaining({ type: "image_url" })
    ]);
    expect(body.messages[1]?.content).toEqual([
      expect.objectContaining({ type: "text", text: expect.stringContaining("Variation token: variation-11") }),
      expect.objectContaining({ type: "image_url" })
    ]);
    readFile.mockRestore();
  });

  it("sends image references with a plain image-edit contract", async () => {
    const readFile = vi.spyOn(fs, "readFile").mockResolvedValue(Buffer.from("image"));
    const body = await buildLmStudioChatRequest(
      {
        prompt: "把 Picture 2 的人物放到 Picture 1 的场景中",
        modelId: "qwen-image-edit-2511",
        mode: "image-edit",
        imageEditEnhanceMode: "faithful",
        imageEditPresetText: "CUSTOM FAITHFUL RULE",
        imagePaths: ["base.png", "person.png"],
        referenceContext: "Slot 1 = 基础画面\nSlot 2 = 人物"
      },
      createDefaultSettings(),
      "qwen/qwen3.5-9b"
    );

    expect(body.messages[0]?.content).toContain("Qwen-Image-Edit-2511");
    expect(body.messages[0]?.content).toContain("Faithful mode:");
    expect(body.messages[0]?.content).toContain("CUSTOM FAITHFUL RULE");
    expect(body.messages[1]?.content).toEqual([
      expect.objectContaining({ type: "text" }),
      expect.objectContaining({ type: "image_url" }),
      expect.objectContaining({ type: "image_url" })
    ]);
    readFile.mockRestore();
  });

  it("does not send a persisted R2V preset to FL2VA", async () => {
    const settings = createDefaultSettings();
    settings.h3PromptPresets["multi-reference"] = "R2V SLOT ONLY: emit <slot> labels.";

    const body = await buildLmStudioChatRequest(
      {
        prompt: "人物从首帧走到尾帧",
        modelId: "minimax_h3_fl2va",
        mode: "h3-vision",
        h3PromptMode: "FL2VA",
        h3PromptPreset: "multi-reference",
        h3DurationSeconds: 5,
        imagePaths: ["first.png", "last.png"]
      },
      settings,
      "qwen/qwen3.5-9b"
    );

    expect(body.messages[0]?.content).not.toContain("R2V SLOT ONLY");
    expect(body.messages[0]?.content).not.toContain("<slot>");
    expect(body.messages[0]?.content).toContain("FL2VA task rule");
  });
});

describe("LM Studio GPU release", () => {
  it("uses the native model-management API and reads loaded instances", () => {
    expect(lmStudioNativeApiBase("http://127.0.0.1:1234/v1")).toBe(
      "http://127.0.0.1:1234/api/v1"
    );
    expect(
      loadedLmStudioInstanceIds({
        models: [
          {
            loaded_instances: [
              { id: "sulphur-2-base" },
              { id: "second-instance" }
            ]
          },
          { loaded_instances: [] }
        ]
      })
    ).toEqual(["sulphur-2-base", "second-instance"]);
  });

  it("unloads every loaded instance before video generation", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            models: [
              {
                loaded_instances: [{ id: "sulphur-2-base" }]
              }
            ]
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ instance_id: "sulphur-2-base" }), {
          status: 200
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ models: [] }), { status: 200 })
      );

    await expect(
      unloadLmStudioModels(createDefaultSettings(), fetchImpl)
    ).resolves.toBe(1);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:1234/api/v1/models/unload",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ instance_id: "sulphur-2-base" })
      })
    );
  });
});
