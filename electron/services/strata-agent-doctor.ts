import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { scanStrataPreparation } from "./strata-preparation.js";
import { strataPreparationProfiles, strataProfileModelRoot } from "../../src/core/strata-preparation.js";
import { supportsStrataUncensored } from "../../src/core/strata-uncensored.js";
import { strataDerivedDataDirectory, validatePreparedStrataRuntime } from "./strata-model-preparation.js";
import { readStrataResources } from "./strata-resources.js";
import { isLocalPortInUse } from "./local-service-process.js";
import { agentSettings, type AgentPreferences } from "./strata-agent-settings.js";
import { agentDirectory } from "./strata-agent-settings.js";
import { atLeastVersion, identifyClaudeEntry, inspectAgentSoftware } from "./strata-agent-software.js";
import { agentNpmLocation } from "./strata-agent-npm.js";

const exec = promisify(execFile);
const file = async (name: string) => (await fs.stat(name).catch(() => null))?.isFile() === true;
async function which(name: string): Promise<string> {
  try { return (await exec("where.exe", [name], { windowsHide: true, timeout: 5000 })).stdout.trim().split(/\r?\n/u)[0] ?? ""; } catch { return ""; }
}
export async function locateClaude(entry = "") {
  const shim = entry ? "" : await which("claude.cmd");
  const base = shim ? path.join(path.dirname(shim), "node_modules", "@anthropic-ai", "claude-code") : "";
  const candidates = entry ? [entry] : base ? [path.join(base, "cli.js"), path.join(base, "bin", "claude.exe")] : [];
  for (const filename of candidates) {
    const identity = await identifyClaudeEntry(filename);
    if (identity.available) return identity;
  }
  return { available: false, compatible: false, path: entry, version: "", identity: "未找到已识别的官方 Claude Code npm JS/原生入口；可选择路径" };
}
export async function discoverAgentPack(install: string, modelId: string, explicit = "", selectedFiles?: string[]): Promise<string> {
  const roots = [strataDerivedDataDirectory()];
  const relative = explicit ? path.relative(strataDerivedDataDirectory(), path.resolve(explicit)) : "";
  const generated = Boolean(relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  const candidates = explicit && !generated ? [explicit] : [...(explicit ? [explicit] : []), ...(await Promise.all(roots.map(async (root) =>
    (await fs.readdir(root, { withFileTypes: true }).catch(() => [])).filter((entry) => entry.isDirectory() && !entry.isSymbolicLink()).slice(-100)
      .map((entry) => path.join(root, entry.name, "runtime.json"))))).flat()];
  for (const config of candidates) {
    try {
      if (await validatePreparedStrataRuntime(config, install) !== modelId) throw new Error("模型身份不匹配");
      const receipt = JSON.parse(await fs.readFile(path.join(path.dirname(config), "lvs-strata-model.json"), "utf8"));
      const expected = strataPreparationProfiles().find((profile) => profile.id === modelId)?.components.filter(component => !component.optional);
      if (!expected || receipt.assets.length !== expected.length || !receipt.assets.every((asset: { filename: string; bytes: number; sha256: string }, index: number) =>
        asset.bytes === expected[index]?.installGuide.bytes && asset.sha256 === expected[index]?.installGuide.sha256
          && (!selectedFiles || path.resolve(asset.filename).toLowerCase() === path.resolve(selectedFiles[index] ?? "").toLowerCase()))) throw new Error("pack 源文件与所选共享模型/catalog不一致");
      return config;
    }
    catch (error) { if (explicit && !generated) throw new Error(`所选 pack 未通过完成记录校验：${error instanceof Error ? error.message : "未知错误"}`); }
  }
  return "";
}
/** Offline files, live resource headroom and executable identity are separate evidence. No installations/hashes/GPU loads. */
export async function agentDoctor(preferences: AgentPreferences, directory = agentDirectory()) {
  const settings = await agentSettings(preferences);
  let npm: Awaited<ReturnType<typeof agentNpmLocation>> | null = null;
  let npmIssue = "";
  try { npm = await agentNpmLocation(preferences.cloudDirectory); } catch (error) { npmIssue = error instanceof Error ? error.message : "npm 不可用"; }
  const software = npm?.prefix ?? preferences.cloudDirectory;
  const [scan, claude, resources, strataPortBusy, guiPortBusy, git, python] = await Promise.all([
    scanStrataPreparation(settings), locateClaude(preferences.claudeEntry), readStrataResources(),
    isLocalPortInUse(preferences.strataPort), isLocalPortInUse(preferences.guiPort), which("git.exe"), which("python.exe")
  ]);
  const selectedFiles = scan.profiles.find((profile) => profile.id === preferences.modelId)?.components.filter(component => !component.optional).map((component) => component.matches[0] ?? "");
  const pack = scan.status.managedInstalled ? await discoverAgentPack(scan.status.installDirectory, preferences.modelId, preferences.packConfig, selectedFiles) : "";
  const ccCandidates = [path.join(process.env.LOCALAPPDATA ?? "", "Programs", "CC Switch", "CC Switch.exe"), path.join(process.env.LOCALAPPDATA ?? "", "CC Switch", "CC Switch.exe")];
  let registered = "";
  try {
    const { stdout } = await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "(Get-ItemProperty 'Registry::HKEY_CURRENT_USER\\Software\\Classes\\ccswitch\\shell\\open\\command' -ErrorAction Stop).'(default)'"], { windowsHide: true, timeout: 5000 });
    registered = stdout.trim().match(/^"([^"\r\n]+\.exe)"/iu)?.[1] ?? stdout.trim().match(/^([^\r\n]+?\.exe)(?:\s|$)/iu)?.[1] ?? "";
  } catch { /* Portable installs remain selectable. */ }
  const cc = (await Promise.all([preferences.ccSwitchPath, registered, ...ccCandidates].filter(Boolean).map(async (name) => await file(name) ? name : ""))).find(Boolean) ?? "";
  let ccVersion = "";
  if (cc) try {
    const literal = `'${cc.replaceAll("'", "''")}'`;
    ccVersion = (await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `(Get-Item -LiteralPath ${literal}).VersionInfo.ProductVersion`], { windowsHide: true, timeout: 5000 })).stdout.trim();
  } catch { /* File discovery alone is not version validation. */ }
  return { node: { path: process.execPath, version: process.versions.node, available: atLeastVersion(process.versions.node, "22.15.0") },
    claude, ccSwitch: { path: cc, version: ccVersion, available: Boolean(cc && ccVersion), identity: cc ? `CC Switch ${ccVersion || "版本未知"}` : "未在常见位置发现；不代表未安装" },
    strata: { ...scan.status, modelDirectory: strataProfileModelRoot(scan.status.modelDirectory, preferences.modelId) },
    models: scan.profiles.map((profile) => ({ id: profile.id, name: profile.name, available: profile.available, uncensoredSupported: supportsStrataUncensored(profile.id),
      components: profile.components.map((c) => ({ label: c.label, found: c.found, optional: c.optional, expected: c.expected })) })),
    pack, resources, ports: { strataPortBusy, guiPortBusy }, git, python,
    cloud: await inspectAgentSoftware(software), npm, npmIssue,
    context: { current: 32768, target: 262144, verified: false }, scannedAt: new Date().toISOString() };
}
