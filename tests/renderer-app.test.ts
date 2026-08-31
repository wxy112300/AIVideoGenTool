import { describe, expect, it } from "vitest";
import { createRendererApp } from "../src/renderer/app";
import { createRendererDependencies, type RendererClient } from "../src/renderer/studio-client";

function createOptions(events: string[]) {
  const dependencies = createRendererDependencies({} as RendererClient);
  return {
    root: {} as HTMLElement,
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
    renderLegacy: () => events.push("render")
  };
}

describe("renderer app foundation", () => {
  it("runs page cleanup before the next legacy render", () => {
    const events: string[] = [];
    const options = createOptions(events);
    const app = createRendererApp(options);
    app.addPageCleanup(() => events.push("cleanup"));

    app.render();

    expect(events).toEqual(["cleanup", "render"]);
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
