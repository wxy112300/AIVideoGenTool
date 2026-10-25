// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { enhanceSelect, type SelectControl } from "../src/renderer/shared/ui/select";
import { mountSharedUi } from "../src/renderer/shared/ui/runtime";

const cleanups: Array<() => void> = [];
afterEach(() => { cleanups.splice(0).reverse().forEach((cleanup) => cleanup()); document.body.replaceChildren(); vi.useRealTimers(); });

function setup(markup = '<option value="a">Alpha</option><option disabled value="b">Beta</option><optgroup label="Models"><option value="c">Charlie</option><option value="d">Delta</option></optgroup>') {
  document.body.innerHTML = `<label>Model<select id="model" name="model">${markup}</select></label>`;
  const native = document.querySelector<HTMLSelectElement>("select")!;
  const control = enhanceSelect(native);
  cleanups.push(control.dispose);
  const key = (name: string) => control.trigger.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
  return { native, control, key };
}

describe("native-backed custom select", () => {
  it("keeps field help on the info icon and option help inside the menu, without a trigger tooltip", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<label><span>Sampler<span class="field-info" tabindex="0" data-tooltip-toggle><span class="field-info-tip" role="tooltip">Field guidance</span>ⓘ</span></span><select id="sampler" title="Field guidance"><option value="a" data-description="Option guidance">Alpha</option></select></label>';
    cleanups.push(mountSharedUi(document.body));
    const native = document.querySelector<HTMLSelectElement>("select")!;
    const trigger = document.querySelector<HTMLButtonElement>("#sampler-trigger")!;
    expect(trigger.getAttribute("aria-label")).toBe("Sampler");
    trigger.dispatchEvent(new Event("pointerover", { bubbles: true }));
    vi.advanceTimersByTime(500);
    expect(document.querySelector(".ui-tooltip")).toBeNull();
    trigger.click();
    expect(document.querySelector('[role="option"] small')?.textContent).toBe("Option guidance");
    document.querySelector(".field-info")!.dispatchEvent(new Event("pointerover", { bubbles: true }));
    vi.advanceTimersByTime(500);
    expect(document.querySelector(".ui-tooltip")?.textContent).toBe("Field guidance");
    native.title = "Updated guidance"; await Promise.resolve();
    expect(trigger.hasAttribute("title")).toBe(false);
    expect(trigger.hasAttribute("data-ui-tooltip")).toBe(false);
  });
  it("preserves the open menu and selected label through unchanged refreshes, updating changed options", () => {
    const { native, control } = setup();
    control.trigger.click();
    const option = document.querySelector('[role="option"]');
    const scroll = vi.fn(); (option as HTMLElement).scrollIntoView = scroll;
    const text = control.trigger.querySelector(".ui-select-value")!.firstChild;
    control.sync(); control.sync();
    expect(document.querySelector('[role="option"]')).toBe(option);
    expect(scroll).not.toHaveBeenCalled();
    expect(control.trigger.querySelector(".ui-select-value")!.firstChild).toBe(text);
    native.options[0]!.label = "Updated"; control.sync();
    expect(document.querySelector('[role="option"]')?.textContent).toContain("Updated");
    expect(control.trigger.textContent).toContain("Updated");
  });
  it("shows existing preset descriptions beneath their labels without adding them to the selected value", () => {
    const { control, native } = setup('<option value="a" data-description="Protect identity and continuity">Reference fidelity</option><option value="b" title="Add camera and sound detail">Cinematic</option>');
    control.trigger.click();
    const items = [...document.querySelectorAll('[role="option"]')];
    expect(items[0]!.querySelector("small")?.textContent).toBe("Protect identity and continuity");
    expect(items[1]!.querySelector("small")?.textContent).toBe("Add camera and sound detail");
    expect(control.trigger.textContent).toContain("Reference fidelity");
    expect(control.trigger.textContent).not.toContain("Protect identity");
    expect(native.value).toBe("a");
  });
  it("keeps the form value and dispatches one existing change handler after keyboard confirmation", () => {
    const { native, control, key } = setup();
    const changed = vi.fn(); native.addEventListener("change", changed);
    control.trigger.focus(); key("ArrowDown"); key("ArrowDown");
    expect(native.value).toBe("a");
    expect(control.trigger.getAttribute("aria-activedescendant")).toBe("model-listbox-2");
    key("Enter");
    expect(native.value).toBe("c"); expect(changed).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(control.trigger);
    expect(control.trigger.getAttribute("aria-expanded")).toBe("false");
  });
  it("supports Home/End, type-ahead and Escape without changing an unconfirmed choice", () => {
    const { native, control, key } = setup();
    key("End"); expect(control.trigger.getAttribute("aria-activedescendant")).toBe("model-listbox-3");
    key("Home"); key("c"); key("Escape"); expect(native.value).toBe("a");
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    key("d"); expect(native.value).toBe("a"); // an unfinished prefix is not a match
  });
  it("skips disabled groups and keeps native disabled mutations visible", async () => {
    const { native, control, key } = setup('<option>A</option><optgroup disabled label="Missing"><option>B</option></optgroup><option>C</option>');
    key("Home"); key("ArrowDown"); key("Enter"); expect(native.value).toBe("C");
    native.disabled = true; await Promise.resolve();
    expect(control.trigger.disabled).toBe(true); expect(control.trigger.getAttribute("aria-expanded")).toBe("false");
  });
  it("reflects changed options and programmatic change events without executing HTML", async () => {
    const { native, control } = setup();
    const option = new Option('<img src=x onerror="bad()">', "safe"); native.append(option); native.value = "safe";
    native.dispatchEvent(new Event("change", { bubbles: true })); await Promise.resolve();
    expect(control.trigger.textContent).toContain("<img"); expect(control.trigger.querySelector("img")).toBeNull();
    control.trigger.click(); expect(document.querySelector('[role="listbox"] img')).toBeNull();
    expect(control.trigger.getAttribute("aria-label")).toBe("Model");
  });
  it("restores the native control and removes portals/document listeners on disposal", () => {
    const { native, control, key } = setup(); key("End");
    control.dispose(); cleanups.pop();
    expect(native.hidden).toBe(false); expect(native.parentElement?.tagName).toBe("LABEL");
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(document.querySelector(".ui-select")).toBeNull();
  });
  it("does not replace a native control twice and cleans up a detached open select", async () => {
    document.body.innerHTML = '<select id="pick"><option>A</option></select>';
    cleanups.push(mountSharedUi(document.body));
    const trigger = document.querySelector<HTMLButtonElement>(".ui-select-trigger")!;
    trigger.click(); document.querySelector(".ui-select")!.remove();
    await Promise.resolve(); await Promise.resolve();
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(document.querySelectorAll(".ui-select-trigger")).toHaveLength(0);
  });
});
