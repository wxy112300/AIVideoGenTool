// @vitest-environment jsdom
import path from "node:path";
import { promises as fs } from "node:fs";
import type { IpcMain } from "electron";
import type { BundledWorkflow } from "../src/types";
import { afterEach, expect, it, vi } from "vitest";
import { createJourney } from "./harness/create-journey";
import { registerWorkflowIpc } from "../electron/workflow-ipc";
import { evaluateModelProfiles } from "../electron/services/environment";
import { minimaxH3Omni, FASTH3_OMNI_MODEL_ID as modelId } from "../src/core/catalog/models/minimax_h3_omni/definition";

let journey: Awaited<ReturnType<typeof createJourney>> | undefined;
afterEach(async () => { journey?.dispose(); journey = undefined; await new Promise(resolve => setTimeout(resolve, 370)); });
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

it("FastH3 Omni: core repair → missing reference → actual picker/Enhance/enqueue buttons → frozen task → return to Base", async () => {
  const h = journey = await createJourney();
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  registerWorkflowIpc({ ipc: { handle: (name, handler) => handlers.set(name, handler) } as unknown as IpcMain,
    fileSystem: fs, workflowRoots: [path.resolve("workflows")], logger: { info: vi.fn() }, getLtxExtensionModelProfile: () => "q3_k_m" });
  h.application.getBundledWorkflow.mockImplementation(async (id, mode) => {
    const workflow = await handlers.get("workflow:get-bundled")!(undefined, id, mode) as BundledWorkflow | null;
    if (!workflow) throw new Error("No bundled workflow");
    return workflow;
  });
  // Production bootstrap remembers the current bundled graph before model changes.
  h.dependencies.bundledWorkflows["minimax_h3_fl2va:image"] = await handlers.get("workflow:get-bundled")!(undefined, "minimax_h3_fl2va", "image") as BundledWorkflow;
  h.scan.modelProfiles.push(evaluateModelProfiles(minimaxH3Omni.definition.scan!.components.map(c => c.expected)).find(p => p.id === modelId)!);
  h.scan.comfyCompatibility.version = "0.39.0";
  h.render();
  h.input("#model", modelId, "change"); await settle();
  await vi.waitFor(() => expect(h.state().draft.workflowPath).toBe(path.resolve("workflows/minimax_h3_omni_r2v_api.json")));
  expect(h.state().draft.steps).toBe(8);
  expect(h.root.querySelector("#pick-start")).toBeNull();
  expect(h.element("#enqueue").disabled).toBe(true);
  expect(h.element("#enqueue").dataset.enqueueBlockReason).toContain("0.42.1+");
  h.scan.comfyCompatibility.version = "0.42.1"; h.render();
  expect(h.element("#enqueue").disabled).toBe(true);
  if (!h.root.querySelector("[data-pick-h3-slot]")) h.element("#add-h3-reference-slot-empty").click();
  await settle(); h.element("[data-pick-h3-slot]").click(); await settle();
  expect(h.element("#enqueue").disabled, h.element("#enqueue").dataset.enqueueBlockReason).toBe(false);
  h.element("#enhance-prompt").click();
  await vi.waitFor(() => expect(h.enhancePrompt).toHaveBeenCalledOnce());
  expect(h.enhancePrompt.mock.calls[0]?.[0]).toMatchObject({ modelId, h3PromptMode: "R2V", imagePaths: ["fixture.png"] });
  await settle();
  h.element("#enqueue").click();
  await vi.waitFor(() => expect(h.state().queue).toHaveLength(1));
  const task = h.state().queue[0]!;
  expect(task).toMatchObject({ id: expect.any(String), modelId, steps: 8, fps: 24, spectrumMode: "off", workflowPath: path.resolve("workflows/minimax_h3_omni_r2v_api.json"), h3ReferenceSlots: [{ mediaPath: "fixture.png" }] });
  h.element("[data-clear-h3-slot]").click(); await settle();
  expect(h.element("#enqueue").disabled).toBe(true);
  expect(task).toMatchObject({ h3ReferenceSlots: [{ mediaPath: "fixture.png" }] });
  h.input("#model", "minimax_h3_fl2va", "change"); await settle();
  expect(h.state().draft.steps).toBe(20);
  expect(h.state().queue[0]?.modelId).toBe(modelId);
});

it("continues an Omni source through the supported ordinary R2V model while retaining source identity", async () => {
  const h = journey = await createJourney({ modelId });
  await h.coordinator.selectDraftVideo("omni-source.mp4", { modelId, assetId: "omni-asset", versionId: "omni-version", duration: 5, width: 864, height: 480, resetPrompt: true });
  expect(h.state().draft).toMatchObject({ modelId: "minimax_h3_ref2va", sourceAssetId: "omni-asset", sourceVersionId: "omni-version", sourceVideoPath: "omni-source.mp4",
    h3ReferenceSlots: [{ mediaType: "video", mediaPath: "omni-source.mp4", role: "motion" }] });
  expect(h.state().draft.workflowPath).toContain("minimax_h3_r2v_extend_api.json");
});
