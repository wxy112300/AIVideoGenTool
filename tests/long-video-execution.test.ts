import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLongVideoLayout, proposeLongVideoExtension } from "../src/core/long-video/layout";
import { createLongVideoScript, editLongVideoScript } from "../src/core/long-video/script";
import { assertLongVideoExecutionSnapshot, freezeLongVideoExecution, freezeLongVideoExtension, type LongVideoMediaEvidence } from "../src/core/long-video/execution";
import type { LongVideoRunSource } from "../src/core/long-video/run-source";
import { verifyLongVideoRunSource } from "../electron/services/long-video-run-source";
import { createHash } from "node:crypto";
import type { ContinuumGroupReceipt, ContinuumGroupRequest } from "../src/core/long-video/group-checkpoint";
import { runLongVideoExecution, type LongVideoExecutionPorts } from "../electron/services/long-video-execution";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true }))); });
function snapshot() {
  let n = 0; const id = () => `id-${++n}`;
  const script = createLongVideoScript(createLongVideoLayout(10, 2), id, "Creative brief");
  const detailed = editLongVideoScript(script, script.segments.map((page, index) => ({ pageId: page.id, text: `Adopted prompt ${index}` })), 0, "user", id);
  const profile = { diffusionModel: "model", textEncoder: "clip", videoVae: "vae", width: 256, height: 256, seed: 42, steps: 8,
    sampler: "euler", scheduler: "simple", chunkSeconds: 5, prompts: ["Adopted prompt 0", "Adopted prompt 1"], firstImage: "uploaded.png", attention: "sdpa" as const };
  return { script: detailed, profile, frozen: freezeLongVideoExecution("task", "execution", detailed, profile) };
}
function receipt(request: ContinuumGroupRequest, completePrefix = true, generated = 1): ContinuumGroupReceipt {
  const before = request.expected_prefix_chunks, accepted = before + generated;
  const full = completePrefix && accepted === request.planned_chunks;
  const indices = Array.from({ length: full ? accepted : generated }, (_, i) => (full ? 1 : before + 1) + i);
  return {
    ...request, schema_version: 1, kind: "continuum_group", revision_id: `revision-${accepted}`,
    run_storage_path: "/output/h3_continuum/runs/run/revisions/rev", package_version: "3.10.2", run_storage_schema_version: 3,
    sampling_contract_version: 6, contract_sha256: "a".repeat(64), resume_safe: true,
    accepted_chunks: accepted, reused_count: before, generated_count: generated,
    physical_group: { index: before + 1, start: before + 1, end: accepted },
    chunk_records: Array.from({ length: accepted }, (_, i) => ({ logical_chunk_index: i + 1, storage_revision_id: `owner-${i}`,
      record_filename: `chunk-${i + 1}.safetensors`, payload_path: `/output/chunk-${i + 1}.safetensors`, payload_bytes: 100,
      payload_sha256: "b".repeat(64), reused: i < before, generated: i >= before })),
    output_scope: full ? "full_accepted_prefix" : "current_physical_group",
    output_groups: indices.map(i => ({ physical_group: i, logical_chunks: [i], total_frames: 124, trim_frames: i === 1 ? 0 : 22,
      net_frames: i === 1 ? 124 : 102, context_frames: i === 1 ? 0 : 22 })),
    sequence_complete: accepted === request.planned_chunks, final_output: full
  };
}
const media = (): LongVideoMediaEvidence => ({ files: [{ path: "/output/final.mp4", bytes: 2000, sha256: "c".repeat(64) }], videoFrames: 240,
  audioContentSamples: 480000, audioSampleRate: 48000, codecPaddingSamples: 0, fullDecode: true });
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "long-video-parent-")); directories.push(root);
  const ports: LongVideoExecutionPorts = {
    assertLease: vi.fn(async () => {}),
    assertSource: vi.fn(async () => {}),
    submit: vi.fn(async (request, _profile, _signal, beforePost) => { await beforePost(); return { promptId: `prompt-${request.expected_prefix_chunks}`, clientId: "client", request, nodeTypes: {} }; }),
    wait: vi.fn(async submission => ({ receipt: receipt(submission.request), outputs: {} })),
    validateFinal: vi.fn(async () => media()), publish: vi.fn(async () => {})
  };
  const signal = new AbortController().signal;
  return { root, ports, signal, ...snapshot() };
}

describe("internal long-video parent execution", () => {
  function extension() {
    const original = snapshot();
    const source: LongVideoRunSource = { schemaVersion: 1, sourceAssetId: "asset", sourceVersionId: "version", profile: original.profile,
      receipt: receipt({ execution_id: original.frozen.executionId, project_id: original.frozen.projectId, run_name: original.frozen.runName,
        step_id: "group-2", attempt_id: "attempt-1", planned_chunks: 2, expected_prefix_chunks: 1, expected_parent_revision_id: "revision-1" }) };
    let n = 0; const id = () => `extension-${++n}`;
    const base = createLongVideoScript(proposeLongVideoExtension(10, 2, 5).layout, id);
    const script = editLongVideoScript(base, base.segments.map((p, i) => ({ pageId: p.id, text: `Future action ${i}` })), 0, "user", id);
    return { source, script, frozen: freezeLongVideoExtension("extension-task", "extension-execution", script, source) };
  }
  it("adds future groups to the same Run without resampling the inherited prefix and validates the entire movie", async () => {
    const f = await fixture(), next = extension();
    vi.mocked(f.ports.validateFinal).mockResolvedValue({ ...media(), videoFrames: 480, audioContentSamples: 960000 });
    await runLongVideoExecution(f.root, next.frozen, f.ports, f.signal);
    expect(vi.mocked(f.ports.submit).mock.calls.map(call => call[0].expected_prefix_chunks)).toEqual([2, 3]);
    expect(vi.mocked(f.ports.submit).mock.calls[0]![0]).toMatchObject({ project_id: next.source.receipt.project_id,
      run_name: next.source.receipt.run_name, expected_parent_revision_id: "revision-2", planned_chunks: 4 });
    expect(vi.mocked(f.ports.submit).mock.calls[0]![1]).toMatchObject({ firstImage: next.source.profile.firstImage, seed: 42,
      prompts: ["Adopted prompt 0", "Adopted prompt 1", "Future action 0", "Future action 1"] });
    await runLongVideoExecution(f.root, next.frozen, f.ports, f.signal);
    expect(f.ports.submit).toHaveBeenCalledTimes(2); expect(f.ports.publish).toHaveBeenCalledTimes(1);
    expect(f.ports.assertSource).toHaveBeenCalledTimes(1);
  });
  it("cannot POST an inherited Run without actual source validation and retains a safe prepared retry", async () => {
    const f = await fixture(), next = extension();
    const check = f.ports.assertSource; delete f.ports.assertSource;
    await expect(runLongVideoExecution(f.root, next.frozen, f.ports, f.signal)).rejects.toThrow(/requires source verification/);
    const names = await fs.readdir(path.join(f.root, next.frozen.executionId, "journal"));
    expect(names).toHaveLength(2); // snapshot and prepared; no durable sampling intent
    f.ports.assertSource = check;
    vi.mocked(f.ports.validateFinal).mockResolvedValue({ ...media(), videoFrames: 480, audioContentSamples: 960000 });
    await runLongVideoExecution(f.root, next.frozen, f.ports, f.signal);
    expect(check).toHaveBeenCalledTimes(1); expect(f.ports.wait).toHaveBeenCalledTimes(2);
  });
  it("rejects inherited profile/head/layout changes and output evidence containing only the new seconds", async () => {
    const f = await fixture(), next = extension();
    expect(() => assertLongVideoExecutionSnapshot({ ...next.frozen, profile: { ...next.frozen.profile, seed: 99 } })).toThrow(/source\/profile/);
    expect(() => assertLongVideoExecutionSnapshot({ ...next.frozen, projectId: "another-run" })).toThrow(/source\/profile/);
    expect(() => freezeLongVideoExtension("extension-task", "extension-execution", next.script,
      { ...next.source, receipt: { ...next.source.receipt, resume_safe: false } } as unknown as LongVideoRunSource)).toThrow(/contract/);
    await expect(runLongVideoExecution(f.root, next.frozen, f.ports, f.signal)).rejects.toThrow(/video\/audio/);
    expect(f.ports.publish).not.toHaveBeenCalled();
  });
  it("rejects a changed inherited owner before accepting the very first extension group", async () => {
    const f = await fixture(), next = extension();
    vi.mocked(f.ports.wait).mockImplementation(async submission => { const r = receipt(submission.request); r.chunk_records[0]!.payload_sha256 = "d".repeat(64); return { receipt: r, outputs: {} }; });
    await expect(runLongVideoExecution(f.root, next.frozen, f.ports, f.signal)).rejects.toThrow(/prefix/);
    expect(f.ports.publish).not.toHaveBeenCalled();
  });
  it("checks real group source files read-only and refuses stale heads, missing or replaced owners", async () => {
    const f = await fixture(), { source } = extension();
    const revisionRoot = path.join(f.root, "h3_continuum", "runs", source.receipt.run_name, "revisions", source.receipt.revision_id);
    await fs.mkdir(revisionRoot, { recursive: true }); source.receipt.run_storage_path = revisionRoot;
    for (const record of source.receipt.chunk_records) {
      if (record.generated) record.storage_revision_id = source.receipt.revision_id;
      record.payload_path = path.join(path.dirname(revisionRoot), record.storage_revision_id, "chunks", record.record_filename);
      const bytes = Buffer.from(`actual payload ${record.logical_chunk_index}`);
      record.payload_bytes = bytes.length; record.payload_sha256 = createHash("sha256").update(bytes).digest("hex");
      await fs.mkdir(path.dirname(record.payload_path), { recursive: true }); await fs.writeFile(record.payload_path, bytes);
    }
    const manifest = { run_storage_schema_version: 3, sampling_contract_version: 6, resume_safe: true, revision_id: source.receipt.revision_id,
      run_name: source.receipt.run_name, contract_sha256: source.receipt.contract_sha256, status: "complete", contract: { chunk_count: 2 },
      chunks: source.receipt.chunk_records.map((r, i) => ({ sequence_index: i, storage_revision_id: r.storage_revision_id, filename: r.record_filename, file_size: r.payload_bytes, file_sha256: r.payload_sha256 })) };
    const manifestPath = path.join(revisionRoot, "manifest.json"), projectPath = path.join(revisionRoot, "..", "..", "project.json");
    await fs.writeFile(manifestPath, JSON.stringify(manifest)); await fs.writeFile(projectPath, JSON.stringify({ canonical_storage_revision_id: source.receipt.revision_id }));
    const original = await fs.readFile(manifestPath);
    expect((await verifyLongVideoRunSource(f.root, source, f.signal)).acceptedChunks).toBe(2);
    expect(await fs.readFile(manifestPath)).toEqual(original);
    await fs.writeFile(projectPath, JSON.stringify({ canonical_storage_revision_id: "new-head" }));
    await expect(verifyLongVideoRunSource(f.root, source, f.signal)).rejects.toThrow(/stale/);
    await fs.writeFile(projectPath, JSON.stringify({ canonical_storage_revision_id: source.receipt.revision_id }));
    await fs.writeFile(source.receipt.chunk_records[0]!.payload_path, "replaced payload");
    await expect(verifyLongVideoRunSource(f.root, source, f.signal)).rejects.toThrow(/bytes\/hash/);
    await fs.rm(source.receipt.chunk_records[0]!.payload_path);
    await expect(verifyLongVideoRunSource(f.root, source, f.signal)).rejects.toThrow(/ENOENT/);
  });
  it("freezes adopted inputs and executes groups sequentially into one validated publication", async () => {
    const f = await fixture(); f.profile.prompts[0] = "later draft";
    const result = await runLongVideoExecution(f.root, f.frozen, f.ports, f.signal);
    expect(result.phase).toBe("published");
    expect(vi.mocked(f.ports.submit).mock.calls.map(call => call[0].expected_prefix_chunks)).toEqual([0, 1]);
    expect(vi.mocked(f.ports.submit).mock.calls[1]![0].expected_parent_revision_id).toBe("revision-1");
    expect(vi.mocked(f.ports.submit).mock.calls[0]![1].prompts[0]).toBe("Adopted prompt 0");
    expect(f.ports.publish).toHaveBeenCalledWith(f.frozen, media(), { assetId: "task", versionId: "execution" }, f.signal, expect.objectContaining({ receipt: expect.objectContaining({ final_output: true }) }));
    await runLongVideoExecution(f.root, f.frozen, f.ports, f.signal);
    expect(f.ports.submit).toHaveBeenCalledTimes(2); expect(f.ports.publish).toHaveBeenCalledTimes(1);
  });
  it("resumes the same submitted prompt after a lost wait without another sample", async () => {
    const f = await fixture(); vi.mocked(f.ports.wait).mockRejectedValueOnce(new Error("lost connection"));
    await expect(runLongVideoExecution(f.root, f.frozen, f.ports, f.signal)).rejects.toThrow("lost connection");
    expect(f.ports.submit).toHaveBeenCalledTimes(1);
    await runLongVideoExecution(f.root, f.frozen, f.ports, f.signal);
    expect(f.ports.submit).toHaveBeenCalledTimes(2);
    expect(vi.mocked(f.ports.wait).mock.calls.slice(0, 2).map(call => call[0].promptId)).toEqual(["prompt-0", "prompt-0"]);
  });
  it("stops at an uncertain POST and never guesses that resubmitting is safe", async () => {
    const f = await fixture();
    vi.mocked(f.ports.submit).mockImplementationOnce(async (_request, _profile, _signal, beforePost) => { await beforePost(); throw new Error("reply lost after POST"); });
    await expect(runLongVideoExecution(f.root, f.frozen, f.ports, f.signal)).rejects.toThrow("reply lost");
    expect((await runLongVideoExecution(f.root, f.frozen, f.ports, f.signal)).phase).toBe("uncertain-submission");
    expect(f.ports.submit).toHaveBeenCalledTimes(1); expect(f.ports.wait).not.toHaveBeenCalled();
  });
  it("retries pre-submit rejection and preserves already accepted groups", async () => {
    const f = await fixture();
    vi.mocked(f.ports.submit).mockRejectedValueOnce(new Error("preflight failed"));
    await expect(runLongVideoExecution(f.root, f.frozen, f.ports, f.signal)).rejects.toThrow("preflight failed");
    await runLongVideoExecution(f.root, f.frozen, f.ports, f.signal);
    expect(vi.mocked(f.ports.submit).mock.calls.map(call => call[0].expected_prefix_chunks)).toEqual([0, 0, 1]);
  });
  it("does not validate or publish a complete sequence with only a current-group output", async () => {
    const f = await fixture(); vi.mocked(f.ports.wait).mockImplementation(async submission => ({ receipt: receipt(submission.request, false), outputs: {} }));
    expect((await runLongVideoExecution(f.root, f.frozen, f.ports, f.signal)).phase).toBe("needs-assembly");
    expect(f.ports.validateFinal).not.toHaveBeenCalled(); expect(f.ports.publish).not.toHaveBeenCalled();
    await runLongVideoExecution(f.root, f.frozen, f.ports, f.signal); expect(f.ports.submit).toHaveBeenCalledTimes(2);
  });
  it("rejects changed reused payloads before accepting or publishing the next group", async () => {
    const f = await fixture();
    vi.mocked(f.ports.wait).mockImplementation(async submission => { const r = receipt(submission.request); if (r.reused_count) r.chunk_records[0]!.payload_sha256 = "d".repeat(64); return { receipt: r, outputs: {} }; });
    await expect(runLongVideoExecution(f.root, f.frozen, f.ports, f.signal)).rejects.toThrow(/prefix/);
    expect(f.ports.publish).not.toHaveBeenCalled();
  });
  it("requires actual frame/audio evidence and resumes publication with stable identities", async () => {
    const f = await fixture(); vi.mocked(f.ports.validateFinal).mockResolvedValueOnce({ ...media(), videoFrames: 120 });
    await expect(runLongVideoExecution(f.root, f.frozen, f.ports, f.signal)).rejects.toThrow(/evidence/);
    expect(f.ports.publish).not.toHaveBeenCalled();
    vi.mocked(f.ports.publish).mockRejectedValueOnce(new Error("History reply lost"));
    await expect(runLongVideoExecution(f.root, f.frozen, f.ports, f.signal)).rejects.toThrow("History reply lost");
    await runLongVideoExecution(f.root, f.frozen, f.ports, f.signal);
    expect(f.ports.submit).toHaveBeenCalledTimes(2);
    expect(vi.mocked(f.ports.publish).mock.calls.map(call => call[2])).toEqual([{ assetId: "task", versionId: "execution" }, { assetId: "task", versionId: "execution" }]);
  });
  it("rejects a changed profile on replay and a lost ownership lease before sampling", async () => {
    const f = await fixture(); vi.mocked(f.ports.submit).mockRejectedValueOnce(new Error("preflight"));
    await expect(runLongVideoExecution(f.root, f.frozen, f.ports, f.signal)).rejects.toThrow();
    await expect(runLongVideoExecution(f.root, { ...f.frozen, profile: { ...f.frozen.profile, seed: 43 } }, f.ports, f.signal)).rejects.toThrow(/snapshot/);
    vi.mocked(f.ports.assertLease).mockRejectedValueOnce(new Error("lease lost"));
    await expect(runLongVideoExecution(f.root, f.frozen, f.ports, f.signal)).rejects.toThrow("lease lost");
    expect(f.ports.submit).toHaveBeenCalledTimes(1);
  });
  it("preserves completed group facts across cancellation and handles undefined optional profile fields on replay", async () => {
    const f = await fixture(); f.frozen.profile.lora = undefined;
    const controller = new AbortController();
    vi.mocked(f.ports.wait).mockImplementationOnce(async submission => { controller.abort(); return { receipt: receipt(submission.request), outputs: {} }; });
    await expect(runLongVideoExecution(f.root, f.frozen, f.ports, controller.signal)).rejects.toThrow();
    await runLongVideoExecution(f.root, f.frozen, f.ports, f.signal);
    expect(vi.mocked(f.ports.submit).mock.calls.map(call => call[0].expected_prefix_chunks)).toEqual([0, 1]);
  });
  it("refuses a second local owner while the first owns the execution", async () => {
    const f = await fixture(); let release!: () => void;
    vi.mocked(f.ports.assertLease).mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    const running = runLongVideoExecution(f.root, f.frozen, f.ports, f.signal);
    await expect(runLongVideoExecution(f.root, f.frozen, f.ports, f.signal)).rejects.toThrow(/already active/);
    release(); await running;
    expect(f.ports.submit).toHaveBeenCalledTimes(2);
  });
  it("accepts an atomic terminal pair without inventing two independently sampled pages", async () => {
    const f = await fixture();
    vi.mocked(f.ports.wait).mockImplementation(async submission => {
      const r = receipt(submission.request, true, 2);
      r.output_groups = [{ physical_group: 1, logical_chunks: [1, 2], total_frames: 243, trim_frames: 0, net_frames: 243, context_frames: 0 }];
      return { receipt: r, outputs: {} };
    });
    expect((await runLongVideoExecution(f.root, f.frozen, f.ports, f.signal)).phase).toBe("published");
    expect(f.ports.submit).toHaveBeenCalledTimes(1);
  });
  it("refuses to mix a different adopted prompt or unsafe execution directory into a snapshot", () => {
    const f = snapshot();
    expect(() => freezeLongVideoExecution("task", "../execution", f.script, f.profile)).toThrow(/identity/);
    expect(() => freezeLongVideoExecution("task", "execution", f.script, { ...f.profile, prompts: ["unadopted", "Adopted prompt 1"] })).toThrow(/mismatched/);
  });
  it("refuses a broken journal hash chain before allowing a new submission", async () => {
    const f = await fixture(); vi.mocked(f.ports.submit).mockRejectedValueOnce(new Error("preflight"));
    await expect(runLongVideoExecution(f.root, f.frozen, f.ports, f.signal)).rejects.toThrow("preflight");
    const filename = path.join(f.root, f.frozen.executionId, "journal", "000001.json");
    const entry = JSON.parse(await fs.readFile(filename, "utf8")); entry.previousHash = "broken";
    await fs.writeFile(filename, JSON.stringify(entry));
    await expect(runLongVideoExecution(f.root, f.frozen, f.ports, f.signal)).rejects.toThrow(/Broken/);
    expect(f.ports.submit).toHaveBeenCalledTimes(1);
  });
});
