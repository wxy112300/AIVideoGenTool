import { describe, expect, it } from "vitest";
import { patchMultimodalPromptLeanLogits, multimodalPromptSupportsLeanLogits } from "../src/infrastructure/multimodal-prompt-logits";

const source = [
  "class GGUFModelManager:",
  "    def load(self):",
  "        if use_vision:",
  "            self.model = Llama(",
  "                model_path=model_path,",
  "                chat_handler=self.chat_handler,",
  "                n_ctx=n_ctx,",
  "                n_gpu_layers=n_gpu_layers,",
  "                logits_all=True,  # legacy handlers may require all logits",
  "            )",
  "        else:",
  "            self.model = Llama(model_path=model_path, n_ctx=n_ctx)",
  ""
].join("\n");

describe("managed Qwen MTMD lean logits adapter", () => {
  it("changes only the vision loader and keeps explicit legacy/MTMD family guards", () => {
    const patched = patchMultimodalPromptLeanLogits(source);
    expect(multimodalPromptSupportsLeanLogits(patched)).toBe(true);
    expect(patched).toContain("logits_all=_lvs_vision_logits_all(self.chat_handler)");
    expect(patched).toContain("return not (\n        QWEN35_AVAILABLE");
    expect(patched).toContain("and mtmd_cls is not None");
    expect(patched).toContain("and isinstance(chat_handler, Qwen35ChatHandler)");
    expect(patched).toContain("and isinstance(chat_handler, mtmd_cls)");
    expect(patched).toContain("self.model = Llama(model_path=model_path, n_ctx=n_ctx)");
    expect(patched).not.toContain("speculative=");
  });

  it.each(["\n", "\r\n"])("is idempotent and preserves %j line endings", (newline) => {
    const baseline = source.replace(/\n/g, newline);
    const patched = patchMultimodalPromptLeanLogits(baseline);
    expect(patchMultimodalPromptLeanLogits(patched)).toBe(patched);
    expect(patched.replace(/\r\n/g, "").includes("\n")).toBe(newline === "\n");
  });

  it("does not call the old all-logits policy adapted", () => {
    expect(multimodalPromptSupportsLeanLogits(source)).toBe(false);
  });

  it("rejects unknown or ambiguous loaders before writing", () => {
    expect(() => patchMultimodalPromptLeanLogits(source.replace("chat_handler=self.chat_handler", "chat_handler=other")))
      .toThrow("源码结构");
    expect(() => patchMultimodalPromptLeanLogits(`${source}\n${source}`)).toThrow("源码结构");
    expect(() => patchMultimodalPromptLeanLogits("# unknown upstream source")).toThrow("源码结构");
  });

  it("detects partial/tampered adaptation rather than adding a second policy", () => {
    const patched = patchMultimodalPromptLeanLogits(source).replace("and mtmd_cls is not None", "and True");
    expect(multimodalPromptSupportsLeanLogits(patched)).toBe(false);
    expect(() => patchMultimodalPromptLeanLogits(patched)).toThrow("适配不完整");
  });
});
