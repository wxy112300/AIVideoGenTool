// @vitest-environment jsdom
import path from "node:path";
import { promises as fs } from "node:fs";
import type { IpcMain } from "electron";
import { expect, it, vi } from "vitest";
import type { BundledWorkflow, GenerationQueueTask } from "../src/types";
import { createJourney } from "./harness/create-journey";
import { registerWorkflowIpc } from "../electron/workflow-ipc";
import { evaluateModelProfiles } from "../electron/services/environment";
import { PI_H3_ADAPTERS, PI_H3_MODEL_ID, PI_H3_NODE_ID, PI_H3_WORKFLOW_FILENAME, minimaxH3Pi } from "../src/core/catalog/models/minimax_h3_pi/definition";
import { renderWorkflow, validateApiWorkflow } from "../src/core/workflow";

it("selects Pi-H3 in FL2VA and recovers the queue button when the selected adapter is installed", async () => {
  const journey = await createJourney();
  try {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    registerWorkflowIpc({
      ipc: { handle: (name, handler) => handlers.set(name, handler) } as unknown as IpcMain,
      fileSystem: fs,
      workflowRoots: [path.resolve("workflows")],
      logger: { info: vi.fn() },
      getLtxExtensionModelProfile: () => "q3_k_m"
    });
    const bundled = (id: string, mode: string) =>
      handlers.get("workflow:get-bundled")!(undefined, id, mode) as Promise<BundledWorkflow | null>;
    journey.application.getBundledWorkflow.mockImplementation(async (id, mode) => {
      const workflow = await bundled(id, mode);
      if (!workflow) throw new Error("No bundled workflow");
      return workflow;
    });
    journey.dependencies.bundledWorkflows["minimax_h3_fl2va:image"] =
      (await bundled("minimax_h3_fl2va", "image"))!;
    expect(await bundled(PI_H3_MODEL_ID, "video")).toBeNull();
    journey.scan.comfyCompatibility.version = "0.46.0";
    const components = minimaxH3Pi.definition.scan!.components;
    const files = components.map(component => component.expected).filter(filename => !filename.endsWith(PI_H3_ADAPTERS[4]));
    const profile = evaluateModelProfiles(files).find(candidate => candidate.id === PI_H3_MODEL_ID)!;
    expect(profile.available).toBe(true);
    journey.scan.modelProfiles.push(profile);
    journey.scan.customNodes.push({ ...journey.scan.customNodes[0]!, id: PI_H3_NODE_ID });
    journey.render();
    const option = journey.element<HTMLOptionElement>(`#model option[value="${PI_H3_MODEL_ID}"]`);
    const base = journey.element<HTMLOptionElement>('#model option[value="minimax_h3_fl2va"]');
    expect(option.textContent).toBe("MiniMax H3 · Pi-H3");
    expect(option.dataset.note).toContain("省去视频 VAE 解码");
    expect(option.parentElement).toBe(base.parentElement);
    journey.input("#model", PI_H3_MODEL_ID, "change");
    await vi.waitFor(() => expect(journey.state().draft.workflowPath).toBe(path.resolve("workflows", PI_H3_WORKFLOW_FILENAME)));
    journey.input("#prompt-input", "A paper kite rises.");
    const stepsPicker = journey.element<HTMLSelectElement>("#steps");
    expect(stepsPicker.value).toBe("");
    expect(stepsPicker.selectedOptions[0]?.label).toBe("选择已安装的档位");
    expect(stepsPicker.querySelector<HTMLOptionElement>('option[value="4"]')).toMatchObject({
      disabled: true, dataset: { note: "缺少此档权重" }
    });
    expect(stepsPicker.querySelector<HTMLOptionElement>('option[value="2"]')).toMatchObject({
      disabled: false, dataset: { note: "快速预览" }
    });
    expect(journey.element("[data-steps-help] .field-info-tip").textContent).toContain("4 步优先画质");
    await vi.waitFor(() => expect(journey.element("#enqueue").dataset.enqueueBlockReason).toContain("4 步"));
    expect(journey.element("#enqueue").disabled).toBe(true);
    journey.input("#steps", "2", "change");
    await vi.waitFor(() => expect(journey.element("#enqueue").disabled, journey.element("#enqueue").dataset.enqueueBlockReason).toBe(false));
    journey.element("#enqueue").click();
    await vi.waitFor(() => expect(journey.state().queue).toHaveLength(1));
    const task = journey.state().queue[0] as GenerationQueueTask;
    expect(task).toMatchObject({ id: expect.any(String), modelId: PI_H3_MODEL_ID, steps: 2, fps: 24,
      h3LatentSaveMode: "none", h3SaveJointAv: false, attentionMode: "pytorch", h3SparseAttentionMode: "off" });
    const installed = evaluateModelProfiles(components.map(component => component.expected))
      .find(candidate => candidate.id === PI_H3_MODEL_ID)!;
    journey.scan.modelProfiles[journey.scan.modelProfiles.indexOf(profile)] = installed;
    journey.render();
    expect(journey.element<HTMLOptionElement>('#steps option[value="4"]')).toMatchObject({
      disabled: false, dataset: { note: "画质优先" }
    });
    journey.input("#steps", "4", "change");
    expect(journey.state().draft.steps).toBe(4);
    expect(journey.state().queue[0]?.steps).toBe(2);

    const source = JSON.parse(await fs.readFile(task.workflowPath, "utf8"));
    expect(validateApiWorkflow(source).valid).toBe(true);
    for (const steps of [2, 4] as const) {
      const graph = renderWorkflow(source, { ...task, steps }, steps === 2 ? {} : { endImage: "last.png" }) as
        Record<string, { class_type: string; inputs: Record<string, unknown> }>;
      const node = (classType: string) => Object.values(graph).find(value => value.class_type === classType);
      expect(JSON.stringify(graph)).not.toContain("{{");
      for (const entry of Object.values(graph)) {
        for (const input of Object.values(entry.inputs)) {
          if (Array.isArray(input)) expect(graph[String(input[0])]).toBeDefined();
        }
      }
      expect(node("Load LakonLab Adapter")?.inputs.adapter_name).toBe(PI_H3_ADAPTERS[steps]);
      expect(node("pi-Flow Scheduler")?.inputs).toMatchObject({ steps, max_raw_t: steps === 2 ? 0.93 : 0.96, final_step_size_scale: 0.6 });
      expect(node("MiniMaxH3ImageToVideo")?.inputs.first_frame).toBeUndefined();
      expect(node("MiniMaxH3ImageToVideo")?.inputs.last_frame).toEqual(steps === 2 ? undefined : ["6", 0]);
      expect(node("DWD Decode")).toBeDefined();
      expect(node("VAEDecodeAudio")).toBeDefined();
      expect(node("VAEDecode")).toBeUndefined();
    }
  } finally {
    journey.dispose();
    await new Promise(resolve => setTimeout(resolve, 370));
  }
});
