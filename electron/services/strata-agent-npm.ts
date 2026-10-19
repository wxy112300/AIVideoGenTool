import { execFile, spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
export interface AgentNpmLocation { executable: string; prefix: string; root: string }
export async function agentNpmLocation(prefix = ""): Promise<AgentNpmLocation> {
  const candidates = [path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js")];
  try {
    const { stdout } = await exec("where.exe", ["npm.cmd"], { windowsHide: true, timeout: 5000 });
    candidates.push(...stdout.trim().split(/\r?\n/u).map((p) => path.join(path.dirname(p), "node_modules", "npm", "bin", "npm-cli.js")));
  } catch { /* Report below. */ }
  for (const executable of candidates) if ((await fs.stat(executable).catch(() => null))?.isFile()) {
    const args = prefix ? ["--prefix", prefix] : [];
    const options = { windowsHide: true, timeout: 10000, encoding: "utf8" as const };
    const [p, r] = await Promise.all([
      exec(process.execPath, [executable, "prefix", "--global", ...args], options),
      exec(process.execPath, [executable, "root", "--global", ...args], options)
    ]);
    const location = { executable, prefix: p.stdout.trim(), root: r.stdout.trim() };
    if (!path.isAbsolute(location.prefix) || !path.isAbsolute(location.root)) throw new Error("npm 共享目录未返回绝对路径。");
    // This Windows launcher deliberately does not infer Unix global layouts.
    if (path.resolve(location.root).toLowerCase() !== path.join(path.resolve(location.prefix), "node_modules").toLowerCase()) throw new Error("未识别的 npm 共享布局；请选择 Windows npm prefix 或按官方方式手动安装。");
    return location;
  }
  throw new Error("未找到 npm；可先安装官方 Node.js LTS，再自动检测，不修改系统 PATH。");
}

/** Read process identities only; never kill or log another application's command line. */
export async function assertSharedPackagesIdle(directories: string[]) {
  if (!directories.length) return;
  const values = directories.map((p) => `'${p.replaceAll("'", "''")}'`).join(",");
  const script = `$roots=@(${values}); $busy=@(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { $_.ProcessId -ne $PID -and $_.ProcessId -ne ${process.pid} -and ($line=$_.CommandLine) -and @($roots | Where-Object { $line.IndexOf($_,[StringComparison]::OrdinalIgnoreCase) -ge 0 }).Count }); if($busy.Count){'busy'}else{'idle'}`;
  const { stdout } = await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true, timeout: 10000 });
  if (stdout.trim() !== "idle") throw new Error("共享软件正在使用或无法确认空闲；请在原程序结束任务后重试。未终止任何进程。");
}

/** Never echo arbitrary installer output: it may contain URLs or environment credentials. */
export function installationFailureHint(output: string): string {
  if (/gyp ERR! find VS|Could not find any Visual Studio|Microsoft Visual C\+\+.*required/iu.test(output)) return "缺少可用的 Visual C++ 构建工具；请查看私有 npm 日志，补齐后重试。";
  if (/gyp ERR! find Python|Could not find any Python/iu.test(output)) return "原生依赖未找到可用 Python；请查看私有 npm 日志并修复依赖。";
  const code = output.match(/npm (?:error|ERR!) code ([A-Z][A-Z0-9_]{1,40})\b/u)?.[1];
  if (code && ["ENOTFOUND", "ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EAI_AGAIN"].includes(code)) return `软件源网络连接失败（${code}），可重试。`;
  if (code && ["CERT_HAS_EXPIRED", "ERR_CERT_AUTHORITY_INVALID", "SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_VERIFY_LEAF_SIGNATURE"].includes(code)) return "软件源证书校验失败；未关闭证书验证，请检查网络环境。";
  return "请查看安装记录目录 .npm-cache/_logs 中的私有 npm 日志。";
}

export async function runAgentNpm(location: AgentNpmLocation, args: string[], work: string, signal: AbortSignal,
  options: { global?: boolean; progress?: (message: string) => void } = {}) {
  signal.throwIfAborted();
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^npm_config_/iu.test(key)));
  const child = spawn(process.execPath, [location.executable, ...args, `--global=${options.global !== false}`, "--prefix", location.prefix,
    "--no-audit", "--no-fund", "--registry=https://registry.npmjs.org", "--userconfig", path.join(work, ".npmrc-user"), "--globalconfig", path.join(work, ".npmrc-global")], {
    cwd: work, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...environment, NODE_OPTIONS: "", npm_config_cache: path.join(work, ".npm-cache"), npm_config_devdir: path.join(work, ".node-gyp") }
  });
  let output = "", aborting = false, timedOut = false;
  const capture = (chunk: Buffer) => { output = (output + chunk.toString("utf8")).slice(-65536); };
  child.stdout.on("data", capture); child.stderr.on("data", capture);
  const cancel = () => {
    aborting = true;
    if (child.pid && child.exitCode === null && child.signalCode === null) void exec("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true }).catch(() => undefined);
  };
  signal.addEventListener("abort", cancel, { once: true });
  const deadline = setTimeout(() => { timedOut = true; cancel(); }, 20 * 60 * 1000);
  const began = Date.now(), heartbeat = setInterval(() => options.progress?.(`npm 正在准备共享依赖（${Math.round((Date.now() - began) / 1000)}秒）；可取消，日志保留在安装记录目录。`), 15000);
  if (signal.aborted) cancel();
  try {
    await new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => code === 0 && !aborting ? resolve() : reject(new Error(aborting
        ? `共享 npm 安装已${timedOut ? "超时中止" : "取消"}；可能已安装部分软件，请重新检测。`
        : `共享 npm 安装失败 (${code})。${installationFailureHint(output)} 请重新检测并重试标准安装；未自动回滚其他程序的依赖。`)));
    });
  } finally { clearTimeout(heartbeat); clearTimeout(deadline); signal.removeEventListener("abort", cancel); }
  signal.throwIfAborted();
}
