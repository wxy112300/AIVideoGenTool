import { afterEach, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { completedGroupVersion } from "./harness/long-video-source";
import { JsonStore } from "../electron/store";
import { createDefaultState } from "../src/core/defaults";
import { longVideoContinuationDraft } from "../src/core/long-video/continuation-draft";
import { editLongVideoScript } from "../src/core/long-video/script";
import { enqueueLongVideoExtension } from "../electron/services/long-video-enqueue";
import type { QueueEnqueueServiceDependencies } from "../electron/queue-enqueue";
import type { HistoryAsset } from "../src/types";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-group-enqueue-")); roots.push(root);
  const version = completedGroupVersion(), receipt = version.longVideoReceipt!;
  receipt.run_storage_path = path.join(root, "h3_continuum", "runs", receipt.run_name, "revisions", receipt.revision_id);
  await fs.mkdir(receipt.run_storage_path, { recursive: true });
  for (const record of receipt.chunk_records) {
    record.payload_path = path.join(path.dirname(receipt.run_storage_path), record.storage_revision_id, "chunks", record.record_filename);
    const bytes = Buffer.from(`frozen raw payload ${record.logical_chunk_index}`);
    record.payload_bytes = bytes.length; record.payload_sha256 = createHash("sha256").update(bytes).digest("hex");
    await fs.mkdir(path.dirname(record.payload_path), { recursive: true }); await fs.writeFile(record.payload_path, bytes);
  }
  const projectPath = path.join(receipt.run_storage_path, "..", "..", "project.json");
  await fs.writeFile(projectPath, JSON.stringify({ canonical_storage_revision_id: receipt.revision_id }));
  await fs.writeFile(path.join(receipt.run_storage_path, "manifest.json"), JSON.stringify({ run_storage_schema_version: 3, sampling_contract_version: 6,
    resume_safe: true, revision_id: receipt.revision_id, run_name: receipt.run_name, contract_sha256: receipt.contract_sha256, status: "complete",
    contract: { chunk_count: 2 }, chunks: receipt.chunk_records.map((r, i) => ({ sequence_index: i, storage_revision_id: r.storage_revision_id,
      filename: r.record_filename, file_size: r.payload_bytes, file_sha256: r.payload_sha256 })) }));
  version.files[0]!.absolutePath = path.join(root, "source.mp4"); await fs.writeFile(version.files[0]!.absolutePath, "preview fixture");
  const state = createDefaultState(); state.history = [{ id: "source-asset", outputFilename: "source.mp4", versions: [version] } as HistoryAsset];
  const storePath = path.join(root, "state.json"); await fs.writeFile(storePath, JSON.stringify(state));
  const store = new JsonStore(storePath); await store.load();
  let i = 0; const id = () => `future-${++i}`;
  const draft = longVideoContinuationDraft(store.get().draft, "source-asset", version, version.files[0]!.absolutePath!, id);
  draft.longVideoScript = editLongVideoScript(draft.longVideoScript!, [{ pageId: draft.longVideoScript!.segments[0]!.id, text: "The red block slowly turns." }], 0, "user", id);
  draft.longVideoEditor!.confirmed = true;
  const deps = { store, logger: { info: vi.fn() }, sendState: vi.fn(), resolveTaskOutputDirectory: async () => root, getCachedEnvironmentScanForQueue: () => undefined } as unknown as QueueEnqueueServiceDependencies;
  return { root, draft, deps, projectPath };
}
it("checks actual Run owners and freezes one inherited extension without changing global settings", async () => {
  const f = await fixture(), beforeSettings = structuredClone(f.deps.store.get().settings);
  const state = await enqueueLongVideoExtension(f.deps, f.draft);
  expect(state.queue).toHaveLength(1); expect(state.settings).toEqual(beforeSettings);
  expect(state.queue[0]).toMatchObject({ taskType: "extension", duration: 5, seed: 42, attentionMode: "pytorch", h3VideoVaeMode: "fp16",
    longVideoPlan: { layout: { prefixChunks: 2, totalChunks: 3 } }, longVideoRunSource: { receipt: { revision_id: "revision-2" } } });
  expect(state.queue[0]!.longVideoRoot).toBe(path.join(f.root, ".lvs-long-video"));
  f.draft.longVideoRunSource!.profile.seed = 99;
  expect(state.queue[0]!.taskType !== "image-generation" && state.queue[0]!.longVideoRunSource!.profile.seed).toBe(42);
});
it("rejects a stale selected head before adding a task and preserves source files", async () => {
  const f = await fixture(); await fs.writeFile(f.projectPath, JSON.stringify({ canonical_storage_revision_id: "newer-head" }));
  await expect(enqueueLongVideoExtension(f.deps, f.draft)).rejects.toThrow(/stale/);
  expect(f.deps.store.get().queue).toEqual([]);
  expect((await fs.stat(f.draft.longVideoRunSource!.receipt.chunk_records[0]!.payload_path)).isFile()).toBe(true);
});
it("does not accept a client-modified profile as the stored History source", async () => {
  const f = await fixture(); f.draft.seed = 99; f.draft.longVideoRunSource!.profile.seed = 99;
  await expect(enqueueLongVideoExtension(f.deps, f.draft)).rejects.toThrow(/source changed/);
  expect(f.deps.store.get().queue).toEqual([]);
});
