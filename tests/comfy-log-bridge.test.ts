import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AppLogger } from "../src/infrastructure/app-logger.js";
import {
  ComfyLogBridge,
  parseH3MemoryAppliedPlan,
  resolveComfyLogRoot
} from "../electron/services/comfy-log-bridge.js";
import { createDefaultSettings } from "../src/core/defaults.js";

const temporaryDirectories: string[] = [];
const originalAppData = process.env.APPDATA;

afterEach(async () => {
  if (originalAppData === undefined) delete process.env.APPDATA;
  else process.env.APPDATA = originalAppData;
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true })
    )
  );
});

describe("ComfyUI log bridge", () => {
  it("classifies H3 Memory applied plans by actual providers", () => {
    expect(parseH3MemoryAppliedPlan(
      "[H3 Optimizations] applied plan: phase=node qkv_provider=standard_h3_qkv memory=baseline"
    )).toMatchObject({
      execution: "fallback",
      qkvProvider: "standard_h3_qkv",
      memoryProvider: "baseline"
    });
    expect(parseH3MemoryAppliedPlan(
      "[H3 Optimizations] applied plan: phase=node qkv_provider=convrot_int8_dense_sage memory=streamed_q+streamed_out"
    )).toMatchObject({
      execution: "optimized",
      qkvProvider: "convrot_int8_dense_sage",
      memoryProvider: "streamed_q+streamed_out"
    });
    expect(parseH3MemoryAppliedPlan("ordinary ComfyUI line")).toBeNull();
  });

  it("uses the discovered data root instead of the selected install directory", async () => {
    const settings = {
      ...createDefaultSettings(),
      comfyInstallDirectory: "D:\\ComfyUI-Install",
      modelDirectory: "C:\\Users\\tester\\Documents\\ComfyUI\\models"
    };
    const discoverRoot = async () => "C:\\Users\\tester\\Documents\\ComfyUI";

    await expect(resolveComfyLogRoot(settings, discoverRoot)).resolves.toBe(
      "C:\\Users\\tester\\Documents\\ComfyUI"
    );
  });

  it("tails new ComfyUI lines into the application log without copying prompt content", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-comfy-log-"));
    temporaryDirectories.push(root);
    process.env.APPDATA = path.join(root, "appdata");
    const logDirectory = path.join(root, "user");
    await fs.mkdir(logDirectory, { recursive: true });
    const comfyLog = path.join(logDirectory, "comfyui.log");
    await fs.writeFile(comfyLog, "[old] ComfyUI started\n", "utf8");
    const logger = new AppLogger({
      directory: path.join(root, "app-logs"),
      now: () => new Date("2026-08-18T12:00:00.000Z")
    });
    const bridge = new ComfyLogBridge(logger, root, { taskId: "task-1" });

    await bridge.prime();
    await fs.appendFile(
      comfyLog,
      "Traceback (most recent call last):\n  File 'C:\\private\\node.py'\nRuntimeError: Llama.eval failed\nPrompt: \"private prompt text\"\n",
      "utf8"
    );

    const result = await bridge.syncIncremental("execution_error");
    expect(result.lines).toBe(3);
    expect(result.errors).toBe(2);
    const snapshot = logger.recent();
    expect(snapshot.text).toContain("ComfyUI: Traceback (most recent call last):");
    expect(snapshot.text).toContain("ComfyUI: RuntimeError: Llama.eval failed");
    expect(snapshot.text).toContain("[path]/node.py");
    expect(snapshot.text).not.toContain("private prompt text");
    expect(snapshot.text).not.toContain("C:\\private\\node.py");
  });

  it("captures a bounded tail with a searchable failure marker", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-comfy-log-tail-"));
    temporaryDirectories.push(root);
    process.env.APPDATA = path.join(root, "appdata");
    const logDirectory = path.join(root, "user");
    await fs.mkdir(logDirectory, { recursive: true });
    await fs.writeFile(
      path.join(logDirectory, "comfyui.log"),
      "[INFO] loading model\n[ERROR] HTTP 500 Server got itself in trouble\n",
      "utf8"
    );
    const logger = new AppLogger({
      directory: path.join(root, "app-logs"),
      now: () => new Date("2026-08-18T12:00:00.000Z")
    });

    const result = await new ComfyLogBridge(logger, root, { modelId: "gemma" })
      .captureFailure("prompt_enhance_failed");

    expect(result.lines).toBe(2);
    expect(result.errors).toBe(1);
    const snapshot = logger.recent();
    expect(snapshot.text).toContain("ComfyUI: [ERROR] HTTP 500 Server got itself in trouble");
    expect(snapshot.text).toContain("ComfyUI.LogSnapshot");
    expect(snapshot.records.some((record) => record.meta?.source === "ComfyUI")).toBe(true);
  });
});
