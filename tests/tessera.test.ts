// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import { upscaleTaskFromRequest } from "../src/core/queue-task-factory";
import { TESSERA_ID, TESSERA_NODES, buildTesseraWorkflow, tesseraAnchorModels, tesseraGeometry } from "../src/core/tessera";
import { renderUpscaleDialog, type UpscaleDialogState } from "../src/renderer/shell/secondary-dialogs";
import { mountUpscaleController } from "../src/renderer/shell/upscale-controller";
import { createUpscaleFilename, upscaleDimensions } from "../src/core/upscale";
import { createTranslator } from "../src/core/i18n";
import type { AssetVersion, EnvironmentScanResult, HistoryAsset, ModelScanProfile, UpscaleRequest } from "../src/types";
import type { RendererContext } from "../src/renderer/contracts";
import { persistVideoHistoryResult } from "../electron/queue-history";

function setup() {
  const version = { id: "v", kind: "original", outputFilename: "h3.mp4", width: 1344, height: 768, duration: 362 / 24, fps: 24,
    files: [{ filename: "h3.mp4", absolutePath: "C:/fixture/h3.mp4", type: "output", subfolder: "" }] } as AssetVersion;
  const asset = { id: "a", title: "Source", prompt: "A person walking.", versions: [version] } as HistoryAsset;
  const state = createDefaultState(); state.history = [asset];
  const request: UpscaleRequest = { modelId: TESSERA_ID, sourceAssetId: "a", sourceVersionId: "v", sourceFilePath: "C:/fixture/h3.mp4",
    sourceFilename: "h3.mp4", sourceWidth: 1344, sourceHeight: 768, duration: version.duration, fps: 24, targetHeight: 2160, tileMode: "safe", faceRestore: false };
  const qwen = { id: "qwen-image-2-1-turbo", name: "Qwen Image 2.1 Turbo", available: true, runtimeVerified: false, runtimeReady: false,
    components: ["diffusion_models/qwen_image_2.1_turbo_int8_convrot.safetensors", "text_encoders/qwen3vl_8b_int8_convrot.safetensors", "vae/qwen_image_2.1_vae_bf16.safetensors"]
      .map(match => ({ found: true, matches: ["C:/models/" + match] })) } as ModelScanProfile;
  const environment = { modelProfiles: [{ id: TESSERA_ID, name: "Tessera", category: "upscale", available: true }, qwen] } as EnvironmentScanResult;
  const task = upscaleTaskFromRequest(request, state);
  const info = Object.fromEntries([...TESSERA_NODES, "LocalVideoStudioH3TesseraLoad", "ImageFromBatch", "TextEncodeQwenImage21", "EmptyLatentImage", "ComfySwitchNode", "QwenImage21Cache", "RandomNoise", "CFGGuider", "ManualSigmas", "SamplerCustomAdvanced", "VAEDecode"].map(id => [id, {}]));
  info.ModelAttentionBackend = { input: { required: { attention: [["pytorch attention"]] } } };
  return { state, version, asset, request, task, info, qwen, environment };
}

describe("Tessera with optional Qwen anchor", () => {
  it("requires complete compatible components, while offline files still enable the option", () => {
    const f = setup();
    expect(tesseraAnchorModels(f.environment)).toMatchObject([{ modelId: f.qwen.id, model: "qwen_image_2.1_turbo_int8_convrot.safetensors" }]);
    f.qwen.components[2]!.found = false;
    expect(tesseraAnchorModels(f.environment)).toEqual([]);
    f.qwen.components[2]!.found = true; f.qwen.runtimeVerified = true;
    expect(tesseraAnchorModels(f.environment)).toEqual([]);
  });
  it("does not load Qwen in the base graph and preserves complete duration and audio", () => {
    const f = setup(), graph = buildTesseraWorkflow(f.task, "uploaded.mp4", f.info);
    expect(Object.keys(graph).some(id => id.startsWith("anchor-"))).toBe(false);
    expect(graph.source!.inputs.frame_load_cap).toBe(0);
    expect(graph.video!.inputs.audio).toEqual(["source", 2]);
    expect(graph.restore!.inputs).toMatchObject({ frame_count: ["prepare", 1], width: 3780, height: 2160 });
    expect(f.task.duration).toBe(362 / 24);
    expect(graph.negative!.class_type).toBe("ConditioningZeroOut");
    const g = tesseraGeometry(1344, 768, 2160);
    expect(g.baseWidth * g.scale).toBe(g.canvasWidth);
    expect(g.baseHeight * g.scale).toBe(g.canvasHeight);
  });
  it("allows 768p to 4K anchor and chains only the first frame, official Turbo schedule, unload and guide", () => {
    const f = setup(); f.task.tessera!.anchor = tesseraAnchorModels(f.environment)[0]!;
    const graph = buildTesseraWorkflow(f.task, "uploaded.mp4", f.info);
    expect(graph["anchor-image-first"]!.inputs).toEqual({ image: ["prepare", 0], batch_index: 0, length: 1 });
    expect(graph["anchor-sigmas"]!.inputs.sigmas).toContain("0.978453");
    expect(graph["anchor-sizeSwitch"]!.inputs.switch).toBe(true);
    expect(graph["anchor-empty"]!.inputs.width).toBe(tesseraGeometry(1344, 768, 2160).canvasWidth);
    expect(graph["anchor-unload"]!.inputs).toMatchObject({ any_input: ["anchor-decoded", 0], unload_all_models: true });
    expect(graph.encode!.inputs.anchor).toEqual(["anchor-unload", 0]);
    expect(graph["h3-load"]!.inputs.anchor).toEqual(["anchor-unload", 0]);
    expect(graph.tao!.inputs.model).toEqual(["h3-load", 0]);
    expect(graph.conditioning!.inputs.clip).toEqual(["h3-load", 1]);
    expect(graph.unet).toBeUndefined();
    const visited = new Set<string>(), visiting = new Set<string>();
    function walk(id: string) {
      expect(graph[id], `Missing graph node ${id}`).toBeDefined();
      if (visited.has(id)) return;
      expect(visiting.has(id), `Cycle through ${id}`).toBe(false); visiting.add(id);
      for (const value of Object.values(graph[id]!.inputs)) {
        if (Array.isArray(value) && value.length === 2 && typeof value[0] === "string" && typeof value[1] === "number") walk(value[0]);
      }
      visiting.delete(id); visited.add(id);
    }
    walk("save");
    expect(visited.has("anchor-unload")).toBe(true);
    expect(graph["anchor-vae"]!.class_type).toBe("LocalVideoStudioH3RequireGpuVAE");
    expect(Object.values(graph).some(n => n.class_type === "SaveImageAdvanced")).toBe(false);
  });
  it("requires backend preflight before accepting an anchor request and retains independent History recipe", () => {
    const f = setup();
    expect(() => upscaleTaskFromRequest({ ...f.request, tesseraAnchor: { enabled: true } }, f.state)).toThrow("预检");
    f.task.tessera!.anchor = tesseraAnchorModels(f.environment)[0]!;
    persistVideoHistoryResult(f.state, { task: f.task, completedAt: "2026-11-03T00:00:00Z", promptId: "p", comfyOutputs: {},
      files: [{ filename: "tessera.mp4", type: "output", subfolder: "" }], id: () => "derived" });
    const out = f.asset.versions[1]!;
    expect(out).toMatchObject({ sourceAssetId: "a", sourceVersionId: "v", upscaleProvider: "tessera", fps: 24 });
    f.task.tessera!.anchor!.model = "changed";
    expect(out.tessera!.anchor!.model).not.toBe("changed");
  });
  it("renders missing-model recovery and clicks the production toggle/button at 768p to 4K", async () => {
    const f = setup(), translator = createTranslator("zh-CN");
    let dialog: UpscaleDialogState | null = { assetId: "a", versionId: "v", modelId: TESSERA_ID, targetHeight: 2160, tileMode: "safe" };
    const root = document.createElement("div"); document.body.append(root);
    const enqueueUpscale = vi.fn(async () => f.state);
    const context = { application: { enqueueUpscale }, getState: () => f.state, t: translator.t, notify: vi.fn(), requestRender: vi.fn() } as unknown as RendererContext;
    let cleanup = () => {};
    const render = () => {
      cleanup();
      root.innerHTML = renderUpscaleDialog({ dialog, history: [f.asset], environment: f.environment, performance: null, icon: () => "", escapeHtml: String,
        formatBytes: String, formatVideoDuration: String, formatUpscaleEstimateRange: () => "", createUpscaleFilename, upscaleDimensions,
        versionShortEdge: v => Math.min(v.width, v.height), estimateUpscaleResources: () => ({ frameCount: 362, vramMinGb: 0, vramMaxGb: 0, secondsMin: 0, secondsMax: 0, internalScale: 4 }), t: translator.t });
      cleanup = mountUpscaleController(context, { root, renderOverlay: render, getDialog: () => dialog, setDialog: d => { dialog = d; },
        setRendererState: vi.fn(), rememberModalFocus: vi.fn(), rememberModalControlFocus: vi.fn(), restoreModalFocus: vi.fn(), bindModalFocus: vi.fn(), reportUserAction: vi.fn() });
    };
    try {
      f.qwen.available = false; render();
      expect(root.querySelector<HTMLInputElement>("#upscale-tessera-anchor")!.disabled).toBe(true);
      f.qwen.available = true; render();
      root.querySelector<HTMLInputElement>("#upscale-tessera-anchor")!.click();
      expect(dialog!.tesseraAnchorEnabled).toBe(true);
      expect(root.textContent).toContain("作者推荐");
      expect(root.querySelector<HTMLButtonElement>("#enqueue-upscale")!.disabled).toBe(false);
      root.querySelector<HTMLButtonElement>("#enqueue-upscale")!.click();
      await vi.waitFor(() => expect(enqueueUpscale).toHaveBeenCalledOnce());
      expect(enqueueUpscale.mock.calls[0]![0]).toMatchObject({ modelId: TESSERA_ID, targetHeight: 2160, tesseraAnchor: { enabled: true, modelId: f.qwen.id } });
    } finally { cleanup(); root.remove(); }
  });
});
