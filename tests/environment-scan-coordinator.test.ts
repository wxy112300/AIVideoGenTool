import { describe, expect, it, vi } from "vitest";
import { EnvironmentScanCoordinator } from "../electron/services/environment-scan-coordinator";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("EnvironmentScanCoordinator", () => {
  it("coalesces equivalent and narrower requests into one active scan", async () => {
    const result = { id: "full" };
    const scan = vi.fn().mockResolvedValue(result);
    const coordinator = new EnvironmentScanCoordinator<typeof result>();

    const full = coordinator.run("selected", "full", scan);
    const dependencies = coordinator.run("selected", "dependencies", vi.fn());
    const runtime = coordinator.run("selected", "runtime", vi.fn());

    expect(dependencies).toBe(full);
    expect(runtime).toBe(full);
    await expect(full).resolves.toBe(result);
    expect(scan).toHaveBeenCalledOnce();
  });

  it("runs one broader follow-up after a narrower active scan and upgrades the queue", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const order: string[] = [];
    const coordinator = new EnvironmentScanCoordinator<string>();

    const active = coordinator.run("selected", "runtime", async () => {
      order.push("runtime-start");
      return first.promise;
    });
    const queuedDependencies = coordinator.run("selected", "dependencies", async () => {
      order.push("dependencies-work");
      return second.promise;
    });
    const queuedFull = coordinator.run("selected", "full", async () => {
      order.push("full-work");
      return second.promise;
    });
    const coalescedRuntime = coordinator.run("selected", "runtime", vi.fn());

    expect(queuedFull).toBe(queuedDependencies);
    first.resolve("runtime-result");
    await expect(active).resolves.toBe("runtime-result");
    await Promise.resolve();
    expect(order).toEqual(["runtime-start", "full-work"]);

    second.resolve("full-result");
    await expect(queuedDependencies).resolves.toBe("full-result");
    await expect(queuedFull).resolves.toBe("full-result");
    await expect(coalescedRuntime).resolves.toBe("runtime-result");
  });

  it("continues a queued operation after rejection and cleans up the key", async () => {
    const first = deferred<string>();
    const calls: string[] = [];
    const coordinator = new EnvironmentScanCoordinator<string>();
    const firstRun = coordinator.run("selected", "dependencies", async () => {
      calls.push("first");
      return first.promise;
    });
    const followUp = coordinator.run("selected", "full", async () => {
      calls.push("follow-up");
      return "recovered";
    });

    first.reject(new Error("probe failed"));
    await expect(firstRun).rejects.toThrow("probe failed");
    await expect(followUp).resolves.toBe("recovered");

    const afterFailure = coordinator.run("selected", "runtime", async () => {
      calls.push("after-cleanup");
      return "fresh";
    });
    await expect(afterFailure).resolves.toBe("fresh");
    expect(calls).toEqual(["first", "follow-up", "after-cleanup"]);
  });

  it("keeps distinct keys independent", async () => {
    const a = deferred<string>();
    const b = deferred<string>();
    const coordinator = new EnvironmentScanCoordinator<string>();
    const aWork = vi.fn(async () => a.promise);
    const bWork = vi.fn(async () => b.promise);

    const aRun = coordinator.run("installation-a", "full", aWork);
    const bRun = coordinator.run("installation-b", "full", bWork);
    await Promise.resolve();
    expect(aWork).toHaveBeenCalledOnce();
    expect(bWork).toHaveBeenCalledOnce();

    b.resolve("b");
    a.resolve("a");
    await expect(bRun).resolves.toBe("b");
    await expect(aRun).resolves.toBe("a");
  });

  it("forces a fresh request behind active work while coalescing its queued followers", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const calls: string[] = [];
    const coordinator = new EnvironmentScanCoordinator<string>();

    const active = coordinator.run("selected", "full", async () => {
      calls.push("active");
      return first.promise;
    });
    const coalesced = coordinator.run("selected", "full", vi.fn());
    const fresh = coordinator.run(
      "selected",
      "full",
      async () => {
        calls.push("fresh");
        return second.promise;
      },
      { fresh: true }
    );
    const freshFollower = coordinator.run("selected", "runtime", vi.fn(), { fresh: true });

    expect(coalesced).toBe(active);
    expect(freshFollower).toBe(fresh);
    expect(fresh).not.toBe(active);
    first.resolve("old");
    await expect(active).resolves.toBe("old");
    await Promise.resolve();
    expect(calls).toEqual(["active", "fresh"]);

    second.resolve("new");
    await expect(fresh).resolves.toBe("new");
    await expect(freshFollower).resolves.toBe("new");
  });

  it("upgrades a queued auto validation to live without losing the waiter", async () => {
    const first = deferred<string>();
    const calls: Array<{ scope: string; validation: string }> = [];
    const coordinator = new EnvironmentScanCoordinator<string>();
    const active = coordinator.run("selected", "full", async (spec) => {
      calls.push({ scope: spec.scope, validation: spec.pythonValidation });
      return first.promise;
    }, { validation: "auto" });
    const queuedAuto = coordinator.run("selected", "dependencies", async (spec) => {
      calls.push({ scope: spec.scope, validation: spec.pythonValidation });
      return "dependencies";
    }, { validation: "auto", fresh: true });
    const queuedLive = coordinator.run("selected", "dependencies", async (spec) => {
      calls.push({ scope: spec.scope, validation: spec.pythonValidation });
      return "live";
    }, {
      validation: "live",
      fresh: true
    });

    expect(queuedLive).toBe(queuedAuto);
    first.resolve("full");
    await expect(active).resolves.toBe("full");
    await expect(queuedLive).resolves.toBe("live");
    expect(calls).toEqual([
      { scope: "full", validation: "auto" },
      { scope: "dependencies", validation: "live" }
    ]);
  });
});
