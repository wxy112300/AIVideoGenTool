import type {
  EnvironmentScanScope,
  EnvironmentScanValidation
} from "../../src/types.js";

/** Options for joining or scheduling an environment scan. */
export interface EnvironmentScanCoordinatorOptions {
  /** Always schedule a new scan after the active operation. */
  fresh?: boolean;
  /** Native Python validation strength; scope and freshness are independent. */
  validation?: EnvironmentScanValidation;
}

export interface EnvironmentScanSpec {
  scope: EnvironmentScanScope;
  pythonValidation: EnvironmentScanValidation;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

type Work<T> = (spec: EnvironmentScanSpec) => Promise<T>;

interface ActiveOperation<T> {
  spec: EnvironmentScanSpec;
  promise: Promise<T>;
}

interface QueuedOperation<T> {
  spec: EnvironmentScanSpec;
  work: Work<T>;
  waiter: Deferred<T>;
}

interface KeyState<T> {
  active?: ActiveOperation<T>;
  queued?: QueuedOperation<T>;
}

export const environmentScanScopeRank: Record<EnvironmentScanScope, number> = {
  runtime: 0,
  dependencies: 1,
  full: 2
};

export const environmentScanValidationRank: Record<EnvironmentScanValidation, number> = {
  reuse: 0,
  auto: 1,
  live: 2
};

export function defaultEnvironmentScanValidation(
  scope: EnvironmentScanScope
): EnvironmentScanValidation {
  if (scope === "runtime") return "reuse";
  if (scope === "dependencies") return "live";
  return "auto";
}

function covers(available: EnvironmentScanSpec, requested: EnvironmentScanSpec): boolean {
  return environmentScanScopeRank[available.scope] >= environmentScanScopeRank[requested.scope] &&
    environmentScanValidationRank[available.pythonValidation] >=
      environmentScanValidationRank[requested.pythonValidation];
}

function mergeSpecs(left: EnvironmentScanSpec, right: EnvironmentScanSpec): EnvironmentScanSpec {
  return {
    scope: environmentScanScopeRank[left.scope] >= environmentScanScopeRank[right.scope]
      ? left.scope
      : right.scope,
    pythonValidation: environmentScanValidationRank[left.pythonValidation] >=
      environmentScanValidationRank[right.pythonValidation]
      ? left.pythonValidation
      : right.pythonValidation
  };
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
 * Serializes environment scans per logical key while keeping scope and native
 * validation strength separate. A queued follow-up is always executed with
 * the merged specification, so a later live request cannot be lost merely
 * because it has the same scope as an earlier auto request.
 */
export class EnvironmentScanCoordinator<T> {
  private readonly states = new Map<string, KeyState<T>>();

  run(
    key: string,
    scope: EnvironmentScanScope,
    work: Work<T>,
    options: EnvironmentScanCoordinatorOptions = {}
  ): Promise<T> {
    const spec: EnvironmentScanSpec = {
      scope,
      // Keep the low-level default backward-compatible for callers that only
      // care about scope. Product requests supply validation explicitly.
      pythonValidation: options.validation ?? "auto"
    };
    let state = this.states.get(key);
    if (!state) {
      state = {};
      this.states.set(key, state);
      return this.start(key, state, spec, work);
    }

    // A fresh request intentionally does not reuse active work. It can still
    // join a follow-up already scheduled by an earlier fresh/stronger request.
    if (!options.fresh && state.active && covers(state.active.spec, spec)) {
      return state.active.promise;
    }

    if (state.queued) {
      return this.joinQueued(state.queued, spec, work);
    }

    return this.enqueue(state, spec, work);
  }

  private start(
    key: string,
    state: KeyState<T>,
    spec: EnvironmentScanSpec,
    work: Work<T>
  ): Promise<T> {
    const raw = Promise.resolve().then(() => work(spec));
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
    active = { spec, promise };
    state.active = active;
    return promise;
  }

  private enqueue(
    state: KeyState<T>,
    spec: EnvironmentScanSpec,
    work: Work<T>
  ): Promise<T> {
    const waiter = deferred<T>();
    state.queued = { spec, work, waiter };
    return waiter.promise;
  }

  private joinQueued(
    queued: QueuedOperation<T>,
    spec: EnvironmentScanSpec,
    work: Work<T>
  ): Promise<T> {
    const merged = mergeSpecs(queued.spec, spec);
    // The newest stronger request supplies the executor. The executor receives
    // the merged spec when it eventually starts, so equal-scope live upgrades
    // cannot accidentally run with the older auto closure.
    if (merged.scope !== queued.spec.scope ||
      merged.pythonValidation !== queued.spec.pythonValidation) {
      queued.spec = merged;
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

    const next = this.start(key, state, queued.spec, queued.work);
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
