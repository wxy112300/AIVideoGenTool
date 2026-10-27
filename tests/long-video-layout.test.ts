import { describe, expect, it } from "vitest";
import { createLongVideoLayout, projectLongVideoFrames, proposeLongVideoExtension, suggestLongVideoChunks } from "../src/core/long-video/layout";

describe("long video layout", () => {
  it.each([[4, 1], [15, 2], [30, 3], [60, 6], [120, 12]])("keeps %s seconds as an export target with %s common chunks", (seconds, chunks) => {
    const layout = createLongVideoLayout(seconds);
    expect(layout.chunks).toBe(chunks);
    expect(layout.chunkSeconds * chunks).toBe(seconds);
    const projection = projectLongVideoFrames(layout);
    expect(projection.targetFrames).toBe(seconds * 24);
    expect(projection.groups.every(g => g.sampledFrames % 17 === 5 && g.netFrames === g.sampledFrames - g.trimFrames)).toBe(true);
    expect(projection.retainedFrames - projection.tailTrimFrames + projection.shortfallFrames).toBe(seconds * 24);
  });
  it("checks product limits and recommendation separately", () => {
    expect(createLongVideoLayout(120, 16).chunks).toBe(16);
    expect(() => createLongVideoLayout(120, 17)).toThrow();
    expect(() => createLongVideoLayout(120, 7)).toThrow();
    expect(() => createLongVideoLayout(3)).toThrow();
    expect(() => createLongVideoLayout(NaN)).toThrow();
    expect(() => projectLongVideoFrames({ ...createLongVideoLayout(60), totalChunks: 17 })).toThrow(/Inconsistent/);
    expect(suggestLongVideoChunks(15)).toEqual({ min: 1, max: 3, suggested: 2 });
  });
  it("matches the observed 5-second ordinary group plans without double subtracting context", () => {
    const projection = projectLongVideoFrames(createLongVideoLayout(10, 2));
    expect(projection.groups.map(g => [g.sampledFrames, g.trimFrames, g.netFrames])).toEqual([[124, 0, 124], [141, 22, 119]]);
    expect(projection.tailTrimFrames).toBe(3);
  });
  it("uses upstream ties-to-even for fractional cumulative frame targets", () => {
    // Python's 124.5 -> 124 stays on the grid; JS's 125 would sample 141.
    const projection = projectLongVideoFrames(createLongVideoLayout(5.1875, 1));
    expect(projection.groups[0].sampledFrames).toBe(124);
    expect(projection.targetFrames).toBe(125);
    expect(projection.shortfallFrames).toBe(1);
  });
  it("requires confirmation of non-exact extension and actual retained prefix frames", () => {
    const proposal = proposeLongVideoExtension(11, 13, 5);
    expect(proposal.exact).toBe(false);
    expect(proposal.proposedSeconds).toBe(15);
    expect(proposal.layout.totalChunks).toBe(16);
    expect(() => proposeLongVideoExtension(16, 13, 5)).toThrow(/capacity/);
    expect(() => proposeLongVideoExtension(5, 16, 5)).toThrow();
    expect(() => projectLongVideoFrames(proposal.layout)).toThrow(/prefix/);
    expect(projectLongVideoFrames(proposal.layout, 1563).groups[0].logicalChunk).toBe(14);
    expect(proposeLongVideoExtension(10, 2, 5).exact).toBe(true);
  });
});
