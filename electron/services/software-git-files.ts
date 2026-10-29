import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const exec = promisify(execFile);
const repository = (value: string) => value.trim().replace(/\.git\/?$/iu, "").replace(/\/$/u, "").toLowerCase();

/** Unchanged tracked files are downloadable software, not local configuration to carry across updates. */
export async function gitSoftwareFiles(directory: string, expected?: { repository: string; revision: string }): Promise<Set<string>> {
  try {
    const git = await fs.lstat(path.join(directory, ".git"));
    if (git.isSymbolicLink()) return new Set();
    const args = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "core.hooksPath=NUL", "-C", directory];
    const options = { windowsHide: true, timeout: 10000, maxBuffer: 4 * 1024 * 1024 };
    if (expected) {
      const [origin, head] = await Promise.all([
        exec("git.exe", [...args, "config", "--get", "remote.origin.url"], options),
        exec("git.exe", [...args, "rev-parse", "HEAD"], options)
      ]);
      if (repository(origin.stdout) !== repository(expected.repository) || head.stdout.trim() !== expected.revision) return new Set();
    }
    const [tracked, modified] = await Promise.all([
      exec("git.exe", [...args, "ls-files", "-z"], options),
      exec("git.exe", [...args, "diff", "--no-ext-diff", "--no-textconv", "--name-only", "-z", "HEAD", "--"], options)
    ]);
    const changed = new Set(modified.stdout.split("\0"));
    return new Set(tracked.stdout.split("\0").filter(name => name && !changed.has(name)));
  } catch { return new Set(); }
}
