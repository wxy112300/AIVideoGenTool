import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Prefix used to separate probe checkpoints from Python and package logging. */
export const ATTENTION_PROBE_PREFIX = "__LOCAL_VIDEO_STUDIO_ATTENTION_PROBE__";

const PROBE_TIMEOUT_MS = 30_000;
const PROBE_MAX_BUFFER = 2 * 1024 * 1024;
const MAX_ERROR_LENGTH = 600;

export type AttentionPythonProbeState = "complete" | "failed";

export interface AttentionPythonProbe {
  pythonVersion?: string;
  torchVersion?: string;
  torchvisionVersion?: string;
  torchaudioVersion?: string;
  cudaVersion?: string;
  gpuName?: string;
  gpuArchitecture?: string;
  sageAttentionVersion?: string;
  sageNativeReady?: boolean;
  sageNativeError?: string;
  tritonVersion?: string;
  comfyKitchenVersion?: string;
  comfyKitchenBackends?: string[];
  comfyKitchenProbeError?: string;
  /** A complete process means all bounded stages ran; it does not imply native readiness. */
  probeState: AttentionPythonProbeState;
  probeError?: string;
  probeStage?: string;
  durationMs?: number;
  /** Bounded, stage-labelled diagnostics suitable for parent logging and UI. */
  errors?: string[];
}

export interface AttentionPythonProbeExecution {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  timedOut?: boolean;
  error?: string;
}

export interface AttentionPythonProbeExecOptions {
  encoding: "utf8";
  timeout: number;
  windowsHide: true;
  maxBuffer: number;
}

export type AttentionPythonProbeRunner = (
  python: string,
  args: readonly string[],
  options: AttentionPythonProbeExecOptions
) => Promise<AttentionPythonProbeExecution>;

export interface InspectAttentionPythonOptions {
  runner?: AttentionPythonProbeRunner;
  now?: () => number;
}

interface ProbeCheckpoint {
  [key: string]: unknown;
}

function boundedText(value: unknown): string {
  const text = String(value ?? "").replace(/\s+/gu, " ").trim();
  if (text.length <= MAX_ERROR_LENGTH) return text;
  return `${text.slice(0, MAX_ERROR_LENGTH - 1)}…`;
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) return boundedText(error.message);
  return boundedText(error);
}

function checkpointJsonLines(stdout: string): ProbeCheckpoint[] {
  const checkpoints: ProbeCheckpoint[] = [];
  for (const line of stdout.split(/\r?\n/u)) {
    const marker = line.indexOf(ATTENTION_PROBE_PREFIX);
    if (marker < 0) continue;
    try {
      const parsed: unknown = JSON.parse(line.slice(marker + ATTENTION_PROBE_PREFIX.length).trim());
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        checkpoints.push(parsed as ProbeCheckpoint);
      }
    } catch {
      // A log line can contain the prefix or a truncated JSON value. Keep scanning.
    }
  }
  return checkpoints;
}

function mergeCheckpointData(checkpoints: ProbeCheckpoint[]): Partial<AttentionPythonProbe> {
  const merged: Record<string, unknown> = {};
  for (const checkpoint of checkpoints) {
    for (const [key, value] of Object.entries(checkpoint)) {
      if (key === "errors" && Array.isArray(value)) {
        const prior = Array.isArray(merged.errors) ? merged.errors : [];
        merged.errors = [...prior, ...value];
      } else if (value !== undefined) {
        merged[key] = value;
      }
    }
  }
  if (Array.isArray(merged.errors)) {
    merged.errors = [...new Set(merged.errors.map((value) => boundedText(value)).filter(Boolean))];
  }
  return merged as Partial<AttentionPythonProbe>;
}

function normalizeProbeData(data: Partial<AttentionPythonProbe>): Partial<AttentionPythonProbe> {
  const normalized: Partial<AttentionPythonProbe> = { ...data };
  if (typeof normalized.errors === "string") normalized.errors = [boundedText(normalized.errors)];
  if (Array.isArray(normalized.errors)) {
    normalized.errors = [...new Set(normalized.errors.map((value) => boundedText(value)).filter(Boolean))];
  }
  if (typeof normalized.sageNativeError === "string") {
    normalized.sageNativeError = boundedText(normalized.sageNativeError);
  }
  if (typeof normalized.comfyKitchenProbeError === "string") {
    normalized.comfyKitchenProbeError = boundedText(normalized.comfyKitchenProbeError);
  }
  if (normalized.sageNativeReady !== true) normalized.sageNativeReady = false;
  if (normalized.comfyKitchenBackends && !Array.isArray(normalized.comfyKitchenBackends)) {
    normalized.comfyKitchenBackends = [];
  }
  return normalized;
}

function makeProbeScript(): string {
  // Keep the imports ordered: metadata, torch, sageattention, then comfy_kitchen.
  // Each heavy stage emits a flushed marker before importing so a timeout identifies
  // the stage that was stuck.
  return [
    "import json, platform, importlib.metadata as md",
    `PREFIX=${JSON.stringify(ATTENTION_PROBE_PREFIX)}`,
    "def package_version(name):",
    "    try: return md.version(name)",
    "    except md.PackageNotFoundError: return ''",
    "def error_text(error):",
    "    value=str(error).replace('\\n',' ')",
    "    return value[:599] + ('…' if len(value) > 600 else '')",
    "result={'probeStage':'metadata','probeState':'running','pythonVersion':platform.python_version(),",
    " 'torchVersion':package_version('torch'),'torchvisionVersion':package_version('torchvision'),",
    " 'torchaudioVersion':package_version('torchaudio'),'sageAttentionVersion':package_version('sageattention'),",
    " 'tritonVersion':package_version('triton-windows') or package_version('triton'),",
    " 'comfyKitchenVersion':package_version('comfy-kitchen'),'comfyKitchenBackends':[],",
    " 'sageNativeReady':False,'errors':[]}",
    "def emit(stage, checkpoint):",
    "    result['probeStage']=stage",
    "    result['checkpoint']=checkpoint",
    "    print(PREFIX + json.dumps(result, separators=(',',':')), flush=True)",
    "emit('metadata','complete')",
    "emit('torch','started')",
    "try:",
    "    import torch",
    "    result['torchVersion']=getattr(torch,'__version__',result['torchVersion'])",
    "    result['cudaVersion']=torch.version.cuda or ''",
    "    if torch.cuda.is_available():",
    "        result['gpuName']=torch.cuda.get_device_name(0)",
    "        cap=torch.cuda.get_device_capability(0)",
    "        result['gpuArchitecture']=f'{cap[0]}.{cap[1]}'",
    "except Exception as error:",
    "    result['probeError']=error_text(error)",
    "    result['errors'].append('torch: '+error_text(error))",
    "emit('torch','complete')",
    "emit('sage','started')",
    "try:",
    "    from sageattention import _fused",
    "    result['sageNativeReady']=True",
    "except Exception as error:",
    "    result['sageNativeReady']=False",
    "    result['sageNativeError']=error_text(error)",
    "    result['errors'].append('sage native import: '+error_text(error))",
    "emit('sage','complete')",
    "emit('kitchen','started')",
    "try:",
    "    import comfy_kitchen as ck",
    "    result['comfyKitchenBackends']=[str(name) for name in ck.list_backends()]",
    "except Exception as error:",
    "    result['comfyKitchenProbeError']=error_text(error)",
    "    result['errors'].append('comfy kitchen import: '+error_text(error))",
    "emit('kitchen','complete')",
    "result['probeState']='complete'",
    "emit('kitchen','complete')"
  ].join("\n");
}

const defaultRunner: AttentionPythonProbeRunner = async (python, args, options) => {
  try {
    const result = await execFileAsync(python, [...args], options);
    return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
  } catch (error) {
    const failure = error as Error & {
      stdout?: string;
      stderr?: string;
      code?: number | string;
      killed?: boolean;
      signal?: string;
    };
    return {
      stdout: failure.stdout,
      stderr: failure.stderr,
      exitCode: typeof failure.code === "number" ? failure.code : undefined,
      timedOut: failure.killed === true || failure.signal === "SIGTERM",
      error: failure.message
    };
  }
};

export async function inspectAttentionPython(
  python: string,
  options: InspectAttentionPythonOptions = {}
): Promise<AttentionPythonProbe> {
  const startedAt = (options.now ?? Date.now)();
  if (!python.trim()) {
    return {
      probeState: "failed",
      probeStage: "python",
      probeError: "No Python executable was configured for the attention probe.",
      errors: ["python: executable path is missing"],
      durationMs: Math.max(0, (options.now ?? Date.now)() - startedAt)
    };
  }

  let execution: AttentionPythonProbeExecution;
  try {
    execution = await (options.runner ?? defaultRunner)(
      python,
      ["-c", makeProbeScript()],
      {
        encoding: "utf8",
        timeout: PROBE_TIMEOUT_MS,
        windowsHide: true,
        maxBuffer: PROBE_MAX_BUFFER
      }
    );
  } catch (error) {
    execution = { error: readErrorMessage(error) };
  }

  const checkpoints = checkpointJsonLines(execution.stdout ?? "");
  const data = normalizeProbeData(mergeCheckpointData(checkpoints));
  const errors = Array.isArray(data.errors) ? [...data.errors] : [];
  const stage = typeof data.probeStage === "string" ? data.probeStage : "result";
  const stderr = boundedText(execution.stderr);
  const executionError = boundedText(execution.error);
  const hasNonZeroExit = execution.exitCode !== undefined && execution.exitCode !== 0;
  const timedOut = execution.timedOut === true;
  const processFailed = timedOut || hasNonZeroExit || Boolean(execution.error);
  const hasCompleteCheckpoint = data.probeState === "complete" &&
    data.probeStage === "kitchen";
  const probeState: AttentionPythonProbeState = !processFailed && hasCompleteCheckpoint
    ? "complete"
    : "failed";

  let probeError = typeof data.probeError === "string" ? boundedText(data.probeError) : undefined;
  if (!checkpoints.length) {
    if (!processFailed) probeError = "Attention probe returned no valid checkpoint JSON.";
    errors.push("result: no valid prefixed checkpoint was returned");
  }
  if (timedOut) {
    probeError = `Attention probe timed out after ${PROBE_TIMEOUT_MS / 1000}s during ${stage}.`;
    errors.push(`process: timeout during ${stage}`);
  } else if (hasNonZeroExit) {
    probeError = `Attention probe exited with code ${execution.exitCode} during ${stage}.`;
    errors.push(`process: exit code ${execution.exitCode}`);
  } else if (executionError) {
    probeError = `Attention probe failed during ${stage}: ${executionError}`;
    errors.push(`process: ${executionError}`);
  }
  if (stderr) errors.push(`stderr: ${stderr}`);
  const nativeErrors = [
    data.sageNativeError ? `sage native import: ${boundedText(data.sageNativeError)}` : "",
    data.comfyKitchenProbeError ? `comfy kitchen import: ${boundedText(data.comfyKitchenProbeError)}` : ""
  ].filter(Boolean);
  if (nativeErrors.length) {
    errors.push(...nativeErrors);
    if (probeState === "complete") {
      const aggregate = [probeError, ...nativeErrors].filter(Boolean).join("; ");
      probeError = boundedText(`Attention native import errors: ${aggregate}`);
    }
  }
  if (probeState === "failed" && !probeError) {
    probeError = `Attention probe did not complete all stages; last stage was ${stage}.`;
    errors.push(`process: incomplete checkpoint at ${stage}`);
  }
  const normalizedErrors = [...new Set(errors.map((error) => boundedText(error)).filter(Boolean))];
  return {
    ...data,
    probeState,
    probeStage: stage,
    ...(probeError ? { probeError } : {}),
    ...(normalizedErrors.length ? { errors: normalizedErrors } : {}),
    durationMs: Math.max(0, (options.now ?? Date.now)() - startedAt),
    // A failed import must never be interpreted as native readiness by a caller.
    sageNativeReady: data.sageNativeReady === true && probeState === "complete"
  };
}
