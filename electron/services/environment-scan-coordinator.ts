import type { EnvironmentScanScope } from "../../src/types.js";

/** Options for joining or scheduling an environment scan. */
export interface EnvironmentScanCoordinatorOptions {
  /**
   * Always schedule a new scan after the active operation. This is useful
   * after a mutation that may have completed while an older scan was running.
   */
  fresh?: boolean;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

interface ActiveOperation<T> {
  scope: EnvironmentScanScope;
  promise: Promise<T>;
}

interface QueuedOperation<T> {
  scope: EnvironmentScanScope;
  work: () => Promise<T>;
  waiter: Deferred<T>;
}

interface KeyState<T> {
  active?: ActiveOperation<T>;
  queued?: QueuedOperation<T>;
}

const scopeRank: Record<EnvironmentScanScope, number> = {
  runtime: 0,
  dependencies: 1,
  full: 2
};

function covers(
  available: EnvironmentScanScope,
  requested: EnvironmentScanScope
): boolean {
  return scopeRank[available] >= scopeRank[requested];
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

/**
 * Serializes environment scans per logical key while allowing unrelated keys
 * to scan concurrently. A broader scan covers narrower requests; a broader
 * request arriving during a narrower scan is held as one follow-up operation.
 */
export class EnvironmentScanCoordinator<T> {
  private readonly states = new Map<string, KeyState<T>>();

  run(
    key: string,
    scope: EnvironmentScanScope,
    work: () => Promise<T>,
    options: EnvironmentScanCoordinatorOptions = {}
  ): Promise<T> {
    let state = this.states.get(key);
    if (!state) {
      state = {};
      this.states.set(key, state);
      return this.start(key, state, scope, work);
    }

    // A fresh request intentionally does not reuse active work. It can still
    // join a follow-up already scheduled by an earlier fresh/stronger request.
    if (!options.fresh && state.active && covers(state.active.scope, scope)) {
      return state.active.promise;
    }

    if (state.queued) {
      return this.joinQueued(state.queued, scope, work);
    }

    return this.enqueue(state, scope, work);
  }

  private start(
    key: string,
    state: KeyState<T>,
    scope: EnvironmentScanScope,
    work: () => Promise<T>
  ): Promise<T> {
    const raw = Promise.resolve().then(work);
    let active!: ActiveOperation<T>;
    const promise = raw.then(
      (value) => {
        this.finish(key, state, active);
        return value;
      },
      (error: unknown) => {
        this.finish(key, state, active);
        throw error;
      }
    );
    active = { scope, promise };
    state.active = active;
    return promise;
  }

  private enqueue(
    state: KeyState<T>,
    scope: EnvironmentScanScope,
    work: () => Promise<T>
  ): Promise<T> {
    const waiter = deferred<T>();
    state.queued = { scope, work, waiter };
    return waiter.promise;
  }

  private joinQueued(
    queued: QueuedOperation<T>,
    scope: EnvironmentScanScope,
    work: () => Promise<T>
  ): Promise<T> {
    // Upgrade the one pending follow-up when a still broader request arrives.
    // Its work must be the broader caller's work because that is the operation
    // that can satisfy every waiter attached to this queue entry.
    if (!covers(queued.scope, scope)) {
      queued.scope = scope;
      queued.work = work;
    }
    return queued.waiter.promise;
  }

  private finish(
    key: string,
    state: KeyState<T>,
    active: ActiveOperation<T>
  ): void {
    if (state.active !== active) return;

    state.active = undefined;
    const queued = state.queued;
    state.queued = undefined;

    if (!queued) {
      this.states.delete(key);
      return;
    }

    const next = this.start(key, state, queued.scope, queued.work);
    next.then(
      (nextValue) => {
        queued.waiter.resolve(nextValue);
      },
      (nextError: unknown) => {
        queued.waiter.reject(nextError);
      }
    );
  }
}
