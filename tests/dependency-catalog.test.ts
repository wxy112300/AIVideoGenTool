import { describe, expect, it } from "vitest";
import {
  compareDependencyIds,
  customNodeCatalog,
  customNodeDefinition,
  H3_ACCELERATION_DEPENDENCY_ID,
  H3_AV_SERIALIZER_REVISION,
  H3_CONTINUUM_REVISION,
  H3_LATENT_UPSCALER_REVISION,
  H3_ULTIMATE_UPSCALE_REVISION
} from "../src/core/catalog";

describe("dependency catalog", () => {
  it("keeps node package identities and install targets unique", () => {
    expect(new Set(customNodeCatalog.map((item) => item.id)).size)
      .toBe(customNodeCatalog.length);
    expect(new Set(customNodeCatalog.map((item) => item.directoryName.toLowerCase())).size)
      .toBe(customNodeCatalog.length);
    for (const definition of customNodeCatalog) {
      expect(definition.repositoryUrl).toMatch(
        definition.source === "bundled"
          ? /^builtin:\/\//
          : /^https:\/\/github\.com\//
      );
      expect(definition.aliases.length).toBeGreaterThan(0);
    }
  });

  it("orders dependencies by stable product priority and keeps unknown entries last", () => {
    expect(customNodeCatalog.map((item) => item.id)).toEqual([
      "video-helper-suite",
      "comfyui-gguf",
      "kjnodes",
      "ltx-video",
      "minimax-h3-prompt-writer",
      "comfyui-multimodal-prompt-nodes",
      "comfyui-qwenvl-lora",
      "inpaint-nodes",
      "inpaint-cropandstitch",
      "seedvr2",
      "flashvsr",
      "frame-interpolation",
      "h3-motion-context",
      "h3-continuum",
      "h3-latent-upscaler",
      "minimax-h3-learned-upscaler",
      "local-video-studio-h3-av",
      "mmh3-ultimate-upscale",
      "spectrum-minimax-h3",
      "h3-optimizations",
      "plaguekind-h3-sla",
      "comfyui-gguf-h3"
    ]);
    expect(customNodeCatalog.every((item) => Number.isFinite(item.priority))).toBe(true);
    expect(compareDependencyIds("llama-cpp-python", "comfyui-multimodal-prompt-nodes")).toBeLessThan(0);
    expect(compareDependencyIds("kjnodes", H3_ACCELERATION_DEPENDENCY_ID)).toBeLessThan(0);
    expect(compareDependencyIds(H3_ACCELERATION_DEPENDENCY_ID, "ltx-video")).toBeLessThan(0);
    expect(compareDependencyIds("unknown-dependency", "video-helper-suite")).toBeGreaterThan(0);
  });

  it("retains runtime and compatibility metadata needed by scanners", () => {
    expect(customNodeDefinition("seedvr2")).toMatchObject({
      minimumVersion: "2.5.24",
      required: true
    });
    expect(customNodeDefinition("minimax-h3-prompt-writer")).toMatchObject({
      runtimeEndpoint: "/h3studio/status",
      minimumVersion: "0.3.1",
      recommendedVersion: "0.4.1",
      compatibilityEvidence: [{ checks: ["static", "object-info"] }],
      required: false
    });
    expect(customNodeDefinition("comfyui-multimodal-prompt-nodes")).toMatchObject({
      nodeTypes: ["VisionLLMNode"],
      minimumVersion: "1.0.15",
      runtimeRequirement: expect.stringContaining("Python 3.10–3.14"),
      required: false
    });
    expect(customNodeDefinition("comfyui-qwenvl-lora")).toMatchObject({
      repositoryUrl: "https://github.com/Dangocan/comfyui_qwenvl_lora.git",
      nodeTypes: ["QwenVLModelLoader", "QwenVLLoRALoader", "QwenVLCaption"],
      required: false
    });
    expect(customNodeDefinition("comfyui-gguf")).toMatchObject({
      repositoryUrl: "https://github.com/city96/ComfyUI-GGUF.git",
      directoryName: "ComfyUI-GGUF",
      releaseSource: "github-release",
      required: true
    });
    expect(customNodeDefinition("comfyui-gguf-h3")).toMatchObject({
      repositoryUrl: "https://github.com/molbal/ComfyUI-GGUF.git",
      directoryName: "ComfyUI-GGUF-H3",
      nodeTypes: ["H3UnetLoaderGGUFAdvanced", "H3CLIPLoaderGGUF"],
      required: false
    });
    expect(customNodeDefinition("h3-motion-context")?.nodeTypes).toContain(
      "MiniMaxH3MotionContextSaveLatent"
    );
    expect(customNodeDefinition("plaguekind-h3-sla")).toMatchObject({
      nodeTypes: ["H3SLAAttention"],
      minimumVersion: "1.3.8",
      recommendedVersion: "1.3.8",
      required: false
    });
    expect(customNodeDefinition("inpaint-cropandstitch")).toMatchObject({
      directoryName: "ComfyUI-Inpaint-CropAndStitch",
      nodeTypes: ["InpaintCropImproved", "InpaintStitchImproved"],
      repositoryUrl: "https://github.com/lquesada/ComfyUI-Inpaint-CropAndStitch.git",
      required: false
    });
    expect(customNodeDefinition("video-helper-suite")?.nodeTypes).toEqual(expect.arrayContaining([
      "VHS_LoadVideoFFmpeg",
      "VHS_VideoInfoSource"
    ]));
    expect(customNodeDefinition("spectrum-minimax-h3")).toMatchObject({
      minimumVersion: "0.2.1",
      recommendedVersion: "0.2.23"
    });
    expect(customNodeDefinition("spectrum-minimax-h3")?.compatibilityEvidence?.[0]).toMatchObject({
      comfyUi: "0.33.1",
      commit: "987be55",
      checks: ["static"]
    });
    expect(customNodeDefinition("h3-optimizations")).toMatchObject({
      repositoryUrl: "https://github.com/Zironic/H3-Optimizations.git",
      nodeTypes: ["H3MemoryOptimization"],
      minimumVersion: "0.2.16",
      recommendedVersion: "0.2.20",
      latestVersion: "0.2.20",
      bulkInstall: false,
      appInstallable: true,
      compatibilityEvidence: [{
        commit: "e15f6534bb5841ff4e6a92ea5f9b42fca0e32746",
        checks: ["static"]
      }],
      required: false
    });
    expect(customNodeDefinition("h3-continuum")).toMatchObject({
      repositoryUrl: "https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum.git",
      directoryName: "ComfyUI-H3-Continuum",
      installRevision: H3_CONTINUUM_REVISION,
      license: "MIT",
      nodeTypes: [
        "H3ContinuumSamplerV3",
        "H3ContinuumAdvancedV3",
        "H3ContinuumAssembleV3",
        "H3ContinuumJoin",
        "H3ContinuumFinish",
        "H3ContinuumSaveState",
        "H3ContinuumLoadState"
      ],
      minimumVersion: "3.6.0",
      recommendedVersion: "3.7.0",
      latestVersion: "3.7.0",
      bulkInstall: false,
      appInstallable: true,
      compatibilityEvidence: [{
        commit: H3_CONTINUUM_REVISION,
        checks: ["static"]
      }],
      required: false
    });
    expect(customNodeDefinition("h3-latent-upscaler")).toMatchObject({
      repositoryUrl: "https://github.com/rockerBOO/h3-latent-upscaler.git",
      directoryName: "h3-latent-upscaler",
      installRevision: H3_LATENT_UPSCALER_REVISION,
      license: "GPL-3.0",
      nodeTypes: [
        "MiniMaxH3LatentUpscale",
        "MiniMaxH3ConditioningUpscale",
        "MiniMaxH3AddNoise",
        "MiniMaxH3ShiftSigmas"
      ],
      required: false
    });
    expect(customNodeDefinition("minimax-h3-learned-upscaler")).toMatchObject({
      repositoryUrl: "https://github.com/LBH-123-AI/Comfyui_Minimax_h3_latent_Upscaler",
      directoryName: "Comfyui_Minimax_h3_latent_Upscaler",
      installRevision: "d7c01b9011f2e8439493f6c02c29995a27df276f",
      nodeTypes: ["MinimaxH3LatentUpscaler3D"],
      bulkInstall: false,
      appInstallable: true,
      runtimeRequirement: expect.stringContaining("用户可从设置页主动"),
      required: false
    });
    expect(customNodeDefinition("mmh3-ultimate-upscale")).toMatchObject({
      repositoryUrl: "https://github.com/bbaudio-2025/Comfyui-MMH3-UltimateUpscale.git",
      directoryName: "Comfyui-MMH3-UltimateUpscale",
      installRevision: H3_ULTIMATE_UPSCALE_REVISION,
      license: "MIT",
      nodeTypes: [
        "MMH3UltimateUpscale",
        "MMH3LatentUpscaleWithModelParams",
        "MMH3TemporalSplitParams",
        "MMH3SpatialSplitParams"
      ],
      bulkInstall: false,
      appInstallable: true,
      compatibilityEvidence: [{
        commit: H3_ULTIMATE_UPSCALE_REVISION,
        checks: ["static", "object-info", "minimal-run"]
      }],
      required: false
    });
    expect(customNodeDefinition("local-video-studio-h3-av")).toMatchObject({
      repositoryUrl: "builtin://LocalVideoStudio-H3",
      source: "bundled",
      directoryName: "LocalVideoStudio-H3",
      installRevision: H3_AV_SERIALIZER_REVISION,
      license: "MIT",
      nodeTypes: [
        "LocalVideoStudioH3SaveJointAV",
        "LocalVideoStudioH3LoadJointAV",
        "LocalVideoStudioRequireGpuVAE",
        "LocalVideoStudioH3RequireGpuVAE",
        "LocalVideoStudioH3AnchorConditioning"
      ],
      required: false
    });
  });

});
