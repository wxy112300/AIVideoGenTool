import { createRendererContext, type RendererContextOptions } from "./context";
import { createRenderLifecycle, type RenderLifecycle } from "./lifecycle";
import type { RendererCleanup, RendererContext } from "./contracts";

export interface RendererAppOptions extends RendererContextOptions {
  renderLegacy(): void;
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

  return {
    context,
    lifecycle,
    render() {
      lifecycle.beginRender();
      options.renderLegacy();
    },
    addPageCleanup(cleanup) {
      lifecycle.addCleanup(cleanup);
    }
  };
}
