// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { mountSharedUi, replaceSharedUiMarkup } from "../src/renderer/shared/ui/runtime";
import { createStableLabels, mountPointerLight } from "../src/renderer/shared/ui/feedback";
import { icon, renderIcons } from "../src/renderer/shared/icons";

let dispose: (() => void) | undefined;
afterEach(() => { dispose?.(); dispose = undefined; vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren(); });

it("connects a fully primed tree even when custom elements synchronously read layout", () => {
  const observed: boolean[] = [];
  customElements.define("ui-layout-reader", class extends HTMLElement {
    connectedCallback() {
      const root = this.parentElement!;
      observed.push(root.querySelector("button")!.classList.contains("ui-button"));
      observed.push(root.querySelector("textarea")!.classList.contains("ui-field"));
      observed.push(!root.querySelector(".history-player button")!.classList.contains("ui-button"));
      observed.push(Boolean(root.querySelector("button > svg")));
      root.querySelectorAll("button").forEach((button) => getComputedStyle(button));
    }
  });
  const root = document.createElement("div"); document.body.append(root);
  replaceSharedUiMarkup(root, `<button class="secondary">${icon("copy")}Action</button><textarea></textarea><div class="history-player"><button class="secondary">Player</button></div><ui-layout-reader></ui-layout-reader>`);
  expect(observed).toEqual([true, true, true, true]);
});

it("renders newly added icons without replacing existing SVG nodes", () => {
  const root = document.createElement("div");
  root.innerHTML = icon("copy"); renderIcons(root);
  const original = root.querySelector("svg");
  root.insertAdjacentHTML("beforeend", icon("folder-open")); renderIcons(root); renderIcons(root);
  expect(root.querySelector("svg")).toBe(original);
  expect(root.querySelectorAll("svg")).toHaveLength(2);
  expect(root.querySelector("i[data-lucide]")).toBeNull();
});

it("does not rescan the page for decoded media, but still enhances dynamically inserted controls", async () => {
  const root = document.createElement("div"); root.innerHTML = '<div class="media"></div><section class="controls"></section>'; document.body.append(root);
  dispose = mountSharedUi(root);
  const scan = vi.spyOn(root, "querySelectorAll");
  root.querySelector(".media")!.append(document.createElement("img"), document.createElement("video"));
  await Promise.resolve(); await Promise.resolve();
  expect(scan).not.toHaveBeenCalled();
  const controls = root.querySelector(".controls")!;
  controls.innerHTML = '<button class="secondary">Action</button><select id="dynamic"><option>One</option><option>Two</option></select>';
  await Promise.resolve(); await Promise.resolve();
  expect(controls.querySelector("button")!.classList.contains("ui-button")).toBe(true);
  expect(controls.querySelector("#dynamic-trigger")).not.toBeNull();
  expect(scan).not.toHaveBeenCalled();
});

it("decorates every button before measuring any, and does not remeasure unchanged labels", () => {
  document.body.innerHTML = '<button id="a" class="secondary">One</button><button id="b" class="primary">Two</button>';
  const measure = vi.fn(() => {
    expect([...document.querySelectorAll("button")].every((button) => button.classList.contains("ui-button"))).toBe(true);
    return { width: 40 };
  });
  vi.spyOn(document, "createRange").mockReturnValue({ selectNodeContents: vi.fn(), getBoundingClientRect: measure } as unknown as Range);
  dispose = mountSharedUi(document.body);
  expect(measure).toHaveBeenCalledTimes(2);
  const stable = createStableLabels(), button = document.querySelector<HTMLButtonElement>("#a")!;
  stable(button); stable(button);
  expect(measure).toHaveBeenCalledTimes(3);
  button.textContent = "Changed"; stable(button);
  expect(measure).toHaveBeenCalledTimes(4);
});

it("keeps light on one hovered control, clearing old controls and on exit", () => {
  document.body.innerHTML = '<button class="ui-button">One</button><button class="ui-button">Two</button>';
  let frame: FrameRequestCallback | undefined;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frame = callback; return 1; });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  dispose = mountPointerLight(document.body);
  const [a,b] = [...document.querySelectorAll("button")];
  a!.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 5, clientY: 5 })); frame!(0);
  expect(a!.classList.contains("ui-lit")).toBe(true);
  b!.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 5, clientY: 5 })); frame!(1);
  expect(a!.classList.contains("ui-lit")).toBe(false);
  expect(b!.classList.contains("ui-lit")).toBe(true);
  document.body.dispatchEvent(new Event("pointerleave"));
  expect(document.querySelectorAll(".ui-lit")).toHaveLength(0);
});
