// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { mountSettingsFieldsController } from "../src/renderer/pages/settings/fields-controller";
import { readSettingsFromForm } from "../src/renderer/pages/settings/form";
import { createDefaultSettings } from "../src/core/defaults";
import type { Settings } from "../src/types";
import type { RendererContext } from "../src/renderer/contracts";

afterEach(() => document.body.replaceChildren());
it("keeps continuous creativity values, fill and editing nodes synchronized without a page render", () => {
  document.body.innerHTML = '<main><div class="settings-content"><input id="prompt-creativity" type="range" min="0" max="1.5" step="0.1" value="0.7"><input id="prompt-creativity-number" type="number" min="0" max="1.5" step="0.1" value="0.7"></div></main>';
  const root = document.querySelector("main")!, range = root.querySelector<HTMLInputElement>("#prompt-creativity")!, number = root.querySelector<HTMLInputElement>("#prompt-creativity-number")!;
  const base = createDefaultSettings(); let draft: Settings | null = null;
  const requestRender = vi.fn();
  const dispose = mountSettingsFieldsController({ root, requestRender } as unknown as RendererContext, {
    formSettings: () => readSettingsFromForm(base, "official-storyboard", "faithful"),
    setSettingsDraft: next => { draft = next; }, syncSettingsDirtyUi: vi.fn(), setH3PromptPreset: vi.fn(), setImagePromptPreset: vi.fn(), setSettingsTab: vi.fn(), hasUnsavedChanges: () => true
  });
  try {
    range.value = "0.8"; range.dispatchEvent(new Event("input"));
    expect(number.value).toBe("0.8"); expect(draft!.promptCreativity).toBe(0.8);
    number.focus(); number.value = "1.1"; number.dispatchEvent(new Event("input"));
    expect(range.value).toBe("1.1"); expect(draft!.promptCreativity).toBe(1.1);
    expect(parseFloat(range.style.getPropertyValue("--ui-range-fill"))).toBeCloseTo(73.33, 1);
    number.value = ""; number.dispatchEvent(new Event("change")); expect(number.value).toBe("1.1");
    number.value = "2"; number.dispatchEvent(new Event("change")); expect(number.value).toBe("1.1");
    expect(root.querySelector("#prompt-creativity")).toBe(range); expect(document.activeElement).toBe(number); expect(requestRender).not.toHaveBeenCalled();
  } finally { dispose(); }
});

it("retains the off reasoning option and updates the persisted select from its segment", () => {
  document.body.innerHTML = '<main><div class="settings-content"><select id="strata-reasoning-effort" hidden><option value="off">Off</option><option value="medium" selected>Medium</option></select><button data-settings-reasoning="off">Off</button><button data-settings-reasoning="medium">Medium</button></div></main>';
  const root = document.querySelector("main")!, base = createDefaultSettings(); let draft: Settings | null = null;
  const dispose = mountSettingsFieldsController({ root } as RendererContext, {
    formSettings: () => readSettingsFromForm(base, "official-storyboard", "faithful"), setSettingsDraft: next => { draft = next; },
    syncSettingsDirtyUi: vi.fn(), setH3PromptPreset: vi.fn(), setImagePromptPreset: vi.fn(), setSettingsTab: vi.fn(), hasUnsavedChanges: () => true
  });
  try {
    root.querySelector<HTMLButtonElement>('[data-settings-reasoning="off"]')!.click();
    expect(draft!.strataReasoningEffort).toBe("off"); expect(root.querySelector('[aria-pressed="true"]')?.textContent).toBe("Off");
  } finally { dispose(); }
});
