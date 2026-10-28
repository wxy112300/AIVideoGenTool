import { describe, expect, it } from "vitest";
import { modelDownloadOrigin, modelDownloadSource, rewriteHuggingFaceDownloadUrl } from "../src/core/download-url";

describe("model download URL mirror", () => {
  it("preserves legacy preferences and lets the explicit official source override an old enabled flag", () => {
    expect(modelDownloadSource({ hfMirrorEnabled: true })).toBe("hf-mirror");
    expect(modelDownloadSource({ hfMirrorEnabled: false })).toBe("huggingface");
    const official = { hfMirrorEnabled: true, modelDownloadSource: "huggingface" as const };
    const url = "https://huggingface.co/org/model/resolve/abc/file.gguf?download=true#file";
    expect(rewriteHuggingFaceDownloadUrl(url, official)).toBe(url);
    for (const [modelDownloadSource, host] of [["hf-mirror-net", "hf-mirror.net"], ["gitee", "hf-api.gitee.com"]] as const) {
      const settings = { modelDownloadSource, hfMirrorEnabled: false };
      expect(rewriteHuggingFaceDownloadUrl(url, settings)).toBe(url.replace("huggingface.co", host));
      expect(rewriteHuggingFaceDownloadUrl("https://huggingface.co/org/model/tree/abc", settings)).toBe("https://huggingface.co/org/model/tree/abc");
    }
  });
  it("accepts custom HTTPS origins without leaking credentials or losing the pinned file path", () => {
    expect(modelDownloadOrigin("https://mirror.example:8443/")).toBe("https://mirror.example:8443");
    for (const value of ["http://mirror.example", "https://user:secret@mirror.example", "https://mirror.example/path", "https://mirror.example?token=x", "invalid"]) expect(modelDownloadOrigin(value)).toBeNull();
    const url = "https://huggingface.co/org/model/resolve/abc/file.gguf?download=true";
    expect(rewriteHuggingFaceDownloadUrl(url, { modelDownloadSource: "custom", modelDownloadCustomUrl: "https://mirror.example:8443", hfMirrorEnabled: true })).toBe(url.replace("huggingface.co", "mirror.example:8443"));
    expect(rewriteHuggingFaceDownloadUrl(url, { modelDownloadSource: "custom", modelDownloadCustomUrl: "invalid", hfMirrorEnabled: true })).toBe(url);
  });
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
