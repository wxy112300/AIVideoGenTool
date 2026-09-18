import { describe, expect, it } from "vitest";
import { adaptH3AvAsset } from "../src/core/h3-av-adapters.js";
import {
  buildH3AvReferenceIndex,
  classifyH3AvInventory,
  planH3AvGc
} from "../src/core/h3-av-inventory.js";
import { validateH3AvLatentAsset } from "../src/core/h3-av-asset.js";
import type { H3AvLatentAsset, HistoryFile } from "../src/types.js";

const outputFile = (subfolder: string, filename: string): HistoryFile => ({
  subfolder,
  filename,
  type: "output",
  format: "safetensors"
});

function producer(legacyUnverified = false) {
  return {
    workflowId: "managed.json",
    workflowRevision: "managed-v38-api-v1",
    producerNodeId: "LocalVideoStudioH3ContinuumManagedReceipt",
    producerNodeVersion: "0.1.0",
    executionModelId: "minimax_h3_continuum",
    diffusionModelFilename: "minimax_h3_fl2va_pruned_int8_convrot.safetensors",
    textEncoderFilename: "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
    videoVaeFilename: "h3_video_vae.safetensors",
    audioVaeFilename: "minimax_h3_audio_vae_fp32.safetensors",
    loraFilenames: [],
    width: 1280,
    height: 736,
    fps: 24 as const,
    frameCount: 22,
    ...(legacyUnverified ? { legacyUnverified: true } : {})
  };
}

function managedAsset(assetId = "h3av_abcdefgh", payloadSha256 = "a".repeat(64)): H3AvLatentAsset {
  return {
    schemaVersion: 1,
    assetId,
    storageKind: "continuum-run-chunk",
    ownerPath: outputFile("h3_continuum/runs/run-1/revisions/rev-1/chunks", `${assetId}.safetensors`),
    aliasPaths: [outputFile("h3-native-av", `${assetId}.safetensors`)],
    aliasMode: "hardlink",
    payloadBytes: 100,
    payloadSha256,
    videoTensorSha256: "b".repeat(64),
    audioTensorSha256: "c".repeat(64),
    videoShape: [1, 24, 7, 46, 80],
    videoDtype: "F16",
    audioShape: [1, 32, 2, 37],
    audioDtype: "F16",
    width: 1280,
    height: 736,
    fps: 24,
    frameCount: 22,
    producer: producer(),
    capabilities: ["continuum-managed-chunk"],
    continuumChunk: {
      projectId: "project-1",
      runName: "run-1",
      runStorageRoot: outputFile("h3_continuum/runs/run-1/revisions/rev-1", "manifest.json"),
      revisionId: "rev-1",
      manifest: outputFile("h3_continuum/runs/run-1/revisions/rev-1", "manifest.json"),
      recordFilename: `${assetId}.safetensors`,
      logicalChunkIndex: 1,
      physicalGroupStart: 1,
      physicalGroupEnd: 1,
      accepted: true,
      reused: false
    },
    createdAt: "2026-09-18T00:00:00.000Z"
  };
}

describe("H3 AV adapters and inventory", () => {
  it("keeps managed owner and consumer protocol separate", () => {
    const asset = managedAsset();
    expect(validateH3AvLatentAsset(asset)).toBeNull();
    const managed = adaptH3AvAsset(asset, "managed-continuum");
    expect(managed.payloadPath).toEqual(asset.ownerPath);
    expect(managed.officialRunStorage).toBe(true);
    expect(() => adaptH3AvAsset(asset, "native-joint-av")).toThrow("native-joint-av");
    expect(() => adaptH3AvAsset(asset, "motion-context")).toThrow("motion-context");
    expect(() => adaptH3AvAsset(asset, "legacy-continuum")).toThrow("continuum-bootstrap");
  });

  it("builds reverse references and classifies legacy/duplicate/missing/corrupt files", () => {
    const first = managedAsset();
    const second = managedAsset("h3av_ijklmnop", first.payloadSha256);
    const legacy: H3AvLatentAsset = {
      ...first,
      assetId: "h3av_legacy1",
      storageKind: "legacy-joint-av",
      ownerPath: outputFile("h3-native-av", "legacy.safetensors"),
      aliasPaths: undefined,
      aliasMode: undefined,
      capabilities: ["native-av", "continuum-bootstrap"],
      continuumChunk: undefined,
      producer: producer(true)
    };
    expect(validateH3AvLatentAsset(legacy)).toBeNull();
    const references = buildH3AvReferenceIndex([
      { referenceId: "history:asset:version", asset: first },
      { referenceId: "queue:task:chunk:1", assetId: first.assetId }
    ], "2026-09-18T00:00:00.000Z");
    expect(references.byAssetId[first.assetId]).toEqual(["history:asset:version", "queue:task:chunk:1"]);
    const result = classifyH3AvInventory([
      { referenceId: "first", path: first.ownerPath, asset: first, present: true, payloadSha256: first.payloadSha256 },
      { referenceId: "second", path: second.ownerPath, asset: second, present: true, payloadSha256: second.payloadSha256 },
      { referenceId: "legacy", path: legacy.ownerPath, asset: undefined, present: true, legacy: true },
      { referenceId: "missing", path: outputFile("h3-native-av", "missing.safetensors"), present: false },
      { referenceId: "corrupt", path: first.ownerPath, asset: first, present: true, validationError: "sha mismatch" }
    ], references);
    expect(result.map((item) => item.status)).toEqual([
      "duplicate-tensor",
      "duplicate-tensor",
      "legacy-unverified",
      "missing",
      "corrupt"
    ]);
    expect(result[0]?.referencedBy).toContain("history:asset:version");
  });

  it("only produces a destructive GC decision when the explicit policy allows it", () => {
    const asset = managedAsset();
    const owner = planH3AvGc(asset, "owner", {
      unselectedTake: true,
      allowUnselectedTakeLatentDeletion: true
    });
    expect(owner.eligible).toBe(false);
    expect(owner.reasons.join(" ")).toContain("Run Storage owner");
    const alias = planH3AvGc(asset, "alias", {
      allowAliasDeletion: true
    });
    expect(alias.eligible).toBe(true);
    const referenced = planH3AvGc(asset, "alias", {
      allowAliasDeletion: true,
      referencedBy: ["history:asset:version"]
    });
    expect(referenced.eligible).toBe(false);
  });
});
