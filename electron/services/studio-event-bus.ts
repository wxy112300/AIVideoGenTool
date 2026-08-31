import type {
  AppState,
  ComfyRuntimeState,
  HistoryMigrationProgress,
  ImageAssetLibraryProgress,
  PromptProgress,
  TaskPreview
} from "../../src/types.js";
import type { PromptRuntimeState } from "../../src/core/prompt-runtime-state.js";

export interface StudioEventMap {
  "state:changed": AppState;
  "comfy-runtime:changed": ComfyRuntimeState;
  "prompt-runtime:changed": PromptRuntimeState;
  "task:preview": TaskPreview;
  "prompt:progress": PromptProgress;
  "history-migration:progress": HistoryMigrationProgress;
  "image-assets:progress": ImageAssetLibraryProgress;
}

export type StudioEventName = keyof StudioEventMap;
export type StudioEventListener<Name extends StudioEventName> = (
  payload: StudioEventMap[Name]
) => void;

export interface StudioEventBus {
  publish<Name extends StudioEventName>(
    name: Name,
    payload: StudioEventMap[Name]
  ): void;
  subscribe<Name extends StudioEventName>(
    name: Name,
    listener: StudioEventListener<Name>
  ): () => void;
}

export interface StudioEventBusOptions {
  onSubscriberError?: (name: StudioEventName, error: unknown) => void;
}

export function createStudioEventBus(options: StudioEventBusOptions = {}): StudioEventBus {
  const listeners = new Map<StudioEventName, Set<StudioEventListener<StudioEventName>>>();

  return {
    publish<Name extends StudioEventName>(name: Name, payload: StudioEventMap[Name]): void {
      const currentListeners = listeners.get(name);
      if (!currentListeners?.size) return;

      for (const listener of [...currentListeners]) {
        try {
          listener(payload);
        } catch (error) {
          try {
            options.onSubscriberError?.(name, error);
          } catch {
            // A diagnostics callback must not make one subscriber affect the bus.
          }
        }
      }
    },

    subscribe<Name extends StudioEventName>(
      name: Name,
      listener: StudioEventListener<Name>
    ): () => void {
      const currentListeners = listeners.get(name) ?? new Set();
      currentListeners.add(listener as StudioEventListener<StudioEventName>);
      listeners.set(name, currentListeners);
      return () => {
        currentListeners.delete(listener as StudioEventListener<StudioEventName>);
        if (!currentListeners.size) listeners.delete(name);
      };
    }
  };
}
