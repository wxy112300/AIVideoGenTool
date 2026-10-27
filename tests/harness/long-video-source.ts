import type { AssetVersion } from "../../src/types";
import { createLongVideoLayout } from "../../src/core/long-video/layout";
import { createLongVideoScript, editLongVideoScript } from "../../src/core/long-video/script";
import { freezeLongVideoExecution } from "../../src/core/long-video/execution";
import { miniMaxH3ModelAssetNames } from "../../src/core/workflow";
import type { ContinuumGroupReceipt } from "../../src/core/long-video/group-checkpoint";

export function completedGroupVersion(): AssetVersion {
  let i = 0; const id = () => `source-page-${++i}`;
  const base = createLongVideoScript(createLongVideoLayout(10, 2), id);
  const script = editLongVideoScript(base, base.segments.map((page, i) => ({ pageId: page.id, text: `Original action ${i}` })), 0, "user", id);
  const execution = freezeLongVideoExecution("original", "original", script, { ...miniMaxH3ModelAssetNames("minimax_h3_fl2va")!,
    videoVae: "minimax_h3_video_vae_fp16.safetensors", width: 480, height: 480, seed: 42, steps: 20, sampler: "euler", scheduler: "simple",
    chunkSeconds: 5, prompts: ["Original action 0", "Original action 1"], firstImage: "original.png", attention: "sdpa" });
  const receipt: ContinuumGroupReceipt = { schema_version: 1, kind: "continuum_group", execution_id: "original", step_id: "group-2", attempt_id: "attempt-1",
    project_id: execution.projectId, run_name: execution.runName, revision_id: "revision-2", expected_parent_revision_id: "revision-1",
    run_storage_path: "C:/fixture/output/h3_continuum/runs/lvs_original/revisions/revision-2", package_version: "3.10.2", run_storage_schema_version: 3,
    sampling_contract_version: 6, contract_sha256: "a".repeat(64), resume_safe: true, planned_chunks: 2, accepted_chunks: 2, reused_count: 1, generated_count: 1,
    physical_group: { index: 2, start: 2, end: 2 }, chunk_records: [1, 2].map(index => ({ logical_chunk_index: index, storage_revision_id: `revision-${index}`,
      record_filename: `chunk-${index}.safetensors`, payload_path: `C:/fixture/output/chunk-${index}.safetensors`, payload_bytes: 100, payload_sha256: "b".repeat(64),
      reused: index === 1, generated: index === 2 })), output_scope: "full_accepted_prefix", sequence_complete: true, final_output: true,
    output_groups: [1, 2].map(index => ({ physical_group: index, logical_chunks: [index], total_frames: index === 1 ? 124 : 141,
      trim_frames: index === 1 ? 0 : 22, net_frames: index === 1 ? 124 : 119, context_frames: index === 1 ? 0 : 22 })) };
  return { id: "source-version", kind: "original", outputFilename: "source.mp4", createdAt: "2026-10-26T00:00:00.000Z", modelId: "minimax_h3_fl2va", width: 480, height: 480, duration: 10, fps: 24, seed: 42,
    steps: 20, longVideoExecution: execution, longVideoReceipt: receipt,
    files: [{ filename: "source.mp4", absolutePath: "C:/fixture/source.mp4", type: "output", subfolder: "" }] } as AssetVersion;
}
