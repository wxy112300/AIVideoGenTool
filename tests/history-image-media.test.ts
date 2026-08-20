import { describe, expect, it } from "vitest";
import {
  imageMediaStateAfterLoad,
  imageMediaStateClass,
  initialImageMediaState
} from "../src/renderer/pages/history/image-media-state";

describe("image history media states", () => {
  it("starts unavailable without a resolved source and loading with one", () => {
    expect(initialImageMediaState("")).toBe("unavailable");
    expect(initialImageMediaState("studio-media://history/project/version/0")).toBe("loading");
  });

  it("distinguishes decoded media from a failed image load", () => {
    const source = "studio-media://history/project/version/0";
    expect(imageMediaStateAfterLoad(source, 640)).toBe("ready");
    expect(imageMediaStateAfterLoad(source, 0)).toBe("error");
    expect(imageMediaStateAfterLoad("", 640)).toBe("unavailable");
  });

  it("exposes a stable state class for the renderer surface", () => {
    expect(imageMediaStateClass("loading")).toBe("image-media-loading");
    expect(imageMediaStateClass("ready")).toBe("image-media-ready");
    expect(imageMediaStateClass("unavailable")).toBe("image-media-unavailable");
    expect(imageMediaStateClass("error")).toBe("image-media-error");
  });
});
