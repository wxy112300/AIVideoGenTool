import { describe, expect, it, vi } from "vitest";
import {
  attentionWheelForProbe,
  comfyKitchenConvRotCudaOptimized,
  createPipDownloadProgressReporter,
  availableVramBytesForReserve,
  buildComfyCandidates,
  buildComfyDesktopCandidates,
  buildComfyDesktopSourceCandidates,
  comfyDataDirectories,
  comfyOutputSubfolder,
  mergeComfyDesktopSettings,
  comfyUiBundledFrontendArgs,
  buildLmStudioCandidates,
  comfyUiMemoryArgs,
  comfyUiRuntimeProfileForSettings,
  comfyUiRuntimeProfileFromCommandLine,
  evaluateModelProfiles,
  evaluateMiniMaxH3CoreSupport,
  evaluatePromptCoreSupport,
  h3TorchRuntimeReady,
  ltxAudioVaeCompatible,
  normalizeProxyUrl,
  parseComfyProcessInfo,
  parseComfyProcessIds,
  isWindowsPythonAlias,
  isAppManagedComfyCommandLine,
  kjNodesAttentionSourceCompatible,
  parseNvidiaGpuQuery,
  parseComfyDesktop2Registry,
  patchH3PromptWriterLlamaCppCompatibility,
  patchLtxAudioVaeCompatibility,
  patchVideoHelperBatchCompatibility,
  renameWithRetry,
  refreshModelProfileRuntimeEvidence,
  repairEnvironmentIssue,
  runLoggedProcess,
  selectLlamaServerReleaseAssets,
  shouldReportComfyDatabaseIssue,
  tritonRequirementForTorch,
  updateComfyUi,
  videoHelperBatchCompatible
} from "../electron/services/environment.js";
import {
  comfyUiSettingsForPromptRuntime,
  comfyUiSettingsForQueueTask
} from "../electron/services/comfy-runtime-policy.js";
import {
  birefnetRequiredNodeTypes,
  hidreamO1RequiredNodeTypes,
  omnigen2RequiredNodeTypes,
  qwenImageEdit2511RequiredNodeTypes
} from "../src/core/image-workflow.js";
import { createDefaultSettings } from "../src/core/defaults.js";
import type { ModelScanProfile } from "../src/types.js";

describe("ComfyUI remote operation boundary", () => {
  it("keeps core updates and environment repairs connection-only for remote endpoints", async () => {
    const settings = {
      ...createDefaultSettings(),
      comfyUrl: "https://comfy.example.test"
    };

    await expect(updateComfyUi(settings)).resolves.toMatchObject({
      ok: false,
      message: "远程 ComfyUI 仅支持连接，应用不会更新远程核心。"
    });
    await expect(repairEnvironmentIssue("comfy-database", settings)).resolves.toMatchObject({
      ok: false,
      message: "远程 ComfyUI 仅支持连接，环境修复必须在本地所选实例上执行。"
    });
  });
});

describe("scoped environment runtime evidence", () => {
  it("preserves file evidence while refreshing runtime nodes", () => {
    const profile = {
      id: "qwen/qwen3.5-2b",
      name: "Qwen3.5 2B",
      category: "prompt",
      badge: "",
      description: "",
      vram: "",
      available: true,
      integrated: true,
      components: [{
        label: "encoder",
        found: true,
        expected: "text_encoders/qwen3.5_2b_bf16.safetensors",
        matches: ["text_encoders/qwen3.5_2b_bf16.safetensors"],
        installGuide: {
          sourceLabel: "test",
          downloadUrl: "https://example.com/model",
          targetSubdirectory: "text_encoders",
          recommendedFilename: "qwen3.5_2b_bf16.safetensors"
        }
      }]
    } satisfies ModelScanProfile;
    const settings = createDefaultSettings();

    const missing = refreshModelProfileRuntimeEvidence(
      [profile],
      settings,
      new Set(["CLIPLoader"])
    )[0]!;
    expect(missing.components).toEqual(profile.components);
    expect(missing.available).toBe(true);
    expect(missing.runtimeVerified).toBe(true);
    expect(missing.runtimeReady).toBe(false);
    expect(missing.runtimeMissingNodes).toEqual(["TextGenerate"]);

    const ready = refreshModelProfileRuntimeEvidence(
      [missing],
      settings,
      new Set(["CLIPLoader", "TextGenerate"])
    )[0]!;
    expect(ready.runtimeReady).toBe(true);
    expect(ready.runtimeMissingNodes).toEqual([]);
  });
});

describe("SageAttention environment selection", () => {
  it("recognizes only the app-specific ComfyUI database marker for the configured port", () => {
    expect(isAppManagedComfyCommandLine(
      "python main.py --port 8188 --database-url sqlite:///C:/Comfy/user/comfyui.local-video-studio-25484-8188.db",
      8188
    )).toBe(true);
    expect(isAppManagedComfyCommandLine(
      "python main.py --port 8188 --database-url sqlite:///C:/Comfy/user/comfy.db",
      8188
    )).toBe(false);
    expect(isAppManagedComfyCommandLine(
      "python main.py --port 8189 --database-url sqlite:///C:/Comfy/user/comfyui.local-video-studio-25484-8189.db",
      8188
    )).toBe(false);
  });

  it("requires the KJNodes large-stride guard added for modern attention runtimes", () => {
    const legacy = "class PathchSageAttentionKJ: optimized_attention_override";
    const guarded = `${legacy}\nif stride >= 2**31:\n q, k, v = q.contiguous(), k.contiguous(), v.contiguous()`;
    expect(kjNodesAttentionSourceCompatible(legacy)).toBe(false);
    expect(kjNodesAttentionSourceCompatible(guarded)).toBe(true);
  });

  it("keeps ComfyUI process and parent details for recovery logs", () => {
    expect(parseComfyProcessInfo(JSON.stringify({
      ProcessId: 86824,
      ParentProcessId: 85288,
      Name: "python.exe",
      ExecutablePath: "C:\\ComfyUI\\.venv\\Scripts\\python.exe",
      CommandLine: "python.exe -s main.py --port 8188"
    }))).toEqual([{
      processId: 86824,
      parentProcessId: 85288,
      name: "python.exe",
      executablePath: "C:\\ComfyUI\\.venv\\Scripts\\python.exe",
      commandLine: "python.exe -s main.py --port 8188"
    }]);
  });

  it("selects the exact official Comfy wheel for the active runtime", () => {
    expect(attentionWheelForProbe({
      pythonVersion: "3.12.11",
      torchVersion: "2.8.0+cu129",
      cudaVersion: "12.9"
    })).toMatchObject({
      version: "2.2.0+cu129torch2.8",
      filename: "sageattention-2.2.0+cu129torch2.8-cp312-cp312-win_amd64.whl"
    });
    expect(tritonRequirementForTorch("2.8.0+cu129")).toBe(
      "triton-windows>=3.4,<3.5"
    );
    expect(attentionWheelForProbe({
      pythonVersion: "3.12.11",
      torchVersion: "2.9.1+cu130",
      cudaVersion: "13.0"
    })).toMatchObject({
      version: "2.2.0+cu130torch2.9",
      filename: "sageattention-2.2.0+cu130torch2.9-cp312-cp312-win_amd64.whl"
    });
    expect(tritonRequirementForTorch("2.9.1+cu130")).toBe(
      "triton-windows>=3.5,<3.6"
    );
    expect(attentionWheelForProbe({
      pythonVersion: "3.12.11",
      torchVersion: "2.10.0+cu130",
      cudaVersion: "13.0"
    })).toMatchObject({
      version: "2.2.0+cu130torch2.10",
      filename: "sageattention-2.2.0+cu130torch2.10-cp312-cp312-win_amd64.whl"
    });
    expect(tritonRequirementForTorch("2.10.0+cu130")).toBe(
      "triton-windows>=3.6,<3.7"
    );
    expect(attentionWheelForProbe({
      pythonVersion: "3.12.11",
      torchVersion: "2.11.0+cu130",
      cudaVersion: "13.0"
    })).toMatchObject({
      version: "2.2.0+cu130torch2.11",
      filename: "sageattention-2.2.0+cu130torch2.11-cp312-cp312-win_amd64.whl"
    });
    expect(tritonRequirementForTorch("2.11.0+cu130")).toBe(
      "triton-windows>=3.7,<3.8"
    );
    expect(tritonRequirementForTorch("2.4.1+cu124")).toBe(
      "triton-windows>=3.0,<3.1"
    );
  });

  it("requires a coherent cu130 H3 runtime trio at Torch 2.10 or newer", () => {
    expect(h3TorchRuntimeReady({
      torchVersion: "2.10.0+cu130",
      torchvisionVersion: "0.25.0+cu130",
      torchaudioVersion: "2.10.0+cu130",
      cudaVersion: "13.0"
    })).toBe(true);
    expect(h3TorchRuntimeReady({
      torchVersion: "2.13.0+cu130",
      torchvisionVersion: "0.28.0+cu130",
      torchaudioVersion: "2.13.0+cu130",
      cudaVersion: "13.0"
    })).toBe(true);
    expect(h3TorchRuntimeReady({
      torchVersion: "2.13.0+cu130",
      torchvisionVersion: "0.27.0+cu130",
      torchaudioVersion: "2.13.0+cu130",
      cudaVersion: "13.0"
    })).toBe(false);
    expect(h3TorchRuntimeReady({
      torchVersion: "2.9.1+cu130",
      torchvisionVersion: "0.24.1+cu130",
      torchaudioVersion: "2.9.1+cu130",
      cudaVersion: "13.0"
    })).toBe(false);
  });

  it("reports the CUDA requirement for optimized INT8 ConvRot kernels", () => {
    expect(comfyKitchenConvRotCudaOptimized("12.9")).toBe(false);
    expect(comfyKitchenConvRotCudaOptimized("13.0")).toBe(true);
    expect(comfyKitchenConvRotCudaOptimized("13.1")).toBe(true);
  });

  it("rejects runtime combinations not published in the official wheel matrix", () => {
    expect(attentionWheelForProbe({
      pythonVersion: "3.12.11",
      torchVersion: "2.7.0+cu129",
      cudaVersion: "12.9"
    })).toBeNull();
    expect(attentionWheelForProbe({
      pythonVersion: "3.12.11",
      torchVersion: "2.12.0+cu130",
      cudaVersion: "13.0"
    })).toBeNull();
    expect(attentionWheelForProbe({
      pythonVersion: "3.14.0",
      torchVersion: "2.8.0+cu129",
      cudaVersion: "12.9"
    })).toBeNull();
  });
});

describe("dependency installer subprocess feedback", () => {
  it("reports pip download percentage, bytes, and speed", () => {
    const messages: string[] = [];
    const timestamps = [0, 1_000, 2_000];
    const reporter = createPipDownloadProgressReporter(
      (message) => messages.push(message),
      () => timestamps.shift() ?? 2_000
    );

    reporter("Progress 10485760 of 104857600");
    reporter("Progress 31457280 of 104857600");

    expect(messages).toEqual([
      "下载进度：10% · 10.0 / 100.0 MB",
      "下载进度：30% · 30.0 / 100.0 MB · 20.0 MB/s"
    ]);
  });

  it("streams command output before returning the collected log", async () => {
    const messages: string[] = [];
    const output = await runLoggedProcess(
      process.execPath,
      ["-e", "console.log('download started'); console.error('dependency ready')"],
      { timeoutMs: 5_000, onLog: (message) => messages.push(message) }
    );

    expect(messages).toContain("download started");
    expect(messages).toContain("dependency ready");
    expect(output).toContain("download started");
    expect(output).toContain("dependency ready");
  });

  it("stops a command that exceeds its explicit time limit", async () => {
    await expect(runLoggedProcess(
      process.execPath,
      ["-e", "setInterval(() => {}, 1000)"],
      { timeoutMs: 150 }
    )).rejects.toThrow("已停止");
  });
});

describe("VRAM reserve budget", () => {
  it("subtracts the clamped reserve from detected total VRAM", () => {
    expect(availableVramBytesForReserve(24 * 1024 ** 3, 1)).toBe(
      23 * 1024 ** 3
    );
    expect(availableVramBytesForReserve(8 * 1024 ** 3, 2)).toBe(
      7 * 1024 ** 3
    );
  });
});

describe("ComfyUI process discovery", () => {
  it("parses PowerShell process id output in scalar and array forms", () => {
    expect(parseComfyProcessIds("[4152, 20512, 4152]")).toEqual([4152, 20512]);
    expect(parseComfyProcessIds("4152")).toEqual([4152]);
    expect(parseComfyProcessIds("null")).toEqual([]);
  });
});

describe("ComfyUI database issue reporting", () => {
  const now = new Date("2026-08-11T10:00:00Z").getTime();
  const recentLog = now - 60_000;

  it("hides historical database errors while the current service is healthy", () => {
    expect(shouldReportComfyDatabaseIssue({
      logContent: "Failed to initialize database",
      logModifiedAt: recentLog,
      databaseModifiedAt: 0,
      serviceReachable: true,
      now
    })).toBe(false);
  });

  it("hides stale errors and errors followed by a successful server start", () => {
    expect(shouldReportComfyDatabaseIssue({
      logContent: "Failed to initialize database",
      logModifiedAt: now - 16 * 60_000,
      databaseModifiedAt: 0,
      serviceReachable: false,
      now
    })).toBe(false);
    expect(shouldReportComfyDatabaseIssue({
      logContent: "Failed to initialize database\nStarting server\nTo see the GUI go to: http://127.0.0.1:8188",
      logModifiedAt: recentLog,
      databaseModifiedAt: 0,
      serviceReachable: false,
      now
    })).toBe(false);
  });

  it("reports a recent unresolved database startup failure", () => {
    expect(shouldReportComfyDatabaseIssue({
      logContent: "Starting ComfyUI\nFailed to initialize database\nStartup aborted",
      logModifiedAt: recentLog,
      databaseModifiedAt: 0,
      serviceReachable: false,
      now
    })).toBe(true);
  });
});

describe("ComfyUI Python selection", () => {
  it("rejects the Microsoft Store WindowsApps Python alias", () => {
    expect(isWindowsPythonAlias(
      "C:\\Users\\98000\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe"
    )).toBe(true);
    expect(isWindowsPythonAlias(
      "C:\\Users\\98000\\Documents\\ComfyUI\\.venv\\Scripts\\python.exe"
    )).toBe(false);
  });
});

describe("NVIDIA GPU discovery", () => {
  it("parses each GPU name, driver, and total VRAM from nvidia-smi", () => {
    expect(parseNvidiaGpuQuery([
      "0, NVIDIA GeForce RTX 4090, 610.88, 24564",
      "1, NVIDIA RTX A4000, 560.12, 16376"
    ].join("\n"))).toEqual([
      {
        index: 0,
        name: "NVIDIA GeForce RTX 4090",
        driverVersion: "610.88",
        vramTotalBytes: 24564 * 1024 ** 2
      },
      {
        index: 1,
        name: "NVIDIA RTX A4000",
        driverVersion: "560.12",
        vramTotalBytes: 16376 * 1024 ** 2
      }
    ]);
  });
});

describe("Windows directory replacement", () => {
  it("retries a transient EPERM before promoting the replacement directory", async () => {
    const error = Object.assign(new Error("temporarily locked"), { code: "EPERM" });
    const rename = vi
      .fn<(source: string, destination: string) => Promise<void>>()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce();
    const waits: number[] = [];

    await renameWithRetry("replacement", "target", {
      attempts: 3,
      retryDelayMs: 25,
      rename,
      wait: async (milliseconds) => {
        waits.push(milliseconds);
      }
    });

    expect(rename).toHaveBeenCalledTimes(2);
    expect(waits).toEqual([25]);
  });
});

describe("ComfyUI environment candidates", () => {
  it("prefers user-selected model and output directories", () => {
    expect(comfyDataDirectories({
      modelDirectory: "E:\\VideoModels",
      outputDirectory: "F:\\VideoOutput"
    }, "C:\\Users\\CurrentUser\\Documents\\ComfyUI")).toEqual({
      modelDirectory: "E:\\VideoModels",
      outputDirectory: "F:\\VideoOutput"
    });
  });

  it("uses the shared parent when video and image directories are siblings", () => {
    const settings = {
      modelDirectory: "C:\\Models",
      outputDirectory: "C:\\ComfyUI\\output\\Videos",
      imageOutputDirectory: "C:\\ComfyUI\\output\\Images"
    };

    expect(comfyDataDirectories(settings, "C:\\ComfyUI").outputDirectory).toBe(
      "C:\\ComfyUI\\output"
    );
    expect(comfyOutputSubfolder(settings, "video")).toBe("Videos");
    expect(comfyOutputSubfolder(settings, "image")).toBe("Images");
  });

  it("derives the ComfyUI root when only the conventional image directory is configured", () => {
    expect(comfyDataDirectories({
      modelDirectory: "C:\\Models",
      outputDirectory: "",
      imageOutputDirectory: "C:\\ComfyUI\\output\\Images"
    }, "C:\\ComfyUI").outputDirectory).toBe("C:\\ComfyUI\\output");
  });

  it("keeps arbitrary nested and Unicode output directories under the ComfyUI output root", () => {
    const settings = {
      modelDirectory: "C:\\Models",
      outputDirectory: "C:\\ComfyUI\\output\\视频",
      imageOutputDirectory: "C:\\ComfyUI\\output\\Output\\图片"
    };

    expect(comfyDataDirectories(settings, "C:\\ComfyUI").outputDirectory).toBe(
      "C:\\ComfyUI\\output"
    );
    expect(comfyOutputSubfolder(settings, "video")).toBe("视频");
    expect(comfyOutputSubfolder(settings, "image")).toBe("Output/图片");
  });

  it("merges selected paths into Comfy Desktop settings", () => {
    expect(mergeComfyDesktopSettings({
      modelsDirs: ["D:\\SharedModels"],
      outputDir: "C:\\OldOutput",
      cacheDir: "C:\\Cache"
    }, {
      modelDirectory: "E:\\VideoModels",
      outputDirectory: "F:\\VideoOutput"
    })).toEqual({
      modelsDirs: ["E:\\VideoModels", "D:\\SharedModels"],
      outputDir: "F:\\VideoOutput",
      cacheDir: "C:\\Cache"
    });
  });

  it("prefers user-selected model and output directories", () => {
    expect(comfyDataDirectories({
      modelDirectory: "E:\\VideoModels",
      outputDirectory: "F:\\VideoOutput"
    }, "C:\\Users\\CurrentUser\\Documents\\ComfyUI")).toEqual({
      modelDirectory: "E:\\VideoModels",
      outputDirectory: "F:\\VideoOutput"
    });
  });

  it("uses the frontend bundled with ComfyUI Desktop", () => {
    expect(
      comfyUiBundledFrontendArgs(
        "D:\\Program Files\\ComfyUI\\resources\\ComfyUI",
        true
      )
    ).toEqual([
      "--front-end-root",
      "D:\\Program Files\\ComfyUI\\resources\\ComfyUI\\web_custom_versions\\desktop_app"
    ]);
    expect(comfyUiBundledFrontendArgs("D:\\ComfyUI", false)).toEqual([]);
  });

  it("finds LM Studio from a manually selected non-system drive", () => {
    const candidates = buildLmStudioCandidates({
      homeDirectory: "C:\\Users\\CurrentUser",
      localAppData: "C:\\Users\\CurrentUser\\AppData\\Local",
      installDirectory: "D:\\Apps\\LM Studio",
      driveRoots: ["C:\\", "D:\\"]
    });

    expect(candidates).toContain("D:\\Apps\\LM Studio\\LM Studio.exe");
    expect(candidates).toContain(
      "D:\\Program Files\\LM Studio\\LM Studio.exe"
    );
  });

  it("uses the Windows H3-safe synchronous offload profile", () => {
    const args = comfyUiMemoryArgs({ vramReserveGb: 2 });

    expect(args).toEqual([
      "--cache-none",
      "--reserve-vram",
      "1",
      "--disable-pinned-memory",
      "--disable-async-offload"
    ]);
    expect(args).not.toContain("--lowvram");
  });

  it("ignores legacy H3 Memory flags when selecting a queue runtime", () => {
    const settings = createDefaultSettings();
    const memorySettings = comfyUiSettingsForQueueTask({
      taskType: "generation",
      modelId: "minimax_h3_fl2va",
      attentionMode: "sage",
      h3MemoryOptimizationMode: "preserve-native"
    }, settings);
    const ordinarySettings = comfyUiSettingsForQueueTask({
      taskType: "generation",
      modelId: "minimax_h3_fl2va",
      attentionMode: "sage",
      h3MemoryOptimizationMode: "off"
    }, settings);

    expect(comfyUiRuntimeProfileForSettings(memorySettings)).toBe("standard");
    expect(comfyUiMemoryArgs(memorySettings)).not.toContain("--enable-dynamic-vram");
    expect(comfyUiMemoryArgs(memorySettings)).not.toContain("--use-sage-attention");
    expect(comfyUiMemoryArgs(memorySettings)).toContain("--disable-pinned-memory");
    expect(comfyUiMemoryArgs(memorySettings)).toContain("--disable-async-offload");
    expect(comfyUiMemoryArgs(memorySettings)).not.toContain("--disable-dynamic-vram");
    expect(comfyUiRuntimeProfileForSettings(ordinarySettings)).toBe("standard");
    expect(comfyUiMemoryArgs(ordinarySettings)).not.toContain("--use-sage-attention");
    expect(comfyUiMemoryArgs(ordinarySettings)).not.toContain("--disable-dynamic-vram");
  });

  it("adds the aggressive CPU/offload profile for Qwen image editing", () => {
    const args = comfyUiMemoryArgs({
      vramReserveGb: 1,
      defaultImageModel: "qwen-image-edit-2511"
    });

    expect(args).toContain("--cpu-vae");
    expect(args).toContain("--disable-smart-memory");
    expect(args).toEqual(expect.arrayContaining(["--vram-headroom", "0.5"]));
    expect(args).not.toContain("--disable-pinned-memory");
    expect(args).not.toContain("--disable-async-offload");
  });

  it("uses the aggressive H3 Q3 profile for a 3080 default video model", () => {
    const args = comfyUiMemoryArgs({
      vramReserveGb: 0.5,
      defaultVideoModel: "minimax_h3_fl2va_q3_gguf"
    });

    expect(args).toEqual(expect.arrayContaining([
      "--lowvram",
      "--cpu-vae",
      "--disable-smart-memory",
      "--disable-pinned-memory",
      "--disable-async-offload"
    ]));
  });

  it("keeps Qwen image and standard video runtime profiles distinct", () => {
    expect(comfyUiRuntimeProfileForSettings({
      defaultImageModel: "qwen-image-edit-2511"
    })).toBe("qwen-image");
    expect(comfyUiRuntimeProfileForSettings({
      defaultImageModel: ""
    })).toBe("standard");
    expect(comfyUiRuntimeProfileForSettings(
      comfyUiSettingsForPromptRuntime(createDefaultSettings())
    )).toBe("prompt-resident");
    expect(comfyUiRuntimeProfileForSettings({
      defaultImageModel: "",
      defaultVideoModel: "minimax_h3_fl2va_q3_gguf"
    })).toBe("h3-q3-3080");

    expect(comfyUiRuntimeProfileFromCommandLine(
      "python main.py --cpu-vae --disable-smart-memory"
    )).toBe("qwen-image");
    expect(comfyUiRuntimeProfileFromCommandLine(
      "python main.py --disable-pinned-memory --disable-async-offload"
    )).toBe("standard");
    expect(comfyUiRuntimeProfileFromCommandLine(
      "python main.py --enable-dynamic-vram --async-offload 2"
    )).toBe("h3-memory");
    expect(comfyUiRuntimeProfileFromCommandLine(
      "python main.py --lowvram --cpu-vae --disable-smart-memory"
    )).toBe("h3-q3-3080");
    expect(comfyUiRuntimeProfileFromCommandLine(
      "python main.py --listen 127.0.0.1"
    )).toBe("unknown");
    expect(comfyUiRuntimeProfileFromCommandLine(
      "python main.py --cache-lru 1 --listen 127.0.0.1"
    )).toBe("prompt-resident");
  });

  it("uses a bounded node cache for explicitly retained prompt models", () => {
    const args = comfyUiMemoryArgs(
      comfyUiSettingsForPromptRuntime(createDefaultSettings())
    );

    expect(args).toEqual(expect.arrayContaining(["--cache-lru", "1"]));
    expect(args).not.toContain("--cache-none");
    expect(args).not.toContain("--disable-pinned-memory");
    expect(args).not.toContain("--disable-async-offload");
  });

  it("detects VideoHelperSuite builds that support six-value ComfyUI queues", () => {
    const oldUtils = [
      "    (_, _, prompt, extra_data, outputs_to_execute) = next(iter(currently_running.values()))",
      "    prompt_queue.put((number, prompt_id, prompt, extra_data, outputs_to_execute))",
      "    (run_number, _, prompt, _, _) = next(iter(prompt_queue.currently_running.values()))"
    ].join("\n");
    const oldNodes = [
      "class BatchManager:",
      "    def reset(self):",
      "        self.close_inputs()",
      "    def update_batch(self, frames_per_batch, prompt=None, unique_id=None):",
      "        if unique_id is not None and prompt is not None:",
      "            requeue = prompt[unique_id]['inputs'].get('requeue', 0)",
      "        if requeue == 0:",
      "            self.reset()",
      "            self.unique_id = unique_id",
      "        else:",
      "            print('next batch')"
    ].join("\r\n");
    const oldLoadVideo = [
      "    if meta_batch is not None:",
      "        if 'frames' in format:",
      "        gen = itertools.islice(gen, meta_batch.frames_per_batch)"
    ].join("\r\n");
    expect(
      videoHelperBatchCompatible(oldUtils, oldNodes, oldLoadVideo)
    ).toBe(false);
    const patched = patchVideoHelperBatchCompatibility(
      oldUtils,
      oldNodes,
      oldLoadVideo
    );
    expect(
      videoHelperBatchCompatible(
        patched.utilsSource,
        patched.nodesSource,
        patched.loadVideoSource
      )
    ).toBe(true);
    expect(patched.nodesSource).toContain(
      "batch_manager_states[unique_id] = self"
    );
    expect(patched.nodesSource).toContain(
      "self = batch_manager_states[unique_id]"
    );
    expect(patched.nodesSource).toContain(
      "previous = batch_manager_states.pop(unique_id, None)"
    );
  });

  it("patches the legacy LTX AudioVAE constructor for ComfyUI 0.22+", () => {
    const legacy = [
      "import comfy.utils",
      "from comfy.ldm.lightricks.vae.audio_vae import AudioVAE",
      "class LowVRAMAudioVAELoader:",
      "    def load_audio_vae_sequentially(self, ckpt_name):",
      "        sd, metadata = comfy.utils.load_torch_file(ckpt_name, return_metadata=True)",
      "        audio_vae = AudioVAE(sd, metadata)",
      "        return (audio_vae,)"
    ].join("\n");

    expect(ltxAudioVaeCompatible(legacy)).toBe(false);
    const patched = patchLtxAudioVaeCompatibility(legacy);
    expect(ltxAudioVaeCompatible(patched)).toBe(true);
    expect(patched).toContain("from comfy.sd import VAE");
    expect(patched).toContain("state_dict_prefix_replace");
    expect(patched).toContain("audio_vae.throw_exception_if_invalid()");
  });

  it("keeps H3 Prompt Writer compatible when GGML KV constants move into _ggml", () => {
    const backend = [
      "        try:",
      "            from llama_cpp import GGML_TYPE_F16, GGML_TYPE_Q8_0, Llama",
      "            kv_types = {'q8': GGML_TYPE_Q8_0, 'f16': GGML_TYPE_F16}"
    ].join("\n");
    const patched = patchH3PromptWriterLlamaCppCompatibility(backend);
    expect(patched).toContain("            from llama_cpp import Llama");
    expect(patched).toContain("                from llama_cpp._ggml import GGMLType");
    expect(patched).toContain("                GGML_TYPE_Q8_0 = GGMLType.GGML_TYPE_Q8_0");
    expect(patched).toContain("            kv_types = {'q8': GGML_TYPE_Q8_0, 'f16': GGML_TYPE_F16}");
    expect(patchH3PromptWriterLlamaCppCompatibility(patched)).toBe(patched);
  });

  it("uses the current home directory instead of a hard-coded username", () => {
    const candidates = buildComfyCandidates({
      homeDirectory: "C:\\Users\\CurrentUser",
      localAppData: "C:\\Users\\CurrentUser\\AppData\\Local",
      driveRoots: ["C:\\"]
    });

    expect(candidates).toContain("C:\\Users\\CurrentUser\\Documents\\ComfyUI");
    expect(candidates.some((candidate) => candidate.includes("\\Alice\\"))).toBe(false);
  });

  it("prefers the ComfyUI root inferred from configured models or output paths", () => {
    const candidates = buildComfyCandidates({
      homeDirectory: "C:\\Users\\CurrentUser",
      localAppData: "C:\\Users\\CurrentUser\\AppData\\Local",
      modelDirectory: "D:\\AI\\ComfyUI\\models",
      outputDirectory: "D:\\AI\\ComfyUI\\output",
      driveRoots: ["C:\\", "D:\\"]
    });

    expect(candidates[0]).toBe("D:\\AI\\ComfyUI");
    expect(candidates.filter((candidate) => candidate === "D:\\AI\\ComfyUI")).toHaveLength(1);
  });

  it("scans ComfyUI Desktop defaults and common C/D Program Files paths", () => {
    const candidates = buildComfyDesktopCandidates({
      homeDirectory: "C:\\Users\\CurrentUser",
      localAppData: "C:\\Users\\CurrentUser\\AppData\\Local",
      programFiles: "C:\\Program Files",
      driveRoots: ["C:\\", "D:\\"]
    });

    expect(candidates).toContain(
      "C:\\Users\\CurrentUser\\AppData\\Local\\Programs\\ComfyUI\\ComfyUI.exe"
    );
    expect(candidates).toContain("C:\\Program Files\\ComfyUI\\ComfyUI.exe");
    expect(candidates).toContain("D:\\Program Files\\ComfyUI\\ComfyUI.exe");
    expect(candidates).toContain(
      "D:\\Program Files\\ComfyUI\\Comfy Desktop\\Comfy Desktop.exe"
    );
    expect(candidates.indexOf(
      "D:\\Program Files\\ComfyUI\\Comfy Desktop\\Comfy Desktop.exe"
    )).toBeLessThan(candidates.indexOf("D:\\Program Files\\ComfyUI\\ComfyUI.exe"));
  });

  it("maps the modern Desktop launcher to its shared parent core directory", () => {
    expect(buildComfyDesktopSourceCandidates(
      "D:\\Program Files\\ComfyUI\\Comfy Desktop\\Comfy Desktop.exe"
    )).toEqual([
      "D:\\Program Files\\ComfyUI\\Comfy Desktop\\resources\\ComfyUI",
      "D:\\Program Files\\ComfyUI\\resources\\ComfyUI"
    ]);
  });

  it("reads Desktop 2 managed instances instead of treating the launcher as the core", () => {
    const entries = parseComfyDesktop2Registry(JSON.stringify([
      {
        id: "inst-1",
        name: "ComfyUI",
        sourceId: "standalone",
        installPath: "D:\\Comfy-Desktop\\ComfyUI-Installs\\ComfyUI",
        status: "installed",
        comfyVersion: { baseTag: "v0.30.1", commit: "0764232429b8" }
      },
      {
        id: "cloud",
        name: "Comfy Cloud",
        sourceId: "cloud",
        installPath: "",
        status: "installed"
      }
    ]));

    expect(entries[0]?.installPath).toBe(
      "D:\\Comfy-Desktop\\ComfyUI-Installs\\ComfyUI"
    );
    expect(entries[0]?.comfyVersion?.baseTag).toBe("v0.30.1");
  });

  it("keeps a manually selected ComfyUI installation ahead of automatic candidates", () => {
    const candidates = buildComfyCandidates({
      homeDirectory: "C:\\Users\\CurrentUser",
      localAppData: "C:\\Users\\CurrentUser\\AppData\\Local",
      installDirectory: "D:\\AI\\ChosenComfyUI",
      modelDirectory: "E:\\OtherComfyUI\\models",
      driveRoots: ["C:\\", "D:\\"]
    });

    expect(candidates[0]).toBe("D:\\AI\\ChosenComfyUI");
  });

  it("reports model profiles from their required component files", () => {
    const profiles = evaluateModelProfiles([
      "diffusion_models\\wan2.2_ti2v_5B_fp16.safetensors",
      "text_encoders\\umt5_xxl_fp8_e4m3fn_scaled.safetensors",
      "vae\\wan2.2_vae.safetensors",
      "SEEDVR2\\seedvr2_ema_3b_fp8_e4m3fn.safetensors",
      "SEEDVR2\\ema_vae_fp16.safetensors"
    ]);

    expect(profiles.find((profile) => profile.id === "wan22_5b")).toBeUndefined();
    expect(profiles.find((profile) => profile.id === "seedvr2")?.available).toBe(true);
    expect(profiles.find((profile) => profile.id === "sulphur2")?.available).toBe(false);
  });

  it("detects the native SeedVR2 INT8 ConvRot profile independently", () => {
    const incomplete = evaluateModelProfiles([
      "diffusion_models\\seedvr2_3b_int8_convrot.safetensors"
    ]).find((profile) => profile.id === "seedvr2-native-int8");
    expect(incomplete).toMatchObject({
      category: "upscale",
      available: false,
      integrated: true,
      runtimeVerified: false,
      runtimeReady: false
    });

    const files = [
      "diffusion_models\\seedvr2_3b_int8_convrot.safetensors",
      "vae\\seedvr2_ema_vae_fp16.safetensors"
    ];
    const complete = evaluateModelProfiles(files).find((profile) => profile.id === "seedvr2-native-int8");
    expect(complete).toMatchObject({ available: true, integrated: true });
    expect(complete?.components.map((component) => component.matches[0])).toEqual([
      "diffusion_models/seedvr2_3b_int8_convrot.safetensors",
      "vae/seedvr2_ema_vae_fp16.safetensors"
    ]);

    const runtimeNodes = new Set(complete?.runtimeMissingNodes ?? []);
    expect(runtimeNodes.size).toBe(0);
    const ready = evaluateModelProfiles(files, "q3_k_m", new Set([
      "LoadVideo",
      "GetVideoComponents",
      "ImageScale",
      "SeedVR2Preprocess",
      "VAELoader",
      "VAEEncodeTiled",
      "UNETLoader",
      "SeedVR2TemporalChunk",
      "SeedVR2Conditioning",
      "KSampler",
      "SeedVR2TemporalMerge",
      "VAEDecodeTiled",
      "SeedVR2PostProcessing",
      "CreateVideo",
      "SaveVideo"
    ])).find((profile) => profile.id === "seedvr2-native-int8");
    expect(ready).toMatchObject({
      available: true,
      runtimeVerified: true,
      runtimeReady: true,
      runtimeMissingNodes: []
    });
  });

  it("scans ComfyUI prompt encoders from the standard text_encoders directory", () => {
    const legacy = evaluateModelProfiles([
      "prompt_models\\qwen3.5-9b\\Qwen3.5-9B-Q4_K_M.gguf",
      "prompt_models\\qwen3.5-9b\\mmproj-F16.gguf"
    ]);
    const incomplete = evaluateModelProfiles([]);
    const complete = evaluateModelProfiles([
      "text_encoders\\qwen3.5_4b_bf16.safetensors"
    ]);
    const completeFast = evaluateModelProfiles([
      "text_encoders\\qwen3.5_2b_bf16.safetensors"
    ]);
    const promptProfiles = incomplete.filter((profile) => profile.category === "prompt");
    const incompleteProfile = incomplete.find((profile) => profile.id === "qwen/qwen3.5-4b");
    const completeProfile = complete.find((profile) => profile.id === "qwen/qwen3.5-4b");
    const fastProfile = completeFast.find((profile) => profile.id === "qwen/qwen3.5-2b");

    expect(promptProfiles).toHaveLength(9);
    expect(promptProfiles.map((profile) => profile.id)).toEqual([
      "qwen/qwen3.6-27b-uncensored-q4",
      "qwen/qwen3.8-27b-uncensored-q4",
      "community/gemma-4-26b-a4b-uncensored-q4",
      "lightx2v/minimax-h3-prompt-rewriter-8b",
      "community/gemma-4-12b-uncensored-q4",
      "google/gemma-4-12b-q5",
      "community/gemma-4-e4b-unconcerned-q5",
      "qwen/qwen3.5-4b",
      "qwen/qwen3.5-2b"
    ]);
    expect(promptProfiles[0]?.managedBy).toBe("comfyui");
    expect(legacy.find((profile) => profile.id === "qwen/qwen3.5-4b")?.available).toBe(false);
    expect(incompleteProfile).toMatchObject({
      category: "prompt",
      available: false,
      integrated: true,
      runtimeVerified: false
    });
    expect(completeProfile).toMatchObject({
      category: "prompt",
      available: true,
      integrated: true,
      runtimeVerified: false
    });
    expect(fastProfile).toMatchObject({
      category: "prompt",
      available: true,
      integrated: true,
      runtimeVerified: false
    });
    expect(fastProfile?.components[0]?.installGuide).toMatchObject({
      downloadUrl: "https://huggingface.co/Comfy-Org/Qwen3.5/resolve/main/text_encoders/qwen3.5_2b_bf16.safetensors?download=true",
      targetSubdirectory: "text_encoders",
      recommendedFilename: "qwen3.5_2b_bf16.safetensors"
    });
    expect(completeProfile?.components.map((component) => component.matches[0])).toEqual([
      "text_encoders/qwen3.5_4b_bf16.safetensors"
    ]);
    expect(incompleteProfile?.components[0]?.installGuide).toMatchObject({
      downloadUrl: "https://huggingface.co/Comfy-Org/Qwen3.5/resolve/main/text_encoders/qwen3.5_4b_bf16.safetensors?download=true",
      targetSubdirectory: "text_encoders",
      recommendedFilename: "qwen3.5_4b_bf16.safetensors"
    });
  });

  it("scans Qwen Image Edit 2511 components separately from runtime readiness", () => {
    const incomplete = evaluateModelProfiles([]).find(
      (profile) => profile.id === "qwen-image-edit-2511"
    );
    const complete = evaluateModelProfiles([
      "diffusion_models\\qwen_image_edit_2511_int8_convrot.safetensors",
      "text_encoders\\qwen_2.5_vl_7b_fp8_scaled.safetensors",
      "vae\\qwen_image_vae.safetensors"
    ]).find((profile) => profile.id === "qwen-image-edit-2511");

    expect(incomplete).toMatchObject({
      category: "image",
      available: false,
      integrated: true,
      runtimeVerified: false,
      runtimeReady: false
    });
    expect(complete).toMatchObject({
      category: "image",
      available: true,
      integrated: true,
      runtimeVerified: false,
      runtimeReady: false
    });
    expect(complete?.available).toBe(true);
    expect(complete?.components.every((component) => component.installGuide.downloadUrl)).toBe(true);

    const runtimeNodes = new Set(qwenImageEdit2511RequiredNodeTypes);
    const ready = evaluateModelProfiles([
      "diffusion_models\\qwen_image_edit_2511_int8_convrot.safetensors",
      "text_encoders\\qwen_2.5_vl_7b_fp8_scaled.safetensors",
      "vae\\qwen_image_vae.safetensors"
    ], "q3_k_m", runtimeNodes).find(
      (profile) => profile.id === "qwen-image-edit-2511"
    );
    expect(ready).toMatchObject({
      available: true,
      integrated: true,
      runtimeVerified: true,
      runtimeReady: true,
      runtimeMissingNodes: []
    });

    const missingRuntimeNode = new Set(runtimeNodes);
    missingRuntimeNode.delete("TextEncodeQwenImageEditPlus");
    const blocked = evaluateModelProfiles([
      "diffusion_models\\qwen_image_edit_2511_int8_convrot.safetensors",
      "text_encoders\\qwen_2.5_vl_7b_fp8_scaled.safetensors",
      "vae\\qwen_image_vae.safetensors"
    ], "q3_k_m", missingRuntimeNode).find(
      (profile) => profile.id === "qwen-image-edit-2511"
    );
    expect(blocked?.runtimeReady).toBe(false);
    expect(blocked?.runtimeMissingNodes).toContain("TextEncodeQwenImageEditPlus");
  });

  it("keeps the Lightning LoRA optional for the base Qwen profile", () => {
    const profile = evaluateModelProfiles([
      "diffusion_models/qwen_image_edit_2511_int8_convrot.safetensors",
      "text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors",
      "vae/qwen_image_vae.safetensors"
    ]).find((item) => item.id === "qwen-image-edit-2511");
    const lightning = profile?.components.find((component) => component.label.includes("Lightning LoRA"));
    expect(profile?.available).toBe(true);
    expect(lightning).toMatchObject({ optional: true, found: false });
    expect(lightning?.installGuide.recommendedFilename).toBe(
      "Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors"
    );
  });

  it("keeps Gemma 4 tiers separate by requiring a colocated model directory", () => {
    const profiles = evaluateModelProfiles([
      "LLM\\gemma-4-26b-a4b-uncensored-q4\\gemma-4-26B-A4B-it-ultra-uncensored-heretic-Q4_K_M.gguf",
      "LLM\\gemma-4-26b-a4b-uncensored-q4\\gemma-4-26B-A4B-it-mmproj-BF16.gguf"
    ]).filter((profile) => profile.id === "community/gemma-4-26b-a4b-uncensored-q4" || profile.id === "google/gemma-4-12b-q5");

    expect(profiles.find((profile) => profile.id === "community/gemma-4-26b-a4b-uncensored-q4")).toMatchObject({
      available: true,
      managedBy: "comfyui",
      integrated: true
    });
    expect(profiles.find((profile) => profile.id === "google/gemma-4-12b-q5")?.available).toBe(false);
    expect(profiles.find((profile) => profile.id === "community/gemma-4-26b-a4b-uncensored-q4")
      ?.components.every((component) => component.installGuide.downloadUrl)).toBe(true);
  });

  it("requires the official MiniMax H3 FL2VA, Qwen3-VL and both VAE files", () => {
    const profiles = evaluateModelProfiles([
      "diffusion_models\\minimax_h3_fl2va_pruned_int8_convrot.safetensors",
      "text_encoders\\qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
      "vae\\minimax_h3_video_vae_fp16.safetensors",
      "vae\\minimax_h3_audio_vae_fp32.safetensors"
    ]);
    const fl2va = profiles.find((profile) => profile.id === "minimax_h3_fl2va");

    expect(fl2va?.available).toBe(true);
    expect(fl2va?.integrated).toBe(true);
    expect(profiles.find((profile) => profile.id === "minimax-h3-lightx2v-turbo-4step")).toBeUndefined();
    expect(profiles.find((profile) => profile.id === "minimax-h3-lightx2v-turbo-4step-768p-v1.1")?.available).toBe(false);
    expect(profiles.some((profile) => profile.id === "minimax_h3_ref2va")).toBe(true);
    expect(profiles.find((profile) => profile.id === "minimax_h3_ref2va")?.available).toBe(false);
  });

  it("accepts the INT8 ConvRot video VAE as an alternative to FP16", () => {
    const files = [
      "diffusion_models\\minimax_h3_fl2va_pruned_int8_convrot.safetensors",
      "text_encoders\\qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
      "vae\\minimax_h3_video_vae_int8_convrot.safetensors",
      "vae\\minimax_h3_audio_vae_fp32.safetensors"
    ];
    const profiles = evaluateModelProfiles(files);
    const fl2va = profiles.find((profile) => profile.id === "minimax_h3_fl2va");
    const fp16 = fl2va?.components.find((component) => component.expected.includes("video_vae_fp16"));
    const int8 = fl2va?.components.find((component) => component.expected.includes("video_vae_int8"));

    expect(fl2va?.available).toBe(true);
    expect(fp16).toMatchObject({
      found: false,
      alternativeGroup: "minimax-h3-video-vae"
    });
    expect(int8).toMatchObject({
      found: true,
      alternativeGroup: "minimax-h3-video-vae",
      installGuide: {
        targetSubdirectory: "vae",
        recommendedFilename: "minimax_h3_video_vae_int8_convrot.safetensors",
        downloadUrl: "https://huggingface.co/Kijai/MiniMax-H3-experimental/resolve/main/minimax_h3_video_vae_int8_convrot.safetensors"
      }
    });

    const missing = evaluateModelProfiles(files.filter((file) => !file.includes("video_vae_int8")))
      .find((profile) => profile.id === "minimax_h3_fl2va");
    expect(missing?.available).toBe(false);
  });

  it("detects the current MiniMax H3 LightX2V v1.1 Turbo profile only with its recommended LoRA", () => {
    const profiles = evaluateModelProfiles([
      "diffusion_models\\minimax_h3_fl2va_pruned_int8_convrot.safetensors",
      "text_encoders\\qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
      "vae\\minimax_h3_video_vae_fp16.safetensors",
      "vae\\minimax_h3_audio_vae_fp32.safetensors",
      "loras\\minimax_h3_fl2v_turbo_4step_v1.1_768p_comfyui_bf16.safetensors"
    ]);
    const turbo = profiles.find((profile) => profile.id === "minimax-h3-lightx2v-turbo-4step-768p-v1.1");

    expect(turbo).toMatchObject({
      available: true,
      integrated: true,
      badge: "H3 专属 · 4 步快速",
      category: "lora"
    });
    expect(turbo?.components.at(-1)?.installGuide).toMatchObject({
      targetSubdirectory: "loras",
      recommendedFilename: "minimax_h3_fl2v_turbo_4step_v1.1_768p_comfyui_bf16.safetensors"
    });

    const legacyOnly = evaluateModelProfiles([
      "diffusion_models\\minimax_h3_fl2va_pruned_int8_convrot.safetensors",
      "text_encoders\\qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
      "vae\\minimax_h3_video_vae_fp16.safetensors",
      "vae\\minimax_h3_audio_vae_fp32.safetensors",
      "loras\\minimax_h3_turbo_4step_ckpt500_pruned_comfyui.safetensors"
    ]).find((profile) => profile.id === "minimax-h3-lightx2v-turbo-4step-768p-v1.1");
    expect(legacyOnly?.available).toBe(false);
  });

  it("does not scan retired ckpt850 while keeping current Turbo-SLA scanning", () => {
    const profiles = evaluateModelProfiles([
      "loras\\minimax_h3_turbo_4step_ema_ckpt850.safetensors",
      "loras\\minimax_h3_fl2v_turbo_4step_v0.1_768p_sla_comfyui_bf16.safetensors"
    ]);
    const ckpt850 = profiles.find((profile) => profile.id === "minimax-h3-turbo-ckpt850-ema");
    const sla = profiles.find((profile) => profile.id === "minimax-h3-turbo-sla-4step");

    expect(ckpt850).toBeUndefined();
    expect(sla).toMatchObject({
      available: true,
      category: "lora",
      requiredCustomNodeIds: ["plaguekind-h3-sla"]
    });
    expect(sla?.components[0]?.installGuide).toMatchObject({
      targetSubdirectory: "loras",
      recommendedFilename: "minimax_h3_fl2v_turbo_4step_v0.1_768p_sla_comfyui_bf16.safetensors"
    });
  });

  it("detects the AfterMidnight Ref2VA NSFW LoRA independently from the H3 base model", () => {
    const profiles = evaluateModelProfiles([
      "loras\\AfterMidnight_ref2va_h3_sexytime_rank64-v1.2.safetensors"
    ]);
    const nsfw = profiles.find((profile) => profile.id === "minimax-h3-after-midnight-ref2va-nsfw");

    expect(nsfw).toMatchObject({
      available: true,
      integrated: true,
      badge: "H3 R2V 专属 · NSFW",
      category: "lora"
    });
    expect(nsfw?.components[0]?.installGuide).toMatchObject({
      targetSubdirectory: "loras",
      recommendedFilename: "AfterMidnight_ref2va_h3_sexytime_rank64-v1.2.safetensors"
    });
  });

  it("scans the native BiRefNet model independently from runtime node readiness", () => {
    const incomplete = evaluateModelProfiles([]).find(
      (profile) => profile.id === "birefnet-background-removal"
    );
    const complete = evaluateModelProfiles([
      "background_removal\\birefnet.safetensors"
    ]).find((profile) => profile.id === "birefnet-background-removal");

    expect(incomplete).toMatchObject({
      category: "image",
      available: false,
      integrated: true,
      runtimeVerified: false,
      runtimeReady: false
    });
    expect(complete?.available).toBe(true);
    expect(complete?.components[0]?.installGuide).toMatchObject({
      targetSubdirectory: "background_removal",
      recommendedFilename: "birefnet.safetensors"
    });

    const runtime = evaluateModelProfiles(
      ["background_removal/birefnet.safetensors"],
      "q3_k_m",
      new Set(birefnetRequiredNodeTypes)
    ).find((profile) => profile.id === "birefnet-background-removal");
    expect(runtime).toMatchObject({ runtimeVerified: true, runtimeReady: true, runtimeMissingNodes: [] });
  });

  it("detects MiniMax H3 Realism People and exposes its current combined I2V/R2V download", () => {
    const profiles = evaluateModelProfiles([
      "loras\\h3-realism-people-t2v-i2v-r2v.safetensors"
    ]);
    const realism = profiles.find((profile) => profile.id === "minimax-h3-realism-people");

    expect(realism).toMatchObject({
      available: true,
      integrated: true,
      badge: "H3 专属 · 人物写实",
      category: "lora"
    });
    expect(realism?.components[0]?.installGuide).toMatchObject({
      sourceLabel: "fal / MiniMax-H3-Realism-People-LoRA",
      targetSubdirectory: "loras",
      recommendedFilename: "h3-realism-people-t2v-i2v-r2v.safetensors"
    });
    expect(realism?.components[0]?.installGuide.downloadUrl).toContain(
      "/h3-realism-people-t2v-i2v-r2v.safetensors"
    );
  });

  it("detects the community MiniMax H3 INT4 FL2VA profile independently", () => {
    const profiles = evaluateModelProfiles([
      "diffusion_models\\minimax_h3_fl2va_pruned_int4_convrot.safetensors",
      "text_encoders\\qwen3vl_32b_minimax_h3_int4_convrot.safetensors",
      "vae\\minimax_h3_video_vae_fp16.safetensors",
      "vae\\minimax_h3_audio_vae_fp32.safetensors"
    ]);
    const int4 = profiles.find((profile) => profile.id === "minimax_h3_fl2va_int4");

    expect(int4?.available).toBe(true);
    expect(int4?.integrated).toBe(true);
    expect(int4?.components[0]?.installGuide.recommendedFilename).toBe(
      "minimax_h3_fl2va_pruned_int4_convrot.safetensors"
    );
  });

  it("detects the RTX 3080 Q3 GGUF FL2VA experiment profile", () => {
    const profiles = evaluateModelProfiles([
      "unet\\minimax_h3_fl2va_pruned-Q3_K.gguf",
      "text_encoders\\qwen3vl_32b_minimax_h3-Q2_K_M.gguf",
      "vae\\minimax_h3_video_vae_fp16.safetensors",
      "vae\\minimax_h3_audio_vae_fp32.safetensors"
    ]);
    const q3 = profiles.find((profile) => profile.id === "minimax_h3_fl2va_q3_gguf");

    expect(q3).toMatchObject({
      available: true,
      integrated: true,
      badge: "Q3 GGUF · 实验",
      vram: "Q3 GGUF · CPU 文本编码器 · RAM offload"
    });
    expect(q3?.components[0]?.installGuide).toMatchObject({
      targetSubdirectory: "unet",
      recommendedFilename: "minimax_h3_fl2va_pruned-Q3_K.gguf"
    });
  });

  it("detects official and community R2V profiles without marking them integrated", () => {
    const profiles = evaluateModelProfiles([
      "diffusion_models\\minimax_h3_ref2va_pruned_int8_convrot.safetensors",
      "diffusion_models\\minimax_h3_ref2va_pruned_int4_convrot.safetensors",
      "text_encoders\\qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
      "text_encoders\\qwen3vl_32b_minimax_h3_int4_convrot.safetensors",
      "vae\\minimax_h3_video_vae_fp16.safetensors",
      "vae\\minimax_h3_audio_vae_fp32.safetensors"
    ]);

    expect(profiles.find((profile) => profile.id === "minimax_h3_ref2va")).toMatchObject({
      available: true,
      integrated: true,
      badge: "R2V · 多参考"
    });
    expect(profiles.find((profile) => profile.id === "minimax_h3_ref2va_int4")).toMatchObject({
      available: true,
      integrated: true,
      badge: "R2V · INT4 · 压缩"
    });
  });

  it("treats MiniMax H3 support as a core-node capability", () => {
    const complete = evaluateMiniMaxH3CoreSupport({
      EmptyMiniMaxH3LatentAV: {},
      MiniMaxH3ImageToVideo: {},
      MiniMaxH3ReferenceToVideo: {},
      MiniMaxH3SigmaShift: {}
    });
    const incomplete = evaluateMiniMaxH3CoreSupport({});

    expect(complete.every((node) => node.available)).toBe(true);
    expect(incomplete.filter((node) => !node.available)).toHaveLength(3);
  });

  it("treats Qwen prompt generation as a built-in ComfyUI core capability", () => {
    const complete = evaluatePromptCoreSupport({
      CLIPLoader: {},
      TextGenerate: {},
      LoadImage: {},
      ImageBatch: {},
      PreviewAny: {}
    });
    const incomplete = evaluatePromptCoreSupport({
      CLIPLoader: {},
      LoadImage: {},
      ImageBatch: {},
      PreviewAny: {}
    });

    expect(complete.every((node) => node.available)).toBe(true);
    expect(incomplete.find((node) => node.id === "TextGenerate")?.available).toBe(false);
    expect(incomplete.filter((node) => !node.available)).toHaveLength(1);
  });

  it("requires the official HunyuanVideo 1.5 dual text and vision encoders", () => {
    const complete = evaluateModelProfiles([
      "unet\\hunyuanvideo1.5_720p_i2v_fp16.safetensors",
      "vae\\hunyuanvideo15_vae_fp16.safetensors",
      "text_encoders\\qwen_2.5_vl_7b_fp8_scaled.safetensors",
      "text_encoders\\byt5_small_glyphxl_fp16.safetensors",
      "clip_vision\\sigclip_vision_patch14_384.safetensors"
    ]);
    const incorrectQwen = evaluateModelProfiles([
      "unet\\hunyuanvideo1.5_720p_i2v_fp16.safetensors",
      "vae\\hunyuanvideo15_vae_fp16.safetensors",
      "text_encoders\\qwen_3_4b.safetensors",
      "text_encoders\\byt5_small_glyphxl_fp16.safetensors",
      "clip_vision\\sigclip_vision_patch14_384.safetensors"
    ]);

    expect(complete.find((profile) => profile.id === "hunyuan15")).toBeUndefined();
    expect(incorrectQwen.find((profile) => profile.id === "hunyuan15")).toBeUndefined();
  });

  it("detects the downloaded SmoothMix and DaSiWa High/Low model pairs", () => {
    const profiles = evaluateModelProfiles([
      "unet\\smoothMixWan22I2VT2V_i2vHigh-Q5_K_M.gguf",
      "unet\\smoothMixWan22I2VT2V_i2vLow-Q5_K_M.gguf",
      "unet\\DasiwaWAN22I2V14BSynthseduction_q4High.gguf",
      "unet\\DasiwaWAN22I2V14BSynthseduction_q4Low.gguf",
      "text_encoders\\umt5_xxl_fp8_e4m3fn_scaled.safetensors",
      "vae\\wan_2.1_vae.safetensors"
    ]);

    expect(profiles.find((profile) => profile.id === "wan22_smoothmix")).toBeUndefined();
    expect(profiles.find((profile) => profile.id === "wan22_dasiwa")).toBeUndefined();
  });

  it("requires shared UMT5 and Wan 2.1 VAE assets before Remix is runnable", () => {
    const incomplete = evaluateModelProfiles([
      "unet\\wan22RemixT2VI2V_i2vHighV30-Q5_K_M.gguf",
      "unet\\wan22RemixT2VI2V_i2vLowV30-Q5_K_M.gguf"
    ]);
    const complete = evaluateModelProfiles([
      "unet\\wan22RemixT2VI2V_i2vHighV30-Q5_K_M.gguf",
      "unet\\wan22RemixT2VI2V_i2vLowV30-Q5_K_M.gguf",
      "text_encoders\\umt5_xxl_fp8_e4m3fn_scaled.safetensors",
      "vae\\wan_2.1_vae.safetensors"
    ]);

    expect(incomplete.find((profile) => profile.id === "wan22_remix")).toBeUndefined();
    expect(complete.find((profile) => profile.id === "wan22_remix")).toBeUndefined();
  });

  it("reports the RIFE interpolation checkpoint separately from video models", () => {
    const profiles = evaluateModelProfiles([
      "frame_interpolation\\rife47.pth"
    ]);
    const rife = profiles.find((profile) => profile.id === "rife");

    expect(rife?.category).toBe("interpolation");
    expect(rife?.available).toBe(true);
  });

  it("uses concrete file URLs for scanned model downloads", () => {
    const pageLinks = evaluateModelProfiles([])
      .flatMap((profile) => profile.components)
      .map((component) => component.installGuide?.downloadUrl)
      .filter((url): url is string => Boolean(url && /\/tree\/|\/releases\/tag\//u.test(url)));

    expect(pageLinks).toEqual([]);
  });

  it("requires all five FlashVSR weights", () => {
    const incomplete = evaluateModelProfiles([
      "FlashVSR\\FlashVSR1_1.safetensors"
    ]);
    const complete = evaluateModelProfiles([
      "FlashVSR\\FlashVSR1_1.safetensors",
      "FlashVSR\\Wan2.1_VAE.safetensors",
      "FlashVSR\\LQ_proj_in.safetensors",
      "FlashVSR\\TCDecoder.safetensors",
      "FlashVSR\\Prompt.safetensors"
    ]);

    expect(incomplete.find((profile) => profile.id === "flashvsr")?.available).toBe(false);
    expect(complete.find((profile) => profile.id === "flashvsr")?.available).toBe(true);

    const upstreamNames = evaluateModelProfiles([
      "FlashVSR\\Wan2_1-T2V-1.1_3B_FlashVSR_fp32.safetensors",
      "FlashVSR\\Wan2.1_VAE.safetensors",
      "FlashVSR\\Wan2_1_FlashVSR_LQ_proj_model_bf16.safetensors",
      "FlashVSR\\Wan2_1_FlashVSR_TCDecoder_fp32.safetensors",
      "FlashVSR\\Prompt.safetensors"
    ]);
    expect(upstreamNames.find((profile) => profile.id === "flashvsr")?.available).toBe(true);
  });

  it("requires the selected Sulphur 2 GGUF split-component runtime set", () => {
    const incomplete = evaluateModelProfiles([
      "checkpoints\\sulphur_dev_fp8mixed.safetensors"
    ]);
    const complete = evaluateModelProfiles([
      "unet\\sulphur_dev-Q3_K_M.gguf",
      "text_encoders\\gemma_3_12B_it_fp4_mixed.safetensors",
      "text_encoders\\ltx-2-3-22b-text_encoder.safetensors",
      "vae\\ltx-2-3-22b-VAE.safetensors",
      "checkpoints\\ltx-2-3-22b-audio_vae.safetensors",
      "loras\\ltx-2.3-22b-distilled-lora-1.1_fro90_ceil72_condsafe.safetensors",
      "latent_upscale_models\\ltx-2-spatial-upscaler-x2-1.0.safetensors"
    ]);

    expect(incomplete.find((profile) => profile.id === "sulphur2")?.available).toBe(false);
    expect(complete.find((profile) => profile.id === "sulphur2")?.available).toBe(true);
  });

  it("does not require a distill LoRA for the distilled Q2 deployment", () => {
    const profiles = evaluateModelProfiles([
      "unet\\sulphur-2-distilled-Q2_K.gguf",
      "text_encoders\\gemma_3_12B_it_fp4_mixed.safetensors",
      "text_encoders\\ltx-2-3-22b-text_encoder.safetensors",
      "vae\\ltx-2-3-22b-VAE.safetensors",
      "checkpoints\\ltx-2-3-22b-audio_vae.safetensors",
      "latent_upscale_models\\ltx-2-spatial-upscaler-x2-1.0.safetensors"
    ], "q2_distilled");

    expect(profiles.find((profile) => profile.id === "sulphur2")?.available).toBe(true);
    expect(
      profiles.find((profile) => profile.id === "sulphur2")?.components
        .some((component) => component.label.includes("LoRA"))
    ).toBe(false);
  });

  it("reports the Hunyuan 1080p SR pair", () => {
    const profiles = evaluateModelProfiles([
      "unet\\hunyuanvideo1.5_720p_i2v_fp16.safetensors",
      "vae\\hunyuanvideo15_vae_fp16.safetensors",
      "text_encoders\\qwen_2.5_vl_7b_fp8_scaled.safetensors",
      "text_encoders\\byt5_small_glyphxl_fp16.safetensors",
      "clip_vision\\sigclip_vision_patch14_384.safetensors",
      "unet\\hunyuanvideo1.5_1080p_sr_distilled_fp16.safetensors",
      "latent_upscale_models\\hunyuanvideo15_latent_upsampler_1080p.safetensors"
    ]);

    expect(profiles.find((profile) => profile.id === "hunyuan15_sr")).toBeUndefined();
  });

  it("provides a complete install guide for every component that can be missing", () => {
    const profiles = evaluateModelProfiles([]);
    const components = profiles.flatMap((profile) => profile.components);

    expect(components.length).toBeGreaterThan(0);
    for (const component of components) {
      expect(component.found).toBe(false);
      expect(component.installGuide.sourceLabel).not.toBe("");
      expect(component.installGuide.downloadUrl).toMatch(/^https:\/\//);
      expect(component.installGuide.targetSubdirectory).not.toBe("");
      expect(component.installGuide.recommendedFilename).not.toBe("");
    }
  });

  it("uses the official FLUX.2 Klein FP8 checkpoint URL", () => {
    const profile = evaluateModelProfiles([]).find((item) => item.id === "flux2-klein-4b");
    const component = profile?.components.find((item) => item.label.includes("扩散模型"));

    expect(component?.installGuide.downloadUrl).toBe(
      "https://huggingface.co/black-forest-labs/FLUX.2-klein-base-4b-fp8/resolve/main/flux-2-klein-base-4b-fp8.safetensors"
    );
  });

  it("uses the current FLUX.2 Klein Qwen3 4B text encoder URL", () => {
    const profile = evaluateModelProfiles([]).find((item) => item.id === "flux2-klein-4b");
    const component = profile?.components.find((item) => item.label.includes("文本编码器"));

    expect(component?.installGuide.downloadUrl).toBe(
      "https://huggingface.co/Comfy-Org/flux2-klein/resolve/main/split_files/text_encoders/qwen_3_4b.safetensors"
    );
  });

  it("keeps the Z-Image-Turbo control patch optional for text-only generation", () => {
    const profile = evaluateModelProfiles([
      "diffusion_models\\z_image_turbo_bf16.safetensors",
      "text_encoders\\qwen_3_4b.safetensors",
      "vae\\ae.safetensors"
    ], "q3_k_m", new Set()).find((item) => item.id === "z-image-turbo");

    expect(profile?.available).toBe(true);
    expect(profile?.components.find((item) => item.label.includes("Fun ControlNet"))).toMatchObject({
      found: false,
      optional: true
    });
    expect(profile?.runtimeMissingNodes).toEqual(
      expect.arrayContaining(["Canny", "ModelPatchLoader", "ZImageFunControlnet"])
    );
  });

  it("recognizes the HiDream-O1 Full checkpoint and native runtime contract", () => {
    const profile = evaluateModelProfiles([
      "checkpoints\\hidream_o1_image_fp8_scaled.safetensors"
    ], "q3_k_m", new Set()).find((item) => item.id === "hidream-o1-image");

    expect(profile?.available).toBe(true);
    expect(profile?.components.find((item) => item.label.includes("HiDream-O1-Image"))).toMatchObject({
      found: true,
      matches: ["checkpoints/hidream_o1_image_fp8_scaled.safetensors"]
    });
    expect(profile?.runtimeMissingNodes).toEqual(
      expect.arrayContaining([...hidreamO1RequiredNodeTypes])
    );
  });

  it("recognizes the OmniGen2 native model files and runtime contract", () => {
    const profile = evaluateModelProfiles([
      "diffusion_models\\omnigen2_fp16.safetensors",
      "text_encoders\\qwen_2.5_vl_fp16.safetensors",
      "vae\\ae.safetensors"
    ], "q3_k_m", new Set()).find((item) => item.id === "omnigen2");

    expect(profile?.available).toBe(true);
    expect(profile?.components.map((item) => item.found)).toEqual([true, true, true]);
    expect(profile?.runtimeMissingNodes).toEqual(
      expect.arrayContaining([...omnigen2RequiredNodeTypes])
    );
  });
});

describe("download proxy settings", () => {
  it("selects the official Windows CUDA llama-server assets", () => {
    expect(selectLlamaServerReleaseAssets({
      assets: [
        {
          name: "llama-b10299-bin-win-cuda-13.3-x64.zip",
          browser_download_url: "https://example.test/13-binary.zip"
        },
        {
          name: "cudart-llama-bin-win-cuda-13.3-x64.zip",
          browser_download_url: "https://example.test/13-cudart.zip"
        },
        {
          name: "llama-b10299-bin-win-cuda-12.4-x64.zip",
          browser_download_url: "https://example.test/12-binary.zip"
        },
        {
          name: "cudart-llama-bin-win-cuda-12.4-x64.zip",
          browser_download_url: "https://example.test/12-cudart.zip"
        }
      ]
    })).toEqual({
      variant: "12.4",
      binaryUrl: "https://example.test/12-binary.zip",
      cudartUrl: "https://example.test/12-cudart.zip"
    });
  });

  it("falls back to the official Windows CUDA 13.3 assets", () => {
    expect(selectLlamaServerReleaseAssets({
      assets: [
        {
          name: "llama-b10299-bin-win-cuda-13.3-x64.zip",
          browser_download_url: "https://example.test/13-binary.zip"
        },
        {
          name: "cudart-llama-bin-win-cuda-13.3-x64.zip",
          browser_download_url: "https://example.test/13-cudart.zip"
        }
      ]
    })).toEqual({
      variant: "13.3",
      binaryUrl: "https://example.test/13-binary.zip",
      cudartUrl: "https://example.test/13-cudart.zip"
    });
  });

  it("normalizes a host and port to an HTTP proxy URL", () => {
    expect(normalizeProxyUrl("127.0.0.1:7890")).toBe("http://127.0.0.1:7890");
  });

  it("accepts common HTTP and SOCKS proxy schemes", () => {
    expect(normalizeProxyUrl("https://proxy.example:8443")).toBe(
      "https://proxy.example:8443"
    );
    expect(normalizeProxyUrl("socks5://127.0.0.1:1080")).toBe(
      "socks5://127.0.0.1:1080"
    );
  });

  it("rejects unsupported proxy protocols", () => {
    expect(() => normalizeProxyUrl("file:///tmp/proxy")).toThrow("不支持");
  });
});
