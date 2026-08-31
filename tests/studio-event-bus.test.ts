import { describe, expect, it, vi } from "vitest";
import {
  createStudioEventBus
} from "../electron/services/studio-event-bus.js";
import {
  createStudioEventBridge,
  type StudioEventTarget
} from "../electron/services/studio-event-bridge.js";
import { createDefaultState } from "../src/core/defaults.js";
import type { AppState } from "../src/types.js";

function stateFixture(): AppState {
  return createDefaultState();
}

describe("StudioEventBus", () => {
  it("isolates subscriber failures and supports unsubscribe", () => {
    const errors: unknown[] = [];
    const bus = createStudioEventBus({
      onSubscriberError: (_name, error) => errors.push(error)
    });
    const first = vi.fn(() => {
      throw new Error("first subscriber failed");
    });
    const second = vi.fn();
    const removeFirst = bus.subscribe("state:changed", first);
    bus.subscribe("state:changed", second);

    bus.publish("state:changed", stateFixture());
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(errors).toHaveLength(1);

    removeFirst();
    bus.publish("state:changed", stateFixture());
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it("bridges typed events to the current target and removes all listeners", () => {
    const bus = createStudioEventBus();
    const send = vi.fn();
    const target: StudioEventTarget = { send };
    let currentTarget: StudioEventTarget | null = target;
    const cleanup = createStudioEventBridge(bus, () => currentTarget);

    bus.publish("state:changed", stateFixture());
    expect(send).toHaveBeenCalledWith("state:changed", expect.any(Object));

    currentTarget = null;
    bus.publish("prompt:progress", {} as never);
    expect(send).toHaveBeenCalledTimes(1);

    cleanup();
    currentTarget = target;
    bus.publish("state:changed", stateFixture());
    expect(send).toHaveBeenCalledTimes(1);
  });
});
