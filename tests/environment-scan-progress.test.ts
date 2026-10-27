import { expect, it, vi } from "vitest";
import { EnvironmentScanProgressHub } from "../electron/services/environment-scan-progress";

it("shares checkpoints only with matching scans and releases the last checkpoint on cleanup", () => {
  const hub = new EnvironmentScanProgressHub(), a = vi.fn(), joined = vi.fn(), b = vi.fn();
  const stopA = hub.subscribe("a", a), stopB = hub.subscribe("b", b);
  const progress = { stage: "files", completed: 1, total: 4 } as const;
  hub.publish("a", progress);
  const stopJoined = hub.subscribe("a", joined);
  expect(joined).toHaveBeenCalledWith(progress);
  expect(b).not.toHaveBeenCalled();
  stopA(); hub.publish("a", { stage: "system", completed: 3, total: 4 });
  expect(a).toHaveBeenCalledTimes(1); expect(joined).toHaveBeenCalledTimes(2);
  stopJoined(); const next = vi.fn(); const stopNext = hub.subscribe("a", next);
  expect(next).not.toHaveBeenCalled(); stopNext(); stopB();
});

it("keeps a closed progress consumer from failing the underlying scan", () => {
  const hub = new EnvironmentScanProgressHub(), other = vi.fn();
  hub.subscribe("a", () => { throw new Error("window closed"); }); hub.subscribe("a", other);
  expect(() => hub.publish("a", { stage: "attention", completed: 2, total: 4 })).not.toThrow();
  expect(other).toHaveBeenCalledTimes(1);
});
