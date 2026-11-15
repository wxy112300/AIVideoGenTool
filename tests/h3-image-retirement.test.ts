import { describe, expect, it, vi } from "vitest";
import { modelCatalog, customNodeCatalog, customNodeDefinition } from "../src/core/catalog";
import { imageModelAdapterFor } from "../src/core/image-workflow";
import { normalizeImageHistory, normalizeImageEditDraft } from "../src/core/image-project";
import { createDefaultImageEditDraft, createDefaultState } from "../src/core/defaults";
import { imageTaskFromDraft } from "../src/core/queue-task-factory";
import { imageEditEnqueueBlockReason } from "../src/renderer/pages/create/view-model";
import { submitImageTask } from "../electron/services/comfy-ui";
import type { ImageGenerationQueueTask } from "../src/types";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { JsonStore } from "../electron/store";

describe("H3 image retirement", () => {
  it("moves editable INT8 defaults/drafts to W4A8 across restart while preserving queued INT8 execution", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-h3-int8-retirement-"));
    try {
      const state = createDefaultState();
      state.imageDraft = { ...createDefaultImageEditDraft(), modelId: "minimax-h3-image", qualityProfile: "native-6", targetResolution: 4096, seed: 42 };
      state.settings.defaultImageModel = "minimax-h3-image";
      state.settings.defaultImageQualityProfile = "native-6";
      const task = imageTaskFromDraft(state.imageDraft, undefined, { root: "", directory: "", subfolder: "" });
      state.queue = [task];
      const filename = path.join(directory, "studio-state.json");
      await fs.writeFile(filename, JSON.stringify(state));
      for (let restart = 0; restart < 2; restart++) {
        const loaded = await new JsonStore(filename).load();
        expect(loaded.settings).toMatchObject({ defaultImageModel: "minimax-h3-image-w4a8", defaultImageQualityProfile: "native-6" });
        expect(loaded.imageDraft).toMatchObject({ modelId: "minimax-h3-image-w4a8", qualityProfile: "native-6", targetResolution: 4096, seed: 42 });
        expect(loaded.queue[0]).toMatchObject({ id: task.id, modelId: "minimax-h3-image", qualityProfile: "native-6", outputWidth: task.outputWidth, outputHeight: task.outputHeight });
      }
      expect(imageModelAdapterFor("minimax-h3-image")).toBeDefined();
      expect(modelCatalog.list("image").some(e => e.definition.id === "minimax-h3-image")).toBe(false);
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
  });
  it.each(["minimax-h3-image-i2i", "minimax-h3-reference-edit"])("keeps %s readable and rejects all new execution", async (modelId) => {
    expect(modelCatalog.get(modelId)?.definition.retired).toBe(true);
    expect(modelCatalog.localized(modelId)?.name).toContain("H3");
    expect(modelCatalog.list("image").some((entry) => entry.definition.id === modelId)).toBe(false);
    expect(imageModelAdapterFor(modelId)).toBeUndefined();
    const draft = { ...createDefaultImageEditDraft(), modelId, qualityProfile: "base-quality-20" };
    expect(imageEditEnqueueBlockReason(draft, undefined)).toContain("已移除");
    expect(() => imageTaskFromDraft(draft, undefined, { root: "", directory: "", subfolder: "" })).toThrow("H3 图片功能已移除");
    const task = { modelId } as ImageGenerationQueueTask;
    const request = vi.spyOn(globalThis, "fetch");
    try {
      await expect(submitImageTask(task, { id: "old-run", index: 0, seed: 42, status: "waiting" }, createDefaultState().settings, new AbortController().signal)).rejects.toThrow("H3 图片功能已移除");
      expect(request).not.toHaveBeenCalled();
    } finally { request.mockRestore(); }
  });

  it("withdraws the node from scan/install catalogs while retaining its uninstall identity", () => {
    expect(customNodeCatalog.some((node) => node.id === "minimax-h3-image-studio")).toBe(false);
    expect(customNodeDefinition("minimax-h3-image-studio")).toMatchObject({ retired: true, nodeTypes: [] });
    expect(modelCatalog.get("minimax_h3_fl2va")?.definition.retired).not.toBe(true);
    expect(modelCatalog.get("minimax_h3_ref2va")?.definition.retired).not.toBe(true);
  });

  it("preserves historical media, model identity and all nine references when the editable draft moves to Qwen", () => {
    const references = Array.from({ length: 9 }, (_, i) => ({ id: `ref-${i}`, pictureNumber: i + 1, absolutePath: `ref-${i}.png`, width: 1024, height: 768, note: `note-${i}` }));
    const input = [{ mediaKind: "image", id: "legacy-project", title: "H3 image", createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:01Z", nextVersionNumber: 2, coverMode: "auto", versions: [{ id: "legacy-version", versionNumber: 1, kind: "edit", modelId: "minimax-h3-reference-edit", workflowPath: "builtin:image/minimax-h3-reference-edit", prompt: "保留人物和服装", promptVersion: 1, seed: 42, width: 1344, height: 768, format: "png", references, file: { filename: "old.png", subfolder: "Images", type: "output", absolutePath: "C:/fixture/old.png" } }] }];
    const history = normalizeImageHistory(input);
    expect(history[0]?.versions[0]).toMatchObject(input[0]!.versions[0]!);
    const draft = normalizeImageEditDraft({ ...createDefaultImageEditDraft(), projectId: "legacy-project", parentVersionId: "legacy-version", modelId: "minimax-h3-reference-edit", pictures: references, seed: 42, promptVersions: [{ id: "prompt", label: "old", text: "保留人物和服装", createdAt: "2026-09-01T00:00:00Z" }] });
    expect(draft).toMatchObject({ modelId: "qwen-image-2-1", qualityProfile: "preview-25", projectId: "legacy-project", parentVersionId: "legacy-version", seed: 42, pictures: references });
    expect(draft.promptVersions[0]?.text).toBe("保留人物和服装");
    expect(history[0]?.versions[0]?.modelId).toBe("minimax-h3-reference-edit");
  });
});
