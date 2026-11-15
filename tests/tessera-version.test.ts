import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { customNodeDefinition } from "../src/core/catalog/dependencies/nodes";
import { readLocalNodeVersion, scanCustomNodes } from "../electron/services/dependency-scanner";
import { readNodeVersionSources } from "../electron/services/node-version-sources";
import { createDefaultState } from "../src/core/defaults";

describe("Tessera standard versions", () => {
  it("uses current/recommended/latest presentation and has no commit or minimum-version lock", () => {
    const node = customNodeDefinition("tessera")!;
    expect(node).toMatchObject({ versionMode: "release", releaseSource: "github-release", recommendedVersion: "1.0.0" });
    expect(node.installRevision).toBeUndefined();
    expect(node.installRevisionPolicy).toBeUndefined();
    expect(node.minimumVersion).toBeUndefined();
    expect(node.latestVersion).toBe("1.0.0");
  });

  it("reads installed version independently of recommendation and accepts a different commit", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "tessera-version-"));
    try {
      const directory = path.join(root, "custom_nodes", "ComfyUI-Tessera");
      await fs.mkdir(path.join(directory, ".git", "objects"), { recursive: true });
      await fs.mkdir(path.join(directory, ".git", "refs"));
      await fs.writeFile(path.join(directory, ".git", "HEAD"), "a".repeat(40) + "\n");
      await fs.writeFile(path.join(directory, "pyproject.toml"), '[project]\nname = "comfyui-tessera"\nversion = "1.1.0"\n');
      await fs.writeFile(path.join(directory, "nodes.py"), 'NODE_CLASS_MAPPINGS = {"TesseraEncode": object, "TesseraRefine": object, "TesseraArgs": object}\n');
      expect(await readLocalNodeVersion(directory)).toEqual({ version: "1.1.0", source: "pyproject.toml" });
      const nodes = await scanCustomNodes(root, { ...createDefaultState().settings, comfyUrl: "http://127.0.0.1:1" }, "", "", "", { tessera: "1.2.0" },
        { nodeIds: new Set(["TesseraEncode", "TesseraRefine", "TesseraArgs"]) });
      expect(nodes.find(node => node.id === "tessera")).toMatchObject({ version: "1.1.0", recommendedVersion: "1.0.0", latestVersion: "1.2.0", versionMode: "release", loaded: true });
      expect(nodes.find(node => node.id === "tessera")!.compatibilityState).not.toBe("error");
      await fs.writeFile(path.join(directory, "pyproject.toml"), '[project]\nname = "comfyui-tessera"\nversion = "0.9.0"\n');
      const offline = await scanCustomNodes(root, { ...createDefaultState().settings, comfyUrl: "http://127.0.0.1:1" }, "", "", "", {},
        { nodeIds: new Set(["TesseraEncode", "TesseraRefine", "TesseraArgs"]) });
      expect(offline.find(node => node.id === "tessera")).toMatchObject({ version: "0.9.0", latestVersion: "", loaded: true });
      expect(offline.find(node => node.id === "tessera")!.compatibilityState).not.toBe("error");
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });

  it("detects source-only upstream versions without fabricating a release or using the recommendation", async () => {
    const repo = "hashu786/ComfyUI-Tessera";
    expect(await readNodeVersionSources(repo, async url => url.includes("raw.githubusercontent")
      ? '[project]\nname = "comfyui-tessera"\nversion = "1.3.0"\n' : ""))
      .toEqual({ tag_name: "1.3.0", version_source: "pyproject.toml · HEAD", cacheable: false });
    expect(await readNodeVersionSources(repo, async () => { throw new Error("offline"); }))
      .toEqual({ tag_name: "", version_source: "", cacheable: false });
  });
});
