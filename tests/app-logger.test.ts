import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AppLogger } from "../electron/services/app-logger.js";

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
  it("records lifecycle metadata without persisting private input values", async () => {
    const directory = await temporaryDirectory();
    const logger = new AppLogger({
      directory,
      now: () => new Date("2026-08-08T12:00:00.000Z")
    });

    logger.info("queue", "task.progress", "SeedVR2 超分辨率", {
      taskId: "task-123",
      taskType: "upscale",
      modelId: "seedvr2",
      progress: 42,
      stage: "SeedVR2 超分辨率",
      prompt: "a private prompt",
      sourceFilePath: "C:\\Users\\private\\video.mp4"
    });

    const snapshot = logger.recent();
    expect(snapshot.records).toHaveLength(1);
    expect(snapshot.text).toContain("[INFO ] Queue.TaskProgress: SeedVR2 超分辨率");
    expect(await fs.readdir(directory)).toEqual(["app-2026-08-08.log"]);
    expect(snapshot.records[0]).toMatchObject({
      level: "info",
      scope: "queue",
      event: "task-progress",
      meta: {
        taskId: "task-123",
        modelId: "seedvr2",
        progress: 42,
        prompt: "[redacted]",
        sourceFilePath: "[redacted]"
      }
    });
    expect(JSON.stringify(snapshot)).not.toContain("a private prompt");
    expect(JSON.stringify(snapshot)).not.toContain("private\\video.mp4");
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
});
