import { promises as fs } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { gitSoftwareFiles } from "../electron/services/software-git-files";
import { preserveSoftwareUserData } from "../electron/services/software-update-cleanup";

it("updates official tracked config while preserving changed and untracked user config", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-git-software-"));
  try {
    const source = path.join(root, "old"), next = path.join(root, "next");
    await fs.mkdir(source); await fs.mkdir(next);
    const git = (...args: string[]) => execFileSync("git.exe", ["-c", "core.hooksPath=NUL", "-C", source, ...args], { windowsHide: true, encoding: "utf8" }).trim();
    git("init", "--quiet");
    git("remote", "add", "origin", "https://github.com/Niko1221/Strata.git");
    await fs.writeFile(path.join(source, "config.yml"), "official old");
    await fs.writeFile(path.join(source, "settings.json"), "official settings");
    git("add", "."); git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "fixture");
    const revision = git("rev-parse", "HEAD");
    await fs.writeFile(path.join(source, "settings.json"), "user settings");
    await fs.writeFile(path.join(source, "user.json"), "private local config");
    await fs.writeFile(path.join(next, "config.yml"), "official new");
    const expected = { repository: "https://github.com/Niko1221/Strata", revision };
    const software = await gitSoftwareFiles(source, expected);
    expect([...software]).toEqual(["config.yml"]);
    await preserveSoftwareUserData(source, next, [], undefined, [...software]);
    expect(await fs.readFile(path.join(next, "config.yml"), "utf8")).toBe("official new");
    expect(await fs.readFile(path.join(next, "settings.json"), "utf8")).toBe("user settings");
    expect(await fs.readFile(path.join(next, "user.json"), "utf8")).toBe("private local config");
    expect((await gitSoftwareFiles(source, { ...expected, revision: "0".repeat(40) })).size).toBe(0);
    expect((await gitSoftwareFiles(source, { ...expected, repository: "https://github.com/other/Strata" })).size).toBe(0);
    await fs.writeFile(path.join(source, "config.yml"), "user override");
    await expect(preserveSoftwareUserData(source, next, [], undefined, [...await gitSoftwareFiles(source, expected)]))
      .rejects.toThrow("同名");
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
