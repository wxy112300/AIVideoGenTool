import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createDefaultSettings } from "../../src/core/defaults.js";
import { strataPreparationProfiles, validStrataPort } from "../../src/core/strata-preparation.js";
import { localStateBase, privateLocalDirectory, writePrivateJson } from "./private-local-state.js";

export interface AgentPreferences {
  schema: 1; modelId: string; uncensored: boolean; lan: boolean;
  strataDirectory: string; modelRoot: string; modelDirectory: string; packConfig: string;
  claudeEntry: string; ccSwitchPath: string; cloudDirectory: string; strataPort: number; guiPort: number;
  openNative: boolean; openGui: boolean; contextTokens: number;
}
export const agentDirectory = () => path.join(localStateBase(), "strata-agent");
export const agentDefaults = (): AgentPreferences => ({ schema: 1,
  modelId: strataPreparationProfiles()[0]!.id, uncensored: false, lan: false,
  strataDirectory: "", modelRoot: "", modelDirectory: "", packConfig: "", claudeEntry: "", ccSwitchPath: "", cloudDirectory: "",
  strataPort: 43127, guiPort: 43128, openNative: true, openGui: true, contextTokens: 262144 });

export function normalizeAgentPreferences(value: unknown): AgentPreferences {
  if (!value || typeof value !== "object") throw new Error("启动器设置无效。");
  const input = value as Record<string, unknown>, result = agentDefaults();
  if (input.schema !== 1) throw new Error("不支持的启动器设置版本。");
  for (const key of ["strataDirectory", "modelRoot", "modelDirectory", "packConfig", "claudeEntry", "ccSwitchPath", "cloudDirectory"] as const) {
    if (input[key] !== undefined && typeof input[key] !== "string") throw new Error(`设置 ${key} 无效。`);
    result[key] = String(input[key] ?? "").trim();
    if (result[key] && !path.isAbsolute(result[key])) throw new Error("请选择完整路径。");
  }
  if (!strataPreparationProfiles().some((profile) => profile.id === input.modelId)) throw new Error("模型必须来自统一 Strata catalog。");
  result.modelId = String(input.modelId);
  if (input.contextTokens !== undefined) {
    if (![32768, 65536, 131072, 262144].includes(input.contextTokens as number)) throw new Error("上下文只支持逐档验证的32K/64K/128K/262144档位。");
    result.contextTokens = input.contextTokens as number;
  }
  for (const key of ["uncensored", "lan", "openNative", "openGui"] as const) {
    if (typeof input[key] !== "boolean") throw new Error(`设置 ${key} 无效。`);
    result[key] = input[key];
  }
  for (const key of ["strataPort", "guiPort"] as const) {
    if (!validStrataPort(input[key])) throw new Error("端口应为 1024–65535，不能使用 8080。");
    result[key] = input[key];
  }
  if (result.strataPort === result.guiPort) throw new Error("Strata 与 GUI 不能使用同一端口。");
  // LAN has its own later, explicit first-use safety gate, not a remembered unchecked boolean.
  if (result.lan) throw new Error("家庭局域网尚未完成 localhost 与首次安全验收；当前只能关闭。");
  // Retire only the former generated private default, without deleting any files.
  if (result.cloudDirectory && path.resolve(result.cloudDirectory).toLowerCase() === path.resolve(path.join(agentDirectory(), "software")).toLowerCase()) result.cloudDirectory = "";
  return result;
}
export async function readAgentPreferences(directory = agentDirectory()): Promise<AgentPreferences> {
  try { return normalizeAgentPreferences(JSON.parse(await fs.readFile(path.join(directory, "preferences.json"), "utf8"))); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const defaults = agentDefaults();
    try {
      const studio = JSON.parse(await fs.readFile(path.join(process.env.APPDATA ?? os.homedir(), "ai-video-gen-tool", "studio-state.json"), "utf8"));
      if (validStrataPort(studio.settings?.strataPort)) defaults.strataPort = studio.settings.strataPort;
    } catch { /* An absent Studio profile is normal in standalone mode. */ }
    return defaults;
  }
}
export async function saveAgentPreferences(value: unknown, directory = agentDirectory()): Promise<AgentPreferences> {
  const preferences = normalizeAgentPreferences(value);
  await privateLocalDirectory(directory);
  await writePrivateJson(path.join(directory, "preferences.json"), preferences);
  return preferences;
}
/** Fill only empty selectors. Explicit choices, including invalid paths, remain visible for repair. */
export function applyAgentDiscovery(preferences: AgentPreferences, found: {
  strata: { managedInstalled?: boolean; installDirectory: string; modelDirectory: string };
  claude: { available: boolean; path: string }; ccSwitch: { path: string };
  cloud: { path: string }; pack: string;
}): AgentPreferences {
  return { ...preferences,
    strataDirectory: preferences.strataDirectory || (found.strata.managedInstalled ? found.strata.installDirectory : ""),
    modelDirectory: preferences.modelDirectory || (!preferences.modelRoot ? found.strata.modelDirectory : ""),
    claudeEntry: preferences.claudeEntry || (found.claude.available ? found.claude.path : ""),
    ccSwitchPath: preferences.ccSwitchPath || found.ccSwitch.path,
    cloudDirectory: preferences.cloudDirectory || found.cloud.path,
    packConfig: preferences.packConfig || found.pack
  };
}
/** Only whitelisted discovery fields; never import provider keys, history, queue or user defaults. */
export async function agentSettings(preferences: AgentPreferences, stateFile = path.join(process.env.APPDATA ?? os.homedir(), "ai-video-gen-tool", "studio-state.json")) {
  let studio: Record<string, unknown> = {};
  try { studio = JSON.parse(await fs.readFile(stateFile, "utf8")).settings ?? {}; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT" && !(preferences.strataDirectory && (preferences.modelRoot || preferences.modelDirectory)))
      throw new Error("Studio 路径发现文件无法读取；请修复该文件或显式选择独立安装和模型路径。");
  }
  const text = (key: string) => typeof studio[key] === "string" ? studio[key] as string : "";
  const settings = createDefaultSettings();
  return { ...settings, comfyInstallDirectory: "", modelDirectory: preferences.modelRoot || (preferences.modelDirectory ? "" : text("modelDirectory")),
    strataModelDirectory: preferences.modelDirectory || text("strataModelDirectory"),
    strataInstallDirectory: preferences.strataDirectory || text("strataInstallDirectory"),
    strataPort: preferences.strataPort, strataUncensored: preferences.uncensored, promptModelId: preferences.modelId,
    // Independent operation never connects to or starts Comfy. This URL is only an occupancy check.
    discoveredComfyUrl: text("comfyUrl"), uiLocale: "zh-CN" as const };
}
