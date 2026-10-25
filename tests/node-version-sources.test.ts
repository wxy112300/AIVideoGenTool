import { describe, expect, it, vi } from "vitest";
import { readNodeVersionSources, registryVersion, upstreamProject } from "../electron/services/node-version-sources";

const repository = "owner/package";
const project = '[build-system]\nversion = "99.0"\n[project]\nname = "Package"\nversion = "2.0.0"\n[tool.other]\nversion = "999.0"\n';
const node = { id: "package", repository: "https://github.com/owner/package.git", latest_version: { version: "1.9.0", node_id: "package" } };

describe("node upstream version sources", () => {
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
    expect(await readNodeVersionSources(repository, read)).toEqual({ tag_name: "1.9.0", version_source: "Comfy Registry" });
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
      .toEqual({ tag_name: "2.0.0", version_source: "pyproject.toml · HEAD" });
    expect(await readNodeVersionSources(repository, async () => { throw new Error("offline"); }))
      .toEqual({ tag_name: "", version_source: "" });
  });
});
