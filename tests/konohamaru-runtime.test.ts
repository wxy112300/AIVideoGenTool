import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import { createNativeTranslator } from "../electron/ui-translator";
import { scanCustomNodes } from "../electron/services/dependency-scanner";
import { assertKonohamaruExecutionReady } from "../electron/services/comfy-ui";
import type { UpscaleQueueTask } from "../src/types";
import { KONOHAMARU_MODEL_ID } from "../src/core/konohamaru-dlss5";
import {
  KONOHAMARU_NEURAL_UPSTREAM_DOWNLOAD_URL,
  KONOHAMARU_NEURAL_UPSTREAM_SHA256,
  KONOHAMARU_NODE_DIRECTORY,
  KONOHAMARU_NODE_ID,
  KONOHAMARU_VIDEO2DLSSNR_DOWNLOAD_URL,
  KONOHAMARU_VIDEO2DLSSNR_ARCHIVE_BYTES
} from "../src/core/catalog/dependencies/konohamaru";
import {
  patchKonohamaruNeuralUpstreamSource,
  patchKonohamaruPathsSource,
  patchKonohamaruProcessorSource,
  patchKonohamaruRootSource,
  patchKonohamaruRuntimeSource,
  konohamaruNeuralUpstreamPatchFiles
} from "../src/infrastructure/dependency-node-adapters";
import {
  installKonohamaruNeuralUpstreamRuntime,
  installKonohamaruVideo2dlssnrRuntime,
  konohamaruNeuralUpstreamAddonPath,
  konohamaruNeuralUpstreamRuntimeProblems,
  konohamaruVideo2dlssnrRuntimeDirectory,
  konohamaruVideo2dlssnrRuntimeProblems
} from "../electron/services/konohamaru-runtime";
import { verifyKonohamaruRuntimeArtifacts } from "../electron/services/dependency-installer";
import {
  KONOHAMARU_RUNTIME_FILES,
  KONOHAMARU_VIDEO2DLSSNR_RUNTIME_FILES
} from "../src/core/catalog/dependencies/konohamaru";
import { konohamaruVideo2dlssnrSource } from "../src/infrastructure/konohamaru-video2dlssnr";

const temporaryDirectories: string[] = [];

describe("Konohamaru runtime localization", () => {
  it.each([
    ["en-US", "SHA-256 check failed", "Downloading neural-upstream"],
    ["zh-TW", "SHA-256 驗證失敗", "正在下載 neural-upstream"],
    ["zh-CN", "SHA-256 校验失败", "正在下载 neural-upstream"]
  ] as const)("keeps existing addons intact after a %s checksum failure", async (uiLocale, failure, stage) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "konohamaru-locale-hash-"));
    temporaryDirectories.push(root);
    const addon = konohamaruNeuralUpstreamAddonPath(root);
    const legacy = path.join(path.dirname(addon), "renodx-dlss5.addon64");
    await fs.mkdir(path.dirname(addon), { recursive: true });
    await fs.writeFile(addon, "existing addon");
    await fs.writeFile(legacy, "existing legacy addon");
    let ran = false;
    const logs: string[] = [];
    const result = await installKonohamaruNeuralUpstreamRuntime(
      { ...createDefaultState().settings, uiLocale }, root, root, {
        platform: "win32", downloadEnvironment: () => ({}), findExecutable: async () => "curl.exe",
        runLoggedProcess: async () => { ran = true; return ""; },
        renameWithRetry: fs.rename, retryableRenameError: () => false, randomId: () => "locale-test",
        downloadFile: async (_url, destination) => {
          await fs.writeFile(destination, "invalid checksum");
          return KONOHAMARU_NEURAL_UPSTREAM_DOWNLOAD_URL;
        }
      }, line => logs.push(line)
    );
    expect(result.ok).toBe(false);
    expect(result.message).toContain(failure);
    expect(result.message).toContain(KONOHAMARU_NEURAL_UPSTREAM_SHA256);
    expect(logs.join("\n")).toContain(stage);
    expect(await fs.readFile(addon, "utf8")).toBe("existing addon");
    expect(await fs.readFile(legacy, "utf8")).toBe("existing legacy addon");
    expect((await fs.readdir(path.dirname(addon))).sort()).toEqual(["nvngx.dll.addon64", "renodx-dlss5.addon64"]);
    expect(ran).toBe(false);
  });

  it.each([
    ["en-US", "video2dlssnr archive size check failed: received 1 bytes, expected "],
    ["zh-TW", "video2dlssnr 封存檔大小驗證失敗：實際 1 bytes，要求 "]
  ] as const)("rejects a truncated archive in %s before extraction", async (uiLocale, message) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "konohamaru-locale-size-"));
    temporaryDirectories.push(root);
    const runtime = konohamaruVideo2dlssnrRuntimeDirectory(root);
    await fs.mkdir(runtime, { recursive: true });
    const userFile = path.join(runtime, "使用者資料.txt");
    await fs.writeFile(userFile, "user data");
    let ran = false;
    const result = await installKonohamaruVideo2dlssnrRuntime(
      { ...createDefaultState().settings, uiLocale }, root, root, {
        platform: "win32", downloadEnvironment: () => ({}), findExecutable: async () => "curl.exe",
        runLoggedProcess: async () => { ran = true; return ""; },
        renameWithRetry: fs.rename, retryableRenameError: () => false, randomId: () => "locale-test",
        downloadFile: async (_url, destination) => {
          await fs.writeFile(destination, "x");
          return KONOHAMARU_VIDEO2DLSSNR_DOWNLOAD_URL;
        }
      }
    );
    expect(result.ok).toBe(false);
    expect(result.message).toContain(message + KONOHAMARU_VIDEO2DLSSNR_ARCHIVE_BYTES);
    expect(result.log).toContain(result.message);
    expect(await fs.readFile(userFile, "utf8")).toBe("user data");
    expect((await fs.readdir(root)).some(name => name.startsWith(".konohamaru-video2dlssnr-staging-"))).toBe(false);
    expect(ran).toBe(false);
  });

  it.each([
    ["en-US", "Konohamaru DLSS5 runtime failed the integrity recheck:", " (missing)", "The Konohamaru DLSS5 task has no immutable provider/options snapshot. Execution refused."],
    ["zh-TW", "Konohamaru DLSS5 runtime 未通過完整性複檢：", "（缺少）", "Konohamaru DLSS5 任務缺少不可變的 provider/options 快照，已拒絕執行。"]
  ] as const)("passes %s into scan and execution guards", async (uiLocale, prefix, missing, execution) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "konohamaru-locale-scan-"));
    temporaryDirectories.push(root);
    const node = path.join(root, "custom_nodes", KONOHAMARU_NODE_DIRECTORY);
    await fs.mkdir(node, { recursive: true });
    const settings = { ...createDefaultState().settings, uiLocale };
    const problems = await konohamaruVideo2dlssnrRuntimeProblems(node, createNativeTranslator(uiLocale).t);
    expect(problems[0]).toContain(missing);
    const statuses = await scanCustomNodes(root, settings, "", "", "", {}, { nodeIds: null });
    expect(statuses.find(item => item.id === KONOHAMARU_NODE_ID)?.loadError).toContain(prefix);
    await expect(assertKonohamaruExecutionReady({ modelId: KONOHAMARU_MODEL_ID } as UpscaleQueueTask, settings, {}))
      .rejects.toThrow(execution);
  });
});

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    fs.rm(directory, { recursive: true, force: true })
  ));
});

describe("Konohamaru neural-upstream source adapter", () => {
  it("switches the Windows and Wine host addon path idempotently", () => {
    const source = [
      "from pathlib import Path",
      "ADDON = HOST_DIR / \"renodx-dlss5.addon64\"",
      "for name in (\"nvngx.dll\", \"renodx-dlss5.addon64\", \"nvngx_dlssnr.dll\", \"_nvngx.dll\"):"
    ].join("\n");
    const patched = patchKonohamaruPathsSource(source);
    expect(patched).toContain("# Local Video Studio neural-upstream runtime compatibility layer");
    expect(patched).toContain('ADDON = HOST_DIR / "nvngx.dll.addon64"');
    expect(patched).toContain('for name in ("nvngx.dll", "nvngx.dll.addon64", "nvngx_dlssnr.dll", "_nvngx.dll"):');
    expect(patchKonohamaruPathsSource(patched)).toBe(patched);
  });

  it("accepts upstream render-resolution evidence while preserving legacy diagnostics", () => {
    const source = [
      '"release": "RenoDX DLSS5 runtime (unlocked)",',
      'f"RenoDX add-on: {runtime_bundle.get(\'addon\', {}).get(\'path\', \'unavailable\')}",',
      '        RUNTIME / "renodx-dlss5.addon64",',
      '"Move host files (nvngx.dll, dxgi.dll, renodx-dlss5.addon64, ReShade.ini, "',
      "def verify_feature_18(",
      "    worker_logs: list[str], reshade_log: str | None = None",
      ") -> dict[str, object]:",
      "    pass",
      "@dataclass",
      "class PreparedRuntime:",
      "    pass"
    ].join("\n");
    const patched = patchKonohamaruRuntimeSource(source);
    expect(patched).toContain('"release": "neural-upstream v0.3.0 add-on (app-managed)",');
    expect(patched).toContain("DLSS5 add-on:");
    expect(patched).toContain("SNIPPET CreateFeature\\(18");
    expect(patched).toContain('"nr_enhancement_active": upstream_verified or legacy_feature_evaluated,');
    expect(patched).not.toContain('"release": "RenoDX DLSS5 runtime (unlocked)",');
    expect(patchKonohamaruRuntimeSource(patched)).toBe(patched);
  });

  it("records the new pipeline and addon inventory in video reports", () => {
    const source = [
      "            else:",
      '                frame_count = int(metadata["frames"])',
      "                if frame_count <= 0:",
      '                    exact = ffmpeg.probe_video(source, count_mode="exact")',
      '                    frame_count = int(exact["frames"])',
      '                    metadata["frames"] = frame_count',
      '                    metadata["frame_count_source"] = exact["frame_count_source"]',
      '                "pipeline": "renodx-dlssnr-feature18",',
      '                "nr_native_fallback": nr_native_fallback,',
      '                    f"{HOST_DIR.name}/renodx-dlss5.addon64",'
    ].join("\n");
    const patched = patchKonohamaruProcessorSource(source);
    expect(patched).toContain("# Local Video Studio full-video frame-count compatibility layer");
    expect(patched).toContain("expected_frame_count > max(1.5, frame_count * 1.5)");
    expect(patched).toContain('"pipeline": "neural-upstream-dlssnr-feature18",');
    expect(patched).toContain('"nr_enhancement_active": bool(feature_evidence["nr_enhancement_active"]),');
    expect(patched).toContain('f"{HOST_DIR.name}/nvngx.dll.addon64"');
    expect(patchKonohamaruProcessorSource(patched)).toBe(patched);
  });

  it("repairs metadata frame under-counting in the frame interpolation processor", () => {
    const source = [
      '    source_rate = Fraction(metadata["rate"])',
      '    cfr = bool(metadata.get("cfr", True))',
      '    frames = int(metadata["frames"])',
      "    if frames <= 0:",
      '        frames = int(ffmpeg.probe_video(source, count_mode="exact")["frames"])'
    ].join("\n");
    const patched = patchKonohamaruNeuralUpstreamSource(
      source,
      "dlss_engine/frame_interpolation/processor.py"
    );

    expect(konohamaruNeuralUpstreamPatchFiles).toContain(
      "dlss_engine/frame_interpolation/processor.py"
    );
    expect(patched).toContain("# Local Video Studio full-video frame-count compatibility layer");
    expect(patched).toContain("expected_frame_count > max(1.5, frames * 1.5)");
    expect(patched).toContain('metadata["frame_count_source"] = exact["frame_count_source"]');
    expect(patchKonohamaruNeuralUpstreamSource(
      patched,
      "dlss_engine/frame_interpolation/processor.py"
    )).toBe(patched);
  });

  it("lets strict video/image guards accept verified upstream enhancement", () => {
    const source = [
      "UPSCALE_FACTORS = {mode[\"label\"]: factor for factor, mode in UPSCALING_MODES.items()}\n",
      'if require_neural_upscaling and options.upscaling_factor > 1.0 and not report["nr_upscaling_active"]:',
      'if require_neural_upscaling and factor > 1.0 and not evidence["nr_upscaling_active"]:',
      '            "nr_upscaling_active": bool(evidence["nr_upscaling_active"]),',
      ""
    ].join("\n");
    const patched = patchKonohamaruRootSource(source);
    expect(patched).toContain("def _lvs_neural_rendering_active(report):");
    expect(patched).toContain("not _lvs_neural_rendering_active(report)");
    expect(patched).toContain("evidence.get(\"nr_enhancement_active\")");
    expect(patched).toContain('"neural_pipeline": evidence.get("neural_pipeline", "unknown"),');
    expect(patchKonohamaruRootSource(patched)).toBe(patched);
  });

  it("fails readiness for a wrong hash or an active legacy addon", async () => {
    const nodeDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-konohamaru-runtime-"));
    temporaryDirectories.push(nodeDirectory);
    const hostDirectory = path.join(nodeDirectory, "bin", "runtime", "host");
    await fs.mkdir(hostDirectory, { recursive: true });
    await fs.writeFile(konohamaruNeuralUpstreamAddonPath(nodeDirectory), "wrong addon", "utf8");
    await fs.writeFile(path.join(hostDirectory, "renodx-dlss5.addon64"), "legacy addon", "utf8");

    const problems = await konohamaruNeuralUpstreamRuntimeProblems(nodeDirectory);
    expect(problems).toEqual(expect.arrayContaining([
      expect.stringContaining(`SHA-256=`),
      expect.stringContaining("旧 addon 仍处于 active host")
    ]));
    expect(KONOHAMARU_NEURAL_UPSTREAM_SHA256).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("keeps the upstream addon out of the node repository's Git LFS gate", async () => {
    const nodeDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-konohamaru-lfs-"));
    temporaryDirectories.push(nodeDirectory);
    for (const relativeFilename of KONOHAMARU_RUNTIME_FILES) {
      if (relativeFilename.endsWith("nvngx.dll.addon64")) continue;
      const filename = path.join(nodeDirectory, ...relativeFilename.split("/"));
      await fs.mkdir(path.dirname(filename), { recursive: true });
      await fs.writeFile(filename, "hydrated runtime", "utf8");
    }
    await expect(verifyKonohamaruRuntimeArtifacts(nodeDirectory)).resolves.toBeUndefined();
  });

  it("requires the official video2dlssnr runtime separately from the Git LFS node files", async () => {
    const nodeDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-konohamaru-video-runtime-"));
    temporaryDirectories.push(nodeDirectory);

    const problems = await konohamaruVideo2dlssnrRuntimeProblems(nodeDirectory);
    expect(problems).toHaveLength(KONOHAMARU_VIDEO2DLSSNR_RUNTIME_FILES.length);
    expect(problems).toEqual(expect.arrayContaining([
      expect.stringContaining("bin/runtime/video2dlssnr/video2dlssnr.exe（缺失）")
    ]));
    expect(konohamaruVideo2dlssnrRuntimeDirectory(nodeDirectory)).toContain(
      path.join("bin", "runtime", "video2dlssnr")
    );
    expect(konohamaruVideo2dlssnrSource).toContain("--nr-video");
    expect(konohamaruVideo2dlssnrSource).toContain("full video frames preserved");
  });

  it("does not activate a downloaded addon when its checksum is wrong", async () => {
    const nodeDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-konohamaru-download-"));
    temporaryDirectories.push(nodeDirectory);
    const settings = createDefaultState().settings;
    const logs: string[] = [];
    const result = await installKonohamaruNeuralUpstreamRuntime(
      settings,
      nodeDirectory,
      nodeDirectory,
      {
        platform: "win32",
        findExecutable: async () => "curl.exe",
        downloadEnvironment: () => ({}),
        runLoggedProcess: async () => "",
        renameWithRetry: async (source, target) => fs.rename(source, target),
        retryableRenameError: () => false,
        downloadFile: async (_url, destination) => {
          await fs.mkdir(path.dirname(destination), { recursive: true });
          await fs.writeFile(destination, "wrong addon", "utf8");
          return KONOHAMARU_NEURAL_UPSTREAM_DOWNLOAD_URL;
        },
        randomId: () => "test"
      },
      (message) => logs.push(message)
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain("SHA-256 校验失败");
    expect(await fs.stat(konohamaruNeuralUpstreamAddonPath(nodeDirectory)).catch(() => null)).toBeNull();
    expect(logs.join("\n")).toContain("正在下载 neural-upstream");
  });
});

describe("Konohamaru patch dispatcher", () => {
  it("routes every catalogued file to a deterministic patch", () => {
    expect(() => patchKonohamaruNeuralUpstreamSource("", "unknown.py")).toThrow("未知的 Konohamaru");
  });
});
