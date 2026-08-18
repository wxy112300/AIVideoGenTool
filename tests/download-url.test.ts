import { describe, expect, it } from "vitest";
import { rewriteHuggingFaceDownloadUrl } from "../src/core/download-url";

describe("model download URL mirror", () => {
  it("rewrites Hugging Face host while preserving the rest of the URL", () => {
    expect(rewriteHuggingFaceDownloadUrl(
      "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/model.safetensors?download=true#file",
      true
    )).toBe("https://hf-mirror.com/Comfy-Org/MiniMax-H3/resolve/main/model.safetensors?download=true#file");
  });

  it("leaves other hosts and disabled settings unchanged", () => {
    const huggingFaceUrl = "https://huggingface.co/org/model/tree/main";
    const githubUrl = "https://github.com/org/model/releases/latest";
    expect(rewriteHuggingFaceDownloadUrl(huggingFaceUrl, false)).toBe(huggingFaceUrl);
    expect(rewriteHuggingFaceDownloadUrl(githubUrl, true)).toBe(githubUrl);
    expect(rewriteHuggingFaceDownloadUrl("not a URL", true)).toBe("not a URL");
  });
});