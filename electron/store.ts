import { promises as fs } from "node:fs";
import path from "node:path";
import type { AppState } from "../src/types.js";
import { createDefaultState } from "../src/core/defaults.js";

export function migrateLegacyComfyUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, "").toLowerCase();
  return [
    "http://127.0.0.1:8000",
    "http://localhost:8000"
  ].includes(normalized)
    ? "http://127.0.0.1:8188"
    : value;
}

export class JsonStore {
  private state: AppState = createDefaultState();
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly filename: string) {}

  async load(): Promise<AppState> {
    try {
      const raw = await fs.readFile(this.filename, "utf8");
      const saved = JSON.parse(raw) as Partial<AppState>;
      this.state = {
        ...createDefaultState(),
        ...saved,
        draft: { ...createDefaultState().draft, ...saved.draft },
        settings: { ...createDefaultState().settings, ...saved.settings },
        queueRunning: false,
        queue: (saved.queue ?? []).map((task) => ({
          ...task,
          fps: task.fps ?? 24,
          frameInterpolation: task.frameInterpolation ?? "off",
          keepSeedOnCopy: task.keepSeedOnCopy ?? false,
          ...(task.status === "running"
            ? {
                status: "waiting" as const,
                error: "应用上次退出时任务仍在运行，已恢复为等待状态。"
              }
            : {})
        })),
        history: (saved.history ?? []).map((asset) => ({
          ...asset,
          files: asset.files ?? []
        }))
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
