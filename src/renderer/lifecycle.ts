import type { RendererCleanup } from "./contracts";

export interface RenderLifecycle {
  beginRender(): void;
  addCleanup(cleanup: RendererCleanup): void;
  dispose(): void;
}

function runCleanups(cleanups: RendererCleanup[]): void {
  for (const cleanup of cleanups.splice(0)) {
    try {
      cleanup();
    } catch {
      continue;
    }
  }
}

export function createRenderLifecycle(): RenderLifecycle {
  let cleanups: RendererCleanup[] = [];

  return {
    beginRender() {
      runCleanups(cleanups);
    },
    addCleanup(cleanup) {
      cleanups.push(cleanup);
    },
    dispose() {
      runCleanups(cleanups);
    }
  };
}
