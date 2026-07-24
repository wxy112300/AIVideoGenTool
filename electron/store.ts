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
import { generationSafetyForTask } from "../src/core/workflow.js";

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
  return {
    ...task,
    taskType: "generation",
    sourceWidth: task.sourceWidth ?? 0,
    sourceHeight: task.sourceHeight ?? 0,
    fps: (task.fps ?? 24) as Draft["fps"],
    frameInterpolation: task.frameInterpolation ?? "off",
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
      this.state = {
        ...createDefaultState(),
        ...saved,
        draft: { ...createDefaultState().draft, ...saved.draft },
        settings: { ...createDefaultState().settings, ...saved.settings },
        queueRunning: false,
        schemaVersion: 2,
        queue: (saved.queue ?? []).map(migrateQueueTask),
        history: (saved.history ?? []).map(migrateHistoryAsset)
      };
      let needsPersist = false;
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
          duration: 2,
          fps: 24,
          frameInterpolation: "rife2x" as const
        });
        needsPersist = true;
      }
      if (this.state.settings.upscaleTileMode !== "safe") {
        this.state.settings.upscaleTileMode = "safe";
        needsPersist = true;
      }
      if (this.state.settings.vramReserveGb < 4) {
        this.state.settings.vramReserveGb = 4;
        needsPersist = true;
      }
      if (!this.state.settings.autoOffload) {
        this.state.settings.autoOffload = true;
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
    this.writeChain = this.writeChain.then(async () => {
      await fs.mkdir(path.dirname(this.filename), { recursive: true });
      const temporary = `${this.filename}.${process.pid}.tmp`;
      await fs.writeFile(temporary, JSON.stringify(this.state, null, 2), "utf8");
      await fs.rename(temporary, this.filename);
    });
    return this.writeChain;
  }

  private async backupCorruptFile(): Promise<void> {
    try {
      await fs.rename(this.filename, `${this.filename}.corrupt-${Date.now()}`);
    } catch {
      // The original read error is more useful than a failed best-effort backup.
    }
  }
}
