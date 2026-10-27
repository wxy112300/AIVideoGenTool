import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Settings } from "../../src/types.js";
import { assertLongVideoExecutionSnapshot, assertLongVideoMediaEvidence, type LongVideoExecutionSnapshot, type LongVideoMediaEvidence } from "../../src/core/long-video/execution.js";
import { acceptContinuumGroupCheckpoint, type ContinuumGroupReceipt, type ContinuumGroupRequest } from "../../src/core/long-video/group-checkpoint.js";
import { commitContinuumGroupCheckpoint } from "./long-video-checkpoint-store.js";
import { submitContinuumGroup, waitForContinuumGroup } from "./long-video-continuum.js";
import type { LongVideoRunSource } from "../../src/core/long-video/run-source.js";

type Submission = Awaited<ReturnType<typeof submitContinuumGroup>>;
type GroupResult = Awaited<ReturnType<typeof waitForContinuumGroup>>;
type Event =
  | { kind: "snapshot"; snapshot: LongVideoExecutionSnapshot }
  | { kind: "prepared"; request: ContinuumGroupRequest }
  | { kind: "posting" }
  | { kind: "submitted"; submission: Submission }
  | { kind: "accepted"; result: GroupResult }
  | { kind: "validated"; media: LongVideoMediaEvidence }
  | { kind: "published" };
interface Entry { schemaVersion: 1; index: number; previousHash: string; event: Event; }

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(item => canonical(item ?? null)).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
const digest = (value: unknown) => crypto.createHash("sha256").update(canonical(value)).digest("hex");
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const active = new Set<string>();

/** Immutable event publication. A partial write never replaces accepted facts. */
class Journal {
  entries: Entry[] = [];
  constructor(readonly directory: string) {}
  async load() {
    await fs.mkdir(this.directory, { recursive: true });
    const names = (await fs.readdir(this.directory)).filter(name => /^\d{6}\.json$/u.test(name)).sort();
    for (const name of names) {
      const entry = JSON.parse(await fs.readFile(path.join(this.directory, name), "utf8")) as Entry;
      if (name !== `${String(this.entries.length).padStart(6, "0")}.json` || entry.schemaVersion !== 1 || entry.index !== this.entries.length || entry.previousHash !== this.hash()) throw new Error("Broken parent execution journal");
      this.entries.push(entry);
    }
  }
  hash() { return this.entries.length ? digest(this.entries[this.entries.length - 1]) : ""; }
  async append(event: Event) {
    const entry: Entry = { schemaVersion: 1, index: this.entries.length, previousHash: this.hash(), event: structuredClone(event) };
    const filename = path.join(this.directory, `${String(entry.index).padStart(6, "0")}.json`);
    const partial = `${filename}.${crypto.randomUUID()}.partial`;
    try {
      const handle = await fs.open(partial, "wx");
      try { await handle.writeFile(JSON.stringify(entry)); await handle.sync(); } finally { await handle.close(); }
      // An overlapping writer must stop even when it proposed identical facts.
      // Idempotence belongs at replay, never at permission to POST twice.
      try { await fs.link(partial, filename); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("Parent execution journal has another writer"); throw error; }
      this.entries.push(entry);
    } finally { await fs.rm(partial, { force: true }); }
  }
}

interface Projection {
  snapshot: LongVideoExecutionSnapshot;
  accepted: GroupResult[];
  pending?: { phase: "prepared" | "posting" | "submitted"; request: ContinuumGroupRequest; submission?: Submission };
  media?: LongVideoMediaEvidence;
  published: boolean;
}

function nextRequest(state: Projection): ContinuumGroupRequest {
  const last = state.accepted.at(-1)?.receipt ?? state.snapshot.parent?.receipt;
  const prefix = last?.accepted_chunks ?? 0;
  return { execution_id: state.snapshot.executionId, project_id: state.snapshot.projectId, run_name: state.snapshot.runName,
    step_id: `group-${prefix + 1}`, attempt_id: "attempt-1", planned_chunks: state.snapshot.script.layout.totalChunks,
    expected_prefix_chunks: prefix, expected_parent_revision_id: last?.revision_id ?? "" };
}

function assertPrefix(prior: ContinuumGroupReceipt | undefined, next: ContinuumGroupReceipt) {
  if (!prior) return;
  for (const old of prior.chunk_records) {
    const current = next.chunk_records[old.logical_chunk_index - 1];
    for (const key of ["storage_revision_id", "record_filename", "payload_path", "payload_bytes", "payload_sha256"] as const) {
      if (!current || current[key] !== old[key]) throw new Error("Accepted prefix owner/payload changed");
    }
  }
}

function replay(entries: Entry[], expected: LongVideoExecutionSnapshot): Projection {
  const state: Projection = { snapshot: structuredClone(expected), accepted: [], published: false };
  for (const [index, { event }] of entries.entries()) {
    if (event.kind === "snapshot") {
      if (index !== 0 || !same(event.snapshot, expected)) throw new Error("Parent snapshot identity/profile changed");
      continue;
    }
    if (index === 0 || state.published) throw new Error("Invalid parent execution transition");
    if (event.kind === "prepared") {
      if (state.pending || state.media || (state.accepted.at(-1)?.receipt.accepted_chunks ?? expected.parent?.receipt.accepted_chunks ?? 0) >= expected.script.layout.totalChunks || !same(event.request, nextRequest(state))) throw new Error("Invalid parent group request");
      state.pending = { phase: "prepared", request: event.request };
    } else if (event.kind === "posting") {
      if (state.pending?.phase !== "prepared") throw new Error("Invalid sampling intent");
      state.pending.phase = "posting";
    } else if (event.kind === "submitted") {
      if (state.pending?.phase !== "posting" || !same(event.submission.request, state.pending.request) || !event.submission.promptId || !event.submission.clientId) throw new Error("Invalid submitted prompt identity");
      state.pending.phase = "submitted"; state.pending.submission = event.submission;
    } else if (event.kind === "accepted") {
      if (state.pending?.phase !== "submitted") throw new Error("Receipt has no submitted owner");
      const receipt = acceptContinuumGroupCheckpoint(state.pending.request, event.result.receipt);
      assertPrefix(state.accepted.at(-1)?.receipt ?? expected.parent?.receipt, receipt);
      state.accepted.push({ ...event.result, receipt }); delete state.pending;
    } else if (event.kind === "validated") {
      if (state.pending || state.media || !state.accepted.at(-1)?.receipt.final_output) throw new Error("Partial output cannot become a final movie");
      assertLongVideoMediaEvidence(expected, event.media); state.media = event.media;
    } else if (event.kind === "published") {
      if (!state.media || state.pending) throw new Error("Movie is not validated");
      state.published = true;
    } else throw new Error("Unknown parent execution event");
  }
  return state;
}

export interface LongVideoExecutionPorts {
  /** Caller owns the single Queue/GPU lease; checked again before every mutation. */
  assertLease(): Promise<void>;
  /** Existing-Run entry must revalidate its actual head/files before the first POST. */
  assertSource?(source: LongVideoRunSource, signal: AbortSignal): Promise<void>;
  submit(request: ContinuumGroupRequest, profile: LongVideoExecutionSnapshot["profile"], signal: AbortSignal, beforePost: () => Promise<void>): Promise<Submission>;
  wait(submission: Submission, signal: AbortSignal, progress: (value: number, stage: string) => void): Promise<GroupResult>;
  validateFinal(snapshot: LongVideoExecutionSnapshot, result: GroupResult, signal: AbortSignal): Promise<LongVideoMediaEvidence>;
  /** Must transactionally upsert these stable IDs; retry after an uncertain reply is expected. */
  publish(snapshot: LongVideoExecutionSnapshot, media: LongVideoMediaEvidence, identity: { assetId: string; versionId: string }, signal: AbortSignal, final: GroupResult): Promise<void>;
  onSubmitted?(submission: Submission): Promise<void>;
  onProgress?(accepted: number, planned: number, groupProgress: number, stage: string): void | Promise<void>;
}

/** Bind the existing app transport, never a second ComfyUI runtime or raw UI API. */
export function continuumParentTransport(settings: Settings, templatePath: string): Pick<LongVideoExecutionPorts, "submit" | "wait"> {
  const frozen = structuredClone(settings);
  return {
    submit: (request, profile, signal, beforePost) => submitContinuumGroup(frozen, templatePath, request, profile, signal, beforePost),
    wait: (submission, signal, progress) => waitForContinuumGroup(submission, frozen, signal, progress)
  };
}

export async function runLongVideoExecution(root: string, input: LongVideoExecutionSnapshot, ports: LongVideoExecutionPorts, signal: AbortSignal) {
  const snapshot = structuredClone(input);
  assertLongVideoExecutionSnapshot(snapshot);
  const directory = path.resolve(root, snapshot.executionId);
  const key = process.platform === "win32" ? directory.toLowerCase() : directory;
  if (active.has(key)) throw new Error("Parent execution is already active");
  active.add(key);
  try {
    await ports.assertLease(); signal.throwIfAborted();
    const journal = new Journal(path.join(directory, "journal"));
    await journal.load();
    if (!journal.entries.length) await journal.append({ kind: "snapshot", snapshot });
    let state = replay(journal.entries, snapshot);
    const append = async (event: Event) => {
      // Reject invalid provider facts before they can poison durable replay.
      replay([...journal.entries, { schemaVersion: 1, index: journal.entries.length, previousHash: journal.hash(), event }], snapshot);
      await journal.append(event); state = replay(journal.entries, snapshot);
    };
    while (!state.published) {
      signal.throwIfAborted(); await ports.assertLease();
      if (state.pending?.phase === "posting") return { phase: "uncertain-submission" as const, request: structuredClone(state.pending.request) };
      if (state.media) {
        await ports.publish(structuredClone(snapshot), structuredClone(state.media), { assetId: snapshot.taskId, versionId: snapshot.executionId }, signal, structuredClone(state.accepted.at(-1)!));
        await append({ kind: "published" }); continue;
      }
      const last = state.accepted.at(-1);
      if (!state.pending && last?.receipt.sequence_complete) {
        if (!last.receipt.final_output) return { phase: "needs-assembly" as const, receipt: structuredClone(last.receipt) };
        const media = await ports.validateFinal(structuredClone(snapshot), structuredClone(last), signal);
        assertLongVideoMediaEvidence(snapshot, media);
        await append({ kind: "validated", media }); continue;
      }
      if (!state.pending) await append({ kind: "prepared", request: nextRequest(state) });
      if (state.pending?.phase === "prepared") {
        const request = structuredClone(state.pending.request);
        const submission = await ports.submit(request, structuredClone(snapshot.profile), signal, async () => {
          signal.throwIfAborted(); await ports.assertLease();
          if (snapshot.parent && request.expected_prefix_chunks === snapshot.parent.receipt.accepted_chunks) {
            if (!ports.assertSource) throw new Error("Existing-Run execution requires source verification");
            await ports.assertSource(structuredClone(snapshot.parent), signal);
          }
          await append({ kind: "posting" });
        });
        await append({ kind: "submitted", submission });
      }
      if (state.pending?.phase !== "submitted" || !state.pending.submission) throw new Error("Missing submitted group");
      const pending = structuredClone(state.pending);
      await ports.onSubmitted?.(structuredClone(pending.submission!));
      const result = await ports.wait(pending.submission!, signal, (value, stage) => ports.onProgress?.(pending.request.expected_prefix_chunks, snapshot.script.layout.totalChunks, value, stage));
      const receipt = acceptContinuumGroupCheckpoint(pending.request, result.receipt);
      assertPrefix(state.accepted.at(-1)?.receipt ?? snapshot.parent?.receipt, receipt);
      await commitContinuumGroupCheckpoint(path.join(directory, "checkpoints"), pending.request, receipt);
      await append({ kind: "accepted", result: { ...result, receipt } });
      await ports.onProgress?.(receipt.accepted_chunks, snapshot.script.layout.totalChunks, 100, "group-accepted");
    }
    return { phase: "published" as const, taskId: snapshot.taskId, executionId: snapshot.executionId, media: structuredClone(state.media!) };
  } finally { active.delete(key); }
}
