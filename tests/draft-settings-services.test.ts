import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import type {
  AppState,
  Draft,
  HistoryAsset,
  HistoryMigrationProgress,
  ImageEditDraft,
  QueueTask,
  Settings
} from "../src/types";
import type { StateRepository } from "../electron/ports/state-repository";
import { DraftService } from "../electron/services/draft-service";
import {
  SettingsService,
  type SettingsHistoryMigrationPort
} from "../electron/services/settings-service";
import type { AppLogger } from "../src/infrastructure/app-logger";
import type {
  PreparedVideoHistoryMigration,
  VideoHistoryMigrationPlan
} from "../src/infrastructure/video-history-migration";

interface TestRepository extends StateRepository {
  snapshot(): AppState;
}

function createRepository(initial: AppState): TestRepository {
  let current = structuredClone(initial);
  return {
    load: vi.fn(async () => structuredClone(current)),
    get: () => current,
    getSettings: () => current.settings,
    update: async (mutator) => {
      const next = structuredClone(current);
      mutator(next);
      current = next;
      return current;
    },
    snapshot: () => current
  };
}

function createLogger(): AppLogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn()
  } as unknown as AppLogger;
}

function createSettingsService(
  repository: TestRepository,
  overrides: Partial<ConstructorParameters<typeof SettingsService>[0]> = {}
): SettingsService {
  return new SettingsService({
    store: repository,
    logger: createLogger(),
    videoHistoryMigrationJournal: path.join(process.cwd(), "migration-journal.json"),
    resolveComfyOutputDirectory: vi.fn(async () => path.join(process.cwd(), "comfy-output")),
    sendState: vi.fn(),
    sendHistoryMigrationProgress: vi.fn(),
    clearRendererDirty: vi.fn(),
    ...overrides
  });
}

function createMigrationPort(plan: VideoHistoryMigrationPlan): {
  migration: SettingsHistoryMigrationPort;
  spies: {
    plan: ReturnType<typeof vi.fn>;
    prepare: ReturnType<typeof vi.fn>;
    markCommitted: ReturnType<typeof vi.fn>;
    cleanup: ReturnType<typeof vi.fn>;
    rollback: ReturnType<typeof vi.fn>;
  };
} {
  const preparation: PreparedVideoHistoryMigration = {
    plan,
    journalFilename: path.join(process.cwd(), "migration-journal.json")
  };
  const planSpy = vi.fn(async (
    _history: HistoryAsset[],
    _oldDirectory: string,
    _newDirectory: string,
    _queue: QueueTask[]
  ) => plan);
  const prepareSpy = vi.fn(async (
    _plan: VideoHistoryMigrationPlan,
    _journalFilename: string,
    _onProgress: (progress: HistoryMigrationProgress) => void
  ) => preparation);
  const markCommittedSpy = vi.fn(async (_value: PreparedVideoHistoryMigration) => undefined);
  const cleanupSpy = vi.fn(async (
    _value: PreparedVideoHistoryMigration,
    _onProgress: (progress: HistoryMigrationProgress) => void
  ) => [] as string[]);
  const rollbackSpy = vi.fn(async (_value: PreparedVideoHistoryMigration) => undefined);
  return {
    migration: {
      plan: planSpy,
      prepare: prepareSpy,
      markCommitted: markCommittedSpy,
      cleanup: cleanupSpy,
      rollback: rollbackSpy
    },
    spies: {
      plan: planSpy,
      prepare: prepareSpy,
      markCommitted: markCommittedSpy,
      cleanup: cleanupSpy,
      rollback: rollbackSpy
    }
  };
}

describe("DraftService", () => {
  it("persists the active projection and independent mode snapshots as one update", async () => {
    const repository = createRepository(createDefaultState());
    const sendState = vi.fn();
    const service = new DraftService({ store: repository, sendState });
    const current = repository.snapshot();
    const imageDraft: Draft = {
      ...current.draft,
      inputMode: "image",
      startImagePath: "still.png",
      modelId: "minimax_h3_fl2va"
    };
    const extensionDraft: Draft = {
      ...current.draft,
      inputMode: "video",
      sourceVideoPath: "extension.mp4",
      modelId: "minimax_h3_ref2va"
    };

    await service.saveDraft(extensionDraft, {
      imageToVideoDraft: imageDraft,
      videoExtensionDraft: extensionDraft
    });

    const persisted = repository.snapshot();
    expect(persisted.draft).toMatchObject({
      inputMode: "video",
      sourceVideoPath: "extension.mp4"
    });
    expect(persisted.imageToVideoDraft).toMatchObject({
      inputMode: "image",
      startImagePath: "still.png"
    });
    expect(persisted.videoExtensionDraft).toMatchObject({
      inputMode: "video",
      sourceVideoPath: "extension.mp4"
    });
    expect(sendState).toHaveBeenCalledTimes(1);
  });

  it("normalizes image drafts before persistence while retaining the image workspace contract", async () => {
    const repository = createRepository(createDefaultState());
    const service = new DraftService({ store: repository, sendState: vi.fn() });
    const incoming = {
      mode: "image-edit",
      pictures: [],
      nextPictureNumber: 0,
      promptVersions: [{
        id: "corrupt",
        label: "旧内容",
        text: "image-edit-prompt-input",
        createdAt: "invalid"
      }],
      activePromptVersion: 99,
      modelId: "",
      qualityProfile: "",
      targetResolution: "source",
      outputCount: 0,
      outputFormat: "jpeg",
      seed: 42
    } as ImageEditDraft;

    await service.saveImageDraft(incoming);

    expect(repository.snapshot().imageDraft).toMatchObject({
      mode: "image-edit",
      modelId: "qwen-image-edit-2511",
      qualityProfile: "balanced-20",
      outputCount: 1,
      outputFormat: "png",
      seed: 42
    });
    expect(repository.snapshot().imageDraft.promptVersions[0]?.text).toBe("");
  });
});

describe("SettingsService", () => {
  it("keeps the single save path and refreshes only eligible queued H3 tasks", async () => {
    const initial = createDefaultState();
    initial.settings.imageInputLibraryDirectory = path.join(process.cwd(), "input-library");
    initial.queue = [
      {
        id: "waiting-h3",
        taskType: "generation",
        status: "waiting",
        modelId: "minimax_h3_fl2va",
        attentionMode: "sage",
        updatedAt: "2026-01-01T00:00:00.000Z"
      } as QueueTask,
      {
        id: "running-h3",
        taskType: "generation",
        status: "running",
        modelId: "minimax_h3_fl2va",
        attentionMode: "sage",
        updatedAt: "2026-01-01T00:00:00.000Z"
      } as QueueTask,
      {
        id: "waiting-upscale",
        taskType: "upscale",
        status: "waiting",
        modelId: "minimax_h3_fl2va",
        attentionMode: "sage",
        updatedAt: "2026-01-01T00:00:00.000Z"
      } as QueueTask
    ];
    const repository = createRepository(initial);
    const sendState = vi.fn();
    const clearRendererDirty = vi.fn();
    const service = createSettingsService(repository, {
      sendState,
      clearRendererDirty
    });
    const nextSettings: Settings = {
      ...initial.settings,
      h3AttentionMode: "pytorch",
      uiLocale: "en-US"
    };

    await service.save(nextSettings);

    const persisted = repository.snapshot();
    expect(persisted.settings.uiLocale).toBe("en-US");
    expect(persisted.queue.find((task) => task.id === "waiting-h3")?.attentionMode).toBe("pytorch");
    expect(persisted.queue.find((task) => task.id === "running-h3")?.attentionMode).toBe("sage");
    expect(persisted.queue.find((task) => task.id === "waiting-upscale")?.attentionMode).toBe("sage");
    expect(sendState).toHaveBeenCalledTimes(1);
    expect(clearRendererDirty).toHaveBeenCalledTimes(1);
  });

  it("runs output-directory migration through the copy-first gate before committing settings", async () => {
    const outputRoot = path.join(process.cwd(), "comfy-output");
    const oldDirectory = path.join(outputRoot, "old");
    const newDirectory = path.join(outputRoot, "new");
    const initial = createDefaultState();
    initial.settings.outputDirectory = oldDirectory;
    initial.settings.imageInputLibraryDirectory = path.join(process.cwd(), "input-library");
    const repository = createRepository(initial);
    const plan: VideoHistoryMigrationPlan = {
      oldDirectory,
      newDirectory,
      entries: [],
      missing: [],
      conflicts: [],
      totalBytes: 0
    };
    const { migration, spies } = createMigrationPort(plan);
    const progress: HistoryMigrationProgress[] = [];
    const service = createSettingsService(repository, {
      migration,
      resolveComfyOutputDirectory: vi.fn(async () => outputRoot),
      sendHistoryMigrationProgress: (value) => progress.push(value)
    });

    const next = await service.save({
      ...initial.settings,
      outputDirectory: newDirectory
    }, "migrate-video-history");

    expect(next.settings.outputDirectory).toBe(newDirectory);
    expect(spies.plan).toHaveBeenCalledWith([], oldDirectory, newDirectory, []);
    expect(spies.prepare).toHaveBeenCalledTimes(1);
    expect(spies.markCommitted).toHaveBeenCalledTimes(1);
    expect(spies.cleanup).toHaveBeenCalledTimes(1);
    expect(spies.rollback).not.toHaveBeenCalled();
    expect(progress.map((item) => item.phase)).toEqual([
      "scanning",
      "scanning",
      "committing",
      "completed"
    ]);
    expect(service.isHistoryMigrationRunning()).toBe(false);
  });

  it("rejects an output directory outside the selected ComfyUI output root", async () => {
    const outputRoot = path.join(process.cwd(), "comfy-output");
    const initial = createDefaultState();
    initial.settings.outputDirectory = path.join(outputRoot, "old");
    initial.settings.imageInputLibraryDirectory = path.join(process.cwd(), "input-library");
    const repository = createRepository(initial);
    const plan: VideoHistoryMigrationPlan = {
      oldDirectory: initial.settings.outputDirectory,
      newDirectory: path.join(process.cwd(), "outside"),
      entries: [],
      missing: [],
      conflicts: [],
      totalBytes: 0
    };
    const { migration, spies } = createMigrationPort(plan);
    const service = createSettingsService(repository, {
      migration,
      resolveComfyOutputDirectory: vi.fn(async () => outputRoot)
    });

    await expect(service.save({
      ...initial.settings,
      outputDirectory: path.join(process.cwd(), "outside")
    }, "migrate-video-history")).rejects.toThrow("必须位于当前 ComfyUI output 目录内");
    expect(spies.plan).not.toHaveBeenCalled();
  });
});
