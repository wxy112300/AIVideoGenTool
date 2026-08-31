import { createElectronRendererClient, createRendererDependencies } from "./studio-client";
/**
 * Build the renderer transport and its explicit capability views from a
 * preload API. The adapter remains argument/return-value transparent; this
 * function only owns composition.
 */
export function createRendererEntry(preloadApi) {
    const client = createElectronRendererClient(preloadApi);
    return {
        client,
        dependencies: createRendererDependencies(client)
    };
}
/**
 * The only renderer-side read of the Electron preload global.
 */
export function createWindowRendererEntry() {
    return createRendererEntry(window.studio);
}
