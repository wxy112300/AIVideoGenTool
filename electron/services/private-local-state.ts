import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
/** Windows mode bits alone do not protect per-user credentials. */
export async function privateLocalDirectory(directory: string): Promise<string> {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  if ((await fs.lstat(directory)).isSymbolicLink()) throw new Error("本机状态目录不能是链接。");
  if (process.platform === "win32") {
    const { stdout } = await exec("whoami.exe", ["/user", "/fo", "csv", "/nh"], { windowsHide: true });
    const sid = stdout.match(/S-1-5-[0-9-]+/u)?.[0];
    if (!sid) throw new Error("无法确认当前用户，未写入本机私有状态。");
    await exec("icacls.exe", [directory, "/inheritance:r", "/grant:r", `*${sid}:(OI)(CI)F`, "*S-1-5-18:(OI)(CI)F"], { windowsHide: true });
  } else await fs.chmod(directory, 0o700);
  return directory;
}
export async function writePrivateJson(filename: string, value: unknown): Promise<void> {
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify(value, null, 2), { flag: "wx", mode: 0o600 });
    await fs.rename(temporary, filename);
  } finally { await fs.unlink(temporary).catch(() => undefined); }
}
export async function processIdentity(pid: number): Promise<string | null> {
  if (!Number.isSafeInteger(pid) || pid < 1) throw new Error("进程身份无效。");
  if (process.platform === "win32") {
    const { stdout } = await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      `$p=Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}'; if($p){$p.CreationDate.ToUniversalTime().Ticks}`],
    { windowsHide: true, timeout: 10_000 });
    return stdout.trim() || null;
  }
  try { return (await fs.readFile(`/proc/${pid}/stat`, "utf8")).split(") ")[1]!.split(" ")[19]!; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
export const localStateBase = () => path.join(process.env.LOCALAPPDATA ?? path.join(process.env.HOME ?? "", ".local", "state"), "Local Video Studio");
