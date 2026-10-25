// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createRendererApp } from "../src/renderer/app";
import { setRendererState } from "../src/renderer/renderer-state";
import { createDefaultState } from "../src/core/defaults";
import { createRendererDependencies, type RendererClient } from "../src/renderer/studio-client";

function createOptions(events: string[]) {
  const dependencies = createRendererDependencies({} as RendererClient);
  return {
    root: document.createElement("div"),
    dependencies,
    enhancePrompt: async () => "",
    getState: () => undefined,
    getRoute: () => ({
      page: "create" as const,
      creationMode: "image-to-video" as const,
      historyKind: "video" as const
    }),
    requestRender: () => undefined,
    navigate: () => undefined,
    notify: () => undefined,
    reportUserAction: () => undefined,
    renderLegacy: (beforeCommit: () => void) => { beforeCommit(); events.push("render"); }
  };
}

it("updates the document language when restored settings change locale", () => {
  const state = createDefaultState();
  state.settings.uiLocale = "en-US"; setRendererState(state);
  expect(document.documentElement.lang).toBe("en-US");
  state.settings.uiLocale = "zh-TW"; setRendererState(state);
  expect(document.documentElement.lang).toBe("zh-TW");
  document.documentElement.lang = "zh-CN";
});

describe("renderer app foundation", () => {
  it("defers cleanup as well as rendering while the rich editor is composing", () => {
    const events: string[] = [], options = createOptions(events);
    options.root.innerHTML = '<div data-rich-composing contenteditable="true">你好</div>';
    const editor = options.root.firstElementChild!;
    const app = createRendererApp(options);
    app.addPageCleanup(() => { events.push("cleanup"); editor.remove(); });
    app.render(); app.render();
    expect(events).toEqual([]); expect(editor.isConnected).toBe(false);
    expect(options.root.firstElementChild).toBe(editor);
    editor.removeAttribute("data-rich-composing");
    editor.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    expect(events).toEqual(["cleanup", "render"]);
  });
  it("runs page cleanup when the coordinator commits the next page", () => {
    const events: string[] = [];
    const options = createOptions(events);
    const app = createRendererApp(options);
    app.addPageCleanup(() => events.push("cleanup"));

    app.render();

    expect(events).toEqual(["cleanup", "render"]);
  });

  it("keeps the old page interactive until an async departure is ready to commit", () => {
    const events: string[] = [], options = createOptions(events);
    let commit!: () => void;
    options.renderLegacy = beforeCommit => { commit = beforeCommit; events.push("departing"); };
    const app = createRendererApp(options);
    app.addPageCleanup(() => events.push("cleanup"));
    app.render();
    expect(events).toEqual(["departing"]);
    commit();
    expect(events).toEqual(["departing", "cleanup"]);
  });

  it("exposes a translator-ready context without changing the current fallback catalog", () => {
    const options = createOptions([]);
    const app = createRendererApp(options);

    expect(app.context.t("task.status.waiting")).toBe("等待");
    expect(app.context.getRoute().page).toBe("create");
    expect(app.context.application).toBe(options.dependencies.application);
    expect(app.context.events).toBe(options.dependencies.events);
    expect(app.context.assets).toBe(options.dependencies.assets);
    expect(app.context.hostCapabilities).toBe(options.dependencies.hostCapabilities);
  });
});
