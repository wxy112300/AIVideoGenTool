import { describe, expect, it, vi } from "vitest";
import { GitHubReleaseVersionLookup, githubReleaseTagFromUrl } from "../electron/services/github-release-version";

describe("upstream release lookup", () => {
  it.each([true, false])("manual invalidation starts a new request and ignores an older response (old finishes first: %s)", async oldFirst => {
    let finishOld!: (value: unknown) => void, finishNew!: (value: unknown) => void;
    const read = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { finishNew = resolve; }));
    const lookup = new GitHubReleaseVersionLookup(read);
    const old = lookup.latest("owner/repo");
    lookup.invalidate();
    const fresh = lookup.latest("owner/repo");
    expect(read).toHaveBeenCalledTimes(2);
    if (oldFirst) {
      finishOld({ tag_name: "3.10.0", version_source: "Comfy Registry" });
      await old;
      expect(lookup.source("owner/repo")).toBe("");
      const joined = lookup.latest("owner/repo");
      expect(read).toHaveBeenCalledTimes(2);
      finishNew({ tag_name: "3.10.2", version_source: "GitHub Release" });
      expect(await joined).toBe("3.10.2");
    } else {
      finishNew({ tag_name: "3.10.2", version_source: "GitHub Release" });
      await fresh;
      finishOld({ tag_name: "3.10.0", version_source: "Comfy Registry" });
      await old;
    }
    expect(await fresh).toBe("3.10.2");
    expect(await lookup.latest("owner/repo")).toBe("3.10.2");
    expect(lookup.source("owner/repo")).toBe("GitHub Release");
    expect(read).toHaveBeenCalledTimes(2);
  });
  it("retries a partial Registry observation instead of caching it for six hours", async () => {
    const read = vi.fn().mockResolvedValueOnce({ tag_name: "3.10.0", version_source: "Comfy Registry", cacheable: false })
      .mockResolvedValueOnce({ tag_name: "3.10.2", version_source: "GitHub Release" });
    const lookup = new GitHubReleaseVersionLookup(read);
    expect(await lookup.latest("owner/repo")).toBe("3.10.0");
    expect(lookup.source("owner/repo")).toBe("Comfy Registry");
    expect(await lookup.latest("owner/repo")).toBe("3.10.2");
    expect(lookup.source("owner/repo")).toBe("GitHub Release");
    expect(read).toHaveBeenCalledTimes(2);
  });
  it("bounds simultaneous upstream connections and releases slots after failures", async () => {
    let active = 0, peak = 0;
    const lookup = new GitHubReleaseVersionLookup(async repository => {
      active += 1; peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 1));
      active -= 1;
      if (repository.endsWith("0")) throw new Error("offline");
      return { tag_name: "v1.0.0" };
    });
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => lookup.latest(`owner/repo${i}`)));
    expect(peak).toBe(4);
    expect(active).toBe(0);
    expect(results.filter(Boolean)).toHaveLength(10);
  });
  it("accepts only the official repository's resolved release, without HTML scraping or API quota", () => {
    expect(githubReleaseTagFromUrl("Niko1221/Strata", "https://github.com/Niko1221/Strata/releases/tag/v0.2.5")).toBe("v0.2.5");
    for (const url of ["https://github.com/Niko1221/Strata/releases", "https://github.com/other/Strata/releases/tag/v9.0", "https://example.com/Niko1221/Strata/releases/tag/v9.0", "invalid"]) {
      expect(githubReleaseTagFromUrl("Niko1221/Strata", url)).toBe("");
    }
  });
  it("deduplicates background scans but refreshes after manual invalidation", async () => {
    const read = vi.fn().mockResolvedValueOnce({ tag_name: "v0.2.3" }).mockResolvedValueOnce({ tag_name: "v0.2.5" });
    const lookup = new GitHubReleaseVersionLookup(read);
    expect(await Promise.all([lookup.latest("Owner/Repo"), lookup.latest("Owner/Repo")])).toEqual(["0.2.3", "0.2.3"]);
    expect(read).toHaveBeenCalledTimes(1);
    expect(await lookup.latest("Owner/Repo")).toBe("0.2.3");
    lookup.invalidate();
    expect(await lookup.latest("Owner/Repo")).toBe("0.2.5");
  });
  it("retries after failure and isolates a changed proxy from an in-flight request", async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error("timeout")).mockResolvedValue({ tag_name: "v0.2.5" });
    const lookup = new GitHubReleaseVersionLookup(read);
    expect(await lookup.latest("Owner/Repo")).toBe("");
    expect(await lookup.latest("Owner/Repo")).toBe("0.2.5");
    lookup.invalidate();
    await Promise.all([lookup.latest("Owner/Repo"), lookup.latest("Owner/Repo", "http://localhost:7890")]);
    expect(read).toHaveBeenCalledTimes(4);
  });
  it.each([{ tag_name: "models" }, { tag_name: "v1.0.0", prerelease: true }, { tag_name: "v1.0.0", draft: true }, {}])(
    "does not display asset or preview releases as stable versions: %j", async release => {
      expect(await new GitHubReleaseVersionLookup(async () => release).latest("Owner/Repo")).toBe("");
    });
});
