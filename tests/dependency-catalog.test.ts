import { describe, expect, it } from "vitest";
import {
  customNodeCatalog,
  customNodeDefinition,
  workflowDependencyCatalog,
  workflowDependencyDefinition
} from "../src/core/catalog";

describe("dependency catalog", () => {
  it("keeps node package identities and install targets unique", () => {
    expect(new Set(customNodeCatalog.map((item) => item.id)).size)
      .toBe(customNodeCatalog.length);
    expect(new Set(customNodeCatalog.map((item) => item.directoryName.toLowerCase())).size)
      .toBe(customNodeCatalog.length);
    for (const definition of customNodeCatalog) {
      expect(definition.repositoryUrl).toMatch(/^https:\/\/github\.com\//);
      expect(definition.aliases.length).toBeGreaterThan(0);
    }
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
      recommendedVersion: "0.2.17"
    });
    expect(customNodeDefinition("spectrum-minimax-h3")?.compatibilityEvidence?.[0]).toMatchObject({
      comfyUi: "0.33.1",
      commit: "9dc51b7",
      checks: ["static"]
    });
  });

  it("defines portable workflow destinations without machine paths", () => {
    expect(workflowDependencyCatalog).toHaveLength(2);
    expect(workflowDependencyDefinition("minimax_h3_i2v")).toMatchObject({
      sourceUrl: expect.stringContaining("Comfy-Org/workflow_templates"),
      targetSegments: [
        "user",
        "default",
        "workflows",
        "video_minimax_h3_i2v.json"
      ]
    });
    expect(workflowDependencyDefinition("qwen36_h3_prompt_enhancer")).toMatchObject({
      sourceUrl: expect.stringContaining("qwen36_h3_prompt_enhancer_api.json"),
      targetSegments: ["user", "default", "workflows", "qwen36_h3_prompt_enhancer_api.json"]
    });
    for (const definition of workflowDependencyCatalog) {
      expect(definition.targetSegments.every((segment) =>
        segment !== ".." && !/[\\/]/.test(segment)
      )).toBe(true);
    }
  });
});
