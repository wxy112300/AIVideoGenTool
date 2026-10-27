/** Internal P0 protocol. Never reinterpret a partial group as a legacy receipt. */
export interface ContinuumGroupRequest {
  execution_id: string;
  step_id: string;
  attempt_id: string;
  project_id: string;
  run_name: string;
  planned_chunks: number;
  expected_prefix_chunks: number;
  expected_parent_revision_id: string;
}

interface GroupOutput {
  physical_group: number;
  logical_chunks: number[];
  total_frames: number;
  trim_frames: number;
  net_frames: number;
  context_frames: number;
}

export interface ContinuumGroupReceipt extends Omit<ContinuumGroupRequest, "expected_prefix_chunks"> {
  schema_version: 1;
  kind: "continuum_group";
  revision_id: string;
  run_storage_path: string;
  package_version: string;
  run_storage_schema_version: 3;
  sampling_contract_version: 6;
  contract_sha256: string;
  resume_safe: true;
  accepted_chunks: number;
  reused_count: number;
  generated_count: number;
  physical_group: { index: number; start: number; end: number };
  chunk_records: Array<{
    logical_chunk_index: number;
    storage_revision_id: string;
    record_filename: string;
    payload_path: string;
    payload_bytes: number;
    payload_sha256: string;
    reused: boolean;
    generated: boolean;
  }>;
  output_scope: "current_physical_group" | "full_accepted_prefix";
  output_groups: GroupOutput[];
  sequence_complete: boolean;
  /** Scope eligibility only; decoded media validation and History publication are separate. */
  final_output: boolean;
}

function requireFact(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Continuum group checkpoint: ${message}`);
}
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const integer = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
export const isContinuumIdentity = (value: unknown): value is string => typeof value === "string" && value !== "." && value !== ".." && /^[A-Za-z0-9._-]{1,200}$/u.test(value);
const identifier = isContinuumIdentity;
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const hash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);

export function parseContinuumGroupReceipt(value: unknown): ContinuumGroupReceipt {
  if (typeof value === "string") value = JSON.parse(value) as unknown;
  requireFact(record(value) && value.schema_version === 1 && value.kind === "continuum_group", "unknown receipt kind/schema");
  for (const key of ["execution_id", "step_id", "attempt_id", "project_id", "run_name", "revision_id"]) requireFact(identifier(value[key]), `invalid ${key}`);
  requireFact(text(value.run_storage_path) && text(value.package_version), "missing writer identity");
  requireFact(value.run_storage_schema_version === 3 && value.sampling_contract_version === 6 && hash(value.contract_sha256) && value.resume_safe === true, "unproven reusable sampling contract");
  requireFact(integer(value.planned_chunks, 1, 16) && integer(value.accepted_chunks, 1, value.planned_chunks), "invalid planned/accepted counts");
  requireFact(integer(value.reused_count, 0, value.accepted_chunks - 1) && integer(value.generated_count, 1, 2) && value.reused_count + value.generated_count === value.accepted_chunks, "invalid reused/generated counts");
  requireFact(value.reused_count ? identifier(value.expected_parent_revision_id) : value.expected_parent_revision_id === "", "invalid parent revision");
  const group = value.physical_group;
  requireFact(record(group) && group.index === value.reused_count + 1 && group.start === group.index && group.end === value.accepted_chunks, "physical group does not extend the accepted prefix");
  // The official engine only merges the final pair; a logical page is not
  // necessarily one physical group or independently retryable.
  requireFact(value.generated_count === 1 || value.accepted_chunks === value.planned_chunks, "merged physical group is not terminal");
  requireFact(Array.isArray(value.chunk_records) && value.chunk_records.length === value.accepted_chunks, "incomplete accepted records");
  for (const [index, chunk] of value.chunk_records.entries()) {
    requireFact(record(chunk) && chunk.logical_chunk_index === index + 1 && identifier(chunk.storage_revision_id) && identifier(chunk.record_filename) && chunk.record_filename.endsWith(".safetensors"), "invalid chunk identity");
    requireFact(text(chunk.payload_path) && integer(chunk.payload_bytes, 1) && hash(chunk.payload_sha256), "missing payload evidence");
    requireFact(chunk.reused === (index < value.reused_count) && chunk.generated === (index >= value.reused_count), "chunk reuse disagrees with prefix");
  }
  requireFact(value.output_scope === "current_physical_group" || value.output_scope === "full_accepted_prefix", "unknown output scope");
  requireFact(Array.isArray(value.output_groups) && value.output_groups.length > 0, "empty output projection");
  const indices: number[] = [];
  for (const decoded of value.output_groups) {
    requireFact(record(decoded) && Array.isArray(decoded.logical_chunks) && decoded.logical_chunks.length >= 1 && decoded.logical_chunks.length <= 2, "invalid decode group");
    const logical: unknown[] = decoded.logical_chunks;
    requireFact(logical.every((item, index) => integer(item, 1, value.accepted_chunks as number) && (index === 0 || item === (logical[index - 1] as number) + 1)) && decoded.physical_group === logical[0], "invalid decode group identity");
    requireFact(logical.length === 1 || (logical[1] === value.planned_chunks && logical[0] === value.planned_chunks - 1), "split or nonterminal merged group");
    requireFact(integer(decoded.total_frames, 1) && integer(decoded.trim_frames) && integer(decoded.net_frames, 1) && decoded.total_frames - decoded.trim_frames === decoded.net_frames && integer(decoded.context_frames), "invalid output frame facts");
    indices.push(...logical as number[]);
  }
  const start = value.output_scope === "full_accepted_prefix" ? 1 : group.start as number;
  requireFact(indices.length === value.accepted_chunks - start + 1 && indices.every((item, index) => item === start + index), "output does not cover declared scope");
  if (value.generated_count === 2) requireFact(value.output_groups.some(decoded => record(decoded) && Array.isArray(decoded.logical_chunks) && decoded.logical_chunks.length === 2), "merged group split across decode outputs");
  const complete = value.accepted_chunks === value.planned_chunks;
  requireFact(value.sequence_complete === complete && value.final_output === (complete && value.output_scope === "full_accepted_prefix"), "partial output mislabeled as final");
  return structuredClone(value) as unknown as ContinuumGroupReceipt;
}

/** Bind a receipt to frozen request facts before any persistent checkpoint write. */
export function acceptContinuumGroupCheckpoint(request: ContinuumGroupRequest, value: unknown): ContinuumGroupReceipt {
  const receipt = parseContinuumGroupReceipt(value);
  for (const key of ["execution_id", "step_id", "attempt_id", "project_id", "run_name", "planned_chunks", "expected_parent_revision_id"] as const) {
    requireFact(receipt[key] === request[key], `receipt differs from frozen ${key}`);
  }
  requireFact(receipt.reused_count === request.expected_prefix_chunks, "accepted prefix changed since request binding");
  return receipt;
}
