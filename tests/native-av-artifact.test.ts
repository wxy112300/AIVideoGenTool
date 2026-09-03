import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { NativeAvArtifactFileSystemPort } from "../electron/ports/native-av-artifact-file-system.js";
import type { NativeAvArtifactCommitRequest } from "../electron/services/native-av-artifact.js";
import { NativeAvArtifactService } from "../electron/services/native-av-artifact.js";
import { nativeAvArtifactFileSystem } from "../electron/services/native-av-artifact-file-system.js";
import {
  H3_CONTINUATION_ARTIFACT_SUBFOLDER,
  continuationArtifactFilenames,
  validateNativeAvContinuationArtifact
} from "../src/core/h3-continuation-artifact.js";

function safetensorsPayload(
  videoShape = [1, 24, 2, 2, 2],
  audioShape = [1, 32, 2, 8]
): Uint8Array {
  const product = (shape: number[]) => shape.reduce((total, value) => total * value, 1);
  const videoBytes = product(videoShape) * 2;
  const audioBytes = product(audioShape) * 4;
  const header = Buffer.from(JSON.stringify({
    video: { dtype: "BF16", shape: videoShape, data_offsets: [0, videoBytes] },
    audio: { dtype: "F32", shape: audioShape, data_offsets: [videoBytes, videoBytes + audioBytes] }
  }), "utf8");
  const length = Buffer.alloc(8);
  length.writeBigUInt64LE(BigInt(header.byteLength));
  return Buffer.concat([length, header, Buffer.alloc(videoBytes + audioBytes)]);
}

function request(outputDirectory: string, payload = safetensorsPayload()): NativeAvArtifactCommitRequest {
  return {
    outputDirectory,
    artifactId: "artifact-001",
    role: "first-pass-clean-av",
    lineageId: "lineage-001",
    executionModelId: "minimax_h3_fl2va",
    providerId: "test-provider",
    providerRevision: "test-revision",
    producerNodeId: "LocalVideoStudioH3SaveJointAV",
    producerNodeVersion: "0.1.0",
    workflowId: "minimax_h3_fl2va_first_pass_av",
    diffusionModelFilename: "diffusion.safetensors",
    textEncoderFilename: "text-encoder.safetensors",
    videoVaeFilename: "video-vae.safetensors",
    audioVaeFilename: "audio-vae.safetensors",
    width: 32,
    height: 32,
    frameCount: 5,
    contextFrames: 0,
    workflowRevision: "workflow-1",
    sourceTaskId: "task-001",
    payload
  };
}

describe("NativeAvArtifactService", () => {
  it("commits a fixed-key safetensors pair and round-trips its manifest", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "native-av-artifact-"));
    try {
      const service = new NativeAvArtifactService({ fileSystem: nativeAvArtifactFileSystem });
      const committed = await service.commit(request(root));
      expect(committed.status).toBe("available");
      expect(committed.artifact?.payload.filename).toBe("h3av_artifact-001.safetensors");
      expect(committed.artifact?.manifest.subfolder).toBe(H3_CONTINUATION_ARTIFACT_SUBFOLDER);
      const artifact = committed.artifact!;
      const inspected = await service.inspect(artifact, root);
      expect(inspected.status).toBe("available");
      expect(inspected.payloadBytes).toBe(artifact.payloadBytes);
      expect(inspected.artifact?.videoShape).toEqual([1, 24, 2, 2, 2]);
      expect(inspected.artifact?.audioShape).toEqual([1, 32, 2, 8]);
      await expect(fs.stat(artifact.payload.absolutePath!)).resolves.toMatchObject({ isFile: expect.any(Function) });
      await expect(fs.stat(artifact.manifest.absolutePath!)).resolves.toMatchObject({ isFile: expect.any(Function) });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("fails closed for truncation, wrong keys, geometry mismatch, and tampering", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "native-av-artifact-"));
    try {
      const service = new NativeAvArtifactService({ fileSystem: nativeAvArtifactFileSystem });
      const truncated = await service.commit(request(root, new Uint8Array([1, 2, 3])));
      expect(truncated.status).toBe("save-failed");

      const wrongKeys = Buffer.from(JSON.stringify({ only: "not-a-joint-payload" }));
      const wrongKeysPayload = Buffer.concat([Buffer.alloc(8), wrongKeys]);
      const wrongKeysResult = await service.commit({ ...request(root), artifactId: "artifact-002", payload: wrongKeysPayload });
      expect(wrongKeysResult.status).toBe("save-failed");

      const mismatchedShape = await service.commit({
        ...request(root),
        artifactId: "artifact-003",
        payload: safetensorsPayload([1, 24, 2, 3, 2])
      });
      expect(mismatchedShape.status).toBe("save-failed");

      const committed = await service.commit({ ...request(root), artifactId: "artifact-004" });
      expect(committed.status).toBe("available");
      const metadataTampered = {
        ...committed.artifact!,
        providerRevision: "tampered-provider"
      };
      const metadataInspection = await service.inspect(metadataTampered, root);
      expect(metadataInspection.status).toBe("invalid");
      expect(metadataInspection.reason).toContain("引用与 manifest 不匹配");
      const payloadPath = committed.artifact!.payload.absolutePath!;
      const original = await fs.readFile(payloadPath);
      original[original.length - 1] ^= 0xff;
      await fs.writeFile(payloadPath, original);
      const inspected = await service.inspect(committed.artifact!, root);
      expect(inspected.status).toBe("invalid");
      expect(inspected.reason).toContain("SHA-256");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("rejects unsafe persisted references and does not overwrite a committed artifact", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "native-av-artifact-"));
    try {
      const service = new NativeAvArtifactService({ fileSystem: nativeAvArtifactFileSystem });
      const first = await service.commit(request(root));
      expect(first.status).toBe("available");
      const second = await service.commit(request(root));
      expect(second.status).toBe("save-failed");
      expect(second.reason).toContain("拒绝覆盖");

      const filenames = continuationArtifactFilenames("artifact-001");
      const unsafe = {
        ...first.artifact!,
        payload: {
          ...first.artifact!.payload,
          filename: `../${filenames.payload}`
        }
      };
      expect(validateNativeAvContinuationArtifact(unsafe)).toContain("文件引用");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("commits a Comfy output descriptor by streaming the produced file", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "native-av-produced-file-"));
    try {
      const producedDirectory = path.join(root, H3_CONTINUATION_ARTIFACT_SUBFOLDER);
      const producedFilename = "serializer-output.safetensors";
      const producedPath = path.join(producedDirectory, producedFilename);
      await fs.mkdir(producedDirectory, { recursive: true });
      await fs.writeFile(producedPath, safetensorsPayload());
      const { payload: _payload, ...metadata } = request(root);
      const streamingOnlyFileSystem: NativeAvArtifactFileSystemPort = {
        ...nativeAvArtifactFileSystem,
        async readFile(_filename: string): Promise<Uint8Array> {
          throw new Error("inspect/commitProducedFile 不应整块读取 safetensors payload");
        }
      };
      const service = new NativeAvArtifactService({ fileSystem: streamingOnlyFileSystem });
      const committed = await service.commitProducedFile({
        ...metadata,
        providerId: "comfyui",
        artifactId: "artifact-005",
        producedFile: {
          filename: producedFilename,
          subfolder: H3_CONTINUATION_ARTIFACT_SUBFOLDER,
          type: "output",
          format: "safetensors"
        }
      });
      expect(committed.status, JSON.stringify(committed)).toBe("available");
      expect(committed.artifact?.payload.filename).toBe("h3av_artifact-005.safetensors");
      expect(await fs.stat(producedPath)).toMatchObject({ isFile: expect.any(Function) });
      const inspection = await service.inspect(committed.artifact!, root);
      expect(inspection.status).toBe("available");
      expect(inspection.payloadBytes).toBeGreaterThan(0);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("rejects produced descriptors outside the managed output subfolder", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "native-av-produced-file-"));
    try {
      const { payload: _payload, ...metadata } = request(root);
      const service = new NativeAvArtifactService({ fileSystem: nativeAvArtifactFileSystem });
      await expect(service.commitProducedFile({
        ...metadata,
        artifactId: "artifact-006",
        producedFile: {
          filename: "serializer-output.safetensors",
          subfolder: "../outside",
          type: "output",
          format: "safetensors"
        }
      })).resolves.toMatchObject({ status: "save-failed" });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
