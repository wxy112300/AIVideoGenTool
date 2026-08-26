import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AppLogger, localDayStamp } from "../electron/services/app-logger.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-log-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true })
    )
  );
});

describe("application logger", () => {
  it("uses the local calendar date for log filenames", () => {
    const date = new Date("2026-08-08T16:05:00.000Z");
    date.getFullYear = () => 2026;
    date.getMonth = () => 7;
    date.getDate = () => 9;

    expect(localDayStamp(date)).toBe("2026-08-09");
  });

  it("records lifecycle metadata without persisting private input values", async () => {
    const directory = await temporaryDirectory();
    const logger = new AppLogger({
      directory,
      now: () => new Date("2026-08-08T12:00:00.000Z")
    });

    logger.info("queue", "task.progress", "SeedVR2 超分辨率", {
      taskId: "task-123",
      promptId: "prompt-456",
      promptModelId: "qwen/qwen3.6-27b-uncensored-q4",
      promptBackend: "comfyui-multimodal",
      taskType: "upscale",
      modelId: "seedvr2",
      progress: 42,
      stage: "SeedVR2 超分辨率",
      prompt: "a private prompt",
      sourceFilePath: "C:\\Users\\private\\video.mp4"
    });

    const snapshot = logger.recent();
    expect(snapshot.records).toHaveLength(1);
    expect(snapshot.text).toContain("[INFO] Queue.TaskProgress: SeedVR2 超分辨率");
    expect(await fs.readdir(directory)).toEqual(["app-2026-08-08.log"]);
    expect(snapshot.records[0]).toMatchObject({
      level: "info",
      scope: "queue",
      event: "task-progress",
      meta: {
        taskId: "task-123",
        promptId: "prompt-456",
        promptModelId: "qwen/qwen3.6-27b-uncensored-q4",
        promptBackend: "comfyui-multimodal",
        modelId: "seedvr2",
        progress: 42,
        prompt: "[redacted]",
        sourceFilePath: "[redacted]"
      }
    });
    expect(snapshot.records[0]?.meta?.processId).toBe(process.pid);
    expect(snapshot.records[0]?.meta?.sessionId).toEqual(expect.any(String));
    expect(JSON.stringify(snapshot)).not.toContain("a private prompt");
    expect(JSON.stringify(snapshot)).not.toContain("private\\video.mp4");
  });

  it("keeps preset routing metadata while redacting prompt content", async () => {
    const directory = await temporaryDirectory();
    const logger = new AppLogger({
      directory,
      now: () => new Date("2026-08-08T12:00:00.000Z")
    });

    logger.info("prompt", "enhance-started", "Prompt enhancement submitted", {
      inputKind: "reference-auto",
      presetFamily: "h3",
      selectedPreset: "detailed-cinematic",
      effectivePreset: "detailed-cinematic",
      presetSource: "selected",
      autoSeedId: "cause-and-effect",
      autoVariationId: "variation-7",
      creativeBrief: "private prompt content"
    });

    const snapshot = logger.recent();
    expect(snapshot.records[0]?.meta).toMatchObject({
      inputKind: "reference-auto",
      presetFamily: "h3",
      selectedPreset: "detailed-cinematic",
      effectivePreset: "detailed-cinematic",
      presetSource: "selected",
      autoSeedId: "cause-and-effect",
      autoVariationId: "variation-7",
      creativeBrief: "[redacted]"
    });
    expect(snapshot.text).toContain("InputKind=reference-auto");
    expect(snapshot.text).toContain("EffectivePreset=detailed-cinematic");
    expect(JSON.stringify(snapshot)).not.toContain("private prompt content");
  });

  it("removes expired log files without deleting the active log", async () => {
    const directory = await temporaryDirectory();
    await fs.writeFile(
      path.join(directory, "app-2020-01-01.log"),
      "[2020-01-01T00:00:00.000Z] [INFO] [system.startup] old\n",
      "utf8"
    );
    const logger = new AppLogger({
      directory,
      now: () => new Date("2026-08-08T12:00:00.000Z")
    });
    logger.warn("system", "startup", "application started");

    expect(await fs.stat(path.join(directory, "app-2020-01-01.log")).catch(() => null)).toBeNull();
    expect(logger.recent().records).toHaveLength(1);
    expect(await fs.stat(path.join(directory, "app-2026-08-08.log")).catch(() => null)).not.toBeNull();
  });

  it("records image asset maintenance results as searchable audit entries", async () => {
    const directory = await temporaryDirectory();
    const logger = new AppLogger({
      directory,
      now: () => new Date("2026-08-11T08:00:00.000Z")
    });

    logger.info("assets", "image-library-organize-completed", "图片素材库归档修复完成，历史引用已保存", {
      operationId: "a1b2c3d4",
      archivedCount: 4,
      updatedReferences: 9,
      remainingArchiveCandidates: 0,
      missingReferences: 1
    });

    const snapshot = logger.recent();
    expect(snapshot.text).toContain("Assets.ImageLibraryOrganizeCompleted");
    expect(snapshot.text).toContain("OperationId=a1b2c3d4");
    expect(snapshot.text).toContain("ArchivedCount=4");
    expect(snapshot.records[0]?.meta).toMatchObject({
      updatedReferences: 9,
      remainingArchiveCandidates: 0,
      missingReferences: 1
    });
  });
});
