import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { H3NativeSidecarTransport } from "../electron/services/h3-native-provider.js";
import { H3NativeSidecarProvider } from "../electron/services/h3-native-provider.js";
import type { NativeAvArtifactCommitRequest } from "../electron/services/native-av-artifact.js";
import { NativeAvArtifactService } from "../electron/services/native-av-artifact.js";
import { nativeAvArtifactFileSystem } from "../electron/services/native-av-artifact-file-system.js";

function payload(): Uint8Array {
  const videoBytes = 384;
  const audioBytes = 2048;
  const header = Buffer.from(JSON.stringify({
    video: { dtype: "BF16", shape: [1, 24, 2, 2, 2], data_offsets: [0, videoBytes] },
    audio: { dtype: "F32", shape: [1, 32, 2, 8], data_offsets: [videoBytes, videoBytes + audioBytes] }
  }), "utf8");
  const length = Buffer.alloc(8);
  length.writeBigUInt64LE(BigInt(header.byteLength));
  return Buffer.concat([length, header, Buffer.alloc(videoBytes + audioBytes)]);
}

function commitRequest(
  outputDirectory: string,
  artifactId: string,
  role: NativeAvArtifactCommitRequest["role"]
): NativeAvArtifactCommitRequest {
  return {
    outputDirectory,
    artifactId,
    role,
    lineageId: "lineage-001",
    executionModelId: "minimax_h3_fl2va",
    providerId: "h3-native-sidecar",
    providerRevision: "provider-1",
    producerNodeId: "legacy-sidecar",
    producerNodeVersion: "test",
    workflowId: "legacy-sidecar-workflow",
    diffusionModelFilename: "diffusion.safetensors",
    textEncoderFilename: "text-encoder.safetensors",
    videoVaeFilename: "video-vae.safetensors",
    audioVaeFilename: "audio-vae.safetensors",
    width: 32,
    height: 32,
    frameCount: 5,
    contextFrames: 0,
    workflowRevision: "workflow-1",
    sourceTaskId: "task-1",
    payload: payload()
  };
}

function provider(): H3NativeSidecarProvider {
  return new H3NativeSidecarProvider({
    artifactService: new NativeAvArtifactService({ fileSystem: nativeAvArtifactFileSystem }),
    resolveVideoOutputDirectory: async () => ""
  });
}

describe("H3NativeSidecarProvider", () => {
  it("reports an uninstalled sidecar instead of claiming high-resolution readiness", async () => {
    const service = provider();
    const environment = await service.inspectEnvironment();
    expect(environment).toMatchObject({
      providerId: "h3-native-sidecar",
      state: "stopped",
      verified: false,
      reasonCode: "provider-not-installed",
      providerVersion: "未安装（上游 release manifest v1.0.0）",
      providerRevision: "未绑定（审计 HEAD afac23294d05）",
      providerSource: "X-MinimaxH3 Native Engine（外部 sidecar；非应用内置）",
      providerInstallGuideUrl: "https://github.com/PullMyBoots/X-MinimaxH3/blob/afac23294d05a9807a9a1b80a0a25e90c4a86b42/README.zh-CN.md",
      providerInstallable: false
    });
    expect(environment.providerInstallNote).toContain("没有已授权");
    const preflight = await service.preflight({
      taskId: "task-1",
      modelId: "minimax_h3_fl2va",
      providerId: "h3-native-sidecar",
      requestedResolution: 1080,
      firstPassResolution: 768,
      profileId: "test-profile",
      artifactPolicy: "save-first-and-final"
    });
    expect(preflight).toMatchObject({ ok: false, reasonCode: "provider-not-installed" });
  });

  it("rejects second sampling without an explicit artifact before transport execution", async () => {
    const service = provider();
    await expect(service.executeStage({
      stage: "second-sampling",
      task: {
        taskId: "task-1",
        modelId: "minimax_h3_fl2va",
        providerId: "h3-native-sidecar",
        requestedResolution: 1080,
        firstPassResolution: 768,
        profileId: "test-profile",
        artifactPolicy: "save-first-and-final"
      },
      signal: new AbortController().signal
    })).rejects.toMatchObject({ reasonCode: "artifact-missing" });
  });

  it("requires stage-compatible input and validates the committed output role", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "h3-native-provider-"));
    try {
      const artifactService = new NativeAvArtifactService({ fileSystem: nativeAvArtifactFileSystem });
      const first = await artifactService.commit(commitRequest(root, "artifact-001", "first-pass-clean-av"));
      const final = await artifactService.commit(commitRequest(root, "artifact-002", "final-clean-av"));
      expect(first.status).toBe("available");
      expect(final.status).toBe("available");

      const transport: H3NativeSidecarTransport = {
        inspectEnvironment: vi.fn(async () => ({
          providerId: "h3-native-sidecar",
          state: "ready",
          verified: true,
          profileId: "test-profile",
          supportedResolutions: [1080, 1440]
        })),
        preflight: vi.fn(async () => ({ ok: true })),
        executeStage: vi.fn(async () => ({ artifact: final.artifact })),
        recover: vi.fn(async () => ({ artifact: final.artifact })),
        releaseRuntime: vi.fn(async () => undefined)
      };
      const service = new H3NativeSidecarProvider({
        artifactService,
        resolveVideoOutputDirectory: async () => root,
        transport
      });
      const task = {
        taskId: "task-1",
        modelId: "minimax_h3_fl2va",
        providerId: "h3-native-sidecar" as const,
        requestedResolution: 1080 as const,
        firstPassResolution: 768 as const,
        profileId: "test-profile",
        artifactPolicy: "save-first-and-final" as const,
        inputArtifact: first.artifact
      };

      const result = await service.executeStage({
        stage: "second-sampling",
        task,
        signal: new AbortController().signal
      });
      expect(result.artifact?.artifactId).toBe("artifact-002");
      expect(transport.executeStage).toHaveBeenCalledTimes(1);

      await expect(service.executeStage({
        stage: "second-sampling",
        task: { ...task, inputArtifact: final.artifact },
        signal: new AbortController().signal
      })).rejects.toMatchObject({ reasonCode: "artifact-incompatible" });
      expect(transport.executeStage).toHaveBeenCalledTimes(1);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
