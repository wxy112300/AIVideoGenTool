import { describe, expect, it } from "vitest";
import { createRendererApp } from "../src/renderer/app";
import type { AppApi } from "../src/types";

function createOptions(events: string[]) {
  return {
    root: {} as HTMLElement,
    studio: {} as AppApi,
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
    const app = createRendererApp(createOptions(events));
    app.addPageCleanup(() => events.push("cleanup"));

    app.render();

    expect(events).toEqual(["cleanup", "render"]);
  });

  it("exposes a translator-ready context without changing the current fallback catalog", () => {
    const app = createRendererApp(createOptions([]));

    expect(app.context.t("task.status.waiting")).toBe("等待");
    expect(app.context.getRoute().page).toBe("create");
    expect(app.context.application).toBe(app.context.studio);
    expect(app.context.events).toBe(app.context.studio);
    expect(app.context.assets).toBe(app.context.studio);
    expect(app.context.hostCapabilities).toBe(app.context.studio);
  });
});
