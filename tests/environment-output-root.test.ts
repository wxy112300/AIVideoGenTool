import { describe, expect, it } from "vitest";
import path from "node:path";
import { sharedComfyOutputRoot } from "../electron/services/environment.js";

describe("shared media output root", () => {
  it("keeps a shared identical output directory rather than using its parent", () => {
    const output = path.resolve("fixture-comfy", "output");
    expect(sharedComfyOutputRoot({ outputDirectory: output, imageOutputDirectory: output })).toBe(output);
    expect(sharedComfyOutputRoot({ outputDirectory: path.join(output, "Videos"), imageOutputDirectory: path.join(output, "Images") })).toBe(output);
  });
});
