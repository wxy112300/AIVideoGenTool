import { describe, expect, it } from "vitest";
import {
  evaluateVramPressure,
  type VramWatchdogState
} from "../src/core/vram-watchdog";

function sample(usedMiB: number, sampledAtMs: number, totalMiB = 24_564) {
  return { usedMiB, totalMiB, sampledAtMs };
}

describe("adaptive VRAM watchdog", () => {
  it("uses only the hard reserve while memory is stable", () => {
    const first = evaluateVramPressure({}, sample(23_664, 0));
    const stable = evaluateVramPressure(first.state, sample(23_664, 1_000));

    expect(stable.requiredReserveMiB).toBe(768);
    expect(stable.remainingMiB).toBe(900);
    expect(stable.shouldAbort).toBe(false);
  });

  it("aborts below the hard reserve even without growth", () => {
    const pressure = evaluateVramPressure({}, sample(23_864, 0));

    expect(pressure.remainingMiB).toBe(700);
    expect(pressure.shouldAbort).toBe(true);
    expect(pressure.reason).toContain("硬安全线");
  });

  it("raises the reserve while allocations are still growing", () => {
    let state: VramWatchdogState = {};
    state = evaluateVramPressure(state, sample(20_000, 0, 23_500)).state;
    const growing = evaluateVramPressure(
      state,
      sample(21_000, 1_000, 23_500)
    );

    expect(growing.growthMiBPerSecond).toBe(1_000);
    expect(growing.requiredReserveMiB).toBe(2_768);
    expect(growing.shouldAbort).toBe(true);
    expect(growing.reason).toContain("动态安全线");
  });

  it("caps predictive reserve and relaxes it after growth stops", () => {
    let pressure = evaluateVramPressure({}, sample(10_000, 0));
    pressure = evaluateVramPressure(pressure.state, sample(16_000, 1_000));
    expect(pressure.requiredReserveMiB).toBe(2_816);

    for (let index = 2; index <= 9; index += 1) {
      pressure = evaluateVramPressure(
        pressure.state,
        sample(16_000, index * 1_000)
      );
    }
    expect(pressure.requiredReserveMiB).toBe(768);
  });

  it("accepts the Q3 smoke peak but stops if the same growth continues", () => {
    const observedUsedMiB = [
      7_618, 9_428, 11_218, 12_919, 14_496, 15_970, 17_310, 18_458,
      19_132, 21_183, 21_180, 21_191
    ];
    let pressure = evaluateVramPressure({}, sample(observedUsedMiB[0]!, 0));
    for (let index = 1; index < observedUsedMiB.length; index += 1) {
      pressure = evaluateVramPressure(
        pressure.state,
        sample(observedUsedMiB[index]!, index * 2_000)
      );
      expect(pressure.shouldAbort).toBe(false);
    }

    const continuedGrowth = evaluateVramPressure(
      pressure.state,
      sample(22_983, observedUsedMiB.length * 2_000)
    );
    expect(continuedGrowth.remainingMiB).toBe(1_581);
    expect(continuedGrowth.shouldAbort).toBe(true);
  });
});