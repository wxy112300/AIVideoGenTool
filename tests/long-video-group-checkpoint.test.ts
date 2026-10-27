import { describe, expect, it } from "vitest";
import { acceptContinuumGroupCheckpoint, parseContinuumGroupReceipt, type ContinuumGroupReceipt, type ContinuumGroupRequest } from "../src/core/long-video/group-checkpoint";
import { validateH3ContinuumManagedReceipt } from "../src/core/h3-continuum-managed-receipt";
import { commitContinuumGroupCheckpoint } from "../electron/services/long-video-checkpoint-store";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

function fixture(before = 0, accepted = 1, planned = 3, full = false): ContinuumGroupReceipt {
  const indices = Array.from({ length: full ? accepted : accepted - before }, (_, i) => (full ? 1 : before + 1) + i);
  return {
    schema_version: 1, kind: "continuum_group", execution_id: "execution", step_id: `step-${before}`, attempt_id: "attempt-1",
    project_id: "project", run_name: "run", revision_id: `revision-${accepted}`, run_storage_path: "/output/h3_continuum/runs/run/revisions/rev",
    package_version: "3.10.2", run_storage_schema_version: 3, sampling_contract_version: 6, contract_sha256: "a".repeat(64), resume_safe: true,
    expected_parent_revision_id: before ? `revision-${before}` : "", planned_chunks: planned, accepted_chunks: accepted,
    reused_count: before, generated_count: accepted - before, physical_group: { index: before + 1, start: before + 1, end: accepted },
    chunk_records: Array.from({ length: accepted }, (_, i) => ({ logical_chunk_index: i + 1, storage_revision_id: "owner",
      record_filename: `chunk-${i + 1}.safetensors`, payload_path: `/output/chunk-${i + 1}.safetensors`, payload_bytes: 100,
      payload_sha256: "b".repeat(64), reused: i < before, generated: i >= before })),
    output_scope: full ? "full_accepted_prefix" : "current_physical_group",
    output_groups: indices.map(i => ({ physical_group: i, logical_chunks: [i], total_frames: 124, trim_frames: i === 1 ? 0 : 22, net_frames: i === 1 ? 124 : 102, context_frames: i === 1 ? 0 : 22 })),
    sequence_complete: accepted === planned, final_output: accepted === planned && full
  };
}

const request = (r: ContinuumGroupReceipt): ContinuumGroupRequest => ({ ...r, expected_prefix_chunks: r.reused_count });

describe("Continuum physical group checkpoints", () => {
  it("publishes an immutable restart-readable checkpoint and refuses a conflicting duplicate callback", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "continuum-group-checkpoint-"));
    try {
      const r = fixture();
      const first = await commitContinuumGroupCheckpoint(directory, request(r), r);
      const original = await fs.readFile(first.filename, "utf8");
      expect(JSON.parse(original).receipt.accepted_chunks).toBe(1);
      await Promise.all([commitContinuumGroupCheckpoint(directory, request(r), r), commitContinuumGroupCheckpoint(directory, request(r), r)]);
      await expect(commitContinuumGroupCheckpoint(directory, request(r), { ...r, revision_id: "another-head" })).rejects.toThrow(/different committed/);
      expect(await fs.readFile(first.filename, "utf8")).toBe(original);
      expect((await fs.readdir(path.dirname(first.filename))).filter(file => file.endsWith(".partial"))).toEqual([]);
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
  });
  it("accepts partial progress without publishing a final output or weakening legacy receipts", () => {
    const first = fixture();
    const accepted = acceptContinuumGroupCheckpoint(request(first), JSON.stringify(first));
    expect(accepted.accepted_chunks).toBe(1);
    expect(accepted.final_output).toBe(false);
    expect(validateH3ContinuumManagedReceipt(first)).not.toBeNull();
    first.chunk_records[0].payload_sha256 = "c".repeat(64);
    expect(accepted.chunk_records[0].payload_sha256).toBe("b".repeat(64));
  });
  it("separates current group previews from complete prefix/final output", () => {
    expect(parseContinuumGroupReceipt(fixture(1, 2)).final_output).toBe(false);
    expect(parseContinuumGroupReceipt(fixture(2, 3, 3, true)).final_output).toBe(true);
    expect(parseContinuumGroupReceipt(fixture(2, 3)).final_output).toBe(false);
  });
  it("accepts a terminal physical pair only as one atomic decode group", () => {
    const merged = fixture(1, 3, 3, false);
    merged.output_groups = [{ physical_group: 2, logical_chunks: [2, 3], total_frames: 243, trim_frames: 22, net_frames: 221, context_frames: 22 }];
    expect(parseContinuumGroupReceipt(merged).generated_count).toBe(2);
    expect(() => parseContinuumGroupReceipt(fixture(1, 3, 3))).toThrow(/split/);
    expect(() => parseContinuumGroupReceipt({ ...merged, planned_chunks: 4, sequence_complete: false })).toThrow(/terminal/);
  });
  it.each(["execution_id", "step_id", "attempt_id", "project_id", "run_name", "expected_parent_revision_id"] as const)("rejects a receipt from a different frozen %s", key => {
    const r = fixture(1, 2);
    expect(() => acceptContinuumGroupCheckpoint({ ...request(r), [key]: "other" }, r)).toThrow(/frozen/);
  });
  it("rejects stale prefixes, omitted payloads, unsafe contracts, false completion and wrong projections", () => {
    const r = fixture(1, 2);
    expect(() => acceptContinuumGroupCheckpoint({ ...request(r), expected_prefix_chunks: 0 }, r)).toThrow(/prefix/);
    for (const change of [{ chunk_records: [] }, { resume_safe: false }, { sampling_contract_version: 5 }, { final_output: true }, { output_scope: "full_accepted_prefix" }, { generated_count: 3 }]) {
      expect(() => parseContinuumGroupReceipt({ ...r, ...change })).toThrow();
    }
    r.output_groups[0].net_frames += 1;
    expect(() => parseContinuumGroupReceipt(r)).toThrow(/frame/);
    expect(() => parseContinuumGroupReceipt({ ...fixture(), execution_id: ".." })).toThrow(/execution_id/);
  });
});
