import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { afterEach, expect, it, vi } from "vitest";
import { submitTask, assertImageWorkflowRuntimeCompatible } from "../electron/services/comfy-ui.js";
import { createNativeTranslator } from "../electron/ui-translator.js";
import { createDefaultState } from "../src/core/defaults.js";
import { queueTaskFromDraft } from "../src/core/queue-task-factory.js";
import { restoreH3ReferenceGuideDraft } from "../src/core/h3-timed-guides.js";

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals(); vi.restoreAllMocks();
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});

it("submits R2V timed Pictures as Add Guides with the original reference image links", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "submission-r2v-guide-")); roots.push(root);
  const workflowPath = path.join(root, "workflow.json");
  const source = {
    "1": { class_type: "LoadImage", inputs: { image: "{{H3_REF_IMAGE_0}}" } },
    "2": { class_type: "LoadImage", inputs: { image: "{{H3_REF_IMAGE_1}}" } },
    "3": { class_type: "MiniMaxH3ReferenceToVideo", inputs: {
      vae: ["5", 0], prompt: "{{PROMPT}}", "ref_images.ref_image_0": ["1", 0], "ref_images.ref_image_1": ["2", 0]
    } },
    "4": { class_type: "BasicGuider", inputs: { model: ["6", 0], conditioning: ["3", 0] } },
    "5": { class_type: "VAELoader", inputs: {} },
    "6": { class_type: "UNETLoader", inputs: {} },
    "7": { class_type: "BasicScheduler", inputs: { model: ["6", 0] } }
  };
  await fs.writeFile(workflowPath, JSON.stringify(source));
  const paths = [path.join(root, "reference.png"), path.join(root, "guide.png")];
  await Promise.all(paths.map(filename => fs.writeFile(filename, "fixture-image")));
  const state = createDefaultState();
  const inputs = restoreH3ReferenceGuideDraft(paths.map((mediaPath, index) => ({
    id: String(index), mediaType: "image", mediaPath, role: "subject", note: ""
  })), [{ picture: 2, mediaPath: paths[1]!, seconds: 0.5 }]);
  expect(inputs.h3ReferenceGuidesEnabled).toBe(true);
  expect(inputs.h3ReferenceSlots.map(slot => slot.guideSeconds)).toEqual([undefined, 0.5]);
  expect(restoreH3ReferenceGuideDraft(inputs.h3ReferenceSlots).h3ReferenceGuidesEnabled).toBe(false);
  expect(restoreH3ReferenceGuideDraft(inputs.h3ReferenceSlots, [])).toMatchObject({
    h3ReferenceGuidesEnabled: true,
    h3ReferenceSlots: [{ guideSeconds: undefined }, { guideSeconds: undefined }]
  });
  const task = { ...queueTaskFromDraft({
    ...state.draft, ...inputs, modelId: "minimax_h3_ref2va", workflowPath, attentionMode: "pytorch", spectrumMode: "off"
  }, state), prompt: "The camera follows <Picture 1> toward <Picture 2>." };
  const submitted: Array<Record<string, { class_type: string; inputs: Record<string, unknown> }>> = [];
  const uploads: string[] = [];
  const request = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/object_info")) {
      return Response.json(Object.fromEntries([...Object.values(source).map(node => node.class_type), "MiniMaxH3AddGuide", "PathchSageAttentionKJ"]
        .map(classType => [classType, {}])));
    }
    if (url.endsWith("/system_stats")) return Response.json({ devices: [] });
    if (url.endsWith("/upload/image")) {
      const file = (init!.body as FormData).get("image") as File;
      uploads.push(file.name);
      return Response.json({ name: file.name });
    }
    expect(url.endsWith("/prompt")).toBe(true);
    submitted.push(JSON.parse(init!.body as string).prompt);
    return Response.json({ prompt_id: "r2v-guide" });
  });
  vi.stubGlobal("fetch", request);
  await expect(submitTask(task, state.settings, new AbortController().signal))
    .resolves.toMatchObject({ promptId: "r2v-guide" });
  expect(uploads).toHaveLength(2);
  const graph = submitted[0]!;
  const guides = Object.entries(graph).filter(([, node]) => node.class_type === "MiniMaxH3AddGuide");
  expect(guides).toHaveLength(1);
  const [guideId, guide] = guides[0]!;
  expect(guide.inputs).toMatchObject({ positive: ["3", 0], latent: ["3", 1], image: ["2", 0], frame_idx: 12 });
  expect(graph["3"]!.inputs.prompt).toBe(task.prompt);
  expect(graph["4"]!.inputs.conditioning).toEqual([guideId, 0]);
});

it("keeps the submitted graph, user text and input bytes identical in all three languages", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "submission-locale-")); roots.push(root);
  const workflowPath = path.join(root, "workflow.json"), startImagePath = path.join(root, "故乡.png");
  const source = { text: { class_type: "CLIPTextEncode", inputs: { text: "{{PROMPT}}" } },
    image: { class_type: "LoadImage", inputs: { image: "{{INPUT_IMAGE}}" } } };
  await fs.writeFile(workflowPath, JSON.stringify(source)); await fs.writeFile(startImagePath, "fixture-image-bytes");
  const state = createDefaultState();
  state.draft = { ...state.draft, modelId: "sulphur2", workflowPath, startImagePath, prompt: "保留故乡招牌" };
  const task = { ...queueTaskFromDraft(state.draft, state), prompt: "保留故乡招牌" }, before = structuredClone(task);
  const bodies: unknown[] = [], uploads: Uint8Array[] = [];
  vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000001");
  for (const uiLocale of ["zh-CN", "en-US", "zh-TW"] as const) {
    const request = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/object_info")) return Response.json({ CLIPTextEncode: {}, LoadImage: {} });
      if (url.endsWith("/system_stats")) return Response.json({ devices: [] });
      if (url.endsWith("/upload/image")) {
        const form = init!.body as FormData;
        uploads.push(new Uint8Array(await (form.get("image") as Blob).arrayBuffer()));
        expect(form.get("overwrite")).toBe("false");
        return Response.json({ name: "input.png", subfolder: "fixture" });
      }
      expect(url.endsWith("/prompt")).toBe(true);
      bodies.push(JSON.parse(init!.body as string)); return Response.json({ prompt_id: "same-prompt" });
    });
    vi.stubGlobal("fetch", request);
    await expect(submitTask(task, { ...state.settings, uiLocale }, new AbortController().signal))
      .resolves.toMatchObject({ promptId: "same-prompt", nodeTypes: { text: "CLIPTextEncode", image: "LoadImage" } });
    expect(request).toHaveBeenCalledTimes(4);
  }
  expect(bodies[1]).toEqual(bodies[0]); expect(bodies[2]).toEqual(bodies[0]);
  expect(JSON.stringify(bodies[0])).toContain("保留故乡招牌");
  expect(uploads).toHaveLength(3); expect(uploads[1]).toEqual(uploads[0]); expect(uploads[2]).toEqual(uploads[0]);
  expect(task).toEqual(before);
  expect(await fs.readFile(startImagePath, "utf8")).toBe("fixture-image-bytes");
});

it.each([
  ["en-US", "Incompatible ModelAttentionBackend.model schema type: expected MODEL"],
  ["zh-TW", "ModelAttentionBackend.model schema 類型不相容：需要 MODEL"]
] as const)("passes %s into nested execution schema diagnostics before POST", async (uiLocale, detail) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "submission-schema-locale-")); roots.push(root);
  const workflowPath = path.join(root, "workflow.json");
  await fs.writeFile(workflowPath, JSON.stringify({
    attention: { class_type: "ModelAttentionBackend", inputs: { model: ["source", 0], attention: "pytorch attention" } }
  }));
  const state = createDefaultState();
  const task = queueTaskFromDraft({ ...state.draft, modelId: "sulphur2", workflowPath, startImagePath: "", endImagePath: "" }, state);
  const before = structuredClone(task);
  const request = vi.fn(async (url: string | URL | Request) => Response.json(String(url).endsWith("/object_info")
    ? { ModelAttentionBackend: { input: { required: { model: ["INT"], attention: [["pytorch attention"], {}] } }, output: ["MODEL"] } }
    : { devices: [] }));
  vi.stubGlobal("fetch", request);
  await expect(submitTask(task, { ...state.settings, uiLocale }, new AbortController().signal)).rejects.toThrow(detail);
  expect(request).toHaveBeenCalledTimes(2);
  expect(request.mock.calls.every(([url]) => !String(url).endsWith("/prompt"))).toBe(true);
  expect(task).toEqual(before);
});

it.each([
  ["en-US", "no ComfyUI API workflow", "Required nodes are not loaded", "missing inputs"],
  ["zh-TW", "未設定 ComfyUI API", "必要節點未載入", "缺少輸入"]
] as const)("keeps %s missing-input and schema guards before submission", async (uiLocale, missing, nodes, inputs) => {
  const state = createDefaultState();
  const task = queueTaskFromDraft({ ...state.draft, workflowPath: "" }, state);
  const request = vi.fn(); vi.stubGlobal("fetch", request);
  await expect(submitTask(task, { ...state.settings, uiLocale }, new AbortController().signal)).rejects.toThrow(missing);
  expect(request).not.toHaveBeenCalled();
  const t = createNativeTranslator(uiLocale).t;
  expect(() => assertImageWorkflowRuntimeCompatible("lama-inpaint", {
    inpaint: { class_type: "INPAINT_InpaintWithModel", inputs: {} }
  }, {}, t)).toThrow(nodes);
  const workflow = { save: { class_type: "SaveImageAdvanced", inputs: { images: ["source", 0], "format.bit_depth": "8-bit" } } };
  expect(() => assertImageWorkflowRuntimeCompatible("qwen-image-2-1", workflow, {
    SaveImageAdvanced: { input: { required: { images: ["IMAGE"], format: ["COMBO"] } } }
  }, t)).not.toThrow();
  expect(() => assertImageWorkflowRuntimeCompatible("qwen-image-2-1", workflow, {
    SaveImageAdvanced: { input: { required: { images: ["IMAGE"] } } }
  }, t)).toThrow(inputs);
});
