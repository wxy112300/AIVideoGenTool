import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import {
  KONOHAMARU_NEURAL_UPSTREAM_DOWNLOAD_URL,
  KONOHAMARU_NEURAL_UPSTREAM_SHA256
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
