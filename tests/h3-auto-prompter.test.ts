import { describe, expect, it } from "vitest";
import { h3AutoPrompterContract } from "../src/core/h3-auto-prompter.js";

describe("H3 Auto Prompter contract", () => {
  it("adds structured retention rules for R2V references", () => {
    const contract = h3AutoPrompterContract("R2V", 15, "Picture 1 = character; Video 1 = motion");
    expect(contract).toContain("subject_definitions");
    expect(contract).toContain("retention_analysis");
    expect(contract).toContain("fully_preserved");
    expect(contract).toContain("15.08 seconds");
    expect(contract).toContain("only source of Subject/Picture/Video/Audio labels");
    expect(contract).toContain("fully_copy");
    expect(contract).toContain("keyframe completion");
    expect(contract).toContain("350-500 grounded English words");
    expect(contract).toContain("<Audio N>");
  });

  it("keeps non-R2V output in the integrated multimodal schema", () => {
    const contract = h3AutoPrompterContract("I2VA", 5);
    expect(contract).toContain("integrated_multimodal_description");
    expect(contract).toContain("first/last frame alignment line exact");
    expect(contract).toContain("Do not invent a reference");
    expect(contract).toContain("<scenetrans>");
    expect(contract).toContain("T2VA has no image-alignment line");
  });
});
