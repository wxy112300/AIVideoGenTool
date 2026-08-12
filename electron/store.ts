import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  AppState,
  AssetVersion,
  Draft,
  GenerationQueueTask,
  HistoryAsset,
  ImageEditDraft,
  ImageGenerationQueueTask,
  ImageGenerationRun,
  QueueTask
} from "../src/types.js";
import { createDefaultState } from "../src/core/defaults.js";
import { normalizeUiLocale } from "../src/core/i18n.js";
import { normalizeQwenImagePromptPresets } from "../src/core/qwen-image-prompt.js";
import { normalizeH3ReferenceSlots } from "../src/core/h3-reference.js";
import {
  managedPromptModelDefinitions
} from "../src/core/prompt-models.js";
import { normalizeImageEditDraft, normalizeImageHistory } from "../src/core/image-project.js";
import { copyPromptVersions, ensureDraftPromptState } from "../src/core/draft-prompts.js";
import {
  generationSafetyForTask,
  isRetiredVideoModel,
  normalizeH3Steps
} from "../src/core/workflow.js";
import {
  LEGACY_H3_TURBO_MODEL_ID,
  baseVideoModelId,
  normalizeVideoLoras
} from "../src/core/video-loras.js";

interface ReplaceStateFileOptions {
  attempts?: number;
  retryDelayMs?: number;
  rename?: typeof fs.rename;
  copyFile?: typeof fs.copyFile;
  remove?: typeof fs.rm;
  wait?: (milliseconds: number) => Promise<void>;
}

function retryableStateFileError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "EPERM" || code === "EACCES" || code === "EBUSY";
}

export async function replaceStateFile(
  temporary: string,
  destination: string,
  options: ReplaceStateFileOptions = {}
): Promise<void> {
  const attempts = Math.max(1, options.attempts ?? 8);
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? 40);
  const rename = options.rename ?? fs.rename;
  const copyFile = options.copyFile ?? fs.copyFile;
  const remove = options.remove ?? fs.rm;
  const wait =
    options.wait ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await rename(temporary, destination);
      return;
    } catch (error) {
      if (!retryableStateFileError(error)) throw error;
      lastError = error;
      if (attempt < attempts) await wait(retryDelayMs * attempt);
    }
  }

  // Antivirus scanners and indexers can deny an atomic replacement on Windows
  // while still allowing the completed temporary file to be copied over it.
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await copyFile(temporary, destination);
      await remove(temporary, { force: true });
      return;
    } catch (error) {
      if (!retryableStateFileError(error)) throw error;
      lastError = error;
      if (attempt < attempts) await wait(retryDelayMs * attempt);
    }
  }
  throw lastError;
}

export function migrateLegacyComfyUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, "").toLowerCase();
  return [
    "http://127.0.0.1:8000",
    "http://localhost:8000"
  ].includes(normalized)
    ? "http://127.0.0.1:8188"
    : value;
}

type LegacyQueueTask = Omit<GenerationQueueTask, "taskType"> & {
  taskType?: "generation";
};

type LegacyHistoryAsset = Omit<HistoryAsset, "updatedAt" | "versions"> & {
  updatedAt?: string;
  versions?: AssetVersion[];
};

function legacyDimensions(asset: LegacyHistoryAsset): [number, number] {
  const ratios: Record<string, [number, number]> = {
    "16:9": [16, 9],
    "9:16": [9, 16],
    "1:1": [1, 1],
    "4:3": [4, 3],
    source: [16, 9]
  };
  const [ratioWidth, ratioHeight] = ratios[asset.ratio ?? "source"] ?? [16, 9];
  const height = Math.max(16, Math.round(asset.resolution / 16) * 16);
  return [Math.max(16, Math.round(height * ratioWidth / ratioHeight / 16) * 16), height];
}

const taskStatuses = new Set([
  "waiting",
  "running",
  "completed",
  "failed",
  "cancelled"
]);

function normalizedTaskStatus(value: unknown): ImageGenerationRun["status"] {
  return taskStatuses.has(String(value))
    ? value as ImageGenerationRun["status"]
    : "waiting";
}

function migrateImageGenerationTask(task: ImageGenerationQueueTask): ImageGenerationQueueTask {
  const runs = Array.isArray(task.runs)
    ? task.runs.map((run, index) => {
        const status = normalizedTaskStatus(run.status);
        const interrupted = status === "running";
        return {
          ...run,
          index: Number.isInteger(run.index) ? run.index : index,
          status: interrupted ? "waiting" : status,
          ...(interrupted
            ? {
                comfyPromptId: undefined,
                progress: 0,
                stage: undefined,
                startedAt: undefined,
                completedAt: undefined,
                error: undefined,
                performanceStats: undefined
              }
            : {})
        };
      })
    : [];
  const taskInterrupted = task.status === "running" ||
    runs.some((run) => normalizedTaskStatus(run.status) === "running");
  return {
    ...task,
    status: taskInterrupted ? "waiting" : normalizedTaskStatus(task.status),
    outputCount: Math.min(10, Math.max(1, Math.trunc(task.outputCount))),
    runs,
    ...(taskInterrupted
      ? {
          comfyPromptId: undefined,
          progress: 0,
          stage: undefined,
          startedAt: undefined,
          error: "应用上次退出时图片批次仍未完成，已恢复为等待状态。"
        }
      : {}),
    automaticRetryAttempt: Number.isInteger(task.automaticRetryAttempt) &&
      (task.automaticRetryAttempt ?? 0) > 0
      ? task.automaticRetryAttempt
      : undefined
  };
}

function migrateQueueTask(task: QueueTask | LegacyQueueTask): QueueTask {
  const automaticRetryAttempt = Number.isInteger(task.automaticRetryAttempt) &&
    (task.automaticRetryAttempt ?? 0) > 0
    ? task.automaticRetryAttempt
    : undefined;
  if (task.taskType === "image-generation") {
    return migrateImageGenerationTask({ ...task, automaticRetryAttempt });
  }
  if (task.taskType === "upscale") return { ...task, automaticRetryAttempt };
  const legacyModelId = task.modelId;
  const modelId = baseVideoModelId(legacyModelId);
  const videoLoras = normalizeVideoLoras(
    (task as QueueTask & { videoLoras?: unknown }).videoLoras,
    legacyModelId
  );
  if (task.taskType === "extension") {
    return {
      ...task,
      modelId,
      videoLoras,
      modelProfile: task.modelProfile ?? "q3_k_m",
      attentionMode: task.attentionMode ?? "sage",
      spectrumMode: task.spectrumMode ?? "off",
      automaticRetryAttempt
    };
  }
  return {
    ...task,
    modelId,
    videoLoras,
    taskType: "generation",
    sourceWidth: task.sourceWidth ?? 0,
    sourceHeight: task.sourceHeight ?? 0,
    h3ReferenceSlots: normalizeH3ReferenceSlots(task.h3ReferenceSlots),
    fps: (task.fps ?? 24) as Draft["fps"],
    frameInterpolation: task.frameInterpolation ?? "off",
    attentionMode: task.attentionMode ?? "sage",
    spectrumMode: task.spectrumMode ?? "off",
    keepSeedOnCopy: task.keepSeedOnCopy ?? false,
    automaticRetryAttempt,
    ...(task.status === "running"
      ? {
          status: "waiting" as const,
          error: "应用上次退出时任务仍在运行，已恢复为等待状态。"
        }
      : {})
  };
}

function migrateHistoryAsset(asset: HistoryAsset | LegacyHistoryAsset): HistoryAsset {
  const files = asset.files ?? [];
  const legacyModelId = asset.modelId;
  const modelId = baseVideoModelId(legacyModelId);
  const videoLoras = normalizeVideoLoras(
    (asset as HistoryAsset & { videoLoras?: unknown }).videoLoras,
    legacyModelId
  );
  if (asset.versions?.length) {
    return {
      ...asset,
      modelId,
      videoLoras,
      mediaKind: "video",
      files,
      updatedAt: asset.updatedAt ?? asset.createdAt,
      versions: asset.versions.map((version) => ({
        ...version,
        modelId: baseVideoModelId(version.modelId),
        videoLoras: normalizeVideoLoras(version.videoLoras, version.modelId)
      }))
    };
  }
  const [width, height] = legacyDimensions(asset);
  const version: AssetVersion = {
    id: crypto.randomUUID(),
    kind: "original",
    createdAt: asset.createdAt,
    outputFilename: asset.outputFilename,
    modelId,
    videoLoras,
    width,
    height,
    duration: asset.duration,
    fps: asset.fps ?? 24,
    seed: asset.seed,
    workflowPath: asset.workflowPath ?? "",
    comfyPromptId: asset.comfyPromptId,
    comfyOutputs: asset.comfyOutputs,
    files,
    startedAt: asset.startedAt
  };
  return {
    ...asset,
    modelId,
    videoLoras,
    mediaKind: "video",
    files,
    updatedAt: asset.updatedAt ?? asset.createdAt,
    defaultVersionId: version.id,
    versions: [version]
  };
}

export class JsonStore {
  private state: AppState = createDefaultState();
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly filename: string) {}

  async load(): Promise<AppState> {
    try {
      const raw = await fs.readFile(this.filename, "utf8");
      const saved = JSON.parse(raw) as Partial<Omit<AppState, "queue" | "history" | "imageHistory">> & {
        queue?: Array<QueueTask | LegacyQueueTask>;
        history?: Array<HistoryAsset | LegacyHistoryAsset>;
        imageHistory?: unknown;
        imageDraft?: Partial<ImageEditDraft>;
      };
      const defaultState = createDefaultState();
      const savedSchemaVersion = Number((saved as { schemaVersion?: unknown }).schemaVersion ?? 2);
      const { promptSystemTemplate: _legacyPromptSystemTemplate, ...savedSettings } = (saved.settings ?? {}) as Partial<AppState["settings"]> & {
        promptSystemTemplate?: unknown;
      };
      const savedPresetText = saved.settings?.h3PromptPresets;
      const h3PromptPresets = Object.fromEntries(
        Object.entries(defaultState.settings.h3PromptPresets).map(([id, fallback]) => {
          const value = savedPresetText?.[id as keyof typeof savedPresetText];
          return [id, typeof value === "string" && value.trim() ? value : fallback];
        })
      ) as typeof defaultState.settings.h3PromptPresets;
      const imagePromptPresets = normalizeQwenImagePromptPresets(saved.settings?.imagePromptPresets);
      const imageHistory = normalizeImageHistory(saved.imageHistory);
      const savedDraft = saved.draft;
      const hasIndependentExtensionPromptState = Array.isArray(savedDraft?.extensionPromptVersions) &&
        savedDraft.extensionPromptVersions.length > 0 &&
        Number.isInteger(savedDraft.extensionActivePromptVersion);
      const legacyExtensionDraft = !hasIndependentExtensionPromptState && savedDraft?.inputMode === "video";
      const mergedDraft = ensureDraftPromptState({
        ...defaultState.draft,
        ...savedDraft,
        ...(legacyExtensionDraft
          ? {
              promptVersions: defaultState.draft.promptVersions,
              activePromptVersion: defaultState.draft.activePromptVersion,
              extensionPromptVersions: copyPromptVersions(
                savedDraft.promptVersions?.length
                  ? savedDraft.promptVersions
                  : defaultState.draft.extensionPromptVersions ?? defaultState.draft.promptVersions
              ),
              extensionActivePromptVersion: savedDraft.activePromptVersion ?? 0
            }
          : {})
      });
      this.state = {
        ...defaultState,
        ...saved,
        draft: mergedDraft,
        imageDraft: normalizeImageEditDraft(saved.imageDraft),
        settings: {
          ...defaultState.settings,
          ...savedSettings,
          h3PromptPresets,
          imagePromptPresets
        },
        queueRunning: false,
        schemaVersion: 10,
        queue: (saved.queue ?? []).map(migrateQueueTask),
        history: (saved.history ?? []).map(migrateHistoryAsset),
        imageHistory
      };
      const savedUiLocale = (saved.settings as { uiLocale?: unknown } | undefined)?.uiLocale;
      const normalizedUiLocale = normalizeUiLocale(savedUiLocale);
      this.state.settings.uiLocale = normalizedUiLocale;
      let needsPersist = saved.queueRunning === true ||
        savedSchemaVersion < 10 ||
        !hasIndependentExtensionPromptState ||
        savedUiLocale !== normalizedUiLocale;
      if (typeof saved.settings?.imageOutputDirectory !== "string") {
        this.state.settings.imageOutputDirectory = "";
        needsPersist = true;
      } else {
        const normalizedImageOutputDirectory = saved.settings.imageOutputDirectory.trim();
        if (normalizedImageOutputDirectory !== this.state.settings.imageOutputDirectory) {
          this.state.settings.imageOutputDirectory = normalizedImageOutputDirectory;
          needsPersist = true;
        }
      }
      if (typeof saved.settings?.imageInputLibraryDirectory !== "string") {
        this.state.settings.imageInputLibraryDirectory = "";
        needsPersist = true;
      } else {
        const normalizedImageInputLibraryDirectory = saved.settings.imageInputLibraryDirectory.trim();
        if (normalizedImageInputLibraryDirectory !== this.state.settings.imageInputLibraryDirectory) {
          this.state.settings.imageInputLibraryDirectory = normalizedImageInputLibraryDirectory;
          needsPersist = true;
        }
      }
      if (JSON.stringify(imageHistory) !== JSON.stringify(saved.imageHistory)) {
        needsPersist = true;
      }
      const normalizedH3ReferenceSlots = normalizeH3ReferenceSlots(
        this.state.draft.h3ReferenceSlots
      );
      if (JSON.stringify(normalizedH3ReferenceSlots) !== JSON.stringify(this.state.draft.h3ReferenceSlots)) {
        this.state.draft.h3ReferenceSlots = normalizedH3ReferenceSlots;
        needsPersist = true;
      }
      const legacyDraftModelId = this.state.draft.modelId;
      const normalizedDraftModelId = baseVideoModelId(legacyDraftModelId);
      const normalizedDraftLoras = normalizeVideoLoras(
        this.state.draft.videoLoras,
        legacyDraftModelId
      );
      if (
        normalizedDraftModelId !== this.state.draft.modelId ||
        JSON.stringify(normalizedDraftLoras) !== JSON.stringify(this.state.draft.videoLoras)
      ) {
        this.state.draft.modelId = normalizedDraftModelId;
        this.state.draft.videoLoras = normalizedDraftLoras;
        needsPersist = true;
      }
      const normalizedH3Steps = normalizeH3Steps(
        this.state.draft.steps,
        this.state.draft.modelId,
        this.state.draft.videoLoras
      );
      if (normalizedH3Steps !== this.state.draft.steps) {
        this.state.draft.steps = normalizedH3Steps;
        needsPersist = true;
      }
      if (isRetiredVideoModel(saved.settings?.defaultVideoModel ?? "")) {
        this.state.settings.defaultVideoModel = "minimax_h3_fl2va";
        needsPersist = true;
      }
      if (this.state.settings.defaultVideoModel === LEGACY_H3_TURBO_MODEL_ID) {
        this.state.settings.defaultVideoModel = "minimax_h3_fl2va";
        needsPersist = true;
      }
      if (typeof this.state.settings.defaultImageModel !== "string" || !this.state.settings.defaultImageModel.trim()) {
        this.state.settings.defaultImageModel = "qwen-image-edit-2511";
        needsPersist = true;
      }
      if (![
        "balanced-20",
        "native",
        "high-quality",
        "lightning-4step"
      ].includes(this.state.settings.defaultImageQualityProfile)) {
        this.state.settings.defaultImageQualityProfile = "balanced-20";
        needsPersist = true;
      }
      if (savedSchemaVersion < 5) {
        if (this.state.settings.defaultImageQualityProfile === "native") {
          this.state.settings.defaultImageQualityProfile = "balanced-20";
          needsPersist = true;
        }
        if (
          this.state.imageDraft.modelId === "qwen-image-edit-2511" &&
          this.state.imageDraft.qualityProfile === "native"
        ) {
          this.state.imageDraft.qualityProfile = "balanced-20";
          needsPersist = true;
        }
      }
      if (
        !Number.isInteger(this.state.settings.imageOutputCount) ||
        this.state.settings.imageOutputCount < 1 ||
        this.state.settings.imageOutputCount > 10
      ) {
        this.state.settings.imageOutputCount = 6;
        needsPersist = true;
      }
      if (this.state.settings.imageOutputFormat !== "png") {
        this.state.settings.imageOutputFormat = "png";
        needsPersist = true;
      }
      if (isRetiredVideoModel(this.state.draft.modelId)) {
        this.state.draft.modelId = "minimax_h3_fl2va";
        this.state.draft.inputMode = "image";
        this.state.draft.workflowPath = "";
        needsPersist = true;
      }
        const supportedPromptModels = new Set([
          "qwen/qwen3.5-4b",
          "qwen/qwen3.5-2b",
          ...managedPromptModelDefinitions.map((model) => model.id)
        ]);
        if (!supportedPromptModels.has(this.state.settings.promptModelId)) {
        this.state.settings.promptModelId = "qwen/qwen3.5-4b";
        needsPersist = true;
      }
      if (
        this.state.settings.modelDirectory.toLowerCase() ===
        "c:\\users\\alice\\documents\\comfyui\\models"
      ) {
        this.state.settings.modelDirectory = "";
        needsPersist = true;
      }
      if (this.state.settings.promptRuntime !== "comfyui" || this.state.settings.promptUseLmStudio) {
        this.state.settings.promptRuntime = "comfyui";
        this.state.settings.promptUseLmStudio = false;
        needsPersist = true;
      }
      const migratedComfyUrl = migrateLegacyComfyUrl(
        this.state.settings.comfyUrl
      );
      if (migratedComfyUrl !== this.state.settings.comfyUrl) {
        this.state.settings.comfyUrl = migratedComfyUrl;
        needsPersist = true;
      }
      if (!generationSafetyForTask(this.state.draft, this.state.settings.uiLocale).safe) {
        Object.assign(this.state.draft, {
          duration: 5,
          fps: 24,
          frameInterpolation: "rife2x" as const
        });
        needsPersist = true;
      }
      if (this.state.settings.upscaleTileMode !== "safe") {
        this.state.settings.upscaleTileMode = "safe";
        needsPersist = true;
      }
      if (
        !Number.isFinite(this.state.settings.vramReserveGb) ||
        this.state.settings.vramReserveGb < 0.5 ||
        this.state.settings.vramReserveGb > 1
      ) {
        this.state.settings.vramReserveGb = 1;
        needsPersist = true;
      }
      if (
        !Number.isInteger(this.state.settings.autoRetryCount) ||
        this.state.settings.autoRetryCount < 1 ||
        this.state.settings.autoRetryCount > 5
      ) {
        this.state.settings.autoRetryCount = 2;
        needsPersist = true;
      }
      if (!this.state.settings.autoOffload) {
        this.state.settings.autoOffload = true;
        needsPersist = true;
      }
      if (
        !["q2_distilled", "q3_k_m", "q4_k_m"].includes(
          this.state.settings.ltxExtensionModelProfile
        )
      ) {
        this.state.settings.ltxExtensionModelProfile = "q3_k_m";
        needsPersist = true;
      }
      if (![360, 480].includes(this.state.settings.ltxExtensionResolution)) {
        this.state.settings.ltxExtensionResolution = 360;
        needsPersist = true;
      }
      if (![49, 65].includes(this.state.settings.ltxExtensionFrames)) {
        this.state.settings.ltxExtensionFrames = 49;
        needsPersist = true;
      }
      if (this.state.settings.ltxExtensionOverlapFrames !== 16) {
        this.state.settings.ltxExtensionOverlapFrames = 16;
        needsPersist = true;
      }
      if (!this.state.settings.ltxExtensionUnloadBetweenStages) {
        this.state.settings.ltxExtensionUnloadBetweenStages = true;
        needsPersist = true;
      }
      if (![10, 20, 30].includes(this.state.settings.ltxExtensionTimeoutMinutes)) {
        this.state.settings.ltxExtensionTimeoutMinutes = 20;
        needsPersist = true;
      }
      if (needsPersist) await this.persist();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        await this.backupCorruptFile();
      }
      this.state = createDefaultState();
      await this.persist();
    }
    return this.snapshot();
  }

  get(): AppState {
    return this.snapshot();
  }

  async update(mutator: (state: AppState) => void): Promise<AppState> {
    mutator(this.state);
    await this.persist();
    return this.snapshot();
  }

  private snapshot(): AppState {
    return structuredClone(this.state);
  }

  private async persist(): Promise<void> {
    const write = this.writeChain.catch(() => undefined).then(async () => {
      await fs.mkdir(path.dirname(this.filename), { recursive: true });
      const temporary = `${this.filename}.${process.pid}.tmp`;
      await fs.writeFile(temporary, JSON.stringify(this.state, null, 2), "utf8");
      await replaceStateFile(temporary, this.filename);
    });
    this.writeChain = write;
    return write;
  }

  private async backupCorruptFile(): Promise<void> {
    try {
      await fs.rename(this.filename, `${this.filename}.corrupt-${Date.now()}`);
    } catch {
      // The original read error is more useful than a failed best-effort backup.
    }
  }
}
