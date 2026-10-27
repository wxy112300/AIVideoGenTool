/** The official latest-release redirect excludes draft and prerelease entries. */
export function githubReleaseTagFromUrl(repository: string, value: string): string {
  try {
    const url = new URL(value);
    const prefix = `/${repository}/releases/tag/`;
    if (url.protocol !== "https:" || url.hostname !== "github.com" ||
      !url.pathname.toLowerCase().startsWith(prefix.toLowerCase())) return "";
    return decodeURIComponent(url.pathname.slice(prefix.length));
  } catch { return ""; }
}

/** Reuse successful observations for background checks; manual scans explicitly invalidate them. */
export class GitHubReleaseVersionLookup {
  private readonly pending = new Map<string, Promise<string>>();
  private readonly cache = new Map<string, { version: string; checkedAt: number; source: string; cacheable: boolean }>();
  private slots = 4;
  private generation = 0;
  private readonly waiters: Array<() => void> = [];
  constructor(private readonly readJson: (repository: string, connectionKey: string) => Promise<unknown>) {}

  invalidate(): void {
    this.generation += 1;
    this.cache.clear();
    this.pending.clear();
  }
  source(repository: string, connectionKey = ""): string {
    return this.cache.get(`${repository.toLowerCase()}\n${connectionKey}`)?.source ?? "";
  }

  private async read(repository: string, connectionKey: string): Promise<unknown> {
    if (this.slots) this.slots -= 1;
    else await new Promise<void>(resolve => { this.waiters.push(resolve); });
    try { return await this.readJson(repository, connectionKey); }
    finally {
      const next = this.waiters.shift();
      if (next) next();
      else this.slots += 1;
    }
  }

  latest(repository: string, connectionKey = ""): Promise<string> {
    const key = `${repository.toLowerCase()}\n${connectionKey}`;
    const cached = this.cache.get(key);
    if (cached?.cacheable && Date.now() - cached.checkedAt < 6 * 60 * 60 * 1000) return Promise.resolve(cached.version);
    const pending = this.pending.get(key);
    if (pending) return pending;
    const generation = this.generation;
    const request = this.read(repository, connectionKey).then(payload => {
      const release = payload as { tag_name?: unknown; draft?: boolean; prerelease?: boolean; version_source?: string; cacheable?: boolean } | null;
      const tag = typeof release?.tag_name === "string" ? release.tag_name.trim().replace(/^v/i, "") : "";
      const version = !release?.draft && !release?.prerelease && /^\d+(?:[.-]\d+)+$/.test(tag) ? tag : "";
      if (version && generation === this.generation) this.cache.set(key, { version, checkedAt: Date.now(), source: release?.version_source || "GitHub Release", cacheable: release?.cacheable !== false });
      return version;
    }).catch(() => "").finally(() => {
      if (this.pending.get(key) === request) this.pending.delete(key);
    });
    this.pending.set(key, request);
    return request;
  }
}
