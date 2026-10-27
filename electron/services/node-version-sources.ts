import { compareReleaseVersions } from "../../src/core/release-version.js";
import { githubReleaseTagFromUrl } from "./github-release-version.js";

const version = (value: unknown): string => typeof value === "string" && /^v?\d+(?:[.-]\d+)+$/.test(value.trim())
  ? value.trim().replace(/^v/i, "") : "";
const repositoryKey = (value: unknown): string => typeof value === "string"
  ? value.replace(/^https:\/\/github\.com\//i, "").replace(/\/+$/, "").replace(/\.git$/i, "").toLowerCase() : "";

export function upstreamProject(text: string): { name: string; version: string } {
  const project = text.match(/^\[project\]\s*\r?\n([\s\S]*?)(?=^\[|$(?![\s\S]))/m)?.[1] ?? "";
  const name = project.match(/^name\s*=\s*["']([^"']+)["']/m)?.[1]?.toLowerCase() ?? "";
  return { name: /^[a-z0-9._-]+$/.test(name) ? name : "",
    version: version(project.match(/^version\s*=\s*["']([^"']+)["']/m)?.[1]) };
}

export function registryVersion(payload: unknown, repository: string, name: string): string {
  const node = payload as { id?: unknown; repository?: unknown; latest_version?: {
    version?: unknown; node_id?: unknown; deprecated?: boolean
  } } | null;
  if (!node || node.id !== name || repositoryKey(node.repository) !== repositoryKey(repository) ||
    node.latest_version?.deprecated || (node.latest_version?.node_id && node.latest_version.node_id !== name)) return "";
  return version(node.latest_version?.version);
}

/** Sources describe observations only; none changes the app's install pin or recommendation. */
export async function readNodeVersionSources(repository: string,
  read: (url: string, redirectOnly?: boolean) => Promise<string>
): Promise<{ tag_name: string; version_source: string; cacheable?: boolean }> {
  const safeRead = (url: string, redirectOnly = false) => read(url, redirectOnly).catch(() => "");
  const readRelease = async () => {
    try {
      const payload = JSON.parse(await safeRead(`https://api.github.com/repos/${repository}/releases/latest`));
      if (!payload.draft && !payload.prerelease && version(payload.tag_name)) return version(payload.tag_name);
    } catch { /* Rate limits and unavailable API routes can use the official redirect. */ }
    return version(githubReleaseTagFromUrl(repository,
      await safeRead(`https://github.com/${repository}/releases/latest`, true)));
  };
  const [projectText, release] = await Promise.all([
    safeRead(`https://raw.githubusercontent.com/${repository}/HEAD/pyproject.toml`), readRelease()
  ]);
  const project = upstreamProject(projectText);
  let published = "";
  if (project.name) {
    try { published = registryVersion(JSON.parse(await safeRead(`https://api.comfy.org/nodes/${encodeURIComponent(project.name)}`)), repository, project.name); }
    catch { /* A missing/unreachable registry entry does not preclude a GitHub release. */ }
  }
  if (published && (!release || compareReleaseVersions(published, release) >= 0)) {
    return { tag_name: published, version_source: "Comfy Registry", ...(!release ? { cacheable: false } : {}) };
  }
  if (release) return { tag_name: release, version_source: "GitHub Release" };
  // Source HEAD is useful for projects without published packages, but must
  // remain distinguishable from a published release in the version row.
  return { tag_name: project.version, version_source: project.version ? "pyproject.toml · HEAD" : "", cacheable: false };
}
