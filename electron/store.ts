import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  AppState,
  AssetVersion,
  Draft,
  GenerationQueueTask,
  HistoryAsset,
  QueueTask
} from "../src/types.js";
import { createDefaultState } from "../src/core/defaults.js";
import { normalizeH3ReferenceSlots } from "../src/core/h3-reference.js";
import { generationSafetyForTask, normalizeH3Steps } from "../src/core/workflow.js";

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

function migrateQueueTask(task: QueueTask | LegacyQueueTask): QueueTask {
  if (task.taskType === "upscale") return task;
  if (task.taskType === "extension") {
    return {
      ...task,
      modelProfile: task.modelProfile ?? "q3_k_m",
      attentionMode: task.attentionMode ?? "sage"
    };
  }
  return {
    ...task,
    taskType: "generation",
    sourceWidth: task.sourceWidth ?? 0,
    sourceHeight: task.sourceHeight ?? 0,
    h3ReferenceSlots: normalizeH3ReferenceSlots(task.h3ReferenceSlots),
    fps: (task.fps ?? 24) as Draft["fps"],
    frameInterpolation: task.frameInterpolation ?? "off",
    attentionMode: task.attentionMode ?? "sage",
    keepSeedOnCopy: task.keepSeedOnCopy ?? false,
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
  if (asset.versions?.length) {
    return {
      ...asset,
      files,
      updatedAt: asset.updatedAt ?? asset.createdAt,
      versions: asset.versions
    };
  }
  const [width, height] = legacyDimensions(asset);
  const version: AssetVersion = {
    id: crypto.randomUUID(),
    kind: "original",
    createdAt: asset.createdAt,
    outputFilename: asset.outputFilename,
    modelId: asset.modelId,
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
      const saved = JSON.parse(raw) as Partial<Omit<AppState, "queue" | "history">> & {
        queue?: Array<QueueTask | LegacyQueueTask>;
        history?: Array<HistoryAsset | LegacyHistoryAsset>;
      };
      const defaultState = createDefaultState();
      const savedPresetText = saved.settings?.h3PromptPresets;
      const h3PromptPresets = Object.fromEntries(
        Object.entries(defaultState.settings.h3PromptPresets).map(([id, fallback]) => {
          const value = savedPresetText?.[id as keyof typeof savedPresetText];
          return [id, typeof value === "string" && value.trim() ? value : fallback];
        })
      ) as typeof defaultState.settings.h3PromptPresets;
      this.state = {
        ...defaultState,
        ...saved,
        draft: { ...defaultState.draft, ...saved.draft },
        settings: {
          ...defaultState.settings,
          ...saved.settings,
          h3PromptPresets
        },
        queueRunning: false,
        schemaVersion: 2,
        queue: (saved.queue ?? []).map(migrateQueueTask),
        history: (saved.history ?? []).map(migrateHistoryAsset)
      };
      let needsPersist = saved.queueRunning === true;
      const normalizedH3ReferenceSlots = normalizeH3ReferenceSlots(
        this.state.draft.h3ReferenceSlots
      );
      if (JSON.stringify(normalizedH3ReferenceSlots) !== JSON.stringify(this.state.draft.h3ReferenceSlots)) {
        this.state.draft.h3ReferenceSlots = normalizedH3ReferenceSlots;
        needsPersist = true;
      }
      const normalizedH3Steps = normalizeH3Steps(this.state.draft.steps);
      if (normalizedH3Steps !== this.state.draft.steps) {
        this.state.draft.steps = normalizedH3Steps;
        needsPersist = true;
      }
      if (saved.settings?.defaultVideoModel === "wan22_5b") {
        this.state.settings.defaultVideoModel = "minimax_h3_fl2va";
        needsPersist = true;
      }
      if (!["qwen/qwen3.5-4b", "qwen/qwen3.5-2b"].includes(this.state.settings.promptModelId)) {
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
      const migratedComfyUrl = migrateLegacyComfyUrl(
        this.state.settings.comfyUrl
      );
      if (migratedComfyUrl !== this.state.settings.comfyUrl) {
        this.state.settings.comfyUrl = migratedComfyUrl;
        needsPersist = true;
      }
      if (!generationSafetyForTask(this.state.draft).safe) {
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
