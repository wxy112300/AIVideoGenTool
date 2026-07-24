import { describe, expect, it } from "vitest";
import {
  buildComfyCandidates,
  buildComfyDesktopCandidates,
  evaluateModelProfiles,
  normalizeProxyUrl
} from "../electron/services/environment.js";

describe("ComfyUI environment candidates", () => {
  it("uses the current home directory instead of a hard-coded username", () => {
    const candidates = buildComfyCandidates({
      homeDirectory: "C:\\Users\\CurrentUser",
      localAppData: "C:\\Users\\CurrentUser\\AppData\\Local",
      driveRoots: ["C:\\"]
    });

    expect(candidates).toContain("C:\\Users\\CurrentUser\\Documents\\ComfyUI");
    expect(candidates.some((candidate) => candidate.includes("\\Alice\\"))).toBe(false);
  });

  it("prefers the ComfyUI root inferred from configured models or output paths", () => {
    const candidates = buildComfyCandidates({
      homeDirectory: "C:\\Users\\CurrentUser",
      localAppData: "C:\\Users\\CurrentUser\\AppData\\Local",
      modelDirectory: "D:\\AI\\ComfyUI\\models",
      outputDirectory: "D:\\AI\\ComfyUI\\output",
      driveRoots: ["C:\\", "D:\\"]
    });

    expect(candidates[0]).toBe("D:\\AI\\ComfyUI");
    expect(candidates.filter((candidate) => candidate === "D:\\AI\\ComfyUI")).toHaveLength(1);
  });

  it("scans ComfyUI Desktop defaults and common C/D Program Files paths", () => {
    const candidates = buildComfyDesktopCandidates({
      homeDirectory: "C:\\Users\\CurrentUser",
      localAppData: "C:\\Users\\CurrentUser\\AppData\\Local",
      programFiles: "C:\\Program Files",
      driveRoots: ["C:\\", "D:\\"]
    });

    expect(candidates).toContain(
      "C:\\Users\\CurrentUser\\AppData\\Local\\Programs\\ComfyUI\\ComfyUI.exe"
    );
    expect(candidates).toContain("C:\\Program Files\\ComfyUI\\ComfyUI.exe");
    expect(candidates).toContain("D:\\Program Files\\ComfyUI\\ComfyUI.exe");
  });

  it("reports model profiles from their required component files", () => {
    const profiles = evaluateModelProfiles([
      "diffusion_models\\wan2.2_ti2v_5B_fp16.safetensors",
      "text_encoders\\umt5_xxl_fp8_e4m3fn_scaled.safetensors",
      "vae\\wan2.2_vae.safetensors",
      "SEEDVR2\\seedvr2_ema_3b_fp8_e4m3fn.safetensors",
      "SEEDVR2\\ema_vae_fp16.safetensors"
    ]);

    expect(profiles.find((profile) => profile.id === "wan22_5b")?.available).toBe(true);
    expect(profiles.find((profile) => profile.id === "seedvr2")?.available).toBe(true);
    expect(profiles.find((profile) => profile.id === "sulphur2")?.available).toBe(false);
  });

  it("requires the official HunyuanVideo 1.5 dual text and vision encoders", () => {
    const complete = evaluateModelProfiles([
      "unet\\hunyuanvideo1.5_720p_i2v_fp16.safetensors",
      "vae\\hunyuanvideo15_vae_fp16.safetensors",
      "text_encoders\\qwen_2.5_vl_7b_fp8_scaled.safetensors",
      "text_encoders\\byt5_small_glyphxl_fp16.safetensors",
      "clip_vision\\sigclip_vision_patch14_384.safetensors"
    ]);
    const incorrectQwen = evaluateModelProfiles([
      "unet\\hunyuanvideo1.5_720p_i2v_fp16.safetensors",
      "vae\\hunyuanvideo15_vae_fp16.safetensors",
      "text_encoders\\qwen_3_4b.safetensors",
      "text_encoders\\byt5_small_glyphxl_fp16.safetensors",
      "clip_vision\\sigclip_vision_patch14_384.safetensors"
    ]);

    expect(complete.find((profile) => profile.id === "hunyuan15")?.available).toBe(true);
    expect(incorrectQwen.find((profile) => profile.id === "hunyuan15")?.available).toBe(false);
  });

  it("detects the downloaded SmoothMix and DaSiWa High/Low model pairs", () => {
    const profiles = evaluateModelProfiles([
      "unet\\smoothMixWan22I2VT2V_i2vHigh-Q5_K_M.gguf",
      "unet\\smoothMixWan22I2VT2V_i2vLow-Q5_K_M.gguf",
      "unet\\DasiwaWAN22I2V14BSynthseduction_q4High.gguf",
      "unet\\DasiwaWAN22I2V14BSynthseduction_q4Low.gguf",
      "text_encoders\\umt5_xxl_fp8_e4m3fn_scaled.safetensors",
      "vae\\wan_2.1_vae.safetensors"
    ]);

    expect(profiles.find((profile) => profile.id === "wan22_smoothmix")?.available).toBe(true);
    expect(profiles.find((profile) => profile.id === "wan22_dasiwa")?.available).toBe(true);
  });

  it("requires shared UMT5 and Wan 2.1 VAE assets before Remix is runnable", () => {
    const incomplete = evaluateModelProfiles([
      "unet\\wan22RemixT2VI2V_i2vHighV30-Q5_K_M.gguf",
      "unet\\wan22RemixT2VI2V_i2vLowV30-Q5_K_M.gguf"
    ]);
    const complete = evaluateModelProfiles([
      "unet\\wan22RemixT2VI2V_i2vHighV30-Q5_K_M.gguf",
      "unet\\wan22RemixT2VI2V_i2vLowV30-Q5_K_M.gguf",
      "text_encoders\\umt5_xxl_fp8_e4m3fn_scaled.safetensors",
      "vae\\wan_2.1_vae.safetensors"
    ]);

    expect(incomplete.find((profile) => profile.id === "wan22_remix")?.available).toBe(false);
    expect(complete.find((profile) => profile.id === "wan22_remix")?.available).toBe(true);
  });

  it("reports the RIFE interpolation checkpoint separately from video models", () => {
    const profiles = evaluateModelProfiles([
      "frame_interpolation\\rife47.pth"
    ]);
    const rife = profiles.find((profile) => profile.id === "rife");

    expect(rife?.category).toBe("interpolation");
    expect(rife?.available).toBe(true);
  });

  it("requires all five FlashVSR weights", () => {
    const incomplete = evaluateModelProfiles([
      "FlashVSR\\FlashVSR1_1.safetensors"
    ]);
    const complete = evaluateModelProfiles([
      "FlashVSR\\FlashVSR1_1.safetensors",
      "FlashVSR\\Wan2.1_VAE.safetensors",
      "FlashVSR\\LQ_proj_in.safetensors",
      "FlashVSR\\TCDecoder.safetensors",
      "FlashVSR\\Prompt.safetensors"
    ]);

    expect(incomplete.find((profile) => profile.id === "flashvsr")?.available).toBe(false);
    expect(complete.find((profile) => profile.id === "flashvsr")?.available).toBe(true);
  });

  it("requires the complete Sulphur 2 / LTX 2.3 runtime set", () => {
    const incomplete = evaluateModelProfiles([
      "checkpoints\\sulphur_dev_fp8mixed.safetensors"
    ]);
    const complete = evaluateModelProfiles([
      "checkpoints\\sulphur_dev_fp8mixed.safetensors",
      "text_encoders\\gemma_3_12B_it_fp4_mixed.safetensors",
      "loras\\ltx-2.3-22b-distilled-lora-1.1_fro90_ceil72_condsafe.safetensors",
      "latent_upscale_models\\ltx-2.3-spatial-upscaler-x2-1.0.safetensors"
    ]);

    expect(incomplete.find((profile) => profile.id === "sulphur2")?.available).toBe(false);
    expect(complete.find((profile) => profile.id === "sulphur2")?.available).toBe(true);
  });

  it("reports the Hunyuan 1080p SR pair", () => {
    const profiles = evaluateModelProfiles([
      "unet\\hunyuanvideo1.5_720p_i2v_fp16.safetensors",
      "vae\\hunyuanvideo15_vae_fp16.safetensors",
      "text_encoders\\qwen_2.5_vl_7b_fp8_scaled.safetensors",
      "text_encoders\\byt5_small_glyphxl_fp16.safetensors",
      "clip_vision\\sigclip_vision_patch14_384.safetensors",
      "unet\\hunyuanvideo1.5_1080p_sr_distilled_fp16.safetensors",
      "latent_upscale_models\\hunyuanvideo15_latent_upsampler_1080p.safetensors"
    ]);

    expect(profiles.find((profile) => profile.id === "hunyuan15_sr")?.available).toBe(true);
  });

  it("provides a complete install guide for every component that can be missing", () => {
    const profiles = evaluateModelProfiles([]);
    const components = profiles.flatMap((profile) => profile.components);

    expect(components.length).toBeGreaterThan(0);
    for (const component of components) {
      expect(component.found).toBe(false);
      expect(component.installGuide.sourceLabel).not.toBe("");
      expect(component.installGuide.downloadUrl).toMatch(/^https:\/\//);
      expect(component.installGuide.targetSubdirectory).not.toBe("");
      expect(component.installGuide.recommendedFilename).not.toBe("");
    }
  });
});

describe("download proxy settings", () => {
  it("normalizes a host and port to an HTTP proxy URL", () => {
    expect(normalizeProxyUrl("127.0.0.1:7890")).toBe("http://127.0.0.1:7890");
  });

  it("accepts common HTTP and SOCKS proxy schemes", () => {
    expect(normalizeProxyUrl("https://proxy.example:8443")).toBe(
      "https://proxy.example:8443"
    );
    expect(normalizeProxyUrl("socks5://127.0.0.1:1080")).toBe(
      "socks5://127.0.0.1:1080"
    );
  });

  it("rejects unsupported proxy protocols", () => {
    expect(() => normalizeProxyUrl("file:///tmp/proxy")).toThrow("不支持");
  });
});
