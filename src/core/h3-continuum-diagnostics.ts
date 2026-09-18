/**
 * Pure validation for the app-owned Continuum Extend runtime report.
 *
 * The report is emitted by the bundled ComfyUI node and is persisted inside
 * the normal Comfy history output. Keeping the parser here free of Electron
 * and filesystem imports lets queue code, history tests, and the renderer
 * share the same fail-closed contract.
 */

export const H3_CONTINUUM_DIAGNOSTICS_SCHEMA_VERSION = 1 as const;

export interface H3ContinuumTensorFingerprint {
  shape: number[];
  dtype: string;
  finite: true;
  mean: number;
  std: number;
  weighted_sample: number;
}

export interface H3ContinuumInputArtifactDiagnostics {
  reference: string;
  payload_path: string;
  manifest_path?: string;
  payload_sha256: string;
  payload_bytes: number;
  video_shape: number[];
  video_dtype: string;
  audio_shape: number[];
  audio_dtype: string;
}

export interface H3ContinuumRuntimeDiagnostics {
  schema_version: typeof H3_CONTINUUM_DIAGNOSTICS_SCHEMA_VERSION;
  input_artifact: H3ContinuumInputArtifactDiagnostics;
  source_frame_count: number;
  capacity_frames: number;
  video_tail_shape: number[];
  audio_tail_shape: number[];
  video_tail_fingerprint: H3ContinuumTensorFingerprint;
  audio_tail_fingerprint: H3ContinuumTensorFingerprint;
  initial_state_nonempty: true;
  selected_source: "initial_state" | "run_storage" | "explicit_session" | "fresh_run" | "none" | "unknown";
  requested_backend: string;
  resolved_transport: string;
  transport_verified: true;
  transport_evidence: string;
  context_frames: number;
  total_frames: number;
  trim_frames: number;
  net_frames: number;
  state_clip_index: number;
  output_clip_index: number;
  continuation: true;
  fresh_fallback: false;
  actual_assembly_total_frames: number[];
  actual_assembly_trims: number[];
  actual_assembly_net_frames: number[];
  actual_assembly_context_frames: number[];
  assembly_report_present: true;
  spectrum_mode: string;
  spectrum_model_aware_mode: string;
  continuum_package_version?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isShape(value: unknown): value is number[] {
  return Array.isArray(value) && value.length > 0 && value.every(isPositiveInteger);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isFingerprint(value: unknown): value is H3ContinuumTensorFingerprint {
  if (!isRecord(value)) return false;
  return isShape(value.shape) &&
    typeof value.dtype === "string" && value.dtype.trim().length > 0 &&
    value.finite === true &&
    isFiniteNumber(value.mean) &&
    isFiniteNumber(value.std) &&
    isFiniteNumber(value.weighted_sample);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function validateInputArtifact(value: unknown): string | null {
  if (!isRecord(value)) return "input_artifact 缺失或不是对象";
  if (typeof value.reference !== "string" || !value.reference.trim()) {
    return "input_artifact.reference 无效";
  }
  if (typeof value.payload_path !== "string" || !value.payload_path.trim()) {
    return "input_artifact.payload_path 无效";
  }
  if (value.manifest_path !== undefined && (
    typeof value.manifest_path !== "string" || !value.manifest_path.trim()
  )) return "input_artifact.manifest_path 无效";
  if (!isSha256(value.payload_sha256)) return "input_artifact.payload_sha256 无效";
  if (!isPositiveInteger(value.payload_bytes)) return "input_artifact.payload_bytes 无效";
  if (!isShape(value.video_shape) || typeof value.video_dtype !== "string") {
    return "input_artifact video shape/dtype 无效";
  }
  if (!isShape(value.audio_shape) || typeof value.audio_dtype !== "string") {
    return "input_artifact audio shape/dtype 无效";
  }
  return null;
}

function validateAssemblyArrays(value: Record<string, unknown>): string | null {
  const fields = [
    "actual_assembly_total_frames",
    "actual_assembly_trims",
    "actual_assembly_net_frames",
    "actual_assembly_context_frames"
  ] as const;
  for (const field of fields) {
    const entries = value[field];
    if (!Array.isArray(entries) || entries.length === 0 || !entries.every(isNonNegativeInteger)) {
      return `${field} 无效`;
    }
  }
  const totals = value.actual_assembly_total_frames as number[];
  const trims = value.actual_assembly_trims as number[];
  const nets = value.actual_assembly_net_frames as number[];
  const contexts = value.actual_assembly_context_frames as number[];
  if (totals.length !== trims.length || totals.length !== nets.length || totals.length !== contexts.length) {
    return "assembly 诊断数组长度不一致";
  }
  for (let index = 0; index < totals.length; index += 1) {
    const total = totals[index]!;
    const trim = trims[index]!;
    const net = nets[index]!;
    if (total <= 0 || net <= 0 || trim >= total || total - trim !== net) {
      return `assembly 第 ${index + 1} 个 chunk 的 total/trim/net 不一致`;
    }
  }
  return null;
}

/** Return a human-readable error; null means this is a valid Extend report. */
export function validateH3ContinuumExtendDiagnostics(value: unknown): string | null {
  if (!isRecord(value)) return "诊断报告不是对象";
  if (value.schema_version !== H3_CONTINUUM_DIAGNOSTICS_SCHEMA_VERSION) {
    return "诊断报告 schema 版本不受支持";
  }
  const artifactError = validateInputArtifact(value.input_artifact);
  if (artifactError) return artifactError;
  for (const field of ["source_frame_count", "capacity_frames", "context_frames", "total_frames", "trim_frames", "net_frames", "state_clip_index", "output_clip_index"] as const) {
    if (!isPositiveInteger(value[field])) return `${field} 无效`;
  }
  if (![5, 22, 39].includes(value.capacity_frames as number)) return "capacity_frames 不在 Continuum 支持范围";
  if (!isShape(value.video_tail_shape) || !isShape(value.audio_tail_shape)) return "state tail shape 无效";
  if (!isFingerprint(value.video_tail_fingerprint) || !isFingerprint(value.audio_tail_fingerprint)) {
    return "state tail fingerprint 缺失或无效";
  }
  if (value.initial_state_nonempty !== true) return "initial_state 为空";
  if (value.selected_source !== "initial_state") return `实际续写来源不是 initial_state：${String(value.selected_source)}`;
  if (typeof value.requested_backend !== "string" || !value.requested_backend.trim()) return "requested_backend 无效";
  if (typeof value.resolved_transport !== "string" || !value.resolved_transport.trim()) return "resolved_transport 无效";
  if (value.transport_verified !== true) return "上游 sampling report 未证明 continuation transport 已执行";
  if (typeof value.transport_evidence !== "string" || !value.transport_evidence.trim()) {
    return "transport_evidence 缺失";
  }
  if (value.continuation !== true) return "assembly plan 没有标记为 continuation";
  if (value.fresh_fallback !== false) return "检测到 fresh fallback";
  const trimFrames = value.trim_frames;
  const netFrames = value.net_frames;
  const stateClipIndex = value.state_clip_index;
  const outputClipIndex = value.output_clip_index;
  if (typeof trimFrames !== "number" || typeof netFrames !== "number" || trimFrames <= 0 || netFrames <= 0) {
    return "续写 trim/net 不满足正重叠与正输出";
  }
  if (typeof outputClipIndex !== "number" || typeof stateClipIndex !== "number" || outputClipIndex <= stateClipIndex) {
    return "输出 clip index 没有推进";
  }
  if (value.assembly_report_present !== true) return "assembly report 缺失";
  if (typeof value.spectrum_mode !== "string" || !value.spectrum_mode.trim()) return "spectrum_mode 无效";
  if (typeof value.spectrum_model_aware_mode !== "string" || !value.spectrum_model_aware_mode.trim()) {
    return "spectrum_model_aware_mode 无效";
  }
  if (value.continuum_package_version !== undefined && (
    typeof value.continuum_package_version !== "string" || !value.continuum_package_version.trim()
  )) return "continuum_package_version 无效";
  return validateAssemblyArrays(value);
}

function jsonCandidate(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function unwrapCandidate(value: unknown): unknown {
  const parsed = jsonCandidate(value);
  if (!isRecord(parsed)) return parsed;
  return isRecord(parsed.facts) ? parsed.facts : parsed;
}

export function parseH3ContinuumExtendDiagnostics(
  value: unknown
): H3ContinuumRuntimeDiagnostics {
  const candidate = unwrapCandidate(value);
  const error = validateH3ContinuumExtendDiagnostics(candidate);
  if (error) throw new Error(`H3 Continuum Extend 诊断校验失败：${error}`);
  return candidate as H3ContinuumRuntimeDiagnostics;
}

/**
 * Extract and validate the diagnostics emitted by a ComfyUI output node.
 * ComfyUI history flattens a node's returned `ui` collection directly onto
 * `outputs[nodeId]`. Retain nested `ui` and `result` only as compatibility
 * fallbacks for older fixtures or alternate clients.
 */
export function extractH3ContinuumExtendDiagnostics(
  comfyOutputs: unknown,
  nodeId: string
): H3ContinuumRuntimeDiagnostics {
  if (!isRecord(comfyOutputs) || !isRecord(comfyOutputs.outputs)) {
    throw new Error("H3 Continuum Extend 缺少 ComfyUI outputs 诊断记录");
  }
  const nodeOutput = comfyOutputs.outputs[nodeId];
  if (!isRecord(nodeOutput)) {
    throw new Error(`H3 Continuum Extend 缺少诊断节点输出：${nodeId}`);
  }
  const candidates: unknown[] = [];
  const directEntries = nodeOutput.h3_continuum_diagnostics;
  if (Array.isArray(directEntries)) candidates.push(...directEntries);
  const ui = isRecord(nodeOutput.ui) ? nodeOutput.ui : undefined;
  const uiEntries = ui?.h3_continuum_diagnostics;
  if (Array.isArray(uiEntries)) candidates.push(...uiEntries);
  const result = nodeOutput.result;
  if (Array.isArray(result)) candidates.push(...result);
  for (const candidate of candidates) {
    try {
      return parseH3ContinuumExtendDiagnostics(candidate);
    } catch {
      // Keep looking so a UI wrapper and result string can coexist.
    }
  }
  throw new Error("H3 Continuum Extend 诊断节点输出无效或未通过 fail-closed 校验");
}
