import type { BrowserWindow } from "electron";
import { createStudioEventBridge } from "./services/studio-event-bridge.js";
import type { StudioEventBus } from "./services/studio-event-bus.js";

/** Bridges application events to the current BrowserWindow. */
export function createWindowStudioEventBridge(
  bus: StudioEventBus,
  resolveWindow: () => BrowserWindow | null
): () => void {
  return createStudioEventBridge(bus, () => {
    const window = resolveWindow();
    if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return null;
    return {
      send: (channel: string, payload: unknown) => window.webContents.send(channel, payload)
    };
  });
}
