import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  startComfyUiService,
  comfyUiPythonEntryArgs,
  rememberOwnedComfyProcessId,
  ownedComfyProcessIdSnapshot,
  clearOwnedComfyProcessIds,
  type ComfyRuntimeServiceDependencies
} from "../electron/services/comfy-runtime-service";
import { comfyUiSettingsForQueueTask } from "../electron/services/comfy-runtime-policy";
import { createDefaultState } from "../src/core/defaults";

describe("ComfyUI runtime service", () => {
  it("rebinds Windows Python output to its visible console before running ComfyUI", () => {
    const args = comfyUiPythonEntryArgs("D:\\ComfyCore\\main.py", "win32");

    expect(args.slice(0, 3)).toEqual(["-s", "-c", expect.any(String)]);
    expect(args[2]).toContain("open('CONOUT$', 'w'");
    expect(args[2]).toContain("open(os.devnull, 'w'");
    expect(args[2]).toContain("for stream_name in ('stdout', 'stderr'):");
    expect(args[2]).toContain("GetConsoleMode");
    expect(args[2]).toContain("SetConsoleMode");
    expect(args[2]).toContain("setattr(sys, name, stream)");
    expect(args[2]).toContain("setattr(sys, '__' + name + '__', stream)");
    expect(args[2]).toContain("mode.value | 0x0004");
    expect(args[2]).toContain("except Exception:");
    expect(args[2]).toContain("runpy.run_path(entry, run_name='__main__')");
    expect(args[3]).toBe("D:\\ComfyCore\\main.py");
  });

  it("keeps the direct Python entry outside Windows", () => {
    expect(comfyUiPythonEntryArgs("/opt/ComfyUI/main.py", "linux"))
      .toEqual(["-s", "/opt/ComfyUI/main.py"]);
  });

  it("retains the real listener PID after a Desktop launcher hands off", () => {
    clearOwnedComfyProcessIds();
    rememberOwnedComfyProcessId(81880);
    expect(ownedComfyProcessIdSnapshot()).toContain(81880);
    clearOwnedComfyProcessIds();
  });
  it("selects memory settings from the queued model instead of persisted defaults", () => {
    const settings = {
      ...createDefaultState().settings,
      defaultImageModel: "qwen-image-edit-2511",
      defaultVideoModel: "minimax_h3_fl2va_q3_gguf"
    };

    expect(comfyUiSettingsForQueueTask({ taskType: "generation", modelId: "wan22_5b" }, settings))
      .toMatchObject({ defaultImageModel: "", defaultVideoModel: "wan22_5b" });
    expect(comfyUiSettingsForQueueTask({ taskType: "image-generation", modelId: "qwen-image-edit-2511" }, settings))
      .toMatchObject({ defaultImageModel: "qwen-image-edit-2511", defaultVideoModel: "" });
    expect(comfyUiSettingsForQueueTask({ taskType: "upscale", modelId: "seedvr2" }, settings))
      .toMatchObject({ defaultImageModel: "", defaultVideoModel: "" });
  });

  it("builds a source launch from the selected data and core directories", async () => {
    const launchDetached = vi.fn(async () => 1234);
    const settings = {
      ...createDefaultState().settings,
      comfyUrl: "http://127.0.0.1:8288",
      modelDirectory: "D:\\ComfyData\\models",
      outputDirectory: "D:\\ComfyData\\output\\Video",
      defaultImageModel: "qwen-image-edit-2511" as const
    };
    const dependencies: ComfyRuntimeServiceDependencies = {
      findComfyRoot: async () => "D:\\ComfyData",
      findComfyInstallation: async () => ({
        type: "manual",
        directory: "D:\\ComfyCore",
        sourceDirectory: "D:\\ComfyCore",
        executable: ""
      }),
      applyComfyDesktopSettings: async () => undefined,
      launchDetached,
      isPortInUse: async () => false,
      downloadEnvironment: () => ({ TEST_ENV: "1" }),
      exists: async (filename) => filename.endsWith("main.py"),
      findComfyPython: async () => "D:\\ComfyData\\.venv\\Scripts\\python.exe",
      comfyDataDirectories: () => ({
        modelDirectory: "D:\\ComfyData\\models",
        outputDirectory: "D:\\ComfyData\\output"
      })
    };

    await expect(startComfyUiService(settings, dependencies)).resolves.toBe(
      "http://127.0.0.1:8288/system_stats"
    );
    const launchCalls = launchDetached.mock.calls as unknown as Array<[
      string,
      string[],
      string,
      NodeJS.ProcessEnv
    ]>;
    const [python, args, cwd, env] = launchCalls[0]!;
    expect(python).toContain("python.exe");
    expect(cwd).toBe("D:\\ComfyCore");
    expect(env).toEqual({ TEST_ENV: "1" });
    expect(args).toEqual(expect.arrayContaining([
      "--port", "8288",
      "--cpu-vae",
      "--models-directory", "D:\\ComfyData\\models",
      "--base-directory", "D:\\ComfyData",
      "--output-directory", "D:\\ComfyData\\output"
    ]));
    expect(args).toContain(
      `sqlite:///${path.join("D:\\ComfyData", "user", `comfyui.local-video-studio-${process.pid}-8288.db`).replaceAll("\\", "/")}`
    );
  });

  it("delegates shell-only Desktop installations to the official executable", async () => {
    const launchDetached = vi.fn(async () => 1234);
    const applyComfyDesktopSettings = vi.fn(async () => undefined);
    const settings = createDefaultState().settings;
    const dependencies: ComfyRuntimeServiceDependencies = {
      findComfyRoot: async () => "D:\\ComfyData",
      findComfyInstallation: async () => ({
        type: "desktop",
        directory: "D:\\Program Files\\ComfyUI",
        sourceDirectory: "",
        executable: "D:\\Program Files\\ComfyUI\\Comfy Desktop.exe"
      }),
      applyComfyDesktopSettings,
      launchDetached,
      isPortInUse: async () => false,
      downloadEnvironment: () => ({}),
      exists: async () => false,
      findComfyPython: async () => "",
      comfyDataDirectories: () => ({ modelDirectory: "", outputDirectory: "" })
    };

    await startComfyUiService(settings, dependencies);
    expect(applyComfyDesktopSettings).toHaveBeenCalledOnce();
    expect(launchDetached).toHaveBeenCalledWith(
      "D:\\Program Files\\ComfyUI\\Comfy Desktop.exe",
      [],
      "D:\\Program Files\\ComfyUI",
      {},
      expect.any(Function)
    );
  });

  it("does not launch a second ComfyUI when the configured port is already occupied", async () => {
    const launchDetached = vi.fn(async () => 1234);
    const settings = {
      ...createDefaultState().settings,
      comfyUrl: "http://127.0.0.1:8288"
    };
    const dependencies: ComfyRuntimeServiceDependencies = {
      findComfyRoot: async () => { throw new Error("should not scan roots"); },
      findComfyInstallation: async () => { throw new Error("should not scan installations"); },
      applyComfyDesktopSettings: async () => undefined,
      launchDetached,
      isPortInUse: async () => true,
      downloadEnvironment: () => ({}),
      exists: async () => false,
      findComfyPython: async () => "",
      comfyDataDirectories: () => ({ modelDirectory: "", outputDirectory: "" })
    };

    await expect(startComfyUiService(settings, dependencies)).resolves.toBe(
      "http://127.0.0.1:8288/system_stats"
    );
    expect(launchDetached).not.toHaveBeenCalled();
  });

  it("shares concurrent startup requests instead of launching twice", async () => {
    const launchDetached = vi.fn(async () => 1234);
    const settings = {
      ...createDefaultState().settings,
      comfyUrl: "http://127.0.0.1:8288"
    };
    const dependencies: ComfyRuntimeServiceDependencies = {
      findComfyRoot: async () => "D:\\ComfyData",
      findComfyInstallation: async () => ({
        type: "manual",
        directory: "D:\\ComfyCore",
        sourceDirectory: "D:\\ComfyCore",
        executable: ""
      }),
      applyComfyDesktopSettings: async () => undefined,
      launchDetached,
      isPortInUse: async () => false,
      downloadEnvironment: () => ({}),
      exists: async (filename) => filename.endsWith("main.py"),
      findComfyPython: async () => "D:\\ComfyData\\.venv\\Scripts\\python.exe",
      comfyDataDirectories: () => ({
        modelDirectory: "D:\\ComfyData\\models",
        outputDirectory: "D:\\ComfyData\\output"
      })
    };

    const results = await Promise.all([
      startComfyUiService(settings, dependencies),
      startComfyUiService(settings, dependencies)
    ]);

    expect(results).toEqual([
      "http://127.0.0.1:8288/system_stats",
      "http://127.0.0.1:8288/system_stats"
    ]);
    expect(launchDetached).toHaveBeenCalledOnce();
  });
});
