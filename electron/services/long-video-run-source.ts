import path from "node:path";
import { promises as fs } from "node:fs";
import { assertLongVideoRunSource, type LongVideoRunSource } from "../../src/core/long-video/run-source.js";
import { hashLongVideoFile } from "./long-video-media.js";

const pathKey = (filename: string) => process.platform === "win32" ? path.resolve(filename).toLowerCase() : path.resolve(filename);
const within = (root: string, filename: string) => { const relative = path.relative(root, filename); return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative); };

/** Read-only eligibility. The official Run lock still checks head/contract again before writing. */
export async function verifyLongVideoRunSource(outputRoot: string, source: LongVideoRunSource, signal: AbortSignal) {
  assertLongVideoRunSource(source); signal.throwIfAborted();
  const root = await fs.realpath(outputRoot);
  const receipt = source.receipt;
  const revisionRoot = await fs.realpath(receipt.run_storage_path);
  const allowed = ["h3_continuum", "h3-continuum"].map(folder => path.join(root, folder, "runs", receipt.run_name, "revisions", receipt.revision_id));
  if (!within(root, revisionRoot) || !allowed.some(directory => pathKey(directory) === pathKey(revisionRoot))) throw new Error("Group Run source escapes its selected output root");
  const manifestPath = path.join(revisionRoot, "manifest.json"), projectPath = path.join(revisionRoot, "..", "..", "project.json");
  const manifestBytes = await fs.readFile(manifestPath), projectBytes = await fs.readFile(projectPath);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  if (JSON.parse(projectBytes.toString("utf8")).canonical_storage_revision_id !== receipt.revision_id) throw new Error("Group Run source head is stale; reopen its current accepted version");
  if (manifest.run_storage_schema_version !== 3 || manifest.sampling_contract_version !== 6 || manifest.resume_safe !== true ||
      manifest.revision_id !== receipt.revision_id || manifest.run_name !== receipt.run_name || manifest.contract_sha256 !== receipt.contract_sha256 ||
      manifest.status !== "complete" || manifest.contract?.chunk_count !== receipt.accepted_chunks || !Array.isArray(manifest.chunks) ||
      manifest.chunks.length !== receipt.accepted_chunks) throw new Error("Group Run source manifest no longer matches the accepted receipt");
  const revisionsRoot = path.dirname(revisionRoot);
  for (const [index, record] of receipt.chunk_records.entries()) {
    signal.throwIfAborted();
    const stored = manifest.chunks[index];
    if (stored.sequence_index !== index || stored.storage_revision_id !== record.storage_revision_id || stored.filename !== record.record_filename ||
        stored.file_size !== record.payload_bytes || stored.file_sha256 !== record.payload_sha256 ||
        (record.generated && record.storage_revision_id !== receipt.revision_id)) throw new Error("Group Run source prefix owner/hash changed");
    const expectedPath = path.join(revisionsRoot, record.storage_revision_id, "chunks", record.record_filename);
    const filename = await fs.realpath(record.payload_path);
    if (!within(revisionsRoot, filename) || pathKey(filename) !== pathKey(expectedPath)) throw new Error("Group Run source payload escapes its registered owner");
    const before = await fs.stat(filename);
    if (!before.isFile() || before.size !== record.payload_bytes || await hashLongVideoFile(filename, signal) !== record.payload_sha256) throw new Error("Group Run source payload bytes/hash mismatch");
    const after = await fs.stat(filename);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error("Group Run source payload changed while checking");
  }
  if (!(await fs.readFile(manifestPath)).equals(manifestBytes) || !(await fs.readFile(projectPath)).equals(projectBytes)) throw new Error("Group Run source head/manifest changed while checking");
  return { outputRoot: root, revisionRoot, acceptedChunks: receipt.accepted_chunks, revisionId: receipt.revision_id };
}
