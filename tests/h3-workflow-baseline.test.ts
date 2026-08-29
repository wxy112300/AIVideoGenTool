import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ExtensionQueueTask, GenerationQueueTask } from "../src/types";
import {
  isMiniMaxH3LivePreviewSupported,
  renderWorkflow,
  validateApiWorkflow
} from "../src/core/workflow";

type ApiWorkflow = Record<string, {
  class_type: string;
  inputs: Record<string, unknown>;
}>;

const createdAt = "2026-08-17T00:00:00.000Z";

const baseGenerationTask: GenerationQueueTask = {
  id: "h3-baseline-generation",
  taskType: "generation",
  status: "waiting",
  createdAt,
  updatedAt: createdAt,
  outputFilename: "h3-baseline.mp4",
  prompt: "integrated_multimodal_description: [Shot 1] The subject turns naturally.\noverall_soundscape: Quiet room ambience.\nnon_diegetic_music: N/A",
  promptVersion: 1,
  startImagePath: "D:/source/start.png",
  sourceWidth: 1920,
  sourceHeight: 1080,
  endImagePath: "",
  modelId: "minimax_h3_fl2va",
  workflowPath: "minimax_h3_i2v_api.json",
  ratio: "16:9",
  resolution: 480,
  duration: 5,
  steps: 20,
  fps: 24,
  frameInterpolation: "off",
  motion: "natural",
  seed: 4242,
  keepSeedOnCopy: false,
  spectrumMode: "off",
  spectrumModelAwareMode: "off"
};

const baseExtensionTask: ExtensionQueueTask = {
  id: "h3-baseline-extension",
  taskType: "extension",
  status: "waiting",
  createdAt,
  updatedAt: createdAt,
  outputFilename: "h3-extension-baseline.mp4",
  prompt: "subject_definitions:\n<Subject 1> is the source subject.\nsummary:\n[video continuation]\nretention_analysis:\n<Subject 1>: fully_preserved\ndetailed_description:\nThe action continues naturally.\noverall_soundscape: Preserve source ambience.\nnon_diegetic_music: N/A",
  promptVersion: 1,
  sourceVideoPath: "D:/source/context.mp4",
  sourceVideoDuration: 10,
  trimStartSeconds: 0,
  trimEndSeconds: 10,
  sourceWidth: 1920,
  sourceHeight: 1080,
  modelId: "minimax_h3_ref2va",
  workflowPath: "minimax_h3_r2v_extend_api.json",
  ratio: "source",
  resolution: 480,
  duration: 5,
  steps: 20,
  fps: 24,
  frameInterpolation: "off",
  motion: "natural",
  seed: 4242,
  keepSeedOnCopy: false,
  maxGeneratedFrames: 362,
  overlapFrames: 22,
  unloadBetweenStages: true,
  spectrumMode: "off",
  spectrumModelAwareMode: "off",
  h3ContextSavePrefix: "h3_context/h3-baseline-extension/clip"
};

function workflow(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`../workflows/${name}`, import.meta.url), "utf8"));
}

function renderI2v(
  task: GenerationQueueTask = baseGenerationTask,
  context: Parameters<typeof renderWorkflow>[2] = {}
): ApiWorkflow {
  return renderWorkflow(
    workflow("minimax_h3_i2v_api.json"),
    task,
    { inputImage: "LocalVideoStudio/start-a.png", ...context }
  ) as ApiWorkflow;
}

function externalInputs(graph: ApiWorkflow): string[] {
  const values: string[] = [];
  for (const node of Object.values(graph)) {
    for (const [key, value] of Object.entries(node.inputs)) {
      if (
        typeof value === "string" &&
        ["image", "video", "latent_path"].includes(key)
      ) {
        values.push(`${node.class_type}.${key}=${value}`);
      }
    }
  }
  return values.sort();
}

function hasLivePreview(graph: ApiWorkflow): boolean {
  return Object.values(graph).some((node) =>
    node.class_type === "ModelPreviewOverrideKJ"
  );
}

describe("H3 rendered workflow baseline", () => {
  it("keeps the selectable final video VAE placeholder in every bundled H3 workflow", () => {
    const workflows = [
      "minimax_h3_fl2va_turbo_api.json",
      "minimax_h3_i2v_api.json",
      "minimax_h3_i2v_gguf_q3_api.json",
      "minimax_h3_r2v_api.json",
      "minimax_h3_r2v_extend_api.json",
      "minimax_h3_t2va_api.json",
      "minimax_h3_t2va_gguf_q3_api.json",
      "minimax_h3_t2va_turbo_api.json"
    ];

    for (const filename of workflows) {
      const source = workflow(filename) as ApiWorkflow;
      const videoVaeNode = Object.values(source).find((node) =>
        node.class_type === "VAELoader" && node.inputs.vae_name === "{{H3_VIDEO_VAE}}"
      );
      expect(videoVaeNode, filename).toBeDefined();
    }
  });

  it("captures the standard, accelerated, preview, and Motion Context node graphs", () => {
    const turboTask: GenerationQueueTask = {
      ...baseGenerationTask,
      id: "h3-baseline-turbo",
      steps: 8,
      videoLoras: [{
        id: "minimax-h3-lightx2v-turbo-8step-v1",
        name: "LightX2V Turbo 8-Step v1.0",
        filename: "minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors",
        strength: 0.75,
        modelFamily: "minimax-h3",
        compatibleModelIds: ["minimax_h3_fl2va"],
        compatibleInputModes: ["image"],
        purpose: "performance"
      }]
    };
    const spectrumTask: GenerationQueueTask = {
      ...baseGenerationTask,
      id: "h3-baseline-spectrum",
      spectrumMode: "balanced",
      spectrumModelAwareMode: "schedule"
    };
    const motionContext = renderWorkflow(
      workflow("minimax_h3_r2v_extend_api.json"),
      baseExtensionTask,
      {
        sourceVideo: "LocalVideoStudio/context-a.mp4",
        h3ContextSavePrefix: "h3_context/h3-baseline-extension/clip"
      }
    ) as ApiWorkflow;
    const motionContextLatent = renderWorkflow(
      workflow("minimax_h3_r2v_extend_api.json"),
      baseExtensionTask,
      {
        sourceVideo: "LocalVideoStudio/context-a.mp4",
        h3ContextLatentPath: "D:/ComfyUI/output/h3_context/previous/clip_00001.safetensors",
        h3ContextSavePrefix: "h3_context/h3-baseline-extension/clip"
      }
    ) as ApiWorkflow;

    expect({
      standard: renderI2v(),
      turbo: renderWorkflow(
        workflow("minimax_h3_fl2va_turbo_api.json"),
        turboTask,
        { inputImage: "LocalVideoStudio/start-a.png" }
      ),
      spectrum: renderI2v(spectrumTask),
      preview: renderI2v(baseGenerationTask, {
        h3PreviewTinyVae: "taeh3.safetensors"
      }),
      motionContext,
      motionContextLatent
    }).toMatchSnapshot();
  });
});

describe("H3 T2VA workflow asset", () => {
  it("uses the official text-only optional-frame conditioning shape", () => {
    const source = workflow("minimax_h3_t2va_api.json") as ApiWorkflow;
    const conditioning = Object.values(source).find((node) =>
      node.class_type === "MiniMaxH3ImageToVideo"
    );
    const classTypes = Object.values(source).map((node) => node.class_type);

    expect(validateApiWorkflow(source).valid).toBe(true);
    expect(classTypes).not.toContain("LoadImage");
    expect(classTypes).toEqual(expect.arrayContaining([
      "MiniMaxH3ImageToVideo",
      "VAEDecode",
      "VAEDecodeAudio",
      "CreateVideo",
      "SaveVideo"
    ]));
    expect(conditioning?.inputs).not.toHaveProperty("first_frame");
    expect(conditioning?.inputs).not.toHaveProperty("last_frame");
    expect(JSON.stringify(source)).not.toContain("{{INPUT_IMAGE}}");
    expect(JSON.stringify(source)).not.toContain("{{END_IMAGE}}");
  });

  it("keeps Turbo and Q3 T2VA graphs on their variant-specific loaders", () => {
    const variants: Array<[string, string[]]> = [
      ["minimax_h3_t2va_turbo_api.json", ["MiniMaxH3SigmaShift", "LoraLoaderModelOnly"]],
      ["minimax_h3_t2va_gguf_q3_api.json", ["H3UnetLoaderGGUFAdvanced", "H3CLIPLoaderGGUF"]]
    ];
    for (const [filename, requiredClasses] of variants) {
      const source = workflow(filename) as ApiWorkflow;
      const classTypes = Object.values(source).map((node) => node.class_type);

      expect(validateApiWorkflow(source).valid).toBe(true);
      expect(classTypes).not.toContain("LoadImage");
      expect(classTypes).toEqual(expect.arrayContaining(requiredClasses));
    }
  });
});

describe("H3 external input cache identity boundary", () => {
  it("makes a changed I2V staged path visible to ComfyUI", () => {
    expect(externalInputs(renderI2v(baseGenerationTask, {
      inputImage: "LocalVideoStudio/start-a.png"
    }))).not.toEqual(externalInputs(renderI2v(baseGenerationTask, {
      inputImage: "LocalVideoStudio/start-b.png"
    })));
  });

  it("makes changed R2V image and video staged paths visible to ComfyUI", () => {
    const source = workflow("minimax_h3_r2v_api.json");
    const first = renderWorkflow(source, baseGenerationTask, {
      h3ReferenceImages: ["LocalVideoStudio/ref-a.png"],
      h3ReferenceVideos: ["LocalVideoStudio/ref-a.mp4"]
    }) as ApiWorkflow;
    const second = renderWorkflow(source, baseGenerationTask, {
      h3ReferenceImages: ["LocalVideoStudio/ref-b.png"],
      h3ReferenceVideos: ["LocalVideoStudio/ref-b.mp4"]
    }) as ApiWorkflow;

    expect(externalInputs(first)).not.toEqual(externalInputs(second));
    expect(externalInputs(second)).toContain(
      "LoadImage.image=LocalVideoStudio/ref-b.png"
    );
    expect(externalInputs(second)).toContain(
      "VHS_LoadVideoFFmpeg.video=LocalVideoStudio/ref-b.mp4"
    );
  });

  it("makes changed Motion Context video and latent paths visible to ComfyUI", () => {
    const source = workflow("minimax_h3_r2v_extend_api.json");
    const first = renderWorkflow(source, baseExtensionTask, {
      sourceVideo: "LocalVideoStudio/context-a.mp4",
      h3ContextLatentPath: "D:/ComfyUI/output/h3_context/a.safetensors",
      h3ContextSavePrefix: "h3_context/h3-baseline-extension/clip"
    }) as ApiWorkflow;
    const second = renderWorkflow(source, baseExtensionTask, {
      sourceVideo: "LocalVideoStudio/context-b.mp4",
      h3ContextLatentPath: "D:/ComfyUI/output/h3_context/b.safetensors",
      h3ContextSavePrefix: "h3_context/h3-baseline-extension/clip"
    }) as ApiWorkflow;

    expect(externalInputs(first)).not.toEqual(externalInputs(second));
    expect(externalInputs(second)).toContain(
      "VHS_LoadVideoFFmpeg.video=LocalVideoStudio/context-b.mp4"
    );
    expect(externalInputs(second)).toContain(
      "MiniMaxH3MotionContextLoadLatent.latent_path=D:/ComfyUI/output/h3_context/b.safetensors"
    );
  });
});

describe("H3 live preview support matrix", () => {
  it("injects the observer across supported H3 graphs and keeps Q3 unchanged", () => {
    const previewContext = { h3PreviewTinyVae: "taeh3.safetensors" };
    const turboTask: GenerationQueueTask = {
      ...baseGenerationTask,
      steps: 8,
      videoLoras: [{
        id: "minimax-h3-lightx2v-turbo-8step-v1",
        name: "LightX2V Turbo 8-Step v1.0",
        filename: "minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors",
        strength: 0.75,
        modelFamily: "minimax-h3",
        compatibleModelIds: ["minimax_h3_fl2va"],
        compatibleInputModes: ["image"],
        purpose: "performance"
      }]
    };
    const supported = [
      renderI2v(baseGenerationTask, previewContext),
      renderI2v({ ...baseGenerationTask, spectrumMode: "balanced" }, previewContext),
      renderWorkflow(
        workflow("minimax_h3_fl2va_turbo_api.json"),
        turboTask,
        { inputImage: "LocalVideoStudio/start-a.png", ...previewContext }
      ) as ApiWorkflow,
      renderWorkflow(
        workflow("minimax_h3_r2v_api.json"),
        { ...baseGenerationTask, modelId: "minimax_h3_ref2va" },
        { h3ReferenceImages: ["LocalVideoStudio/ref-a.png"], ...previewContext }
      ) as ApiWorkflow,
      renderWorkflow(
        workflow("minimax_h3_r2v_extend_api.json"),
        baseExtensionTask,
        {
          sourceVideo: "LocalVideoStudio/context-a.mp4",
          h3ContextSavePrefix: "h3_context/h3-baseline-extension/clip",
          ...previewContext
        }
      ) as ApiWorkflow
    ];
    const q3 = renderWorkflow(
      workflow("minimax_h3_i2v_gguf_q3_api.json"),
      { ...baseGenerationTask, modelId: "minimax_h3_fl2va_q3_gguf", steps: 8 },
      {
        inputImage: "LocalVideoStudio/start-a.png",
        h3PreviewTinyVae: isMiniMaxH3LivePreviewSupported("minimax_h3_fl2va_q3_gguf")
          ? "taeh3.safetensors"
          : ""
      }
    ) as ApiWorkflow;

    expect(supported.every(hasLivePreview)).toBe(true);
    expect(isMiniMaxH3LivePreviewSupported("minimax_h3_fl2va_q3_gguf")).toBe(false);
    expect(hasLivePreview(q3)).toBe(false);
  });
});
