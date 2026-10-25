import { describe, expect, it, vi } from "vitest";
import { GitHubReleaseVersionLookup, githubReleaseTagFromUrl } from "../electron/services/github-release-version";

describe("upstream release lookup", () => {
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
