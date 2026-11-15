// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { mountModalIsolation } from "../src/renderer/shared/ui/modal-isolation";

let dispose: (() => void) | undefined;
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
afterEach(() => { dispose?.(); dispose = undefined; document.body.replaceChildren(); });

it("isolates a custom modal, new background content and restores only inert state it owns", async () => {
  document.body.innerHTML = '<main><button>Background</button></main><aside inert>Already blocked</aside><div id="overlays"></div>';
  dispose = mountModalIsolation(document.body);
  const overlays = document.querySelector("#overlays")!;
  overlays.innerHTML = '<section role="dialog" aria-modal="true"><button>Cancel</button></section>';
  await settle();
  expect(document.querySelector("main")!.hasAttribute("inert")).toBe(true);
  expect(overlays.closest("[inert]")).toBeNull();
  const background = document.createElement("button"); document.body.append(background);
  await settle(); expect(background.hasAttribute("inert")).toBe(true);
  overlays.replaceChildren(); await settle();
  expect(document.querySelector("main")!.hasAttribute("inert")).toBe(false);
  expect(background.hasAttribute("inert")).toBe(false);
  expect(document.querySelector("aside")!.hasAttribute("inert")).toBe(true);
});

it("keeps modal select and tooltip portals usable while blocking unrelated portals", async () => {
  document.body.innerHTML = '<main>Background</main><section aria-modal="true"><button aria-controls="picker" aria-describedby="help">Choice</button></section><div id="picker" class="ui-select-list"></div><div id="help" class="ui-tooltip"></div><div class="ui-select-list" id="other"></div>';
  dispose = mountModalIsolation(document.body);
  expect(document.querySelector("#picker")!.closest("[inert]")).toBeNull();
  expect(document.querySelector("#help")!.closest("[inert]")).toBeNull();
  expect(document.querySelector("#other")!.hasAttribute("inert")).toBe(true);
  const button = document.querySelector("button")!;
  button.removeAttribute("aria-controls"); button.removeAttribute("aria-describedby"); await settle();
  expect(document.querySelector("#picker")!.hasAttribute("inert")).toBe(true);
  expect(document.querySelector("#help")!.hasAttribute("inert")).toBe(true);
});

it("isolates a nested crop dialog and restores its parent when hidden without replacing controls", async () => {
  document.body.innerHTML = '<main>Background</main><section aria-modal="true"><button id="editor">Editor</button><div hidden id="crop" aria-modal="true"><button>Apply</button></div></section>';
  dispose = mountModalIsolation(document.body);
  const editor = document.querySelector<HTMLButtonElement>("#editor")!;
  const crop = document.querySelector<HTMLElement>("#crop")!;
  crop.hidden = false; await settle();
  expect(editor.hasAttribute("inert")).toBe(true);
  expect(crop.closest("[inert]")).toBeNull();
  crop.hidden = true; await settle();
  expect(editor.hasAttribute("inert")).toBe(false);
  expect(document.querySelector("#editor")).toBe(editor);
  expect(document.querySelector("main")!.hasAttribute("inert")).toBe(true);
  document.querySelector("section")!.setAttribute("aria-modal", "false"); await settle();
  expect(document.querySelector("main")!.hasAttribute("inert")).toBe(false);
});

it("leaves native dialog isolation to the browser and releases custom isolation on dispose", async () => {
  document.body.innerHTML = '<main>Background</main><dialog open aria-modal="true">Native dialog</dialog><section hidden aria-modal="true">Custom dialog</section>';
  dispose = mountModalIsolation(document.body);
  expect(document.querySelector("main")!.hasAttribute("inert")).toBe(false);
  document.querySelector<HTMLElement>("section")!.hidden = false; await settle();
  expect(document.querySelector("main")!.hasAttribute("inert")).toBe(true);
  dispose(); dispose = undefined;
  expect(document.querySelector("main")!.hasAttribute("inert")).toBe(false);
});
