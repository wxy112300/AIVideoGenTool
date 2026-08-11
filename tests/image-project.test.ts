import { describe, expect, it } from "vitest";
import {
  expandImageSeeds,
  createImageSourceVersion,
  findImageProjectLineage,
  imageEditPicturesForVersion,
  imageEditDraftFromQueueTask,
  imageProjectCoverVersion,
  nextImagePictureNumber,
  normalizeImageHistory,
  normalizeImageEditDraft,
  nextImageVersionNumber
} from "../src/core/image-project.js";
import type { ImageGenerationQueueTask, ImageHistoryProject } from "../src/types.js";

function project(): ImageHistoryProject {
  return {
    mediaKind: "image",
    id: "project-1",
    title: "测试图片",
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:03.000Z",
    coverMode: "auto",
    nextVersionNumber: 3,
    versions: [
      {
        id: "version-1",
        versionNumber: 1,
        kind: "source",
        createdAt: "2026-08-10T00:00:01.000Z",
        modelId: "source",
        workflowPath: "",
        prompt: "",
        promptVersion: 0,
        references: [],
        width: 1024,
        height: 1024,
        format: "png",
        file: { filename: "source.png", subfolder: "", type: "output" }
      },
      {
        id: "version-2",
        versionNumber: 2,
        kind: "edit",
        parentVersionId: "version-1",
        createdAt: "2026-08-10T00:00:02.000Z",
        modelId: "qwen-image-edit-2511",
        workflowPath: "builtin:image/qwen-image-edit-2511",
        prompt: "修复",
        promptVersion: 1,
        references: [],
        seed: 42,
        width: 1024,
        height: 1024,
        format: "png",
        file: { filename: "edit.png", subfolder: "", type: "output" }
      }
    ]
  };
}

describe("image project pure functions", () => {
  it("expands a fixed seed to identical sequential runs", () => {
    expect(expandImageSeeds(42, 3)).toEqual([42, 42, 42]);
  });

  it("expands a random batch once and preserves generated values", () => {
    const values = [7, 8, 9];
    expect(expandImageSeeds(null, 3, () => values.shift() ?? 0)).toEqual([7, 8, 9]);
  });

  it("clamps output count and normalizes an image draft", () => {
    const contentHash = "a".repeat(64);
    const draft = normalizeImageEditDraft({
      pictures: [{
        id: "p1",
        pictureNumber: 1,
        absolutePath: " a.png ",
        originalPath: "C:/external/a.png",
        managedRelativePath: "sources/a.png",
        contentHash,
        width: 0,
        height: 0
      }],
      activePromptVersion: 99,
      outputCount: 99,
      outputFormat: "tiff",
      seed: 12.8
    });

    expect(draft.mode).toBe("image-edit");
    expect(draft.outputCount).toBe(10);
    expect(draft.outputFormat).toBe("png");
    expect(draft.seed).toBe(12);
    expect(draft.pictures[0]).toMatchObject({
      absolutePath: "a.png",
      originalPath: "C:/external/a.png",
      managedRelativePath: "sources/a.png",
      contentHash,
      pictureNumber: 1
    });
    expect(draft.activePromptVersion).toBe(0);
    expect(draft.targetResolution).toBe("source");
  });

  it("preserves a valid image markup sidecar and drops an incomplete one", () => {
    const draft = normalizeImageEditDraft({
      pictures: [
        {
          id: "p1",
          pictureNumber: 1,
          absolutePath: "a.png",
          width: 1024,
          height: 1024,
          markup: {
            documentPath: "guide.fabric.json",
            renderedPath: "guide.png",
            summary: "A：移除标记区域",
            revision: 3,
            objectCount: 1,
            updatedAt: "2026-08-11T00:00:00.000Z"
          }
        },
        {
          id: "p2",
          pictureNumber: 2,
          absolutePath: "b.png",
          width: 512,
          height: 512,
          markup: { documentPath: "", renderedPath: "missing.png" }
        }
      ]
    });

    expect(draft.pictures[0]?.markup).toMatchObject({ revision: 3, objectCount: 1 });
    expect(draft.pictures[1]?.markup).toBeUndefined();
  });

  it("falls back to the original size when a saved target exceeds the base image", () => {
    const draft = normalizeImageEditDraft({
      targetResolution: 2160,
      pictures: [{ id: "p1", pictureNumber: 1, absolutePath: "a.png", width: 1024, height: 1024 }]
    });

    expect(draft.targetResolution).toBe("source");
  });

  it("uses the viewed generated file as Picture 1 when continuing an edit", () => {
    const contentHash = "b".repeat(64);
    const pictures = imageEditPicturesForVersion({
      file: {
        filename: "generated.png",
        subfolder: "Images",
        type: "output",
        absolutePath: "C:/output/generated.png"
      },
      width: 1280,
      height: 720,
      contentHash,
      references: [
        { id: "source", pictureNumber: 1, absolutePath: "C:/input/source.jpg", width: 1920, height: 1080, role: "base" },
        { id: "style", pictureNumber: 2, absolutePath: "C:/input/style.jpg", width: 1024, height: 1024, role: "style" }
      ]
    });

    expect(pictures).toMatchObject([
      { pictureNumber: 1, absolutePath: "C:/output/generated.png", width: 1280, height: 720, role: "base", contentHash },
      { pictureNumber: 2, absolutePath: "C:/input/style.jpg", role: "style" }
    ]);
  });

  it("starts a new project when Picture 1 changes even if the prompt stays the same", () => {
    const existing = project();
    existing.versions[0]!.contentHash = "1".repeat(64);
    existing.versions[1]!.contentHash = "2".repeat(64);

    expect(findImageProjectLineage([existing], {
      absolutePath: "C:/library/new-base.png",
      contentHash: "3".repeat(64)
    })).toBeUndefined();
  });

  it("keeps the project when Picture 1 is any generated version in its lineage", () => {
    const existing = project();
    existing.versions[1]!.contentHash = "2".repeat(64);

    expect(findImageProjectLineage([existing], {
      absolutePath: "C:/library/copied-result.png",
      contentHash: "2".repeat(64)
    })).toEqual({ projectId: "project-1", parentVersionId: "version-2" });
  });

  it("does not treat a secondary reference as project ancestry", () => {
    const existing = project();
    existing.versions[1]!.references = [{
      id: "style-reference",
      pictureNumber: 2,
      absolutePath: "C:/input/style.png",
      contentHash: "4".repeat(64),
      width: 512,
      height: 512,
      role: "style"
    }];

    expect(findImageProjectLineage([existing], {
      absolutePath: "C:/library/style-copy.png",
      contentHash: "4".repeat(64)
    })).toBeUndefined();
  });

  it("restores a failed image queue task into the image draft", () => {
    const currentDraft = normalizeImageEditDraft({});
    const task: ImageGenerationQueueTask = {
      id: "image-task-1",
      taskType: "image-generation",
      status: "failed",
      createdAt: "2026-08-11T00:00:00.000Z",
      updatedAt: "2026-08-11T00:01:00.000Z",
      outputFilename: "QwenEdit-1",
      modelId: "qwen-image-edit-2511",
      workflowPath: "builtin:image/qwen-image-edit-2511",
      projectId: "project-1",
      pictures: [{ id: "picture-1", pictureNumber: 1, absolutePath: "input.png", width: 1280, height: 720, role: "base" }],
      targetResolution: 720,
      outputWidth: 1280,
      outputHeight: 720,
      prompt: "把天空改成蓝色",
      promptVersion: 2,
      qualityProfile: "balanced-20",
      outputFormat: "png",
      outputCount: 2,
      runs: [
        { id: "run-1", index: 0, seed: 42, status: "failed" },
        { id: "run-2", index: 1, seed: 42, status: "failed" }
      ]
    };

    const draft = imageEditDraftFromQueueTask(task, currentDraft);
    expect(draft).toMatchObject({
      modelId: "qwen-image-edit-2511",
      qualityProfile: "balanced-20",
      targetResolution: 720,
      outputCount: 2,
      seed: 42,
      projectId: "project-1"
    });
    expect(draft.pictures[0]?.absolutePath).toBe("input.png");
    expect(draft.promptVersions[0]?.text).toBe("把天空改成蓝色");
  });

  it("preserves empty Slots and promotes the first Slot to the base input", () => {
    const draft = normalizeImageEditDraft({
      pictures: [
        { id: "slot-a", pictureNumber: 8, absolutePath: "", width: 0, height: 0 },
        { id: "slot-b", pictureNumber: 12, absolutePath: "b.png", width: 0, height: 0, role: "base" }
      ]
    });

    expect(draft.pictures).toMatchObject([
      { id: "slot-a", pictureNumber: 1, absolutePath: "", role: "base" },
      { id: "slot-b", pictureNumber: 2, absolutePath: "b.png", role: "auto" }
    ]);
  });

  it("preserves stable Picture gaps and never reuses an old number", () => {
    const draft = normalizeImageEditDraft({
      pictures: [
        { id: "picture-1", pictureNumber: 1, absolutePath: "base.png", width: 1, height: 1 },
        { id: "picture-3", pictureNumber: 3, absolutePath: "style.png", width: 1, height: 1 }
      ],
      nextPictureNumber: 4
    });

    expect(draft.pictures.map((picture) => picture.pictureNumber)).toEqual([1, 3]);
    expect(nextImagePictureNumber(draft)).toBe(4);
    expect(nextImagePictureNumber({ ...draft, nextPictureNumber: 2 })).toBe(4);
  });

  it("clears prompt text contaminated by the image page template", () => {
    const draft = normalizeImageEditDraft({
      promptVersions: [
        {
          id: "original",
          label: "原始",
          text: "保留基础画面。",
          createdAt: "2026-08-10T00:00:00.000Z"
        },
        {
          id: "corrupt",
          label: "手动编辑",
          text: "</div><div class=\"prompt-tool-row\">",
          createdAt: "2026-08-10T00:00:01.000Z"
        }
      ],
      activePromptVersion: 1
    });

    expect(draft.promptVersions).toHaveLength(1);
    expect(draft.promptVersions[0]?.text).toBe("保留基础画面。");
    expect(draft.activePromptVersion).toBe(0);
  });

  it("allocates the next monotonic version number", () => {
    expect(nextImageVersionNumber(project())).toBe(3);
    expect(nextImageVersionNumber({ ...project(), nextVersionNumber: 1 })).toBe(3);
  });

  it("uses the pinned cover only when it still exists", () => {
    const pinned = { ...project(), coverMode: "pinned" as const, coverVersionId: "version-1" };
    expect(imageProjectCoverVersion(pinned)?.id).toBe("version-1");
    expect(imageProjectCoverVersion({ ...pinned, coverVersionId: "missing" })?.id).toBe("version-2");
    expect(imageProjectCoverVersion(project())?.id).toBe("version-2");
  });

  it("normalizes legacy generated source versions without dropping deleted parents", () => {
    const history = normalizeImageHistory([
      {
        mediaKind: "image",
        id: "project-legacy",
        title: "旧项目",
        createdAt: "2026-08-10T00:00:00.000Z",
        updatedAt: "2026-08-10T00:00:02.000Z",
        coverMode: "pinned",
        coverVersionId: "missing-version",
        nextVersionNumber: 1,
        versions: [
          {
            id: "generated-source",
            versionNumber: 0,
            kind: "source",
            taskId: "task-1",
            createdAt: "2026-08-10T00:00:02.000Z",
            modelId: "qwen-image-edit-2511",
            workflowPath: "builtin:image/qwen-image-edit-2511",
            prompt: "修复",
            promptVersion: 1,
            references: [],
            qualityProfile: "lightning-4step",
            steps: 4,
            cfg: 1,
            targetResolution: 1080,
            outputCount: 6,
            diffusionModelFilename: "qwen_image_edit_2511_int8.safetensors",
            width: 1024,
            height: 1024,
            format: "png",
            file: { filename: "edit.png", subfolder: "", type: "output" }
          },
          {
            id: "child-version",
            versionNumber: 0,
            kind: "edit",
            parentVersionId: "deleted-parent",
            createdAt: "2026-08-10T00:00:01.000Z",
            modelId: "qwen-image-edit-2511",
            workflowPath: "builtin:image/qwen-image-edit-2511",
            prompt: "继续",
            promptVersion: 2,
            references: [],
            width: 1024,
            height: 1024,
            format: "png",
            file: { filename: "child.png", subfolder: "", type: "output" }
          }
        ]
      }
    ]);

    expect(history[0]?.versions.map((version) => version.versionNumber)).toEqual([2, 1]);
    expect(history[0]?.versions[0]?.kind).toBe("edit");
    expect(history[0]?.versions[0]).toMatchObject({
      qualityProfile: "lightning-4step",
      steps: 4,
      cfg: 1,
      targetResolution: 1080,
      outputCount: 6,
      diffusionModelFilename: "qwen_image_edit_2511_int8.safetensors"
    });
    expect(history[0]?.versions[0]?.parentVersionId).toBeUndefined();
    expect(history[0]?.versions[1]?.parentVersionId).toBe("deleted-parent");
    expect(history[0]?.nextVersionNumber).toBe(3);
  });

  it("creates a protected source version from Picture 1", () => {
    const version = createImageSourceVersion({
      id: "picture-1",
      pictureNumber: 1,
      absolutePath: "C:/images/source.jpg",
      width: 800,
      height: 600,
      role: "base"
    }, "2026-08-10T00:00:00.000Z");

    expect(version).toMatchObject({
      kind: "source",
      modelId: "source",
      format: "jpeg",
      width: 800,
      height: 600,
      file: {
        filename: "source.jpg",
        type: "input",
        absolutePath: "C:/images/source.jpg"
      }
    });
  });
});
