// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { mountPromptHeight } from "../src/renderer/pages/create/prompt-height";

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("uses spare tall-window space, stays stable after growing, and restores compact limits on resize", () => {
  document.body.innerHTML = '<div class="create-workspace"><section class="composer"><div class="create-rich-prompt"></div></section></div>';
  const workspace = document.querySelector<HTMLElement>(".create-workspace")!;
  const composer = document.querySelector<HTMLElement>(".composer")!;
  const editor = document.querySelector<HTMLElement>(".create-rich-prompt")!;
  workspace.style.gridTemplateColumns = "500px 700px";
  let editorHeight = 320, otherHeight = 700;
  vi.spyOn(editor, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
  vi.spyOn(editor, "getBoundingClientRect").mockImplementation(() => ({ height: editorHeight } as DOMRect));
  vi.spyOn(composer, "getBoundingClientRect").mockImplementation(() => ({ top: 150 - window.scrollY, height: otherHeight + editorHeight } as DOMRect));
  let update: FrameRequestCallback | undefined;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => { update = callback; return 1; });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  vi.stubGlobal("innerHeight", 2000);
  const dispose = mountPromptHeight(editor);
  expect(editor.style.getPropertyValue("--prompt-max-height")).toBe("900px");
  editorHeight = 900;
  window.dispatchEvent(new Event("resize")); update!(0);
  expect(editor.style.getPropertyValue("--prompt-max-height")).toBe("900px");
  otherHeight = 1300;
  window.dispatchEvent(new Event("resize")); update!(0);
  expect(editor.style.getPropertyValue("--prompt-max-height")).toBe("502px");
  vi.stubGlobal("innerHeight", 800);
  window.dispatchEvent(new Event("resize")); update!(0);
  expect(editor.style.getPropertyValue("--prompt-max-height")).toBe("320px");
  vi.stubGlobal("innerHeight", 2000); workspace.style.gridTemplateColumns = "700px";
  window.dispatchEvent(new Event("resize")); update!(0);
  expect(editor.style.getPropertyValue("--prompt-max-height")).toBe("320px");
  dispose();
});
