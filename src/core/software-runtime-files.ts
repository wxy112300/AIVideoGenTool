import { DLSS5_NODE_ID } from "./catalog/dependencies/dlss5.js";
import { KONOHAMARU_NODE_ID, KONOHAMARU_RUNTIME_OPTIONAL_FILES } from "./catalog/dependencies/konohamaru.js";

export const DLSS5_RUNTIME_CONFIG_FILENAME = "config.json";
const dlssConfigFields = ["python", "sr_plugin", "sr_runtime", "temp_dir", "nr_plugin", "nr_runtime",
  "timeout_seconds", "vapourkit_release", "vapourkit_archive_sha256"] as const;
export type Dlss5RuntimeConfig = Partial<Record<typeof dlssConfigFields[number], unknown>>;

function generatedDlssConfig(text: string): boolean {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const config = value as Record<string, unknown>;
  if (Object.keys(config).some(key => !(dlssConfigFields as readonly string[]).includes(key))) return false;
  const string = (key: string) => typeof config[key] === "string" && Boolean((config[key] as string).trim());
  return ["python", "temp_dir", "vapourkit_release", "vapourkit_archive_sha256"].every(string)
    && /^[a-f0-9]{64}$/iu.test(config.vapourkit_archive_sha256 as string)
    && typeof config.timeout_seconds === "number" && Number.isFinite(config.timeout_seconds) && config.timeout_seconds >= 0
    && [["sr_plugin", "sr_runtime"], ["nr_plugin", "nr_runtime"]].some(pair => pair.every(string))
    && dlssConfigFields.filter(key => key !== "timeout_seconds" && key in config).every(string);
}

function generatedReShadeConfig(text: string): boolean {
  let section = false, values = 0;
  for (const raw of text.replace(/^\uFEFF/u, "").split(/\r?\n/u)) {
    const line = raw.trim();
    if (!line || /^[;#]/u.test(line)) continue;
    if (line.startsWith("[")) {
      if (line !== "[RenoDX.DLSS5]") return false;
      section = true; continue;
    }
    const entry = /^(EnableHooks|NR[A-Za-z0-9_]+)\s*=\s*(.+)$/u.exec(line);
    if (!section || !entry || !/^(?:[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|true|false)$/iu.test(entry[2]!.trim())) return false;
    values++;
  }
  return section && values > 0;
}

/** Recognizes installation/runtime output, not arbitrary config files in an old directory. */
export async function generatedNodeRuntimeFile(nodeId: string, relativePath: string, read: () => Promise<string>): Promise<boolean> {
  if (nodeId === KONOHAMARU_NODE_ID && relativePath === KONOHAMARU_RUNTIME_OPTIONAL_FILES[1]) return true;
  try {
    if (nodeId === KONOHAMARU_NODE_ID && relativePath === KONOHAMARU_RUNTIME_OPTIONAL_FILES[0]) return generatedReShadeConfig(await read());
    if (nodeId === DLSS5_NODE_ID && relativePath === `runtime/${DLSS5_RUNTIME_CONFIG_FILENAME}`) return generatedDlssConfig(await read());
  } catch { /* Unknown/oversized/malformed config stays protected. */ }
  return false;
}
