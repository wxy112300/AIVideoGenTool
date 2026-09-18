import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ExtensionQueueTask, H3ContinuumReceipt, HistoryFile } from "../src/types.js";
import { createDefaultState } from "../src/core/defaults.js";
import { persistVideoHistoryResult } from "../electron/queue-history.js";
import {
  isH3ContinuumReceipt,
  safeH3OutputRelativePath,
  sequenceAfterManagedReceipt,
  validateContinuumAppend,
  validateContinuumSequence,
  validateH3AvLatentAsset,
  validateH3ContinuumReceipt
} from "../src/core/h3-av-asset.js";
import {
  type H3ContinuumManagedReceiptRaw,
  extractH3ContinuumManagedReceipt,
  validateH3ContinuumManagedReceipt
} from "../src/core/h3-continuum-managed-receipt.js";
import { validateH3ComfyWorkflow } from "../src/core/h3-workflow-contract.js";
import {
  isMiniMaxH3ContinuumManagedWorkflow,
  h3ContinuumModeForSource,
  h3ContinuumWorkflowPathForInput,
  continuumFirstFrameTask,
  continuumTimelinePromptForTask,
  renderWorkflow,
  validateApiWorkflow,
  workflowSupportsH3ContinuumManagedExtension
} from "../src/core/workflow.js";
import { H3ContinuumAssetRegistry } from "../electron/services/h3-continuum-asset-registry.js";
import { nativeAvArtifactFileSystem } from "../electron/services/native-av-artifact-file-system.js";
import { HistoryArtifactService } from "../electron/services/history-artifact-service.js";
import { NativeAvArtifactService } from "../electron/services/native-av-artifact.js";
import type { StateRepository } from "../electron/ports/state-repository.js";

const outputFile = (subfolder: string, filename: string, format: string): HistoryFile => ({
  subfolder,
  filename,
  type: "output",
  format
});

function continuumPayload(videoTemporalLatent: number): { payload: Buffer; frameCount: number } {
  const frameCount = ((videoTemporalLatent - 2) / 5) * 17 + 5;
  const audioTemporalLatent = Math.round((frameCount / 24) * 40);
  const videoBytes = 1 * 24 * videoTemporalLatent * 30 * 54 * 2;
  const audioBytes = 1 * 32 * 2 * audioTemporalLatent * 2;
  const header = Buffer.from(JSON.stringify({
    video: { dtype: "F16", shape: [1, 24, videoTemporalLatent, 30, 54], data_offsets: [0, videoBytes] },
    audio: { dtype: "F16", shape: [1, 32, 2, audioTemporalLatent], data_offsets: [videoBytes, videoBytes + audioBytes] }
  }), "utf8");
  const payload = Buffer.alloc(8 + header.byteLength + videoBytes + audioBytes);
  payload.writeBigUInt64LE(BigInt(header.byteLength), 0);
  header.copy(payload, 8);
  return { payload, frameCount };
}

function validReceipt(requestedChunks = 1, generatedChunk = requestedChunks): H3ContinuumReceipt {
  const chunkRecords = Array.from({ length: requestedChunks }, (_, index) => ({
    logicalChunkIndex: index + 1,
    recordFilename: `chunk-${index + 1}.safetensors`,
    payloadPath: outputFile(
      `h3_continuum/runs/run-1/revisions/rev-${generatedChunk}/chunks`,
      `chunk-${index + 1}.safetensors`,
      "safetensors"
    ),
    reused: index + 1 < generatedChunk,
    generated: index + 1 === generatedChunk
  }));
  return {
    schemaVersion: 1,
    projectId: "project-1",
    runName: "run-1",
    runStorageRoot: outputFile(
      `h3_continuum/runs/run-1/revisions/rev-${generatedChunk}`,
      "manifest.json",
      "json"
    ),
    revisionId: `rev-${generatedChunk}`,
    packageVersion: "3.8.2",
    runStorageSchemaVersion: 3,
    generationMode: "Review Each Chunk" as const,
    reviewAction: "Continue / Next" as const,
    runStorage: "Save + Auto Resume" as const,
    selectedSource: "run_storage" as const,
    freshFallback: false as const,
    requestedChunks,
    reusedCount: generatedChunk - 1,
    generatedCount: 1,
    reusedChunkIndices: chunkRecords.filter((record) => record.reused).map((record) => record.logicalChunkIndex),
    generatedChunkIndices: [generatedChunk],
    firstGeneratedChunk: generatedChunk,
    chunkRecords,
    actualAssemblyTotalFrames: Array.from({ length: requestedChunks }, () => 125),
    actualAssemblyTrims: Array.from({ length: requestedChunks }, () => 22),
    actualAssemblyNetFrames: Array.from({ length: requestedChunks }, () => 103),
    actualAssemblyContextFrames: Array.from({ length: requestedChunks }, () => 22),
    spectrumMode: "balanced",
    spectrumModelAwareMode: "off",
    continuumInteropApi: 1,
    createdAt: "2026-09-18T00:00:00.000Z"
  };
}

function emptySequence() {
  return {
    schemaVersion: 1 as const,
    sequenceId: "sequence-1",
    projectId: "project-1",
    runName: "run-1",
    packageVersion: "3.8.2",
    runStorageSchemaVersion: 3,
    workflowRevision: "managed-v38-api-v1",
    status: "in-progress" as const,
    chunkSeconds: 5,
    fps: 24 as const,
    width: 1280,
    height: 736,
    baseSeed: 123,
    modelIdentity: "minimax_h3_continuum",
    promptFormat: "Timeline" as const,
    targetChunks: 1,
    acceptedChunks: 0,
    canonicalHead: { revisionId: "pending" },
    chunks: [],
    updatedAt: "2026-09-18T00:00:00.000Z"
  };
}

describe("managed Continuum contracts", () => {
  it("registers a normal Native artifact as one app-canonical owner", async () => {
    const root = await mkdtemp(path.join(process.cwd(), "tmp-h3-canonical-asset-"));
    try {
      const payload = continuumPayload(2);
      const artifactService = new NativeAvArtifactService({ fileSystem: nativeAvArtifactFileSystem });
      const committed = await artifactService.commit({
        outputDirectory: root,
        artifactId: "canonical-asset-1",
        role: "final-clean-av",
        lineageId: "lineage-1",
        executionModelId: "minimax_h3_ref2va",
        providerId: "comfyui",
        providerRevision: "test",
        producerNodeId: "LocalVideoStudioH3SaveJointAV",
        producerNodeVersion: "0.3.4",
        workflowId: "minimax_h3_r2v_api.json",
        diffusionModelFilename: "diffusion.safetensors",
        textEncoderFilename: "text.safetensors",
        videoVaeFilename: "video.safetensors",
        audioVaeFilename: "audio.safetensors",
        width: 864,
        height: 480,
        frameCount: payload.frameCount,
        contextFrames: 0,
        workflowRevision: "test-workflow",
        sourceTaskId: "canonical-task",
        payload: payload.payload
      });
      expect(committed.status).toBe("available");
      const registry = new H3ContinuumAssetRegistry({ fileSystem: nativeAvArtifactFileSystem });
      const asset = await registry.registerNativeArtifact({
        outputDirectory: root,
        task: {
          id: "canonical-task",
          taskType: "extension",
          modelId: "minimax_h3_ref2va",
          workflowPath: "minimax_h3_r2v_extend_api.json",
          videoLoras: [],
          sourceVersionId: "source-version"
        } as unknown as ExtensionQueueTask,
        artifact: committed.artifact!,
        createdAt: "2026-09-19T03:37:00.000Z"
      });
      expect(asset).toMatchObject({
        storageKind: "app-canonical",
        sampleScope: "extension-segment",
        artifactRole: "final-clean-av",
        capabilities: ["native-av"],
        payloadSha256: committed.artifact!.payloadSha256,
        ownerPath: committed.artifact!.payload
      });
      expect(asset.aliasPaths).toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("persists the History identity and checks the actual canonical head without mutation", async () => {
    const state = createDefaultState();
    const task = {
      ...state.draft, taskType: "extension", id: "managed-task", modelId: "minimax_h3_continuum",
      prompt: "  First body.\n", workflowPath: "minimax_h3_continuum_v38_managed_extend_api.json",
      h3ContinuumMode: "managed", h3ContinuumSequence: emptySequence(),
      sourceWidth: 864, sourceHeight: 480, resolution: 480, duration: 5
    } as unknown as ExtensionQueueTask;
    let nextId = 0;
    persistVideoHistoryResult(state, {
      task, completedAt: "2026-09-18", promptId: "prompt-1", comfyOutputs: {}, files: [],
      h3ContinuumReceipt: validReceipt(), id: () => `id-${++nextId}`
    });
    const version = state.history[0]!.versions[0]!;
    const sequence = version.h3ContinuumSequence!;
    expect(version.duration).toBe(5);
    expect(state.history[0]!.duration).toBe(version.duration);
    expect(sequence.canonicalHead.historyVersionId).toBe(version.id);
    expect(sequence.chunks[0]!.outputVersionId).toBe(version.id);
    expect(sequence.chunks[0]!.prompt.finalPrompt).toBe(task.prompt);
    expect(continuumTimelinePromptForTask({ prompt: "Second body.", h3ContinuumSequence: sequence }, 5))
      .toBe(`[Chunk 1]\n${task.prompt}\n\n[Chunk 2]\nSecond body.`);
    const root = await mkdtemp(path.join(process.cwd(), "tmp-h3-managed-preflight-"));
    try {
      const sourceVideoPath = path.join(root, "source.mp4");
      await writeFile(sourceVideoPath, "video");
      sequence.firstFrameSource = { ...state.draft, sourceVideoPath };
      const receipt = version.h3ContinuumReceipt!;
      for (const file of [receipt.runStorageRoot, ...receipt.chunkRecords.map((record) => record.payloadPath)]) {
        const filename = path.join(root, file.subfolder, file.filename);
        await mkdir(path.dirname(filename), { recursive: true });
        await writeFile(filename, "fixture");
      }
      const projectPath = path.join(root, "h3_continuum/runs/run-1/project.json");
      await writeFile(projectPath, JSON.stringify({ canonical_storage_revision_id: receipt.revisionId }));
      const inspector = new HistoryArtifactService({
        store: { get: () => state } as unknown as StateRepository,
        artifactService: new NativeAvArtifactService({ fileSystem: nativeAvArtifactFileSystem }),
        resolveVideoOutputDirectory: async () => root
      });
      const draft = { ...state.draft, inputMode: "video" as const, modelId: "minimax_h3_continuum",
        sourceVideoPath, sourceAssetId: state.history[0]!.id, sourceVersionId: version.id,
        h3ContinuumSequence: sequence };
      const before = structuredClone(state);
      expect(await inspector.inspectExtensionSource(draft)).toMatchObject({ route: "managed", status: "available" });
      expect(await inspector.inspectExtensionSource({ ...draft, h3ContinuumTakeAction: "Continue From Here" }))
        .toMatchObject({ status: "invalid", reason: expect.stringContaining("group revision") });
      await writeFile(projectPath, JSON.stringify({ canonical_storage_revision_id: "other-take" }));
      expect(await inspector.inspectExtensionSource(draft))
        .toMatchObject({ status: "invalid", reason: expect.stringContaining("当前 head") });
      expect(state).toEqual(before);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps accepted prompt bytes and does not append an ignored section on Retry", () => {
    const first = "  integrated_multimodal_description: [Shot 1] First action.\n";
    const second = "integrated_multimodal_description: [Shot 1] Second action.";
    const sequence = {
      ...emptySequence(),
      globalPromptPreamble: "Frozen scene.\n",
      acceptedChunks: 2,
      targetChunks: 2,
      chunks: [first, second].map((finalPrompt, index) => ({
        logicalChunkIndex: index + 1,
        physicalGroupStart: index + 1,
        physicalGroupEnd: index + 1,
        status: "accepted" as const,
        prompt: { chunkIndex: index + 1, userPrompt: finalPrompt, finalPrompt, promptHash: "a".repeat(64), createdAt: "2026-09-18" }
      }))
    };
    const appended = continuumTimelinePromptForTask({ prompt: "Third action.", h3ContinuumSequence: sequence }, 5);
    expect(appended).toBe(`Frozen scene.\n\n\n[Chunk 1]\n${first}\n\n[Chunk 2]\n${second}\n\n[Chunk 3]\nThird action.`);
    const retry = continuumTimelinePromptForTask({ prompt: second, h3ContinuumSequence: sequence, h3ContinuumReviewAction: "Regenerate Current" }, 5);
    expect(retry).toContain(`[Chunk 1]\n${first}\n\n[Chunk 2]\n${second}`);
    expect(retry).not.toContain("[Chunk 3]");
    expect(() => continuumTimelinePromptForTask({ prompt: "New second action.", h3ContinuumSequence: sequence, h3ContinuumReviewAction: "Regenerate Current" }, 5)).toThrow("必须保留原提示词");
    expect(() => continuumTimelinePromptForTask({ prompt: "[Chunk 2] inline body" }, 5)).toThrow("Timeline");
  });

  it("uses the frozen first-frame source instead of the new continuation boundary", () => {
    const task = {
      sourceVideoPath: "extended.mp4", trimEndSeconds: 10,
      h3ContinuumSequence: { ...emptySequence(), acceptedChunks: 1 }
    } as unknown as ExtensionQueueTask;
    expect(() => continuumFirstFrameTask(task)).toThrow("首帧来源");
    task.h3ContinuumSequence!.firstFrameSource = {
      sourceVideoPath: "original.mp4", sourceVideoDuration: 5, trimStartSeconds: 0,
      trimEndSeconds: 5, sourceWidth: 864, sourceHeight: 480, resolution: 480
    };
    expect(continuumFirstFrameTask(task)).toMatchObject({ sourceVideoPath: "original.mp4", trimEndSeconds: 5 });
    expect(task.sourceVideoPath).toBe("extended.mp4");
  });

  it("routes old AV sources independently of stale managed workflow and pending Run fields", () => {
    const workflowPath = "C:/app/workflows/minimax_h3_continuum_v38_managed_extend_api.json";
    const source = {
      workflowPath,
      h3ContinuumMode: "managed" as const,
      h3ContinuumArtifactPath: "C:/output/h3-native-av/old.safetensors",
      h3ContinuumSequence: { acceptedChunks: 0 }
    };
    expect(h3ContinuumModeForSource(source)).toBe("bootstrap");
    expect(h3ContinuumModeForSource({ workflowPath, h3ContinuumMode: "bootstrap" })).toBe("bootstrap");
    expect(h3ContinuumModeForSource({ ...source, h3ContinuumSequence: { acceptedChunks: 2 } })).toBe("managed");
    expect(h3ContinuumWorkflowPathForInput(workflowPath)).toBe("C:/app/workflows/minimax_h3_continuum_v38_extend_api.json");
  });

  it("recognizes the separate official Run Storage workflow", () => {
    const filename = path.resolve(process.cwd(), "workflows/minimax_h3_continuum_v38_managed_extend_api.json");
    const workflow = JSON.parse(readFileSync(filename, "utf8")) as Record<string, unknown>;
    expect(validateApiWorkflow(workflow).valid).toBe(true);
    expect(validateH3ComfyWorkflow(workflow).valid).toBe(true);
    expect(workflowSupportsH3ContinuumManagedExtension(workflow)).toBe(true);
    expect(isMiniMaxH3ContinuumManagedWorkflow(filename)).toBe(true);
    expect(Object.values(workflow).some((node) => (node as { class_type?: string }).class_type === "LocalVideoStudioH3SaveJointAV")).toBe(false);
    expect(Object.values(workflow).some((node) => (node as { class_type?: string }).class_type === "LocalVideoStudioH3ContinuumDiagnostics")).toBe(false);
    const samplerInputs = (workflow["12"] as { inputs?: Record<string, unknown> }).inputs;
    expect(samplerInputs?.diagnostics).toBe("Detailed Report");
    const serialized = JSON.stringify(workflow);
    expect(serialized).toContain("{{H3_CONTINUUM_REROLL_FROM}}");
    expect(serialized).toContain("{{H3_CONTINUUM_TAKE_GROUP}}");
    expect(serialized).toContain("{{H3_CONTINUUM_TAKE_REVISION_ID}}");
    expect(serialized).toContain("{{H3_CONTINUUM_TAKE_ACTION}}");
  });

  it("renders Retry/Take values into the managed sampler without adding legacy state", () => {
    const filename = path.resolve(process.cwd(), "workflows/minimax_h3_continuum_v38_managed_extend_api.json");
    const workflow = JSON.parse(readFileSync(filename, "utf8")) as Record<string, unknown>;
    const task = {
      id: "managed-task",
      taskType: "extension",
      status: "waiting",
      createdAt: "2026-09-18T00:00:00.000Z",
      updatedAt: "2026-09-18T00:00:00.000Z",
      outputFilename: "managed.mp4",
      prompt: "second chunk",
      promptVersion: 1,
      sourceVideoPath: "source.mp4",
      sourceVideoDuration: 5,
      trimStartSeconds: 0,
      trimEndSeconds: 5,
      sourceWidth: 1280,
      sourceHeight: 736,
      modelId: "minimax_h3_continuum",
      workflowPath: filename,
      ratio: "source",
      resolution: 480,
      duration: 5,
      fps: 24,
      frameInterpolation: "off",
      motion: "natural",
      seed: 123,
      keepSeedOnCopy: true,
      maxGeneratedFrames: 362,
      overlapFrames: 22,
      unloadBetweenStages: true,
      h3ContinuumMode: "managed",
      h3ContinuumTargetChunks: 2,
      h3ContinuumReviewAction: "Continue / Next",
      h3ContinuumRerollFromChunk: 2,
      h3ContinuumTakeGroup: 2,
      h3ContinuumTakeRevisionId: "rev-parent",
      h3ContinuumTakeAction: "Continue From Here",
      spectrumMode: "off",
      spectrumModelAwareMode: "off"
    } as unknown as ExtensionQueueTask;
    const rendered = renderWorkflow(workflow, task) as Record<string, { class_type?: string; inputs?: Record<string, unknown> }>;
    expect(rendered["12"]?.inputs).toMatchObject({
      chunks: 2,
      review_action: "Continue / Next",
      reroll_from_chunk: 2,
      take_group: 2,
      take_revision_id: "rev-parent",
      take_action: "Continue From Here"
    });
    expect(Object.values(rendered).some((node) => [
      "LocalVideoStudioH3LoadJointAV",
      "LocalVideoStudioH3ArtifactToContinuumState",
      "LocalVideoStudioH3SaveJointAV"
    ].includes(node.class_type ?? ""))).toBe(false);
    expect(JSON.stringify(rendered)).not.toContain("{{");
    const policyTask = { ...task, attentionMode: "sage", h3ComfyCompilerMode: "disabled" } as ExtensionQueueTask;
    const stable = renderWorkflow(workflow, policyTask) as typeof rendered;
    expect(Object.values(stable).find((node) => node.class_type === "PathchSageAttentionKJ")?.inputs?.allow_compile).toBe(true);
    const legacyWorkflow = JSON.parse(readFileSync(path.resolve(process.cwd(), "workflows/minimax_h3_continuum_v38_extend_api.json"), "utf8"));
    const legacy = renderWorkflow(legacyWorkflow, { ...policyTask, h3ContinuumMode: "bootstrap", workflowPath: "minimax_h3_continuum_v38_extend_api.json" }) as typeof rendered;
    expect(Object.values(legacy).find((node) => node.class_type === "PathchSageAttentionKJ")?.inputs?.allow_compile).toBe(false);
  });

  it("parses a Run Storage receipt and rejects fresh or multi-generated claims", () => {
    const receipt = validReceipt();
    expect(validateH3ContinuumReceipt(receipt)).toBeNull();
    expect(isH3ContinuumReceipt(receipt)).toBe(true);
    const raw = {
      schema_version: 1,
      project_id: "project-1",
      run_name: "run-1",
      run_storage_path: "C:/ComfyUI/output/h3_continuum/runs/run-1/revisions/rev-1",
      revision_id: "rev-1",
      package_version: "3.8.2",
      run_storage_schema_version: 3,
      generation_mode: "Review Each Chunk",
      review_action: "Continue / Next",
      run_storage: "Save + Auto Resume",
      selected_source: "run_storage",
      fresh_fallback: false,
      requested_chunks: 1,
      reused_count: 0,
      generated_count: 1,
      reused_chunk_indices: [],
      generated_chunk_indices: [1],
      first_generated_chunk: 1,
      chunk_records: [{
        logical_chunk_index: 1,
        record_filename: "chunk-1.safetensors",
        storage_revision_id: "rev-1",
        payload_path: "C:/ComfyUI/output/h3_continuum/runs/run-1/revisions/rev-1/chunks/chunk-1.safetensors",
        reused: false,
        generated: true
      }],
      actual_assembly_total_frames: [125],
      actual_assembly_trims: [22],
      actual_assembly_net_frames: [103],
      actual_assembly_context_frames: [22],
      spectrum_mode: "balanced",
      spectrum_model_aware_mode: "off",
      created_at: "2026-09-18T00:00:00.000Z"
    };
    expect(validateH3ContinuumManagedReceipt(raw)).toBeNull();
    expect(extractH3ContinuumManagedReceipt({ outputs: { "24": { result: [JSON.stringify(raw)] } } }, "24")).toMatchObject({
      selected_source: "run_storage",
      generated_count: 1
    });
    expect(validateH3ContinuumManagedReceipt({ ...raw, generated_count: 2 })).toContain("counts");
  });

  it("allows one append while preserving the accepted prefix", () => {
    const first = emptySequence();
    const firstNext = sequenceAfterManagedReceipt(
      first,
      validReceipt(),
      { userPrompt: "first", finalPrompt: "first", promptHash: "a".repeat(64), createdAt: first.updatedAt },
      "h3av_first",
      "version-1",
      "2026-09-18T00:01:00.000Z"
    );
    expect(validateContinuumSequence(firstNext)).toBeNull();
    const secondNext = sequenceAfterManagedReceipt(
      firstNext,
      { ...validReceipt(2, 2), requestedChunks: 2 },
      { userPrompt: "second", finalPrompt: "second", promptHash: "b".repeat(64), createdAt: "2026-09-18T00:02:00.000Z" },
      "h3av_second",
      "version-2",
      "2026-09-18T00:02:00.000Z"
    );
    expect(validateContinuumAppend(firstNext, secondNext)).toBeNull();
    expect(secondNext.chunks).toHaveLength(2);
    expect(secondNext.chunks[0]?.assetId).toBe("h3av_first");
    expect(secondNext.chunks[1]?.assetId).toBe("h3av_second");
  });

  it("keeps path and asset storage validation fail-closed", () => {
    expect(safeH3OutputRelativePath(outputFile("h3_continuum/runs/run-1", "chunk.safetensors", "safetensors"))).toBe("h3_continuum/runs/run-1/chunk.safetensors");
    expect(safeH3OutputRelativePath(outputFile("../outside", "chunk.safetensors", "safetensors"))).toBeNull();
    expect(validateH3AvLatentAsset({
      schemaVersion: 1,
      assetId: "h3av_invalid",
      storageKind: "continuum-run-chunk",
      ownerPath: outputFile("h3_continuum/runs/run-1", "chunk.safetensors", "safetensors"),
      payloadBytes: 1,
      payloadSha256: "a".repeat(64),
      videoTensorSha256: "b".repeat(64),
      audioTensorSha256: "c".repeat(64),
      videoShape: [1, 24, 7, 45, 80],
      videoDtype: "F16",
      audioShape: [1, 32, 2, 55],
      audioDtype: "F16",
      width: 1280,
      height: 736,
      fps: 24,
      frameCount: 90,
      producer: { legacyUnverified: true },
      capabilities: ["native-av"],
      createdAt: "2026-09-18T00:00:00.000Z"
    })).toContain("producer");
  });

  it("registers one Run Storage owner and creates a verified hardlink alias", async () => {
    const outputDirectory = await mkdtemp(path.join(process.cwd(), "tmp-h3-managed-"));
    try {
      const chunkDirectory = path.join(outputDirectory, "h3-continuum", "runs", "run-1", "revisions", "rev-1", "chunks");
      await mkdir(chunkDirectory, { recursive: true });
      const frameCount = 345;
      const videoBytes = 1 * 24 * 102 * 30 * 52 * 2;
      const audioBytes = 1 * 32 * 2 * 575 * 2;
      const header = Buffer.from(JSON.stringify({
        video: { dtype: "F16", shape: [1, 24, 102, 30, 52], data_offsets: [0, videoBytes] },
        audio: { dtype: "F16", shape: [1, 32, 2, 575], data_offsets: [videoBytes, videoBytes + audioBytes] }
      }), "utf8");
      const payload = Buffer.alloc(8 + header.byteLength + videoBytes + audioBytes);
      payload.writeBigUInt64LE(BigInt(header.byteLength), 0);
      header.copy(payload, 8);
      const payloadPath = path.join(chunkDirectory, "chunk-1.safetensors");
      await writeFile(payloadPath, payload);
      const task = {
        id: "managed-task",
        taskType: "extension",
        status: "waiting",
        createdAt: "2026-09-18T00:00:00.000Z",
        updatedAt: "2026-09-18T00:00:00.000Z",
        outputFilename: "managed.mp4",
        prompt: "first chunk",
        promptVersion: 1,
        sourceVideoPath: "source.mp4",
        sourceVideoDuration: 14,
        trimStartSeconds: 0,
        trimEndSeconds: 14,
        sourceWidth: 1280,
        sourceHeight: 736,
        modelId: "minimax_h3_continuum",
        workflowPath: "minimax_h3_continuum_v38_managed_extend_api.json",
        ratio: "source",
        resolution: 480,
        duration: 14,
        fps: 24,
        frameInterpolation: "off",
        motion: "natural",
        seed: 123,
        keepSeedOnCopy: true,
        maxGeneratedFrames: 362,
        overlapFrames: 22,
        unloadBetweenStages: true,
        h3VideoVaeMode: "fp16",
        videoLoras: []
      } as unknown as ExtensionQueueTask;
      const raw: H3ContinuumManagedReceiptRaw = {
        schema_version: 1,
        project_id: "project-1",
        run_name: "run-1",
        run_storage_path: path.join(outputDirectory, "h3-continuum", "runs", "run-1", "revisions", "rev-1"),
        revision_id: "rev-1",
        package_version: "3.8.2",
        run_storage_schema_version: 3,
        generation_mode: "Review Each Chunk",
        review_action: "Continue / Next",
        run_storage: "Save + Auto Resume",
        selected_source: "run_storage",
        fresh_fallback: false,
        requested_chunks: 1,
        reused_count: 0,
        generated_count: 1,
        reused_chunk_indices: [],
        generated_chunk_indices: [1],
        first_generated_chunk: 1,
        chunk_records: [{
          logical_chunk_index: 1,
          record_filename: "chunk-1.safetensors",
          storage_revision_id: "rev-1",
          payload_path: payloadPath,
          reused: false,
          generated: true
        }],
        actual_assembly_total_frames: [frameCount],
        actual_assembly_trims: [0],
        actual_assembly_net_frames: [345],
        actual_assembly_context_frames: [0],
        spectrum_mode: "off",
        spectrum_model_aware_mode: "off",
        created_at: "2026-09-18T00:00:00.000Z"
      };
      const registry = new H3ContinuumAssetRegistry({ fileSystem: nativeAvArtifactFileSystem });
      const result = await registry.registerManagedReceipt({
        outputDirectory,
        task,
        receipt: raw,
        workflowRevision: "managed-v38-api-v1",
        producerNodeId: "LocalVideoStudioH3ContinuumManagedReceipt",
        producerNodeVersion: "0.1.0",
        createdAt: "2026-09-18T00:00:00.000Z"
      });
      const asset = result.assetsByChunkIndex[1]!;
      expect(asset.storageKind).toBe("continuum-run-chunk");
      expect(asset.aliasMode).toBe("hardlink");
      expect(asset.ownerPath.absolutePath).toBe(payloadPath);
      const aliasPath = asset.aliasPaths?.[0]?.absolutePath;
      expect(aliasPath).toBeTruthy();
      const [ownerStat, aliasStat] = await Promise.all([stat(payloadPath), stat(aliasPath!)]);
      expect(ownerStat.size).toBe(aliasStat.size);
      expect(ownerStat.ino).toBe(aliasStat.ino);
      const inventory = await registry.inventoryOutputRoot(outputDirectory);
      expect(inventory.entries.filter((entry) => entry.status === "valid")).toHaveLength(2);
      expect(inventory.entries.every((entry) => entry.assetId === asset.assetId)).toBe(true);
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  });

  it("uses each official assembly total for mixed reused and generated chunks", async () => {
    const outputDirectory = await mkdtemp(path.join(process.cwd(), "tmp-h3-managed-mixed-"));
    try {
      const revisionRoot = path.join(outputDirectory, "h3-continuum", "runs", "run-mixed", "revisions", "rev-mixed");
      const chunkDirectory = path.join(revisionRoot, "chunks");
      await mkdir(chunkDirectory, { recursive: true });
      const first = continuumPayload(102);
      const second = continuumPayload(107);
      const firstPath = path.join(chunkDirectory, "chunk-1.safetensors");
      const secondPath = path.join(chunkDirectory, "chunk-2.safetensors");
      await Promise.all([writeFile(firstPath, first.payload), writeFile(secondPath, second.payload)]);
      const task = {
        id: "managed-mixed-task",
        taskType: "extension",
        outputFilename: "managed-mixed.mp4",
        sourceVideoPath: "source.mp4",
        sourceVideoDuration: 14,
        trimStartSeconds: 0,
        trimEndSeconds: 14,
        sourceWidth: 1920,
        sourceHeight: 1080,
        modelId: "minimax_h3_continuum",
        workflowPath: "minimax_h3_continuum_v38_managed_extend_api.json",
        ratio: "source",
        resolution: 480,
        duration: 14,
        fps: 24,
        maxGeneratedFrames: 362,
        overlapFrames: 22,
        h3VideoVaeMode: "fp16",
        videoLoras: []
      } as unknown as ExtensionQueueTask;
      const raw: H3ContinuumManagedReceiptRaw = {
        schema_version: 1,
        project_id: "project-mixed",
        run_name: "run-mixed",
        run_storage_path: revisionRoot,
        revision_id: "rev-mixed",
        package_version: "3.8.2",
        run_storage_schema_version: 3,
        generation_mode: "Review Each Chunk",
        review_action: "Continue / Next",
        run_storage: "Save + Auto Resume",
        selected_source: "run_storage",
        fresh_fallback: false,
        requested_chunks: 2,
        reused_count: 1,
        generated_count: 1,
        reused_chunk_indices: [1],
        generated_chunk_indices: [2],
        first_generated_chunk: 2,
        chunk_records: [
          { logical_chunk_index: 1, record_filename: "chunk-1.safetensors", storage_revision_id: "rev-mixed", payload_path: firstPath, reused: true, generated: false },
          { logical_chunk_index: 2, record_filename: "chunk-2.safetensors", storage_revision_id: "rev-mixed", payload_path: secondPath, reused: false, generated: true }
        ],
        actual_assembly_total_frames: [first.frameCount, second.frameCount],
        actual_assembly_trims: [0, 22],
        actual_assembly_net_frames: [first.frameCount, second.frameCount - 22],
        actual_assembly_context_frames: [0, 22],
        spectrum_mode: "off",
        spectrum_model_aware_mode: "off",
        created_at: "2026-09-18T00:00:00.000Z"
      };
      const registry = new H3ContinuumAssetRegistry({ fileSystem: nativeAvArtifactFileSystem });
      const result = await registry.registerManagedReceipt({
        outputDirectory,
        task,
        receipt: raw,
        workflowRevision: "managed-v38-api-v1",
        producerNodeId: "LocalVideoStudioH3ContinuumManagedReceipt",
        producerNodeVersion: "0.1.0",
        createdAt: "2026-09-18T00:00:00.000Z"
      });
      expect(result.assetsByChunkIndex[1]?.frameCount).toBe(345);
      expect(result.assetsByChunkIndex[2]?.frameCount).toBe(362);
      expect(result.assetsByChunkIndex[1]?.ownerPath.absolutePath).toBe(firstPath);
      expect(result.assetsByChunkIndex[2]?.ownerPath.absolutePath).toBe(secondPath);
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  });
});
