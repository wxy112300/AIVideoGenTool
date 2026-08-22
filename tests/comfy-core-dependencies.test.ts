import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  inspectComfyCorePythonDependency,
  repairComfyCorePythonDependency
} from "../electron/services/comfy-core-dependencies";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    fs.rm(directory, { recursive: true, force: true })
  ));
});

async function createVideoApiSource(source: string): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "comfy-core-pyav-"));
  temporaryDirectories.push(directory);
  const filename = path.join(directory, "comfy_api", "latest", "_input_impl", "video_types.py");
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename, source, "utf8");
  return directory;
}

function probeOutput(version: string, importReady: boolean, error = ""): string {
  return JSON.stringify({ version, importReady, error });
}

describe("ComfyUI core Python dependency detection", () => {
  it("detects the PyAV gap when the current core imports newer video enums", async () => {
    const sourceDirectory = await createVideoApiSource(
      "from av.video.reformatter import ColorPrimaries, ColorRange, ColorTrc\n"
    );
    const runProcess = vi.fn(async (
      _executable: string,
      args: string[],
      _options: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number }
    ) => args.includes("-c")
      ? probeOutput("16.1.0", false, "ImportError: cannot import name 'ColorPrimaries'")
      : "");

    const status = await inspectComfyCorePythonDependency(
      sourceDirectory,
      "C:\\ComfyData\\.venv\\Scripts\\python.exe",
      runProcess
    );

    expect(status).toMatchObject({
      featureDetected: true,
      installedVersion: "16.1.0",
      importReady: false,
      needsRepair: true,
      minimumVersion: "17.1.0"
    });
    expect(runProcess).toHaveBeenCalledOnce();
  });

  it("does not report or install PyAV when the official core no longer has the affected import", async () => {
    const sourceDirectory = await createVideoApiSource(
      "from av.video.reformatter import ColorRange\n"
    );
    const runProcess = vi.fn(async () => probeOutput("16.1.0", false));

    const status = await inspectComfyCorePythonDependency(
      sourceDirectory,
      "C:\\ComfyData\\.venv\\Scripts\\python.exe",
      runProcess
    );

    expect(status.featureDetected).toBe(false);
    expect(status.needsRepair).toBe(false);
    expect(runProcess).not.toHaveBeenCalled();
  });

  it("repairs only PyAV and verifies the import after pip finishes", async () => {
    const sourceDirectory = await createVideoApiSource(
      "from av.video.reformatter import ColorPrimaries, ColorRange, ColorTrc\n"
    );
    let repaired = false;
    const runProcess = vi.fn(async (
      _executable: string,
      args: string[],
      _options: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number; onLog?: (message: string) => void }
    ) => {
      if (args.includes("-c")) {
        return repaired ? probeOutput("17.1.0", true) : probeOutput("16.1.0", false);
      }
      expect(args).toEqual(expect.arrayContaining([
        "-m",
        "pip",
        "install",
        "--prefer-binary",
        "--upgrade",
        "av>=17.1.0"
      ]));
      repaired = true;
      return "Successfully installed av-17.1.0";
    });

    const result = await repairComfyCorePythonDependency(
      sourceDirectory,
      "C:\\ComfyData\\.venv\\Scripts\\python.exe",
      {},
      runProcess
    );

    expect(result.ok).toBe(true);
    expect(result.status.installedVersion).toBe("17.1.0");
    expect(result.status.importReady).toBe(true);
    expect(runProcess).toHaveBeenCalledTimes(3);
  });
});
