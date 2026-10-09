import { describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { customNodeCatalog, customNodeDefinition, modelCatalog } from "../src/core/catalog";
import { createDefaultState } from "../src/core/defaults";
import { imageModelAdapterFor } from "../src/core/image-workflow";
import { normalizeImageEditDraft, normalizeImageHistory } from "../src/core/image-project";
import { imageLoraDefinition } from "../src/core/image-loras";
import { imageTaskFromDraft } from "../src/core/queue-task-factory";
import { imageEditEnqueueBlockReason } from "../src/renderer/pages/create/view-model";
import { JsonStore } from "../electron/store";
import { submitImageTask } from "../electron/services/comfy-ui";
import type { ImageGenerationQueueTask } from "../src/types";

const retired = "qwen-image-edit-2511-crop-stitch";
function legacyDraft() {
  const draft = createDefaultState().imageDraft;
  return { ...draft, modelId: retired, qualityProfile: "native", projectId: "old-fusion", parentVersionId: "old-parent", seed: 42,
    pictures: [{ id: "base", pictureNumber: 1, absolutePath: "source.png", width: 640, height: 480, role: "base" as const,
      mask: { documentPath: "mask.json", maskPath: "mask.png", regionCount: 1, revision: 2, updatedAt: "2026-10-01T00:00:00Z" } }],
    promptVersions: [{ id: "prompt", label: "old", text: "Blend the pasted subject into the scene.", createdAt: "2026-10-01T00:00:00Z" }]
  };
}
function legacyHistory() {
  return normalizeImageHistory([{ id: "old-fusion", title: "fusion", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:01Z", nextVersionNumber: 2, coverMode: "auto", versions: [{ id: "old-parent", versionNumber: 1, kind: "edit", modelId: retired, workflowPath: "builtin:image/" + retired, prompt: "Blend the subject.", promptVersion: 1, seed: 42, width: 640, height: 480, format: "png", references: legacyDraft().pictures, file: { filename: "fusion.png", subfolder: "Images", type: "output", absolutePath: "old-output.png" } }] }]);
}

describe("Qwen local fusion retirement", () => {
  it("removes only the dedicated route and node, retaining plain 2511 and 2.1 Lighting Blend", () => {
    expect(modelCatalog.get(retired)?.definition.retired).toBe(true);
    expect(modelCatalog.localized(retired)?.name).toContain("局部融合修复");
    expect(modelCatalog.list("image").some(e => e.definition.id === retired)).toBe(false);
    expect(imageModelAdapterFor(retired)).toBeUndefined();
    expect(customNodeCatalog.some(n => n.id === "inpaint-cropandstitch")).toBe(false);
    expect(customNodeDefinition("inpaint-cropandstitch")).toMatchObject({ retired: true, nodeTypes: [], appInstallable: true });
    expect(imageModelAdapterFor("qwen-image-edit-2511")).toBeDefined();
    expect(imageModelAdapterFor("qwen-image-2-1")).toBeDefined();
    expect(imageLoraDefinition("qwen-image-2-1-lighting-blend")?.compatibleModelIds).toContain("qwen-image-2-1");
  });

  it("rejects stale new drafts and old execution before requesting ComfyUI", async () => {
    const draft = legacyDraft();
    expect(imageEditEnqueueBlockReason(draft, undefined)).toContain("已移除");
    expect(() => imageTaskFromDraft(draft, undefined, { root: "", directory: "", subfolder: "" })).toThrow("局部融合修复功能已移除");
    const fetch = vi.spyOn(globalThis, "fetch");
    try {
      await expect(submitImageTask({ modelId: retired } as ImageGenerationQueueTask, { id: "run", index: 0, seed: 42, status: "waiting" }, createDefaultState().settings, new AbortController().signal)).rejects.toThrow("局部融合修复功能已移除");
      expect(fetch).not.toHaveBeenCalled();
    } finally { fetch.mockRestore(); }
  });

  it("migrates the editable draft while preserving prompt, lineage, seed and mask", () => {
    const old = legacyDraft();
    const migrated = normalizeImageEditDraft(old);
    expect(migrated).toMatchObject({ modelId: "qwen-image-2-1", qualityProfile: "preview-25", projectId: old.projectId, parentVersionId: old.parentVersionId, seed: old.seed, pictures: old.pictures, promptVersions: old.promptVersions });
    expect(migrated.imageLoras).toEqual([]);
    expect(legacyHistory()[0]?.versions[0]).toMatchObject({ modelId: retired, workflowPath: "builtin:image/" + retired, references: old.pictures });
  });

  it("persists migrated defaults and drafts across restart without changing old queue/history identities", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-fusion-retirement-"));
    try {
      const state = createDefaultState();
      state.imageDraft = legacyDraft();
      state.settings.defaultImageModel = retired;
      state.settings.defaultImageQualityProfile = "native";
      state.imageHistory = legacyHistory();
      const task = imageTaskFromDraft({ ...state.imageDraft, modelId: "qwen-image-2-1", qualityProfile: "preview-25" }, undefined, { root: "", directory: "", subfolder: "" });
      task.modelId = retired; task.workflowPath = "builtin:image/" + retired; task.qualityProfile = "native"; task.status = "failed";
      state.queue = [task];
      const filename = path.join(directory, "studio-state.json");
      await fs.writeFile(filename, JSON.stringify(state));
      for (let restart = 0; restart < 2; restart++) {
        const loaded = await new JsonStore(filename).load();
        expect(loaded.settings).toMatchObject({ defaultImageModel: "qwen-image-2-1", defaultImageQualityProfile: "preview-25" });
        expect(loaded.imageDraft).toMatchObject({ modelId: "qwen-image-2-1", pictures: state.imageDraft.pictures });
        expect(loaded.queue[0]).toMatchObject({ id: task.id, modelId: retired, workflowPath: task.workflowPath, qualityProfile: "native", pictures: task.pictures });
        expect(loaded.imageHistory).toEqual(state.imageHistory);
      }
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
  });
});
