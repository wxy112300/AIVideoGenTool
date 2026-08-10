import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { HistoryAsset, QueueTask } from "../src/types.js";
import {
  cleanupVideoHistoryMigration,
  isPathWithinDirectory,
  planVideoHistoryMigration,
  prepareVideoHistoryMigration
} from "../electron/services/video-history-migration.js";

function historyAsset(sourcePath: string): HistoryAsset {
  const file = {
    filename: "clip.mp4",
    subfolder: "",
    type: "output",
    absolutePath: sourcePath
  };
  return {
    mediaKind: "video",
    id: "asset-1",
    taskId: "task-1",
    title: "测试视频",
    outputFilename: "clip.mp4",
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:00.000Z",
    modelId: "test",
    duration: 1,
    resolution: 480,
    prompt: "测试",
    seed: 1,
    comfyPromptId: "prompt-1",
    comfyOutputs: {},
    files: [file],
    versions: [{
      id: "version-1",
      kind: "original",
      createdAt: "2026-08-10T00:00:00.000Z",
      outputFilename: "clip.mp4",
      modelId: "test",
      width: 16,
      height: 16,
      duration: 1,
      fps: 24,
      workflowPath: "",
      comfyPromptId: "prompt-1",
      comfyOutputs: {},
      files: [file]
    }]
  };
}

describe("video history migration", () => {
  it("accepts only targets inside the output root", () => {
    expect(isPathWithinDirectory("C:\\ComfyUI\\output", "C:\\ComfyUI\\output\\Videos")).toBe(true);
    expect(isPathWithinDirectory("C:\\ComfyUI\\output", "C:\\ComfyUI\\output-archive")).toBe(false);
  });

  it("deduplicates one physical file referenced by multiple history records", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "video-migration-"));
    const oldDirectory = path.join(root, "output");
    const newDirectory = path.join(oldDirectory, "Videos");
    const source = path.join(oldDirectory, "clip.mp4");
    await fs.mkdir(oldDirectory, { recursive: true });
    await fs.writeFile(source, "video-content");

    try {
      const plan = await planVideoHistoryMigration(
        [historyAsset(source)],
        oldDirectory,
        newDirectory
      );
      expect(plan.missing).toEqual([]);
      expect(plan.conflicts).toEqual([]);
      expect(plan.entries).toHaveLength(1);
      expect(plan.entries[0]?.references).toHaveLength(2);
      expect(plan.totalBytes).toBe("video-content".length);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("includes queued upscale inputs linked to a history version", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "video-migration-"));
    const oldDirectory = path.join(root, "output");
    const newDirectory = path.join(oldDirectory, "Videos");
    const source = path.join(oldDirectory, "clip.mp4");
    await fs.mkdir(oldDirectory, { recursive: true });
    await fs.writeFile(source, "video-content");
    const history = [historyAsset(source)];
    const queue = [{
      id: "upscale-1",
      taskType: "upscale",
      status: "waiting",
      sourceAssetId: "asset-1",
      sourceVersionId: "version-1",
      sourceFilePath: source
    }] as QueueTask[];

    try {
      const plan = await planVideoHistoryMigration(history, oldDirectory, newDirectory, queue);
      expect(plan.entries).toHaveLength(1);
      expect(plan.entries[0]?.references).toContainEqual({
        kind: "queue",
        taskId: "upscale-1",
        field: "sourceFilePath"
      });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("copies, verifies, and cleans source files only after preparation", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "video-migration-"));
    const oldDirectory = path.join(root, "output");
    const newDirectory = path.join(oldDirectory, "Videos");
    const source = path.join(oldDirectory, "clip.mp4");
    const journal = path.join(root, "migration.json");
    await fs.mkdir(oldDirectory, { recursive: true });
    await fs.writeFile(source, "video-content");

    try {
      const plan = await planVideoHistoryMigration(
        [historyAsset(source)],
        oldDirectory,
        newDirectory
      );
      const progress: Array<{ phase: string; current: number; total: number }> = [];
      const preparation = await prepareVideoHistoryMigration(plan, journal, (value) => {
        progress.push({ phase: value.phase, current: value.current, total: value.total });
      });
      const target = path.join(newDirectory, "clip.mp4");
      expect((await fs.stat(source)).isFile()).toBe(true);
      expect((await fs.stat(target)).isFile()).toBe(true);
      expect(progress).toContainEqual({ phase: "moving", current: 0, total: 1 });
      expect(progress).toContainEqual({ phase: "verifying", current: 0, total: 1 });
      expect(progress).toContainEqual({ phase: "verifying", current: 1, total: 1 });
      await cleanupVideoHistoryMigration(preparation, () => undefined);
      await expect(fs.stat(source)).rejects.toMatchObject({ code: "ENOENT" });
      expect((await fs.stat(target)).isFile()).toBe(true);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("reports a different existing target as a conflict without changing files", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "video-migration-"));
    const oldDirectory = path.join(root, "output");
    const newDirectory = path.join(oldDirectory, "Videos");
    const source = path.join(oldDirectory, "clip.mp4");
    const target = path.join(newDirectory, "clip.mp4");
    await fs.mkdir(newDirectory, { recursive: true });
    await fs.writeFile(source, "source-content");
    await fs.writeFile(target, "different-content");

    try {
      const plan = await planVideoHistoryMigration(
        [historyAsset(source)],
        oldDirectory,
        newDirectory
      );
      expect(plan.conflicts).toContain(`${target}（目标文件内容不同）`);
      expect(plan.missing).toEqual([]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
