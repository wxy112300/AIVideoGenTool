import { describe, expect, it } from "vitest";
import { modelCatalog } from "../src/core/catalog";

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
      "qwen-image-edit-2511",
      "flux2-klein-4b"
    ]);
    expect(modelCatalog.list("upscale").map((entry) => entry.definition.id)).toEqual([
      "seedvr2",
      "flashvsr",
      "realesrgan"
    ]);
    expect(modelCatalog.list("interpolation").map((entry) => entry.definition.id)).toEqual(["rife"]);
    expect(modelCatalog.list("lora")).toHaveLength(2);
  });
});
