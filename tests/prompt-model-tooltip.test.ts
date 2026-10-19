// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { createJourney } from "./harness/create-journey";
import { modelName, promptModelActionTitle } from "../src/renderer/shared/labels";
import { projectPromptRuntimeView } from "../src/core/prompt-runtime-view";
import { createPromptRuntimeState, reducePromptRuntime } from "../src/core/prompt-runtime-state";
import type { CreationMode } from "../src/renderer/contracts";

let journey: Awaited<ReturnType<typeof createJourney>> | undefined;
afterEach(async () => { journey?.dispose(); journey = undefined; await new Promise(r => setTimeout(r, 370)); });
const selected = "strata/qwen3.8-flash-next-iq3_xxs";
const idle = () => createPromptRuntimeState({ phase: "stopped", backend: "strata", ownership: "none",
  endpoint: "http://127.0.0.1:43127", message: "", updatedAt: "", operationId: 0 });
function tipText(h: Awaited<ReturnType<typeof createJourney>>, selector: string): string {
  const button = h.element(selector);
  expect(button.hasAttribute("title")).toBe(false);
  const tip = h.root.querySelector(`#${button.getAttribute("aria-describedby")}`);
  expect(tip?.getAttribute("role")).toBe("tooltip");
  expect(tip?.classList.contains("prompt-progress-tooltip")).toBe(true);
  expect(tip?.parentElement).toBe(button.parentElement);
  return tip?.textContent ?? "";
}

describe("prompt button model tooltips", () => {
  it.each(["image-edit", "image-to-video", "video-extension"] as CreationMode[])("identifies the next model on both idle %s controls without starting inference", async mode => {
    const h = journey = await createJourney();
    h.state().settings.promptModelId = selected;
    h.dependencies.promptRuntimeView = origin => projectPromptRuntimeView(idle(), origin, "strata");
    h.setMode(mode);
    const name = modelName(selected);
    expect(name).toContain("IQ3_XXS");
    expect(tipText(h, "#release-prompt-model-create")).toContain(name);
    expect(tipText(h, "#enhance-prompt")).toContain(name);
    expect(h.enhancePrompt).not.toHaveBeenCalled();
    h.state().settings.promptModelId = "qwen/qwen3.6-27b-uncensored-q4";
    h.render();
    for (const id of ["#release-prompt-model-create", "#enhance-prompt"]) {
      expect(tipText(h, id)).toContain(modelName(h.state().settings.promptModelId));
      expect(tipText(h, id)).not.toContain(name);
    }
  });

  it("keeps missing-input reasons alongside the selected model on the image enhancement button", async () => {
    const h = journey = await createJourney();
    h.state().settings.promptModelId = selected;
    h.setMode("image-edit");
    expect(h.element("#enhance-prompt").disabled).toBe(true);
    expect(tipText(h, "#enhance-prompt")).toContain("请先输入图片编辑 Prompt");
    expect(tipText(h, "#enhance-prompt")).toContain(modelName(selected));
    const host = h.element("#enhance-prompt").parentElement!;
    expect(host.tabIndex).toBe(0);
    host.focus();
    expect(document.activeElement).toBe(host);
  });

  it("does not label a resident stop button with a different newly selected model", async () => {
    const h = journey = await createJourney();
    h.state().settings.promptModelId = selected;
    const resident = reducePromptRuntime({ ...idle(), service: { ...idle().service, phase: "ready" } },
      { type: "model-updated", modelPhase: "resident", modelId: "qwen/qwen3.6-27b-uncensored-q4" });
    h.dependencies.promptRuntimeView = origin => projectPromptRuntimeView(resident, origin, "strata");
    h.setMode("image-edit");
    expect(tipText(h, "#release-prompt-model-create")).not.toContain(modelName(selected));
    expect(tipText(h, "#enhance-prompt")).toContain(modelName(selected));
  });

  it("retains cancel/transition labels and safely falls back to unknown IDs", () => {
    expect(promptModelActionTitle("正在取消", selected, "zh-CN", false)).toBe("正在取消");
    expect(promptModelActionTitle("Start", "future/model", "en-US")).toBe("Start\nfuture/model");
    expect(promptModelActionTitle("Start", "", "en-US")).toBe("Start");
  });
});
