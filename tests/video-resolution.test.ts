import { describe, expect, it } from "vitest";
import { nearestSupportedVideoResolution } from "../src/core/video-resolution";

describe("nearestSupportedVideoResolution", () => {
  const h3 = [480, 540, 720, 768] as const;

  it("keeps a supported history resolution", () => {
    expect(nearestSupportedVideoResolution(768, h3, 480)).toBe(768);
  });

  it("uses the highest option when history is above the model range", () => {
    expect(nearestSupportedVideoResolution(1080, h3, 480)).toBe(768);
  });

  it("uses the lowest option when history is below the model range", () => {
    expect(nearestSupportedVideoResolution(360, h3, 480)).toBe(480);
  });

  it("prefers the higher option on an exact tie", () => {
    expect(nearestSupportedVideoResolution(630, [540, 720], 540)).toBe(720);
  });

  it("falls back safely when no options are declared", () => {
    expect(nearestSupportedVideoResolution(1080, [], 480)).toBe(480);
  });
});
