import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { acceptContinuumGroupCheckpoint, type ContinuumGroupRequest } from "../../src/core/long-video/group-checkpoint.js";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

/** Publish validated receipt evidence once. Never overwrite a prior step attempt.
 * This is not Run rollback or reconciliation of an uncertain sampling request.
 */
export async function commitContinuumGroupCheckpoint(directory: string, request: ContinuumGroupRequest, raw: unknown) {
  const receipt = acceptContinuumGroupCheckpoint(request, raw);
  const checkpoint = { schemaVersion: 1, request: structuredClone(request), receipt };
  const stepDirectory = path.join(directory, request.execution_id, request.step_id);
  await fs.mkdir(stepDirectory, { recursive: true });
  const filename = path.join(stepDirectory, `${request.attempt_id}.json`);
  const partial = `${filename}.${crypto.randomUUID()}.partial`;
  const contents = JSON.stringify(checkpoint, null, 2);
  try {
    const handle = await fs.open(partial, "wx");
    try { await handle.writeFile(contents); await handle.sync(); }
    finally { await handle.close(); }
    try { await fs.link(partial, filename); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const prior = JSON.parse(await fs.readFile(filename, "utf8")) as unknown;
      if (canonical(prior) !== canonical(checkpoint)) throw new Error("Continuum checkpoint attempt already has different committed facts");
    }
  } finally { await fs.rm(partial, { force: true }); }
  return { filename, checkpoint };
}
