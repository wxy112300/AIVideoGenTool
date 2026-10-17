import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { privateLocalDirectory, writePrivateJson } from "./private-local-state.js";
import { agentNpmLocation, assertSharedPackagesIdle, runAgentNpm, type AgentNpmLocation } from "./strata-agent-npm.js";
export { installationFailureHint } from "./strata-agent-npm.js";

export const AGENT_SOFTWARE = {
  cloud: { name: "@cloudcli-ai/cloudcli", version: "1.37.5", integrity: "sha512-1oqh/kf8P1Mq0z2sARtM8fqyrRgCR+QS62Xs9hxvYAdcqy2qBDu3M+7cJZmUa2A+pTSI24EjBHI/hdN1vuR73Q==" },
  sdk: { name: "@anthropic-ai/claude-agent-sdk", version: "0.3.165", integrity: "sha512-wEUJNTAWkE6KMV35abqGi30lwhZz+jQLMtLh4SuTN2Hllzsysq8kmQFgcWulza3FLHG/GHzGHPi0+Sp2fb8xlw==" },
  claude: { name: "@anthropic-ai/claude-code", version: "2.1.165", integrity: "sha512-gqRw9XegRhh1fLUB8+/sTWzBpO2xvpdx0sF07lKIjUC3ZySolobu8k1pHlV1yMtK52yHw5BPWk/17yA9Qagvgg==" }
} as const;
export const AGENT_NATIVE_CLAUDE = { name: "@anthropic-ai/claude-code-win32-x64", version: "2.1.165", integrity: "sha512-RAS7Zwy3eeUu7pO+qXD9azPt6IxftFnEOZFuLLEjUFhuMDbSjKb1VsQ/dOHe3L8qdPiyrQEVznj8CKymKV8HRA==" } as const;
export const cloudPackageDirectory = (directory: string) => path.join(directory, "node_modules", "@cloudcli-ai", "cloudcli");
export const agentSdkEntrySha256 = "d8d324a35da141bc4976395f1fbadd125d38d9ed1a9f797653714b6ea81a0024";
export function atLeastVersion(actual: string, minimum: string) {
  if (!/^\d+\.\d+\.\d+$/u.test(actual)) return false;
  const a = actual.split(".").map(Number), b = minimum.split(".").map(Number);
  for (let i = 0; i < 3; i++) { if (a[i]! > b[i]!) return true; if (a[i]! < b[i]!) return false; }
  return true;
}
export async function identifyClaudeEntry(filename: string) {
  if ((await fs.stat(filename).catch(() => null))?.isFile()) for (const directory of [path.dirname(filename), path.dirname(path.dirname(filename))]) try {
    const pkg = JSON.parse(await fs.readFile(path.join(directory, "package.json"), "utf8"));
    const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.claude;
    if (pkg.name !== AGENT_SOFTWARE.claude.name || (bin && path.resolve(directory, bin).toLowerCase() !== path.resolve(filename).toLowerCase())) continue;
    return { available: true, compatible: atLeastVersion(String(pkg.version), AGENT_SOFTWARE.claude.version), path: filename, version: String(pkg.version), identity: pkg.name as string };
  } catch { /* Try native bin's package parent. */ }
  return { available: false, compatible: false, path: filename, version: "", identity: "未找到已识别的官方Claude Code入口" };
}
async function json(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { headers: { "User-Agent": "Strata-Agent-Launcher", Accept: "application/json" }, redirect: "error", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`软件元数据读取失败 (${response.status})；未执行安装。`);
  return response.json();
}
/** Called both when preparing a reviewable plan and immediately before installation. */
export async function checkAgentSoftwareUpstream(signal?: AbortSignal) {
  const [release, advisories, cloud, sdk, claude, native, latest] = await Promise.all([
    json("https://api.github.com/repos/siteboon/claudecodeui/releases/latest", signal),
    json("https://api.github.com/repos/siteboon/claudecodeui/security-advisories", signal),
    ...[...Object.values(AGENT_SOFTWARE), AGENT_NATIVE_CLAUDE].map((p) => json(`https://registry.npmjs.org/${encodeURIComponent(p.name)}/${p.version}`, signal)),
    json("https://registry.npmjs.org/%40cloudcli-ai%2Fcloudcli/latest", signal)
  ]);
  if (release.tag_name !== `v${AGENT_SOFTWARE.cloud.version}` || latest.version !== AGENT_SOFTWARE.cloud.version || release.prerelease || release.draft) throw new Error(`CloudCLI 最新稳定版已变化（GitHub ${release.tag_name ?? "未知"} / npm ${latest.version ?? "未知"}；已审核 ${AGENT_SOFTWARE.cloud.version}）。请更新启动器适配后重试；未执行安装。`);
  if (!atLeastVersion(cloud.version, "1.25.0")) throw new Error("禁止安装 CloudCLI <=1.24.0。");
  const reviewed: Record<string, [string, string]> = { "GHSA-7fv4-fmmc-86g2": ["<=1.23.0", "1.24.0"], "GHSA-gv8f-wpm2-m5wr": ["<=1.24.0", "1.25.0"], "GHSA-f2fc-vc88-6w7q": ["<=1.23.0", "1.24.0"] };
  if (!Array.isArray(advisories) || advisories.length !== 3 || advisories.some((a) => !reviewed[a.ghsa_id] || a.vulnerabilities?.length !== 1
    || a.vulnerabilities[0].vulnerable_version_range?.replaceAll(" ", "") !== reviewed[a.ghsa_id]![0]
    || a.vulnerabilities[0].patched_versions !== reviewed[a.ghsa_id]![1])) throw new Error("CloudCLI 安全公告发生变化，需先复核；未安装。");
  for (const [key, actual] of [["cloud", cloud], ["sdk", sdk], ["claude", claude]] as const) {
    const expected = AGENT_SOFTWARE[key];
    if (actual.name !== expected.name || actual.version !== expected.version || actual.dist?.integrity !== expected.integrity) throw new Error("官方软件包身份或 integrity 变化；未安装。");
  }
  if (native.name !== AGENT_NATIVE_CLAUDE.name || native.version !== AGENT_NATIVE_CLAUDE.version || native.dist?.integrity !== AGENT_NATIVE_CLAUDE.integrity) throw new Error("官方Claude原生包身份变化；未安装。");
  if (sdk.claudeCodeVersion !== AGENT_SOFTWARE.claude.version) throw new Error("SDK 与受控 Claude CLI 身份不匹配。");
  const packages = [cloud, sdk, claude, native].map((item) => ({ name: item.name as string, version: item.version as string,
    tarball: item.dist.tarball as string, integrity: item.dist.integrity as string, unpackedSize: Number(item.dist.unpackedSize) }));
  if (packages.some((item) => { try { const url = new URL(item.tarball); return url.origin !== "https://registry.npmjs.org" || url.username || url.password || !Number.isFinite(item.unpackedSize) || item.unpackedSize <= 0; } catch { return true; } })) throw new Error("软件包下载地址或规模无效；未安装。");
  return { checkedAt: new Date().toISOString(), cloudBytes: cloud.dist.unpackedSize, cliBytes: claude.dist.unpackedSize, packages };
}
interface PackageIdentity { name: string; version: string; claudeCodeVersion?: string }
async function metadata(directory: string): Promise<PackageIdentity | null> {
  try { return JSON.parse(await fs.readFile(path.join(directory, "package.json"), "utf8")); } catch { return null; }
}
const isFile = async (filename: string) => (await fs.stat(filename).catch(() => null))?.isFile() === true;
export async function inspectedAgentSdk(directory: string) {
  const pkg = await metadata(directory), entry = path.join(directory, "sdk.mjs");
  const data = await fs.readFile(entry).catch(() => null);
  return { available: Boolean(pkg?.name === AGENT_SOFTWARE.sdk.name && pkg.version === AGENT_SOFTWARE.sdk.version
    && pkg.claudeCodeVersion === AGENT_SOFTWARE.claude.version && data && createHash("sha256").update(data).digest("hex") === agentSdkEntrySha256),
    path: directory, entry, version: pkg?.version ?? "", bundledCliPresent: await isFile(path.join(directory, "node_modules", "@anthropic-ai", "claude-agent-sdk-win32-x64", "claude.exe")) };
}
/** Recognizes normal npm installs without requiring a launcher receipt or changing their files. */
export async function inspectAgentSoftware(prefix: string) {
  if (!path.isAbsolute(prefix)) return { available: false, cloudReady: false, sdkReady: false, path: "", version: "", sdkVersion: "", sdkDirectory: "", sdkBundledCliPresent: false, stage: "未找到 npm 共享目录；请修复 Node/npm 或选择完整路径。" };
  const pkg = cloudPackageDirectory(prefix), cloud = await metadata(pkg);
  const cloudReady = cloud?.name === AGENT_SOFTWARE.cloud.name && cloud.version === AGENT_SOFTWARE.cloud.version
    && await isFile(path.join(pkg, "dist-server", "server", "index.js"));
  const candidates = [path.join(pkg, "node_modules", AGENT_SOFTWARE.sdk.name), path.join(prefix, "node_modules", AGENT_SOFTWARE.sdk.name)];
  const sdks = await Promise.all(candidates.map(inspectedAgentSdk));
  const sdk = sdks.find((item) => item.available) ?? sdks[1]!;
  return { available: Boolean(cloudReady && sdk.available), cloudReady: Boolean(cloudReady), sdkReady: sdk.available,
    path: prefix, version: cloud?.version ?? "", sdkVersion: sdk.version, sdkDirectory: sdk.path, sdkBundledCliPresent: sdk.bundledCliPresent,
    stage: cloudReady && sdk.available ? `共享 CloudCLI ${cloud!.version} / Agent SDK ${sdk.version}（运行未验）`
      : `共享 CloudCLI：${cloudReady ? cloud!.version : "缺失或版本未适配"}；SDK：${sdk.available ? sdk.version : "缺失或身份未适配"}` };
}
export interface SharedSoftwareItem { key: keyof typeof AGENT_SOFTWARE | "native"; name: string; version: string; previousVersion: string; target: string }
interface SelectedCli { available: boolean; compatible: boolean; path: string; version: string }
export interface SharedSoftwarePlan { location: AgentNpmLocation; items: SharedSoftwareItem[]; selected: SelectedCli; repair: boolean }
/** A concrete, reviewable npm plan; a different/higher shared version is never silently downgraded. */
export async function planSharedAgentSoftware(location: AgentNpmLocation, selected: SelectedCli, repair = false): Promise<SharedSoftwarePlan> {
  const found = await inspectAgentSoftware(location.prefix), items: SharedSoftwareItem[] = [];
  const add = async (key: SharedSoftwareItem["key"]) => {
    const expected = key === "native" ? AGENT_NATIVE_CLAUDE : AGENT_SOFTWARE[key];
    const target = path.join(location.root, expected.name), actual = await metadata(target);
    const stat = await fs.lstat(target).catch((error) => { if (error.code === "ENOENT") return null; throw error; });
    if (stat && (stat.isSymbolicLink() || !stat.isDirectory() || actual?.name !== expected.name)) throw new Error(`${expected.name} 目标存在未知文件或 npm link；请用原安装方式管理，不自动覆盖。`);
    if (actual && actual.version !== expected.version && atLeastVersion(actual.version, expected.version)) throw new Error(`${expected.name} 已有 ${actual.version}，高于已适配 ${expected.version}；未降级，请更新启动器适配。`);
    items.push({ key, name: expected.name, version: expected.version, previousVersion: actual?.version ?? "", target });
  };
  if (!found.cloudReady || repair) await add("cloud");
  // Updating CloudCLI can replace its nested SDK. Prefer a reusable shared SDK for that case.
  const globalSdk = await inspectedAgentSdk(path.join(location.root, AGENT_SOFTWARE.sdk.name));
  if (repair || (!found.sdkReady || (items.some((p) => p.key === "cloud") && !globalSdk.available))) await add("sdk");
  if (!selected.available || !selected.compatible || !atLeastVersion(selected.version, AGENT_SOFTWARE.claude.version)) {
    const cliRoot = path.join(location.root, AGENT_SOFTWARE.claude.name);
    if (selected.path && (!selected.available || !path.resolve(selected.path).toLowerCase().startsWith(path.resolve(cliRoot).toLowerCase() + path.sep)))
      throw new Error("所选旧 Claude 不属于此 npm 共享安装；请用原安装方式更新或重新选择，未再装另一份 CLI。");
    await add("claude");
    const native = path.join(location.root, AGENT_NATIVE_CLAUDE.name), actual = await metadata(native);
    if (actual?.version !== AGENT_NATIVE_CLAUDE.version || !await isFile(path.join(native, "claude.exe"))) await add("native");
  }
  return { location, items, selected, repair };
}

/** Standard shared npm installation; only explicitly reviewed packages change, never provider settings. */
export async function installAgentSoftware(plan: SharedSoftwarePlan, directory: string, signal: AbortSignal, progress: (message: string) => void, selected: SelectedCli) {
  const location = await agentNpmLocation(plan.location.prefix);
  if (JSON.stringify(location) !== JSON.stringify(plan.location)) throw new Error("npm 位置已变化，请重新生成安装计划。");
  const fresh = await planSharedAgentSoftware(location, selected, plan.repair);
  for (const item of fresh.items) if (!plan.items.some((approved) => JSON.stringify(approved) === JSON.stringify(item))) throw new Error("共享软件状态已变化，当前缺件超出确认计划；请重新检测并确认。");
  if (!fresh.items.length) return { ...await inspectAgentSoftware(location.prefix), claudePath: selected.path };
  const upstream = await checkAgentSoftwareUpstream(signal);
  signal.throwIfAborted();
  if (process.platform !== "win32" || process.arch !== "x64") throw new Error("此安装执行器仅核对 Windows x64；其他平台请按官方方式安装。");
  await assertSharedPackagesIdle(fresh.items.map((item) => item.target));
  const work = await privateLocalDirectory(path.join(directory, "installations", randomUUID()));
  await fs.writeFile(path.join(work, ".npmrc-user"), "", { flag: "wx" });
  await fs.writeFile(path.join(work, ".npmrc-global"), "", { flag: "wx" });
  // Backups are recovery data, not a second active installation or executable search location.
  for (const item of fresh.items) {
    signal.throwIfAborted();
    if (item.previousVersion) await fs.cp(item.target, path.join(work, "previous-packages", item.name), { recursive: true, dereference: false });
  }
  for (const bin of ["claude", "cloudcli"]) for (const suffix of ["", ".cmd", ".ps1"]) {
    const source = path.join(location.prefix, bin + suffix);
    if (await isFile(source)) { await fs.mkdir(path.join(work, "previous-bins"), { recursive: true }); await fs.copyFile(source, path.join(work, "previous-bins", bin + suffix)); }
  }
  await writePrivateJson(path.join(work, "plan.json"), fresh);
  progress(`共享安装位置：${location.prefix}；安装日志及旧包备份：${work}。不修改 Claude/CC Switch/Codex 配置。`);
  try {
    const artifacts: string[] = [];
    for (const item of fresh.items) {
      const pack = upstream.packages.find((p) => p.name === item.name && p.version === item.version)!;
      progress(`下载并核对 ${item.name}@${item.version}（共享npm安装包，不启动服务）`);
      const response = await fetch(pack.tarball, { redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(20 * 60 * 1000)]) });
      if (!response.ok || !response.body) throw new Error("官方软件包下载失败；旧包未修改。");
      const filename = path.join(work, `${item.key}.tgz`), file = await fs.open(filename, "wx"), hash = createHash("sha512");
      let bytes = 0, reportedAt = Date.now();
      try {
        for await (const chunk of response.body) {
          signal.throwIfAborted(); bytes += chunk.byteLength;
          if (bytes > pack.unpackedSize + 1024 * 1024) throw new Error("软件包下载超出已核对规模，未安装。");
          hash.update(chunk); await file.writeFile(chunk);
          if (Date.now() - reportedAt >= 1500) { progress(`${item.name} 已下载 ${(bytes / 1024 ** 2).toFixed(1)}MiB（总下载大小未知）；可取消。`); reportedAt = Date.now(); }
        }
      } finally { await file.close(); }
      if (`sha512-${hash.digest("base64")}` !== pack.integrity) throw new Error("软件包下载 integrity 不匹配，未安装。");
      artifacts.push(filename);
    }
    // Ask npm to omit optional binaries; some global npm versions still install them.
    // Shared dependency trees are preserved. Runtime always selects the explicit Claude CLI.
    progress("npm 准备已确认的共享软件包；已有兼容项跳过，不下载安装模型。");
    await assertSharedPackagesIdle(fresh.items.map((item) => item.target));
    // Recheck target versions after downloads, before standard npm changes shared files.
    const beforeWrite = await planSharedAgentSoftware(location, selected, plan.repair);
    if (JSON.stringify(beforeWrite.items) !== JSON.stringify(fresh.items)) throw new Error("下载期间共享软件已变化，请重新检测；未覆盖。");
    await runAgentNpm(location, ["install", "--ignore-scripts", "--omit=optional", ...artifacts], work, signal, { progress });
    progress("准备共享 SQLite/PTY 原生依赖和官方 Claude 入口；可能需要 C++ 构建工具。");
    if (fresh.items.some((p) => p.key === "cloud")) await runAgentNpm({ ...location, prefix: cloudPackageDirectory(location.prefix) },
      ["rebuild", "better-sqlite3", "node-pty", "bcrypt", "--omit=optional"], work, signal, { global: false, progress });
    if (fresh.items.some((p) => p.key === "claude")) await runAgentNpm(location,
      ["rebuild", AGENT_SOFTWARE.claude.name, "--omit=optional"], work, signal, { progress });
    const cli = fresh.items.some((p) => p.key === "claude") ? path.join(location.root, AGENT_SOFTWARE.claude.name, "bin", "claude.exe") : selected.path;
    const software = await inspectAgentSoftware(location.prefix), identity = await identifyClaudeEntry(cli);
    if (!software.available || !identity.available || !identity.compatible) throw new Error("共享软件安装后复检未通过；请查看安装日志，不启动服务。");
    await writePrivateJson(path.join(work, "result.json"), { completedAt: new Date().toISOString(), software, cli: identity });
    progress("共享软件准备完成；普通 claude/cloudcli 可复用相同安装，原 provider 未修改。真实 Agent 仍待验收。");
    return { ...software, claudePath: cli };
  } catch (error) { progress(`安装未完成；请重新检测。已修改软件可能部分生效，旧包备份和日志保留：${work}；未自动恢复/覆盖其他软件。`); throw error; }
}
