import { describe, expect, it } from "vitest";
import { modelCatalog } from "../src/core/catalog";
import { evaluateModelProfiles } from "../electron/services/environment";
import { imageModelAdapterFor } from "../src/core/image-workflow";

const dit = "diffusion_models/minimax_h3_image_pruned_w4a8.safetensors";
const vae = "vae/minimax_h3_image_vae_fp16.safetensors";
const profile = (files: string[]) => evaluateModelProfiles(files).find(p => p.id === "minimax-h3-image-w4a8")!;

describe("MiniMax H3 Image preparation", () => {
  it("recognizes W4A8 with NVFP4 separately from INT8 and retains their independent IDs", () => {
    const files = ["diffusion_models/minimax_h3_image_pruned_w4a8.safetensors", vae,
      "text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors"];
    const result = evaluateModelProfiles(files);
    expect(result.find(p => p.id === "minimax-h3-image-w4a8")).toMatchObject({ available: true, integrated: true });
    expect(result.find(p => p.id === "minimax-h3-image")).toBeUndefined();
    const onlyInt8Encoder = evaluateModelProfiles([files[0]!, vae, "text_encoders/qwen3vl_32b_minimax_h3_int8_convrot.safetensors"]);
    expect(onlyInt8Encoder.find(p => p.id === "minimax-h3-image-w4a8")?.available).toBe(false);
    const ids = modelCatalog.list("image").map(e => e.definition.id);
    expect(ids).toContain("minimax-h3-image-w4a8");
    expect(ids).not.toContain("minimax-h3-image");
    const asset = modelCatalog.get("minimax-h3-image-w4a8")!.definition.scan!.components[0]!;
    expect(asset.installGuide).toMatchObject({ bytes: 12549794530, sha256: "517cc19b85348386f4df7c806dce80d839d0899e7cdaa3e1dbb09de964381dbb" });
  });
  it.each(["nvfp4_awq"])("reuses the %s H3 encoder with separate runtime readiness", precision => {
    const files = [dit, vae, `text_encoders/qwen3vl_32b_minimax_h3_${precision}.safetensors`];
    expect(profile(files)).toMatchObject({ available: true, integrated: true, runtimeVerified: false });
    expect(profile(files.map(f => f.replaceAll("/", "\\")))).toMatchObject({ available: true, integrated: true });
    expect(imageModelAdapterFor("minimax-h3-image")).toBeDefined();
  });

  it("requires the image VAE and an encoder, not just existing video weights", () => {
    expect(profile([dit, vae]).available).toBe(false);
    expect(profile([dit, "text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
      "vae/minimax_h3_video_vae_fp16.safetensors"]).available).toBe(false);
    expect(profile([]).components.every(c => c.installGuide?.sha256?.length === 64)).toBe(true);
    expect(modelCatalog.get("minimax-h3-image")?.definition.scan?.minimumComfyVersion).toBe("0.45.0");
    for (const locale of ["zh-CN", "zh-TW", "en-US"] as const) {
      expect(modelCatalog.localized("minimax-h3-image", locale)?.description).toContain("0.45.0");
    }
  });
});
