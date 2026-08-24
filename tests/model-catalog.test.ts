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
    expect(modelCatalog.get("minimax-h3-lightx2v-turbo-4step")?.definition.retired).toBe(true);
    expect(modelCatalog.get("minimax-h3-lightx2v-turbo-4step-768p-v1")?.definition.retired).toBe(true);
    expect(modelCatalog.get("minimax-h3-pink-fluffy-bunny-nsfw")?.definition.retired).toBe(true);
    expect(modelCatalog.list("lora").map((entry) => entry.definition.id)).not.toEqual(expect.arrayContaining([
      "minimax-h3-lightx2v-turbo-4step",
      "minimax-h3-lightx2v-turbo-4step-768p-v1",
      "minimax-h3-pink-fluffy-bunny-nsfw"
    ]));
  });

  it("covers every model category used by environment scanning", () => {
    expect(modelCatalog.list("prompt")).toHaveLength(9);
    expect(modelCatalog.list("image").map((entry) => entry.definition.id)).toEqual([
      "birefnet-background-removal",
      "lama-inpaint",
      "qwen-image-edit-2511",
      "qwen-image-edit-2511-crop-stitch",
      "flux2-klein-4b"
    ]);
    expect(modelCatalog.list("upscale").map((entry) => entry.definition.id)).toEqual([
      "seedvr2-native-int8",
      "seedvr2",
      "flashvsr",
      "realesrgan"
    ]);
    expect(modelCatalog.list("interpolation").map((entry) => entry.definition.id)).toEqual(["rife"]);
    expect(modelCatalog.list("lora").map((entry) => entry.definition.id)).toEqual([
      "minimax-h3-lightx2v-turbo-4step-768p-v1.1",
      "minimax-h3-camera-motion-v1",
      "minimax-h3-turbo-v4-step600-ema-pruned",
      "minimax-h3-lightx2v-turbo-8step-v1",
      "minimax-h3-ref2v-turbo-4step-v01",
      "minimax-h3-after-midnight-ref2va-nsfw",
      "minimax-h3-realism-people"
    ]);
    expect(modelCatalog.get("lama-inpaint")?.definition.scan?.requiredCustomNodeIds)
      .toEqual(["inpaint-nodes"]);
    expect(modelCatalog.get("qwen-image-edit-2511-crop-stitch")?.definition.scan?.requiredCustomNodeIds)
      .toEqual(["inpaint-cropandstitch"]);
    expect(modelCatalog.get("birefnet-background-removal")?.definition.scan?.requiredCustomNodeIds)
      .toBeUndefined();
  });

  it("points native SeedVR2 downloads directly at the required files", () => {
    const components = modelCatalog.get("seedvr2-native-int8")?.definition.scan?.components ?? [];
    expect(components.map((component) => component.installGuide?.downloadUrl)).toEqual([
      "https://huggingface.co/Comfy-Org/SeedVR2/resolve/main/diffusion_models/seedvr2_3b_int8_convrot.safetensors?download=true",
      "https://huggingface.co/Comfy-Org/SeedVR2/resolve/main/vae/seedvr2_ema_vae_fp16.safetensors?download=true"
    ]);
  });

  it("keeps catalog model downloads on concrete files instead of repository pages", () => {
    const components = modelCatalog.entries.flatMap(({ definition }) => [
      ...(definition.scan?.components ?? []),
      ...Object.values(definition.scanVariants ?? {}).flatMap((scan) => scan.components)
    ]);
    const pageLinks = components
      .map((component) => component.installGuide?.downloadUrl)
      .filter((url): url is string => Boolean(url && /\/tree\/|\/releases\/tag\//u.test(url)));

    expect(pageLinks).toEqual([]);
  });

  it("derives LoRA scanning and runtime metadata from the same definitions", () => {
    expect(modelCatalog.list("lora").map((entry) => entry.definition.id))
      .toEqual([...VIDEO_LORA_DEFINITIONS]
        .filter((lora) => lora.retired !== true)
        .sort((left, right) => right.catalogOrder - left.catalogOrder)
        .map((lora) => lora.id));
    expect(BUILTIN_VIDEO_LORAS.map((lora) => ({
      id: lora.id,
      filename: lora.filename,
      strength: lora.strength,
      promptPrefixes: lora.promptPrefixes
    }))).toEqual(VIDEO_LORA_DEFINITIONS
      .filter((lora) => lora.retired !== true)
      .map((lora) => ({
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
    expect(modelCatalog.localized("community/gemma-4-26b-a4b-uncensored-q4", "zh-TW")).toMatchObject({
      badge: "Uncensored · MoE Q4"
    });
  });
});
