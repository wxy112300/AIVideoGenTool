import { describe, expect, it, vi } from "vitest";
import { createDefaultSettings } from "../src/core/defaults.js";
import {
  buildLmStudioChatRequest,
  lmStudioNativeApiBase,
  loadedLmStudioInstanceIds,
  selectLmStudioModel,
  unloadLmStudioModels
} from "../electron/services/lm-studio.js";

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
