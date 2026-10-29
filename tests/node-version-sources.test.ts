import { describe, expect, it, vi } from "vitest";
import { readNodeVersionSources, registryVersion, upstreamProject } from "../electron/services/node-version-sources";

const repository = "owner/package";
const project = '[build-system]\nversion = "99.0"\n[project]\nname = "Package"\nversion = "2.0.0"\n[tool.other]\nversion = "999.0"\n';
const node = { id: "package", repository: "https://github.com/owner/package.git", latest_version: { version: "1.9.0", node_id: "package" } };

describe("node upstream version sources", () => {
  it("reports Strata's release hotfix separately from its older app tag without using source HEAD", async () => {
    const read = vi.fn(async () => JSON.stringify({ tag_name: "v0.2.7", name: "Strata 0.2.7.1: fixes", draft: false, prerelease: false }));
    expect(await readNodeVersionSources("Niko1221/Strata", read)).toEqual({ tag_name: "0.2.7.1", version_source: "GitHub Release" });
    expect(read).toHaveBeenCalledTimes(1);
    expect(await readNodeVersionSources("Niko1221/Strata", async (url, redirect) => {
      if (redirect) return "https://github.com/Niko1221/Strata/releases/tag/v0.2.7";
      if (url.includes("api.github.com")) throw new Error("rate limited");
      return "<title>Release Strata 0.2.7.1: NVIDIA · Niko1221/Strata · GitHub</title>";
    })).toEqual({ tag_name: "0.2.7.1", version_source: "GitHub Release" });
    expect(await readNodeVersionSources("Niko1221/Strata", async () => JSON.stringify({ tag_name: "v0.2.7", name: "Strata 99.0.0: unrelated" })))
      .toEqual({ tag_name: "0.2.7", version_source: "GitHub Release" });
  });
  it("reads the selected llama wheel provider's CUDA release tag without substituting Registry or HEAD", async () => {
    const read = vi.fn(async (_url: string) => JSON.stringify({ tag_name: "v0.4.5-cu131-win-20261025", draft: false, prerelease: false }));
    expect(await readNodeVersionSources("JamePeng/llama-cpp-python", read)).toEqual({ tag_name: "0.4.5", version_source: "GitHub Release" });
    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0]?.[0]).toBe("https://api.github.com/repos/JamePeng/llama-cpp-python/releases/latest");
  });
  it("falls back to the official llama release redirect and leaves latest unknown when both sources fail", async () => {
    const repository="JamePeng/llama-cpp-python";
    expect(await readNodeVersionSources(repository, async (_url, redirect) => {
      if (!redirect) throw new Error("rate limited");
      return `https://github.com/${repository}/releases/tag/v0.4.5-cu130-win-20261025`;
    })).toEqual({ tag_name: "0.4.5", version_source: "GitHub Release" });
    expect(await readNodeVersionSources(repository, async () => { throw new Error("offline"); }))
      .toEqual({ tag_name: "", version_source: "", cacheable: false });
    expect(await readNodeVersionSources(repository, async (_url, redirect) => redirect ? "https://github.com/other/fork/releases/tag/v9.9.9-cu130-win-20261025" : JSON.stringify({tag_name:"v9.9.9-cu130-win-20261025",prerelease:true})))
      .toEqual({ tag_name: "", version_source: "", cacheable: false });
  });
  it("reads the project table only and checks registry package and repository identity", () => {
    expect(upstreamProject(project)).toEqual({ name: "package", version: "2.0.0" });
    expect(registryVersion(node, repository, "package")).toBe("1.9.0");
    expect(registryVersion({ ...node, repository: "https://github.com/fork/package" }, repository, "package")).toBe("");
    expect(registryVersion({ ...node, id: "another-package" }, repository, "package")).toBe("");
    expect(registryVersion({ ...node, latest_version: { version: "99.0", deprecated: true } }, repository, "package")).toBe("");
  });
  it("gets registry-only publications and prefers newer published versions over old GitHub releases", async () => {
    const read = vi.fn(async (url: string) => url.includes("raw.githubusercontent") ? project
      : url.includes("api.comfy.org") ? JSON.stringify(node)
      : "https://github.com/owner/package/releases/tag/v1.8.0");
    expect(await readNodeVersionSources(repository, read)).toEqual({ tag_name: "1.9.0", version_source: "Comfy Registry" });
    read.mockImplementation(async url => url.includes("raw.githubusercontent") ? project : url.includes("api.comfy.org") ? JSON.stringify(node) : "https://github.com/owner/package/releases");
    expect(await readNodeVersionSources(repository, read)).toEqual({ tag_name: "1.9.0", version_source: "Comfy Registry", cacheable: false });
  });
  it("keeps a newer official release and tolerates unavailable registry/source endpoints", async () => {
    expect(await readNodeVersionSources(repository, async (url) => {
      if (url.includes("raw.githubusercontent")) return project;
      if (url.includes("api.comfy.org")) throw new Error("offline");
      return "https://github.com/owner/package/releases/tag/v3.0.0";
    })).toEqual({ tag_name: "3.0.0", version_source: "GitHub Release" });
  });
  it("labels a source-only version explicitly and never substitutes a same-name fork", async () => {
    expect(await readNodeVersionSources(repository, async url => url.includes("raw.githubusercontent") ? project
      : url.includes("api.comfy.org") ? JSON.stringify({ ...node, repository: "https://github.com/fork/package" }) : ""))
      .toEqual({ tag_name: "2.0.0", version_source: "pyproject.toml · HEAD", cacheable: false });
    expect(await readNodeVersionSources(repository, async () => { throw new Error("offline"); }))
      .toEqual({ tag_name: "", version_source: "", cacheable: false });
  });
  it("reads GitHub API hotfixes ahead of Registry even when the website redirect is unavailable", async () => {
    const read = vi.fn(async (url: string) => {
      if (url.includes("raw.githubusercontent")) return project;
      if (url.includes("api.comfy.org")) return JSON.stringify(node);
      if (url.includes("api.github.com")) return JSON.stringify({ tag_name: "v3.10.2", draft: false, prerelease: false });
      throw new Error("website unavailable");
    });
    expect(await readNodeVersionSources(repository, read)).toEqual({ tag_name: "3.10.2", version_source: "GitHub Release" });
    expect(read.mock.calls.some(([url]) => url.startsWith("https://github.com/"))).toBe(false);
  });
});
