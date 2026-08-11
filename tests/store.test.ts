import { describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { JsonStore, replaceStateFile } from "../electron/store.js";
import { createDefaultState } from "../src/core/defaults.js";
import type { ImageGenerationQueueTask } from "../src/types.js";

function fileError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}

describe("Windows state file replacement", () => {
  it("retries transient EPERM rename failures", async () => {
    const rename = vi
      .fn()
      .mockRejectedValueOnce(fileError("EPERM"))
      .mockRejectedValueOnce(fileError("EBUSY"))
      .mockResolvedValueOnce(undefined);
    const copyFile = vi.fn();
    const waits: number[] = [];

    await replaceStateFile("state.tmp", "state.json", {
      attempts: 4,
      retryDelayMs: 10,
      rename,
      copyFile,
      wait: async (milliseconds) => {
        waits.push(milliseconds);
      }
    });

    expect(rename).toHaveBeenCalledTimes(3);
    expect(copyFile).not.toHaveBeenCalled();
    expect(waits).toEqual([10, 20]);
  });

  it("falls back to copying a complete temporary file when rename stays locked", async () => {
    const rename = vi.fn().mockRejectedValue(fileError("EPERM"));
    const copyFile = vi.fn().mockResolvedValue(undefined);
    const remove = vi.fn().mockResolvedValue(undefined);

    await replaceStateFile("state.tmp", "state.json", {
      attempts: 2,
      retryDelayMs: 0,
      rename,
      copyFile,
      remove,
      wait: async () => undefined
    });

    expect(rename).toHaveBeenCalledTimes(2);
    expect(copyFile).toHaveBeenCalledWith("state.tmp", "state.json");
    expect(remove).toHaveBeenCalledWith("state.tmp", { force: true });
  });

  it("does not hide non-locking filesystem failures", async () => {
    const rename = vi.fn().mockRejectedValue(fileError("ENOENT"));
    const copyFile = vi.fn();

    await expect(
      replaceStateFile("state.tmp", "state.json", { rename, copyFile })
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(copyFile).not.toHaveBeenCalled();
  });
});

describe("queue lock recovery", () => {
  it("persists queueRunning=false when reopening after an interrupted run", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-store-"));
    const filename = path.join(directory, "studio-state.json");
    const state = { ...createDefaultState(), queueRunning: true };
    await fs.writeFile(filename, JSON.stringify(state), "utf8");

    try {
      const store = new JsonStore(filename);
      const loaded = await store.load();
      expect(loaded.queueRunning).toBe(false);
      const persisted = JSON.parse(await fs.readFile(filename, "utf8")) as {
        queueRunning: boolean;
      };
      expect(persisted.queueRunning).toBe(false);
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });

  it("recovers an interrupted image batch without repeating completed runs", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-store-"));
    const filename = path.join(directory, "studio-state.json");
    const state = createDefaultState();
    const task: ImageGenerationQueueTask = {
      id: "image-task-1",
      taskType: "image-generation",
      status: "running",
      createdAt: "2026-08-10T00:00:00.000Z",
      updatedAt: "2026-08-10T00:00:05.000Z",
      outputFilename: "QwenEdit-1",
      modelId: "qwen-image-edit-2511",
      workflowPath: "builtin:image/qwen-image-edit-2511",
      projectId: "image-project-1",
      pictures: [],
      prompt: "修复图片",
      promptVersion: 1,
      qualityProfile: "native",
      outputFormat: "png",
      outputCount: 3,
      runs: [
        {
          id: "run-1",
          index: 0,
          seed: 11,
          status: "completed",
          comfyPromptId: "completed-prompt",
          outputVersionId: "version-1",
          progress: 100,
          performanceStats: { durationSeconds: 1 } as never
        },
        {
          id: "run-2",
          index: 1,
          seed: 22,
          status: "running",
          comfyPromptId: "stale-prompt",
          progress: 43,
          stage: "采样",
          startedAt: "2026-08-10T00:00:03.000Z"
        },
        {
          id: "run-3",
          index: 2,
          seed: 33,
          status: "waiting"
        }
      ]
    };
    state.queue = [task];
    state.queueRunning = true;
    await fs.writeFile(filename, JSON.stringify(state), "utf8");

    try {
      const loaded = await new JsonStore(filename).load();
      const recovered = loaded.queue[0];
      expect(loaded.queueRunning).toBe(false);
      expect(recovered?.status).toBe("waiting");
      expect(recovered?.error).toContain("恢复为等待状态");
      expect(recovered && recovered.taskType === "image-generation" ? recovered.runs.map((run) => run.status) : []).toEqual([
        "completed",
        "waiting",
        "waiting"
      ]);
      if (recovered?.taskType !== "image-generation") throw new Error("图片任务未恢复");
      expect(recovered.runs[0]).toMatchObject({
        comfyPromptId: "completed-prompt",
        outputVersionId: "version-1",
        progress: 100
      });
      expect(recovered.runs[1]).toMatchObject({
        comfyPromptId: undefined,
        progress: 0,
        startedAt: undefined,
        stage: undefined
      });
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });

  it("migrates legacy image reference slots to typed media slots", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-store-"));
    const filename = path.join(directory, "studio-state.json");
    const state = createDefaultState();
    state.draft.h3ReferenceSlots = [
      { id: "legacy-slot", imagePath: "subject.png", role: "subject", note: "" }
    ] as never;
    await fs.writeFile(filename, JSON.stringify(state), "utf8");

    try {
      const store = new JsonStore(filename);
      const loaded = await store.load();
      expect(loaded.draft.h3ReferenceSlots).toEqual([
        {
          id: "legacy-slot",
          mediaType: "image",
          mediaPath: "subject.png",
          role: "subject",
          note: ""
        }
      ]);
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });

  it("migrates retired prompt model selections to the 4090 default", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-store-"));
    const filename = path.join(directory, "studio-state.json");
    const state = createDefaultState();
    state.settings.promptModelId = "qwen/qwen3.5-9b";
    await fs.writeFile(filename, JSON.stringify(state), "utf8");

    try {
      const store = new JsonStore(filename);
      const loaded = await store.load();
      expect(loaded.settings.promptModelId).toBe("qwen/qwen3.5-4b");
      const persisted = JSON.parse(await fs.readFile(filename, "utf8")) as {
        settings: { promptModelId: string };
      };
      expect(persisted.settings.promptModelId).toBe("qwen/qwen3.5-4b");
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });

  it("preserves the supported low-memory prompt model selection", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-store-"));
    const filename = path.join(directory, "studio-state.json");
    const state = createDefaultState();
    state.settings.promptModelId = "qwen/qwen3.5-2b";
    await fs.writeFile(filename, JSON.stringify(state), "utf8");

    try {
      const store = new JsonStore(filename);
      const loaded = await store.load();
      expect(loaded.settings.promptModelId).toBe("qwen/qwen3.5-2b");
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });

  it("persists a customized image output directory without changing video output", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-store-"));
    const filename = path.join(directory, "studio-state.json");
    const state = createDefaultState();
    state.settings.outputDirectory = "C:\\ComfyUI\\output\\Videos";
    state.settings.imageOutputDirectory = " C:\\ComfyUI\\output\\Images ";
    await fs.writeFile(filename, JSON.stringify(state), "utf8");

    try {
      const loaded = await new JsonStore(filename).load();
      expect(loaded.settings.outputDirectory).toBe("C:\\ComfyUI\\output\\Videos");
      expect(loaded.settings.imageOutputDirectory).toBe("C:\\ComfyUI\\output\\Images");
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });

  it("persists edited H3 prompt presets and fills missing preset defaults", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-store-"));
    const filename = path.join(directory, "studio-state.json");
    const state = createDefaultState();
    state.settings.h3PromptPresets = {
      "official-storyboard": "Use a compact three-shot structure.",
      "reference-faithful": "",
      "continuous-motion": "",
      "dialogue-sound": "",
      "beat-storyboard": "",
      "product-brand": "",
      "music-video": "",
      "narrative-animation": "",
      "multi-reference": ""
    };
    await fs.writeFile(filename, JSON.stringify(state), "utf8");

    try {
      const store = new JsonStore(filename);
      const loaded = await store.load();
      expect(loaded.settings.h3PromptPresets["official-storyboard"]).toBe(
        "Use a compact three-shot structure."
      );
      expect(loaded.settings.h3PromptPresets["reference-faithful"]).not.toBe("");
      expect(loaded.settings.h3PromptPresets["continuous-motion"]).not.toBe("");
      expect(loaded.settings.h3PromptPresets["dialogue-sound"]).not.toBe("");
      expect(loaded.settings.h3PromptPresets["beat-storyboard"]).not.toBe("");
      expect(loaded.settings.h3PromptPresets["product-brand"]).not.toBe("");
      expect(loaded.settings.h3PromptPresets["music-video"]).not.toBe("");
      expect(loaded.settings.h3PromptPresets["narrative-animation"]).not.toBe("");
      expect(loaded.settings.h3PromptPresets["multi-reference"]).not.toBe("");
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });

  it("persists edited image Prompt presets and fills missing defaults", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-store-"));
    const filename = path.join(directory, "studio-state.json");
    const state = createDefaultState();
    state.settings.imagePromptPresets = {
      faithful: "只保留用户原意。",
      "detail-enhance": ""
    };
    await fs.writeFile(filename, JSON.stringify(state), "utf8");

    try {
      const store = new JsonStore(filename);
      const loaded = await store.load();
      expect(loaded.settings.imagePromptPresets.faithful).toBe("只保留用户原意。");
      expect(loaded.settings.imagePromptPresets["detail-enhance"]).not.toBe("");
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });

  it("migrates a schema v2 video state to v8 with an independent image draft", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-store-"));
    const filename = path.join(directory, "studio-state.json");
    const { imageDraft: _imageDraft, ...stateWithoutImageDraft } = createDefaultState();
    const legacyState = {
      ...stateWithoutImageDraft,
      schemaVersion: 2
    };
    await fs.writeFile(filename, JSON.stringify(legacyState), "utf8");

    try {
      const store = new JsonStore(filename);
      const loaded = await store.load();
      expect(loaded.schemaVersion).toBe(8);
      expect(loaded.imageDraft.mode).toBe("image-edit");
      expect(loaded.imageDraft.modelId).toBe("qwen-image-edit-2511");
      expect(loaded.settings.imageOutputDirectory).toBe("");
      expect(loaded.settings.imageInputLibraryDirectory).toBe("");
      expect(loaded.imageHistory).toEqual([]);
      const persisted = JSON.parse(await fs.readFile(filename, "utf8")) as {
        schemaVersion: number;
        imageDraft: { mode: string };
        settings: { imageOutputDirectory: string };
        imageHistory: unknown[];
      };
      expect(persisted.schemaVersion).toBe(8);
      expect(persisted.imageDraft.mode).toBe("image-edit");
      expect(persisted.settings.imageOutputDirectory).toBe("");
      expect(persisted.imageHistory).toEqual([]);

      const reloaded = await new JsonStore(filename).load();
      expect(reloaded.schemaVersion).toBe(8);
      expect(reloaded.imageDraft.mode).toBe("image-edit");
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });

  it("migrates the old Qwen native default to the official 20-step balanced profile", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-store-"));
    const filename = path.join(directory, "studio-state.json");
    const state = createDefaultState();
    state.schemaVersion = 4;
    state.settings.defaultImageQualityProfile = "native";
    state.imageDraft.qualityProfile = "native";
    await fs.writeFile(filename, JSON.stringify(state), "utf8");

    try {
      const loaded = await new JsonStore(filename).load();
      expect(loaded.schemaVersion).toBe(8);
      expect(loaded.settings.defaultImageQualityProfile).toBe("balanced-20");
      expect(loaded.imageDraft.qualityProfile).toBe("balanced-20");
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });

  it("fills and persists a missing UI locale in an older state", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-store-"));
    const filename = path.join(directory, "studio-state.json");
    const state = createDefaultState();
    const { uiLocale: _uiLocale, ...legacySettings } = state.settings;
    const legacyState = {
      ...state,
      schemaVersion: 7,
      settings: legacySettings
    };
    await fs.writeFile(filename, JSON.stringify(legacyState), "utf8");

    try {
      const loaded = await new JsonStore(filename).load();
      expect(loaded.settings.uiLocale).toBe("zh-CN");
      const persisted = JSON.parse(await fs.readFile(filename, "utf8")) as {
        settings: { uiLocale?: string };
      };
      expect(persisted.settings.uiLocale).toBe("zh-CN");
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });

  it("normalizes and persists legacy image project versions on load", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-store-"));
    const filename = path.join(directory, "studio-state.json");
    const state = createDefaultState();
    state.imageHistory = [{
      mediaKind: "image",
      id: "project-legacy",
      title: "旧图片项目",
      createdAt: "2026-08-10T00:00:00.000Z",
      updatedAt: "2026-08-10T00:00:02.000Z",
      coverMode: "auto",
      nextVersionNumber: 1,
      versions: [{
        id: "generated-source",
        versionNumber: 0,
        kind: "source",
        taskId: "task-1",
        createdAt: "2026-08-10T00:00:01.000Z",
        modelId: "qwen-image-edit-2511",
        workflowPath: "builtin:image/qwen-image-edit-2511",
        prompt: "修复",
        promptVersion: 1,
        references: [],
        width: 1024,
        height: 1024,
        format: "png",
        file: { filename: "edit.png", subfolder: "", type: "output" }
      }]
    }];
    await fs.writeFile(filename, JSON.stringify(state), "utf8");

    try {
      const loaded = await new JsonStore(filename).load();
      expect(loaded.imageHistory[0]?.versions[0]).toMatchObject({
        versionNumber: 1,
        kind: "edit"
      });
      const persisted = JSON.parse(await fs.readFile(filename, "utf8")) as {
        imageHistory: Array<{ versions: Array<{ kind: string; versionNumber: number }> }>;
      };
      expect(persisted.imageHistory[0]?.versions[0]).toMatchObject({
        versionNumber: 1,
        kind: "edit"
      });
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });

  it("migrates retired prompt runtimes and models to ComfyUI Qwen", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-store-"));
    const filename = path.join(directory, "studio-state.json");
    const state = createDefaultState();
    state.settings.promptModelId = "qwen/qwen3.5-4b-unconcerned";
    state.settings.promptRuntime = "llama-server";
    state.settings.promptUseLmStudio = false;
    await fs.writeFile(filename, JSON.stringify(state), "utf8");

    try {
      const store = new JsonStore(filename);
      const loaded = await store.load();
      expect(loaded.settings.promptModelId).toBe("qwen/qwen3.5-4b");
      expect(loaded.settings.promptRuntime).toBe("comfyui");
      expect(loaded.settings.promptUseLmStudio).toBe(false);
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
});
