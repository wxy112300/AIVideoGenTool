import {
  type StudioEventBus,
  type StudioEventMap,
  type StudioEventName
} from "./studio-event-bus.js";

export interface StudioEventTarget {
  send(channel: string, payload: unknown): void;
}

const bridgedEventNames = [
  "state:changed",
  "comfy-runtime:changed",
  "prompt-runtime:changed",
  "task:preview",
  "prompt:progress",
  "history-migration:progress",
  "image-assets:progress"
] as const satisfies readonly StudioEventName[];

export function createStudioEventBridge(
  bus: StudioEventBus,
  resolveTarget: () => StudioEventTarget | null
): () => void {
  const cleanups = bridgedEventNames.map((name) =>
    bus.subscribe(name, (payload: StudioEventMap[typeof name]) => {
      resolveTarget()?.send(name, payload);
    })
  );
  return () => cleanups.forEach((cleanup) => cleanup());
}
