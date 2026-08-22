import { describe, expect, it } from "vitest";
import { createHistoryMediaScheduler } from "../src/renderer/pages/history/media-scheduler.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

async function flushScheduler(): Promise<void> {
  for (let index = 0; index < 12; index += 1) {
    await Promise.resolve();
  }
}

describe("history media scheduler", () => {
  it("limits work and favors interactive tasks over prefetch tasks", async () => {
    const scheduler = createHistoryMediaScheduler(2);
    const started: string[] = [];
    const first = deferred<boolean>();
    const second = deferred<boolean>();

    scheduler.enqueue("prefetch-1", async () => {
      started.push("prefetch-1");
      return first.promise;
    }, "prefetch");
    scheduler.enqueue("prefetch-2", async () => {
      started.push("prefetch-2");
      return second.promise;
    }, "prefetch");
    scheduler.enqueue("interactive", () => {
      started.push("interactive");
      return true;
    }, "interactive");

    await flushScheduler();
    expect(started).toEqual(["prefetch-1", "prefetch-2"]);
    first.resolve(true);
    await flushScheduler();
    expect(started).toEqual(["prefetch-1", "prefetch-2", "interactive"]);
    second.resolve(true);
    scheduler.dispose();
  });

  it("deduplicates successful keys and permits a retry after an unsuccessful task", async () => {
    const scheduler = createHistoryMediaScheduler(3);
    let runs = 0;
    scheduler.enqueue("same", () => {
      runs += 1;
      return false;
    });
    scheduler.enqueue("same", () => {
      runs += 1;
      return true;
    });
    await flushScheduler();
    expect(runs).toBe(1);

    scheduler.enqueue("same", () => {
      runs += 1;
      return true;
    });
    await flushScheduler();
    scheduler.enqueue("same", () => {
      runs += 1;
      return true;
    });
    await flushScheduler();
    expect(runs).toBe(2);
    scheduler.dispose();
  });

  it("aborts active work and drops pending work on clear", async () => {
    const scheduler = createHistoryMediaScheduler(1);
    let signal: AbortSignal | undefined;
    let pendingStarted = false;
    scheduler.enqueue("active", (taskSignal) => {
      signal = taskSignal;
      return new Promise<void>(() => undefined);
    });
    scheduler.enqueue("pending", () => {
      pendingStarted = true;
    });
    await Promise.resolve();
    scheduler.clear();
    expect(signal?.aborted).toBe(true);
    expect(pendingStarted).toBe(false);
    scheduler.dispose();
  });

  it("does not run a canceled replacement beside the old task", async () => {
    const scheduler = createHistoryMediaScheduler(1);
    const started: string[] = [];
    const first = deferred<boolean>();
    let firstSignal: AbortSignal | undefined;
    scheduler.enqueue("same", (signal) => {
      firstSignal = signal;
      started.push("first");
      return first.promise;
    });
    await flushScheduler();
    scheduler.cancel("same");
    scheduler.enqueue("same", () => {
      started.push("replacement");
      return true;
    }, "interactive");
    await flushScheduler();
    expect(firstSignal?.aborted).toBe(true);
    expect(started).toEqual(["first"]);
    first.resolve(false);
    await flushScheduler();
    expect(started).toEqual(["first", "replacement"]);
    scheduler.dispose();
  });
});