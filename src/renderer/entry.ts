import type { AppApi } from "../types";
import {
  createElectronRendererClient,
  createRendererDependencies,
  type RendererClient,
  type RendererDependencies
} from "./studio-client";

export interface RendererEntry {
  readonly client: RendererClient;
  readonly dependencies: RendererDependencies;
}

/**
 * Build the renderer transport and its explicit capability views from a
 * preload API. The adapter remains argument/return-value transparent; this
 * function only owns composition.
 */
export function createRendererEntry(preloadApi: AppApi): RendererEntry {
  const client = createElectronRendererClient(preloadApi);
  return {
    client,
    dependencies: createRendererDependencies(client)
  };
}

/**
 * The only renderer-side read of the Electron preload global.
 */
export function createWindowRendererEntry(): RendererEntry {
  return createRendererEntry(window.studio);
}
