import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { privateLocalDirectory, writePrivateJson } from "./private-local-state.js";

const exec = promisify(execFile);
/** Backups are explicit and private. CC Switch SQLite is read-only; no global provider is selected. */
export async function backupClaudeAndSwitch(directory: string, toolDirectory: string, python: string, home = os.homedir()) {
  const backup = await privateLocalDirectory(path.join(directory, "backups", `${Date.now()}-${randomUUID()}`));
  const records: Array<{ source: string; target?: string; sha256?: string; absent?: boolean }> = [];
  const hash = (data: Buffer) => createHash("sha256").update(data).digest("hex");
  const config = process.env.CLAUDE_CONFIG_DIR || path.join(home, ".claude");
  for (const [source, name] of [[path.join(config, "settings.json"), "claude-settings.json"], [path.join(config, "settings.local.json"), "claude-settings-local.json"], [path.join(process.env.CLAUDE_CONFIG_DIR || home, ".claude.json"), "claude-global.json"], [path.join(config, ".config.json"), "claude-legacy.json"], [path.join(home, ".cc-switch/settings.json"), "cc-switch-settings.json"]] as const) {
    try {
      const data = await fs.readFile(source);
      await fs.writeFile(path.join(backup, name!), data, { flag: "wx", mode: 0o600 });
      records.push({ source, target: name!, sha256: hash(data) });
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; records.push({ source, absent: true }); }
  }
  const source = path.join(home, ".cc-switch", "cc-switch.db");
  if (await fs.stat(source).catch(() => null)) {
    if (!(await fs.stat(python).catch(() => null))?.isFile()) throw new Error("CC Switch 在线备份需要已检测的 Python；未裸拷活动 SQLite。");
    await exec(python, ["-B", path.join(toolDirectory, "backup-sqlite.py"), source, path.join(backup, "cc-switch.db")], { windowsHide: true, timeout: 30000 });
    records.push({ source, target: "cc-switch.db", sha256: hash(await fs.readFile(path.join(backup, "cc-switch.db"))) });
  } else records.push({ source, absent: true });
  // Integrity baseline only, never copy/write/parse Codex credentials or provider contents.
  for (const relative of [".codex/config.toml", ".codex/auth.json"]) {
    const filename = path.join(home, relative);
    try { records.push({ source: filename, sha256: hash(await fs.readFile(filename)) }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; records.push({ source: filename, absent: true }); }
  }
  await writePrivateJson(path.join(backup, "manifest.json"), { schema: 1, createdAt: new Date().toISOString(), restore: "先退出相关软件，逐文件比较后恢复。后续用户修改不得整库覆盖；启动器未改源配置或选择provider。", files: records });
  return backup;
}
export function switchBackupConfig(token: string, port: number) {
  return { env: {
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`, ANTHROPIC_AUTH_TOKEN: token, ANTHROPIC_API_KEY: "",
    ANTHROPIC_MODEL: "claude-sonnet-4-6", ANTHROPIC_DEFAULT_SONNET_MODEL: "claude-sonnet-4-6",
    ANTHROPIC_DEFAULT_HAIKU_MODEL: "claude-haiku-4-5", ANTHROPIC_DEFAULT_OPUS_MODEL: "claude-opus-4-6"
  } };
}
