import { createRendererContext, type RendererContextOptions } from "./context";
import { createRenderLifecycle, type RenderLifecycle } from "./lifecycle";
import type { RendererCleanup, RendererContext } from "./contracts";

export interface RendererAppOptions extends RendererContextOptions {
  renderLegacy(beforeCommit: () => void): void;
}

export interface RendererApp {
  readonly context: RendererContext;
  readonly lifecycle: RenderLifecycle;
  render(): void;
  addPageCleanup(cleanup: RendererCleanup): void;
}

export function createRendererApp(options: RendererAppOptions): RendererApp {
  const lifecycle = createRenderLifecycle();
  const context = createRendererContext(options);
  let awaitingComposition = false;

  return {
    context,
    lifecycle,
    render() {
      if (context.getRoute().page === "create" && context.root.querySelector("[data-rich-composing]")) {
        if (!awaitingComposition) {
          awaitingComposition = true;
          context.root.addEventListener("compositionend", () => { awaitingComposition = false; this.render(); }, { once: true });
        }
        return;
      }
      if (context.getRoute().page === "create") context.root.dataset.createScrollTop ??= String(window.scrollY);
      // The old page remains interactive during departure and async loading.
      // Its listeners are disposed only when the coordinator replaces its DOM.
      options.renderLegacy(() => lifecycle.beginRender());
    },
    addPageCleanup(cleanup) {
      lifecycle.addCleanup(cleanup);
    }
  };
}
