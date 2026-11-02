import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { afterEach, expect, it, vi } from "vitest";
import { submitTask, assertImageWorkflowRuntimeCompatible } from "../electron/services/comfy-ui.js";
import { createNativeTranslator } from "../electron/ui-translator.js";
import { createDefaultState } from "../src/core/defaults.js";
import { queueTaskFromDraft } from "../src/core/queue-task-factory.js";

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals(); vi.restoreAllMocks();
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
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
