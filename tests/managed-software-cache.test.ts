import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultSettings } from "../src/core/defaults";
import { STRATA_RELEASES } from "../src/core/catalog/dependencies/strata";
import { DLSS5_RUNTIME_BUNDLE_ID, customNodeDefinition } from "../src/core/catalog/index";
import { managedStrataDirectory } from "../electron/services/strata-installation";
import { createManagedSoftwareCache } from "../electron/services/managed-software-cache";
import { createAppCacheService } from "../electron/services/cache-service";
import { depthAnythingBuiltinMetadataFile, DEPTH_ANYTHING_V2_SMALL_METADATA_RELATIVE_DIRECTORY } from "../src/infrastructure/depth-anything-metadata";

vi.mock("../src/core/catalog/dependencies/dlss5.js", async importOriginal => ({
  ...await importOriginal<typeof import("../src/core/catalog/dependencies/dlss5")>(),
  DLSS5_RETIRED_DESKTOP_ASSET: {
    relativePath: "extracted/resources/app.asar", bytes: 24,
    sha256: createHash("sha256").update("distributed desktop asar").digest("hex")
  }
}));

const roots: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });
async function write(filename: string, text = "software") { await fs.mkdir(path.dirname(filename), { recursive: true }); await fs.writeFile(filename, text); }
function commitSoftware(directory: string, origin: string) {
  const git = (...args: string[]) => execFileSync("git", ["-c", "core.hooksPath=NUL", "-C", directory, ...args], { windowsHide: true, stdio: "pipe" });
  git("init"); git("remote", "add", "origin", origin);
  git("add", "."); git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-m", "distributed assets");
  return git;
}
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-managed-cache-")); roots.push(root); vi.stubEnv("LOCALAPPDATA", root);
  const current = managedStrataDirectory(STRATA_RELEASES[0]), old = managedStrataDirectory(STRATA_RELEASES[1]);
  for (const [dir, release] of [[current, STRATA_RELEASES[0]], [old, STRATA_RELEASES[1]]] as const) {
    await write(path.join(dir, "lvs-strata-install.json"), JSON.stringify({ owner: "local-video-studio", ...release, installedAt: "fixture" }));
    await write(path.join(dir, ".venv/Scripts/python.exe")); await write(path.join(dir, "engine/runtime.dll")); await write(path.join(dir, "engine/BUILD.json"), '{"engine":true}');
  }
  const settings = { ...createDefaultSettings(), modelDirectory: path.join(root, "models"), outputDirectory: path.join(root, "outputs") };
  const comfy = path.join(root, "comfy"), logs: string[] = [];
  const software = createManagedSoftwareCache({ getSettings: () => settings, comfyRoot: async () => comfy,
    agentRoot: path.join(root, "agent"), withExclusive: async work => work(), assertIdle: async () => {}, log: message => logs.push(message) });
  const cache = createAppCacheService({ software, temporaryRoot: path.join(root, "temporary"), session: { getCacheSize: async () => 0, clearCache: async () => {} } });
  return { root, old, current, settings, comfy, software, cache, logs };
}
describe("managed software cleanup through cache management", () => {
  it.each(["builtin", "custom-config", "custom-preprocessor", "weights", "misplaced", "unknown-source"])("recognizes only exact bundled Depth Anything metadata in official backups (%s)", async state => {
    const f = await fixture(), backup = path.join(f.comfy, "node-backups", "ComfyUI-DLSS5-123");
    await write(path.join(backup, "nodes.py"));
    commitSoftware(backup, state === "unknown-source" ? "https://example.invalid/other.git" : "https://github.com/HECer/ComfyUI-DLSS5.git");
    const directory = path.join(backup, state === "misplaced" ? "user-metadata" : DEPTH_ANYTHING_V2_SMALL_METADATA_RELATIVE_DIRECTORY);
    for (const filename of ["config.json", "preprocessor_config.json"]) {
      const custom = state === (filename === "config.json" ? "custom-config" : "custom-preprocessor");
      const text = depthAnythingBuiltinMetadataFile(filename);
      await write(path.join(directory, filename), custom ? JSON.stringify({ ...JSON.parse(text), user: true }) : text);
    }
    if (state === "weights") await write(path.join(directory, "model.safetensors"), "user model");
    const result = await f.cache.clear();
    if (state === "builtin") {
      expect(result.errors).toEqual([]);
      await expect(fs.stat(backup)).rejects.toMatchObject({ code: "ENOENT" });
    } else {
      if (state !== "unknown-source") expect(result.errors.length).toBeGreaterThan(0);
      expect(await fs.stat(path.join(directory, "config.json"))).toBeTruthy();
      if (state === "weights") expect(await fs.readFile(path.join(directory, "model.safetensors"), "utf8")).toBe("user model");
    }
  });
  it("keeps modified tracked configuration even when the distributed demo media is disposable", async () => {
    const f = await fixture();
    const backup = path.join(f.comfy, "node-backups", "ComfyUI-DLSS-Frame-Interpolation-123");
    const config = path.join(backup, "bin/runtime/host/ReShade.ini");
    const demo = path.join(backup, "Assets/120fps-Upscaled-interpolated.mp4");
    await write(demo, "distributed demo"); await write(config, "distributed defaults");
    commitSoftware(backup, "https://github.com/Konohamaru04/ComfyUI-NVIDIA-DLSS-Frame-Interpolation.git");
    await write(config, "user settings");
    const errors = (await f.cache.clear()).errors.join(" ");
    expect(errors).toContain("ReShade.ini");
    expect(errors).toContain("配置已修改或来源未确认");
    expect(errors).toContain("未清理整个备份");
    expect(await fs.readFile(config, "utf8")).toBe("user settings");
    expect(await fs.stat(demo)).toBeTruthy();
  });
  it.each(["owned", "modified", "misplaced", "unknown", "user-data", "linked"])("validates retired DLSS5 staging payload before deleting a backup (%s)", async state => {
    const f = await fixture();
    const backup = path.join(f.comfy, "node-backups", "ComfyUI-DLSS5-123");
    await write(path.join(backup, "__init__.py"));
    commitSoftware(backup, state === "unknown" ? "https://example.invalid/other.git" : "https://github.com/HECer/ComfyUI-DLSS5.git");
    const stage = path.join(backup, ".dlss5-runtime-staging-5782fc7f-7fba-4f26-839f-f43dc0324110");
    const payload = path.join(state === "misplaced" ? backup : stage, "extracted/resources/app.asar");
    await write(payload, state === "modified" ? "custom desktop contents!" : "distributed desktop asar");
    if (state === "user-data") await write(path.join(stage, "settings.json"), "private user settings");
    if (state === "linked") {
      const external = path.join(f.root, "private"); await write(path.join(external, "keep.txt"), "private");
      await fs.symlink(external, path.join(stage, "private"), "junction");
    }
    const result = await f.cache.clear();
    if (state === "owned") {
      expect(result.errors).toEqual([]);
      await expect(fs.stat(backup)).rejects.toMatchObject({ code: "ENOENT" });
    } else {
      expect(await fs.readFile(payload, "utf8")).toContain(state === "modified" ? "custom" : "distributed");
      if (state !== "unknown") expect(result.errors.length).toBeGreaterThan(0);
    }
  });
  it.each(["unchanged", "modified", "untracked"])("handles distributed demo media without deleting user media (%s)", async state => {
    const f = await fixture();
    const backup = path.join(f.comfy, "node-backups", "ComfyUI-DLSS-Frame-Interpolation-123");
    const demo = path.join(backup, "Assets/120fps-Upscaled-interpolated.mp4");
    await write(path.join(backup, "__init__.py"));
    if (state !== "untracked") await write(demo, "distributed demo");
    commitSoftware(backup, "https://github.com/Konohamaru04/ComfyUI-NVIDIA-DLSS-Frame-Interpolation.git");
    if (state !== "unchanged") await write(demo, "user media");
    const result = await f.cache.clear();
    if (state === "unchanged") {
      expect(result.errors).toEqual([]);
      await expect(fs.stat(backup)).rejects.toMatchObject({ code: "ENOENT" });
    } else {
      expect(result.errors.join(" ")).toContain("模型／媒体／数据库");
      expect(await fs.readFile(demo, "utf8")).toBe("user media");
    }
    await expect(fs.stat(f.old)).rejects.toMatchObject({ code: "ENOENT" });
  });
  async function strataStage(parent: string) {
    const stage = path.join(parent, ".install-real123");
    const assets = ["draft_vocab.bin", "draft_vocab_en.bin", "draft_vocab_fr.bin", "draft_vocab_cyrillic.bin", "expert-profile.bin", "expert-profile-coder.bin", "expert-profile-sycl.bin"];
    for (const name of assets) await write(path.join(stage, "data", name), "distributed runtime asset");
    await write(path.join(stage, "tools/draft_vocab.py"));
    const git = (...args: string[]) => execFileSync("git", ["-C", stage, ...args], { windowsHide: true, stdio: "pipe" });
    git("init"); git("remote", "add", "origin", "https://github.com/Niko1221/Strata.git");
    git("add", "."); git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-m", "distributed assets");
    return { stage, git };
  }
  it("clears unchanged upstream Strata vocabulary subsets and expert profiles in abandoned stages", async () => {
    const f = await fixture(), { stage } = await strataStage(path.dirname(f.old));
    const result = await f.cache.clear();
    expect(result.errors).toEqual([]);
    await expect(fs.stat(stage)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await fs.stat(f.current)).toBeTruthy();
  });
  it.each(["data/draft_vocab.bin", "data/expert-profile.bin", "data/expert-profile-coder.bin", "models/draft_vocab.bin", "data/model.bin", "data/weights.gguf", "data/settings.json", "sessions/chat.json"])("preserves local data in a Strata stage: %s", async name => {
    const f = await fixture(), { stage } = await strataStage(path.dirname(f.old));
    await write(path.join(stage, name), "local user data");
    expect((await f.cache.clear()).errors.length).toBeGreaterThan(0);
    expect(await fs.readFile(path.join(stage, name), "utf8")).toBe("local user data");
  });
  it("does not trust a stage marker alone for untracked vocabulary or another repository", async () => {
    const f = await fixture(), { stage, git } = await strataStage(path.dirname(f.old));
    await write(path.join(stage, "lvs-strata-stage.json"), '{"owner":"local-video-studio"}');
    git("remote", "set-url", "origin", "https://example.invalid/other.git");
    expect((await f.cache.clear()).errors.join(" ")).toContain("模型");
    git("remote", "set-url", "origin", "https://github.com/Niko1221/Strata.git");
    git("rm", "--cached", "data/draft_vocab.bin");
    expect((await f.cache.clear()).errors.join(" ")).toContain("模型");
    expect(await fs.stat(stage)).toBeTruthy();
  });
  it("rejects linked runtime assets and keeps the external target", async () => {
    const f = await fixture(), { stage } = await strataStage(path.dirname(f.old));
    const external = path.join(f.root, "private-data");
    await write(path.join(external, "draft_vocab.bin"), "private data");
    await fs.symlink(external, path.join(stage, "data", "linked"), "junction");
    expect((await f.cache.clear()).errors.join(" ")).toContain("链接");
    expect(await fs.readFile(path.join(external, "draft_vocab.bin"), "utf8")).toBe("private data");
    expect(await fs.stat(stage)).toBeTruthy();
  });
  it("keeps unknown stages even when they contain the same runtime asset names", async () => {
    const f = await fixture(), stage = path.join(path.dirname(f.old), ".install-unknown");
    await write(path.join(stage, "data/draft_vocab.bin"), "unknown data");
    expect((await f.cache.clear()).errors).toEqual([]);
    expect(await fs.readFile(path.join(stage, "data/draft_vocab.bin"), "utf8")).toBe("unknown data");
  });
  it("clears legacy runtimes, owned stages, download cache and node/runtime backups but keeps the current version and data", async () => {
    const f = await fixture(), parent = path.dirname(f.old);
    const stage = path.join(parent, ".install-old123"); await write(path.join(stage, "lvs-strata-stage.json"), '{"owner":"local-video-studio"}'); await write(path.join(stage, "setup.py"));
    const download = path.join(parent, "downloads", `engine-${"a".repeat(40)}-${"b".repeat(64)}`);
    await write(path.join(download, "download.json"), JSON.stringify({ owner: "local-video-studio", revision: "a".repeat(40), sha256: "b".repeat(64) }));
    await write(path.join(download, "engine.zip"));
    const bundled = customNodeDefinition("local-video-studio-h3-av")!;
    const backup = path.join(f.comfy, "node-backups", bundled.directoryName + "-123");
    await write(path.join(backup, "VERSION"), "fixture"); await write(path.join(backup, "__init__.py"));
    const runtime = path.join(f.comfy, "dlss5-runtime-backups", "123-fixture");
    await write(path.join(runtime, "install-manifest.json"), JSON.stringify({ schemaVersion: 1, bundleId: DLSS5_RUNTIME_BUNDLE_ID, ownedFiles: ["runtime.dll"] }));
    await write(path.join(runtime, "runtime.dll"));
    const data = path.join(parent, "data", "keep.gguf"), model = path.join(f.settings.modelDirectory, "keep.gguf");
    await write(data); await write(model); const unknown = path.join(parent, ".install-unknown"); await write(path.join(unknown, "keep.txt"));
    const before = await f.cache.inspect(); expect(before.temporaryDirectoryCount).toBe(5);
    const result = await f.cache.clear(); expect(result.errors).toEqual([]); expect(result.clearedBytes).toBeGreaterThan(0);
    for (const target of [f.old, stage, download, backup, runtime]) await expect(fs.stat(target)).rejects.toMatchObject({ code: "ENOENT" });
    for (const target of [f.current, data, model, unknown]) expect(await fs.stat(target)).toBeTruthy();
    expect(f.logs.some(message => message.includes("已清理"))).toBe(true);
    expect((await f.cache.clear()).clearedBytes).toBe(0);
  });
  it("preserves model/configuration leftovers, links and unowned folders, and reports the reason", async () => {
    const f = await fixture(); await write(path.join(f.old, "user-settings.json"), '{"user":true}');
    const unknown = path.join(path.dirname(f.old), "v0.0.1-12345678"); await write(path.join(unknown, "user.gguf"));
    const linked = path.join(path.dirname(f.old), "v0.1.1-12345678"); await fs.symlink(f.current, linked, "junction");
    const result = await f.cache.clear(); expect(result.errors.join(" ")).toContain("本地文件");
    expect(await fs.readFile(path.join(f.old, "user-settings.json"), "utf8")).toContain("user");
    expect(await fs.stat(unknown)).toBeTruthy(); expect(await fs.lstat(linked)).toBeTruthy();
    await fs.rm(path.join(f.old, "user-settings.json")); await write(path.join(f.old, "local-model.gguf"));
    expect((await f.cache.clear()).errors.join(" ")).toContain("模型");
  });
  it("revalidates identity and selected paths before deletion, without trusting a stale snapshot", async () => {
    const f = await fixture(), targets = await f.software.inspect(); const target = targets.find(target => target.path === f.old)!;
    const receipt = path.join(f.old, "lvs-strata-install.json"); const json = JSON.parse(await fs.readFile(receipt, "utf8"));
    await fs.writeFile(receipt, JSON.stringify({ ...json, installedAt: "changed" }));
    await expect(f.software.clear(target)).rejects.toThrow("已改变");
    f.settings.modelDirectory = f.old;
    expect((await f.software.inspect()).some(target => target.path === f.old)).toBe(false);
    expect(await fs.stat(f.old)).toBeTruthy();
  });
});
