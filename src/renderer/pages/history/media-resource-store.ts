import type {
  HistoryCoverLookup,
  HistoryCoverSaveResult
} from "../../../types";
import {
  createHistoryMediaScheduler,
  type HistoryMediaTaskPriority
} from "./media-scheduler";

export type MediaKind = "image" | "video";

export interface MediaRef {
  key: string;
  kind: MediaKind;
  sourcePath: string;
  sourceUrl: string;
  width?: number;
  height?: number;
  coverTime?: number;
  duration?: number;
  seed?: number;
}

export interface Presentation {
  url: string;
  phase: "preview" | "final";
  origin: "disk" | "generated";
  sourceRevision: string;
}

export interface ProducedThumbnail {
  blob: Blob;
  data: ArrayBuffer;
  sourceRevision: string;
  selectedTime?: number;
}

export interface ThumbnailProducerHooks {
  publishPreview?(thumbnail: ProducedThumbnail): Promise<void> | void;
}

export interface MediaResourceConsumer {
  priority: HistoryMediaTaskPriority;
  signal: AbortSignal;
  onPresentation(value: Presentation): Promise<boolean> | boolean;
  onFailure(reason: "missing" | "decode" | "timeout" | "io"): void;
}

export interface MediaResourceStoreDependencies {
  lookup(ref: MediaRef, signal: AbortSignal): Promise<HistoryCoverLookup>;
  produce(
    ref: MediaRef,
    sourceRevision: string,
    signal: AbortSignal,
    hooks: ThumbnailProducerHooks
  ): Promise<ProducedThumbnail | null>;
  save(input: {
    key: string;
    sourcePath: string;
    sourceRevision: string;
    data: ArrayBuffer;
  }): Promise<HistoryCoverSaveResult>;
  onPersistenceFailure?(key: string, error?: unknown): void;
  createObjectUrl?(blob: Blob): string | Promise<string>;
  revokeObjectUrl?(url: string): void;
}

export interface MediaResourceStore {
  subscribe(ref: MediaRef, consumer: MediaResourceConsumer): () => void;
  invalidate(keys?: readonly string[]): void;
  dispose(): void;
}

interface Subscriber extends MediaResourceConsumer {
  id: number;
  abortHandler?: () => void;
}

interface ResourceEntry {
  key: string;
  ref: MediaRef;
  fingerprint: string;
  generation: number;
  subscribers: Map<number, Subscriber>;
  presentation?: Presentation;
  sourceRevision: string;
  lookupState?: HistoryCoverLookup["state"];
  lookupCompleted: boolean;
  lookupInFlight: boolean;
  productionInFlight: boolean;
  saveInFlight: boolean;
  persistence: "none" | "pending" | "saved" | "failed";
  missExpiresAt: number;
  needsRevalidation: boolean;
  staleRetries: number;
  diskUrl?: string;
  generatedUrls: Set<string>;
  generatedBytes: number;
}

const MAX_RESULT_KEYS = 256;
const MAX_UNREFERENCED_BLOB_BYTES = 32 * 1024 * 1024;
const MISS_TTL_MS = 1_000;

type HistoryMediaBenchmarkHook = {
  count?: (name: string, delta?: number) => void;
  set?: (name: string, value: number) => void;
  max?: (name: string, value: number) => void;
};

function benchmarkHook(): HistoryMediaBenchmarkHook | undefined {
  const candidate = (globalThis as typeof globalThis & {
    __historyMediaBenchmark?: HistoryMediaBenchmarkHook;
  }).__historyMediaBenchmark;
  return candidate && typeof candidate === "object" ? candidate : undefined;
}

function benchmarkCount(name: string, delta = 1): void {
  benchmarkHook()?.count?.(name, delta);
}

function benchmarkSet(name: string, value: number): void {
  benchmarkHook()?.set?.(name, value);
}

function abortError(): Error {
  const error = new Error("The media operation was aborted");
  error.name = "AbortError";
  return error;
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = (): void => {
      benchmarkCount("canceledRequests");
      finish(() => reject(abortError()));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error))
    );
  });
}

function refFingerprint(ref: MediaRef): string {
  return [ref.kind, ref.sourcePath, ref.sourceUrl].join("\u0000");
}

function defaultObjectUrl(blob: Blob): string | Promise<string> {
  if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
    return URL.createObjectURL(blob);
  }
  return new Promise((resolve, reject) => {
    if (typeof FileReader === "undefined") {
      reject(new Error("当前环境不支持媒体对象 URL 或 FileReader"));
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(blob);
  });
}

function defaultRevokeObjectUrl(url: string): void {
  if (
    url.startsWith("blob:") &&
    typeof URL !== "undefined" &&
    typeof URL.revokeObjectURL === "function"
  ) {
    URL.revokeObjectURL(url);
  }
}

export function createMediaResourceStore(
  dependencies: MediaResourceStoreDependencies
): MediaResourceStore {
  const entries = new Map<string, ResourceEntry>();
  const lookupScheduler = createHistoryMediaScheduler(8);
  const imageScheduler = createHistoryMediaScheduler(3);
  const videoScheduler = createHistoryMediaScheduler(1);
  const saveScheduler = createHistoryMediaScheduler(1);
  const revokeObjectUrl = dependencies.revokeObjectUrl ?? defaultRevokeObjectUrl;
  const revoke = (url: string): void => {
    revokeObjectUrl(url);
    benchmarkCount("objectUrlsRevoked");
  };
  let subscriberSequence = 0;
  let unreferencedBlobBytes = 0;
  let disposed = false;
  const presentationRetryRevisions = new Map<string, string>();

  const syncBenchmarkResourceState = (): void => {
    benchmarkSet("unreferencedBlobBytes", unreferencedBlobBytes);
    benchmarkSet(
      "liveObjectUrls",
      [...entries.values()].reduce((total, entry) => total + entry.generatedUrls.size, 0)
    );
  };

  const touch = (entry: ResourceEntry): void => {
    if (entries.get(entry.key) !== entry) return;
    entries.delete(entry.key);
    entries.set(entry.key, entry);
  };

  const releaseGeneratedUrls = (entry: ResourceEntry): void => {
    entry.generatedUrls.forEach((url) => revoke(url));
    entry.generatedUrls.clear();
    if (entry.subscribers.size === 0) {
      unreferencedBlobBytes = Math.max(0, unreferencedBlobBytes - entry.generatedBytes);
    }
    entry.generatedBytes = 0;
    if (entry.presentation?.origin === "generated") entry.presentation = undefined;
    syncBenchmarkResourceState();
  };

  const trimUnreferencedBlobs = (): void => {
    if (unreferencedBlobBytes <= MAX_UNREFERENCED_BLOB_BYTES) return;
    for (const entry of entries.values()) {
      if (unreferencedBlobBytes <= MAX_UNREFERENCED_BLOB_BYTES) break;
      if (entry.subscribers.size > 0 || entry.generatedBytes <= 0) continue;
      releaseGeneratedUrls(entry);
    }
  };

  const trimResultKeys = (): void => {
    if (entries.size <= MAX_RESULT_KEYS) return;
    for (const [key, entry] of entries) {
      if (entries.size <= MAX_RESULT_KEYS) break;
      if (
        entry.subscribers.size > 0 ||
        entry.lookupInFlight ||
        entry.productionInFlight ||
        entry.saveInFlight
      ) continue;
      releaseGeneratedUrls(entry);
      entries.delete(key);
    }
  };

  const highestPriority = (entry: ResourceEntry): HistoryMediaTaskPriority => {
    let priority: HistoryMediaTaskPriority = "prefetch";
    for (const subscriber of entry.subscribers.values()) {
      if (subscriber.priority === "interactive") return "interactive";
      if (subscriber.priority === "viewport") priority = "viewport";
    }
    return priority;
  };

  const notifyFailure = (
    entry: ResourceEntry,
    reason: "missing" | "decode" | "timeout" | "io"
  ): void => {
    for (const subscriber of [...entry.subscribers.values()]) {
      if (!subscriber.signal.aborted) {
        try {
          subscriber.onFailure(reason);
        } catch {
          // One stale consumer must not fail the shared resource.
        }
      }
    }
  };

  function handlePresentationFailure(
    entry: ResourceEntry,
    subscriber: Subscriber,
    presentation: Presentation
  ): void {
    if (
      disposed ||
      entries.get(entry.key) !== entry ||
      entry.subscribers.get(subscriber.id) !== subscriber ||
      subscriber.signal.aborted ||
      entry.presentation !== presentation
    ) return;
    const sourceRevision = presentation.sourceRevision;
    if (
      presentation.origin === "disk" &&
      presentationRetryRevisions.get(entry.key) !== sourceRevision
    ) {
      resetForNewReference(entry, entry.ref);
      presentationRetryRevisions.set(entry.key, sourceRevision);
      ensureWork(entry);
      return;
    }
    try {
      subscriber.onFailure("io");
    } catch {
      // A broken surface must not fail the shared resource.
    }
  }

  const deliver = (entry: ResourceEntry, subscriber: Subscriber): void => {
    const presentation = entry.presentation;
    if (!presentation || subscriber.signal.aborted) return;
    Promise.resolve()
      .then(async () => {
        if (
          disposed ||
          entries.get(entry.key) !== entry ||
          entry.subscribers.get(subscriber.id) !== subscriber ||
          subscriber.signal.aborted ||
          entry.presentation !== presentation
        ) return;
        const loaded = await subscriber.onPresentation(presentation);
        if (loaded === false) handlePresentationFailure(entry, subscriber, presentation);
      })
      .catch(() => undefined);
  };

  const publish = (entry: ResourceEntry, presentation: Presentation): void => {
    if (disposed || entries.get(entry.key) !== entry) return;
    entry.presentation = presentation;
    touch(entry);
    for (const subscriber of [...entry.subscribers.values()]) deliver(entry, subscriber);
  };

  const createGeneratedPresentation = async (
    entry: ResourceEntry,
    thumbnail: ProducedThumbnail,
    phase: "preview" | "final",
    generation: number,
    signal?: AbortSignal
  ): Promise<void> => {
    const url = await (dependencies.createObjectUrl ?? defaultObjectUrl)(thumbnail.blob);
    if (
      signal?.aborted ||
      disposed ||
      entries.get(entry.key) !== entry ||
      entry.generation !== generation ||
      thumbnail.sourceRevision !== entry.sourceRevision
    ) {
      revoke(url);
      return;
    }
    entry.generatedUrls.add(url);
    entry.generatedBytes += thumbnail.data.byteLength;
    if (entry.subscribers.size === 0) unreferencedBlobBytes += thumbnail.data.byteLength;
    benchmarkCount("objectUrlsCreated");
    publish(entry, {
      url,
      phase,
      origin: "generated",
      sourceRevision: thumbnail.sourceRevision
    });
    syncBenchmarkResourceState();
    trimUnreferencedBlobs();
  };

  const scheduleSave = (
    entry: ResourceEntry,
    thumbnail: ProducedThumbnail,
    generation: number
  ): void => {
    if (!entry.ref.sourcePath || !thumbnail.sourceRevision || entry.saveInFlight) return;
    entry.saveInFlight = true;
    entry.persistence = "pending";
    const saveKey = `save:${entry.key}`;
    const data = thumbnail.data.slice(0) as ArrayBuffer;
    saveScheduler.enqueue(saveKey, async (signal) => {
      try {
        if (signal.aborted) return false;
        const result = await abortable(
          dependencies.save({
            key: entry.key,
            sourcePath: entry.ref.sourcePath,
            sourceRevision: thumbnail.sourceRevision,
            data
          }),
          signal
        );
        if (
          entries.get(entry.key) !== entry ||
          entry.generation !== generation ||
          thumbnail.sourceRevision !== entry.sourceRevision
        ) return false;
        if (result.state === "saved") {
          benchmarkCount("coverSaves");
          entry.persistence = "saved";
          entry.diskUrl = result.url;
          if (entry.subscribers.size === 0) {
            releaseGeneratedUrls(entry);
            entry.presentation = {
              url: result.url,
              phase: "final",
              origin: "disk",
              sourceRevision: thumbnail.sourceRevision
            };
          }
          return true;
        }
        if (result.state === "stale") {
          benchmarkCount("coverSaveStale");
          entry.persistence = "none";
          if (entry.staleRetries < 1 && entries.get(entry.key) === entry) {
            entry.staleRetries += 1;
            releaseGeneratedUrls(entry);
            entry.presentation = undefined;
            entry.diskUrl = undefined;
            entry.lookupState = undefined;
            entry.lookupCompleted = false;
            entry.needsRevalidation = false;
            entry.sourceRevision = "";
            ensureWork(entry);
          }
          return false;
        }
        entry.persistence = "failed";
        dependencies.onPersistenceFailure?.(entry.key);
        return false;
      } catch (error) {
        if (!signal.aborted && entries.get(entry.key) === entry && entry.generation === generation) {
          entry.persistence = "failed";
          dependencies.onPersistenceFailure?.(entry.key, error);
        }
        return false;
      } finally {
        if (entries.get(entry.key) === entry && entry.generation === generation) {
          entry.saveInFlight = false;
        }
      }
    }, "prefetch");
  };

  const startProduction = (entry: ResourceEntry): void => {
    if (
      disposed ||
      entry.subscribers.size === 0 ||
      entry.productionInFlight ||
      !entry.ref.sourceUrl
    ) return;
    const scheduler = entry.ref.kind === "image" ? imageScheduler : videoScheduler;
    const generation = entry.generation;
    const sourceRevision = entry.sourceRevision;
    entry.productionInFlight = true;
    scheduler.enqueue(entry.key, async (signal) => {
      try {
        const final = await abortable(
          dependencies.produce(
            entry.ref,
            sourceRevision,
            signal,
            {
              publishPreview: async (thumbnail) => {
                if (signal.aborted) return;
                await createGeneratedPresentation(entry, thumbnail, "preview", generation, signal);
                if (!signal.aborted && entry.ref.kind === "video") {
                  const priority = highestPriority(entry);
                  scheduler.reprioritize(
                    entry.key,
                    priority === "interactive" ? "interactive" : "prefetch"
                  );
                }
              }
            }
          ),
          signal
        );
        if (
          signal.aborted ||
          entries.get(entry.key) !== entry ||
          entry.generation !== generation
        ) return false;
        if (!final) {
          notifyFailure(entry, "decode");
          return false;
        }
        await createGeneratedPresentation(entry, final, "final", generation, signal);
        if (
          !signal.aborted &&
          entries.get(entry.key) === entry &&
          entry.generation === generation
        ) {
          scheduleSave(entry, final, generation);
        }
        return true;
      } catch (error) {
        if (!signal.aborted && entries.get(entry.key) === entry && entry.generation === generation) {
          notifyFailure(entry, error instanceof DOMException && error.name === "TimeoutError" ? "timeout" : "decode");
        }
        return false;
      } finally {
        if (entries.get(entry.key) === entry && entry.generation === generation) {
          entry.productionInFlight = false;
        }
      }
    }, highestPriority(entry));
  };

  const applyLookup = (entry: ResourceEntry, result: HistoryCoverLookup): void => {
    entry.lookupCompleted = true;
    entry.lookupState = result.state;
    entry.missExpiresAt = result.state === "miss" ? Date.now() + MISS_TTL_MS : 0;
    if (result.state === "hit") {
      benchmarkCount("coverHits");
      if (entry.presentation?.origin === "generated") releaseGeneratedUrls(entry);
      entry.sourceRevision = result.sourceRevision;
      entry.diskUrl = result.url;
      entry.persistence = "saved";
      publish(entry, {
        url: result.url,
        phase: "final",
        origin: "disk",
        sourceRevision: result.sourceRevision
      });
      return;
    }
    if (result.state === "miss") {
      const sourceChanged = Boolean(
        entry.presentation?.sourceRevision &&
        entry.presentation.sourceRevision !== result.sourceRevision
      );
      entry.sourceRevision = result.sourceRevision;
      entry.diskUrl = undefined;
      entry.persistence = entry.presentation?.origin === "generated" ? "pending" : "none";
      if (sourceChanged) {
        releaseGeneratedUrls(entry);
        entry.presentation = undefined;
        entry.persistence = "none";
      }
      if (
        entry.presentation?.phase === "final" &&
        entry.presentation.sourceRevision === result.sourceRevision
      ) {
        for (const subscriber of entry.subscribers.values()) deliver(entry, subscriber);
        return;
      }
      startProduction(entry);
      return;
    }
    entry.sourceRevision = "";
    if (!entry.ref.sourcePath && entry.ref.sourceUrl) {
      startProduction(entry);
      return;
    }
    notifyFailure(entry, "missing");
  };

  const startLookup = (entry: ResourceEntry): void => {
    if (
      disposed ||
      entry.subscribers.size === 0 ||
      entry.lookupInFlight ||
      !entry.ref.sourceUrl
    ) return;
    if (!entry.ref.sourcePath) {
      entry.lookupCompleted = true;
      entry.lookupState = "unavailable";
      entry.sourceRevision = "";
      startProduction(entry);
      return;
    }
    const generation = entry.generation;
    entry.lookupInFlight = true;
    benchmarkCount("coverLookups");
    lookupScheduler.enqueue(entry.key, async (signal) => {
      try {
        const result = await abortable(dependencies.lookup(entry.ref, signal), signal);
        if (
          signal.aborted ||
          entries.get(entry.key) !== entry ||
          entry.generation !== generation
        ) return false;
        applyLookup(entry, result);
        return true;
      } catch {
        if (!signal.aborted && entries.get(entry.key) === entry && entry.generation === generation) {
          notifyFailure(entry, "io");
        }
        return false;
      } finally {
        if (entries.get(entry.key) === entry && entry.generation === generation) {
          entry.lookupInFlight = false;
        }
      }
    }, highestPriority(entry));
  };

  function ensureWork(entry: ResourceEntry): void {
    if (disposed || entry.subscribers.size === 0 || !entry.ref.sourceUrl) {
      if (!entry.ref.sourceUrl && entry.subscribers.size > 0) notifyFailure(entry, "missing");
      return;
    }
    if (entry.needsRevalidation) {
      entry.needsRevalidation = false;
      entry.lookupCompleted = false;
      entry.lookupState = undefined;
    }
    if (!entry.lookupCompleted) {
      startLookup(entry);
      return;
    }
    if (
      entry.lookupState === "miss" &&
      entry.missExpiresAt > Date.now() &&
      !entry.presentation
    ) return;
    if (entry.lookupState === "miss" && entry.presentation?.phase !== "final") startProduction(entry);
  }

  const resetForNewReference = (entry: ResourceEntry, ref: MediaRef): void => {
    entry.generation += 1;
    presentationRetryRevisions.delete(entry.key);
    lookupScheduler.cancel(entry.key);
    imageScheduler.cancel(entry.key);
    videoScheduler.cancel(entry.key);
    saveScheduler.cancel(`save:${entry.key}`);
    releaseGeneratedUrls(entry);
    entry.ref = ref;
    entry.fingerprint = refFingerprint(ref);
    entry.presentation = undefined;
    entry.sourceRevision = "";
    entry.lookupState = undefined;
    entry.lookupCompleted = false;
    entry.lookupInFlight = false;
    entry.productionInFlight = false;
    entry.saveInFlight = false;
    entry.persistence = "none";
    entry.missExpiresAt = 0;
    entry.needsRevalidation = false;
    entry.staleRetries = 0;
    entry.diskUrl = undefined;
  };

  const unsubscribe = (entry: ResourceEntry, id: number): void => {
    const subscriber = entry.subscribers.get(id);
    if (!subscriber) return;
    subscriber.signal.removeEventListener("abort", subscriber.abortHandler ?? (() => undefined));
    entry.subscribers.delete(id);
    if (entry.subscribers.size === 0) {
      unreferencedBlobBytes += entry.generatedBytes;
      entry.lookupInFlight = false;
      entry.productionInFlight = false;
      lookupScheduler.cancel(entry.key);
      imageScheduler.cancel(entry.key);
      videoScheduler.cancel(entry.key);
      entry.needsRevalidation = true;
      trimUnreferencedBlobs();
      trimResultKeys();
      syncBenchmarkResourceState();
    }
  };

  return {
    subscribe(ref, consumer) {
      if (disposed || !ref.key) return () => undefined;
      let entry = entries.get(ref.key);
      if (!entry) {
        entry = {
          key: ref.key,
          ref,
          fingerprint: refFingerprint(ref),
          generation: 0,
          subscribers: new Map(),
          sourceRevision: "",
          lookupCompleted: false,
          lookupInFlight: false,
          productionInFlight: false,
          saveInFlight: false,
          persistence: "none",
          missExpiresAt: 0,
          needsRevalidation: false,
          staleRetries: 0,
          generatedUrls: new Set(),
          generatedBytes: 0
        };
        entries.set(ref.key, entry);
      } else if (entry.fingerprint !== refFingerprint(ref)) {
        resetForNewReference(entry, ref);
      }
      const wasEmpty = entry.subscribers.size === 0;
      const id = ++subscriberSequence;
      const subscriber: Subscriber = { ...consumer, id };
      entry.subscribers.set(id, subscriber);
      const abortHandler = () => unsubscribe(entry!, id);
      subscriber.abortHandler = abortHandler;
      if (wasEmpty) {
        unreferencedBlobBytes = Math.max(0, unreferencedBlobBytes - entry.generatedBytes);
        syncBenchmarkResourceState();
      }
      if (subscriber.signal.aborted) {
        unsubscribe(entry, id);
        return () => undefined;
      }
      subscriber.signal.addEventListener("abort", abortHandler, { once: true });
      touch(entry);
      const shouldRevalidate = wasEmpty && entry.lookupCompleted;
      if (entry.presentation && !shouldRevalidate) deliver(entry, subscriber);
      if (shouldRevalidate) entry.needsRevalidation = true;
      if (entry.productionInFlight) {
        const scheduler = entry.ref.kind === "image" ? imageScheduler : videoScheduler;
        scheduler.reprioritize(entry.key, highestPriority(entry));
      }
      ensureWork(entry);
      return () => unsubscribe(entry!, id);
    },

    invalidate(keys) {
      if (disposed) return;
      const selected = keys ? new Set(keys) : undefined;
      for (const entry of entries.values()) {
        if (selected && !selected.has(entry.key)) continue;
        presentationRetryRevisions.delete(entry.key);
        entry.generation += 1;
        lookupScheduler.cancel(entry.key);
        imageScheduler.cancel(entry.key);
        videoScheduler.cancel(entry.key);
        saveScheduler.cancel(`save:${entry.key}`);
        releaseGeneratedUrls(entry);
        entry.presentation = undefined;
        entry.diskUrl = undefined;
        entry.sourceRevision = "";
        entry.lookupState = undefined;
        entry.lookupCompleted = false;
        entry.lookupInFlight = false;
        entry.productionInFlight = false;
        entry.saveInFlight = false;
        entry.persistence = "none";
        entry.missExpiresAt = 0;
        entry.needsRevalidation = false;
        entry.staleRetries = 0;
        ensureWork(entry);
      }
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      lookupScheduler.dispose();
      imageScheduler.dispose();
      videoScheduler.dispose();
      saveScheduler.dispose();
      for (const entry of entries.values()) releaseGeneratedUrls(entry);
      entries.clear();
      presentationRetryRevisions.clear();
      unreferencedBlobBytes = 0;
      syncBenchmarkResourceState();
    }
  };
}
