import { createRendererContext } from "./context";
import { createRenderLifecycle } from "./lifecycle";
export function createRendererApp(options) {
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
