import { describe, expect, it } from "vitest";
import { modelCatalog } from "../src/core/catalog";
import { VIDEO_LORA_DEFINITIONS } from "../src/core/catalog/loras/definitions";
import { BUILTIN_VIDEO_LORAS } from "../src/core/video-loras";

describe("model catalog", () => {
  it("registers H3 models from one index", () => {
    expect(modelCatalog.list("video").map((entry) => entry.definition.id).filter((id) => [
      "minimax_h3_fl2va",
      "minimax_h3_fl2va_int4",
      "minimax_h3_fl2va_q3_gguf",
      "minimax_h3_ref2va",
      "minimax_h3_ref2va_int4",
      "sulphur2"
    ].includes(id))).toEqual([
      "minimax_h3_fl2va",
      "minimax_h3_fl2va_int4",
      "minimax_h3_fl2va_q3_gguf",
      "minimax_h3_ref2va",
      "minimax_h3_ref2va_int4",
      "sulphur2"
    ]);
  });

  it("keeps family queries independent from display names", () => {
    expect(modelCatalog.isFamily("minimax_h3_ref2va", "minimax-h3")).toBe(true);
    expect(modelCatalog.isFamily("sulphur2", "minimax-h3")).toBe(false);
    expect(modelCatalog.localized("minimax_h3_fl2va", "en-US")?.name)
      .toBe("MiniMax H3 FL2VA · start / end frame");
    expect(modelCatalog.get("minimax_h3_fl2va")?.definition.promptPackId).toBe("h3");
    expect(modelCatalog.get("qwen-image-edit-2511")?.definition.promptPackId).toBe("qwen-image-edit");
  });

  it("keeps retired IDs available for persisted records but out of active lists", () => {
    expect(modelCatalog.get("minimax_h3_fl2va_turbo")?.definition.retired).toBe(true);
    expect(modelCatalog.list("video").some((entry) => entry.definition.id === "minimax_h3_fl2va_turbo"))
      .toBe(false);
  });

  it("covers every model category used by environment scanning", () => {
    expect(modelCatalog.list("prompt")).toHaveLength(10);
    expect(modelCatalog.list("image").map((entry) => entry.definition.id)).toEqual([
      "lama-inpaint",
      "qwen-image-edit-2511",
      "flux2-klein-4b"
    ]);
    expect(modelCatalog.list("upscale").map((entry) => entry.definition.id)).toEqual([
      "seedvr2",
      "flashvsr",
      "realesrgan"
    ]);
    expect(modelCatalog.list("interpolation").map((entry) => entry.definition.id)).toEqual(["rife"]);
    expect(modelCatalog.list("lora").map((entry) => entry.definition.id)).toEqual([
      "minimax-h3-lightx2v-turbo-4step",
      "minimax-h3-realism-people",
      "minimax-h3-pink-fluffy-bunny-nsfw"
    ]);
    expect(modelCatalog.get("lama-inpaint")?.definition.scan?.requiredCustomNodeIds)
      .toEqual(["inpaint-nodes"]);
  });

  it("derives LoRA scanning and runtime metadata from the same definitions", () => {
    expect(modelCatalog.list("lora").map((entry) => entry.definition.id))
      .toEqual(VIDEO_LORA_DEFINITIONS.map((lora) => lora.id));
    expect(BUILTIN_VIDEO_LORAS.map((lora) => ({
      id: lora.id,
      filename: lora.filename,
      strength: lora.strength,
      promptPrefixes: lora.promptPrefixes
    }))).toEqual(VIDEO_LORA_DEFINITIONS.map((lora) => ({
      id: lora.id,
      filename: lora.filename,
      strength: lora.strength,
      promptPrefixes: lora.promptPrefixes
    })));
    for (const lora of VIDEO_LORA_DEFINITIONS) {
      expect(lora.scan.components.some((component) =>
        component.expected.replaceAll("\\", "/").endsWith(`loras/${lora.filename}`)
      ), lora.id).toBe(true);
    }
  });

  it("provides English display metadata for every catalog entry", () => {
    for (const entry of modelCatalog.entries) {
      const locale = entry.locales["en-US"];
      expect(locale?.name, entry.definition.id).toBeTruthy();
      expect(locale?.name, entry.definition.id).not.toMatch(/[\u3400-\u9fff]/u);
      expect(locale?.badge ?? "", entry.definition.id).not.toMatch(/[\u3400-\u9fff]/u);
      expect(locale?.description ?? "", entry.definition.id).not.toMatch(/[\u3400-\u9fff]/u);
      expect(locale?.limitations?.join(" ") ?? "", entry.definition.id).not.toMatch(/[\u3400-\u9fff]/u);
    }
  });

  it("provides Taiwan Traditional Chinese display metadata for every catalog entry", () => {
    for (const entry of modelCatalog.entries) {
      const locale = entry.locales["zh-TW"];
      expect(locale?.name, entry.definition.id).toBeTruthy();
      expect(locale?.badge ?? locale?.description ?? "", entry.definition.id).toBeTruthy();
    }
    expect(modelCatalog.localized("qwen-image-edit-2511", "zh-TW")).toMatchObject({
      name: "Qwen-Image-Edit-2511 · 圖片處理",
      badge: "最多 3 Picture · 原生品質"
    });
    expect(modelCatalog.localized("minimax-h3-realism-people", "zh-TW")).toMatchObject({
      badge: "H3 專屬 · 人物寫實"
    });
    expect(modelCatalog.localized("google/gemma-4-26b-a4b-q4", "zh-TW")).toMatchObject({
      badge: "社群推薦 · MoE Q4"
    });
  });
});
