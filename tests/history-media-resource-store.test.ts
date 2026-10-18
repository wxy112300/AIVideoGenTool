import { describe, expect, it, vi } from "vitest";
import type {
  HistoryCoverLookup,
  HistoryCoverSaveResult
} from "../src/types.js";
import {
  createMediaResourceStore,
  type MediaRef,
  type MediaResourceConsumer,
  type Presentation,
  type ProducedThumbnail
} from "../src/renderer/pages/history/media-resource-store.ts";

function mediaRef(overrides: Partial<MediaRef> = {}): MediaRef {
  return {
    key: "history-key",
    kind: "image",
    sourcePath: "C:\\fixtures\\source.png",
    sourceUrl: "studio-media://history/source.png",
    ...overrides
  };
}

function thumbnail(sourceRevision: string): ProducedThumbnail {
  const blob = new Blob(["thumbnail"], { type: "image/png" });
  return {
    blob,
    data: new Uint8Array([1, 2, 3]).buffer,
    sourceRevision
  };
}

function consumer(
  presentations: Presentation[],
  failures: string[] = [],
  priority: MediaResourceConsumer["priority"] = "interactive"
): MediaResourceConsumer {
  return {
    priority,
    signal: new AbortController().signal,
    onPresentation: (value) => {
      presentations.push(value);
      return true;
    },
    onFailure: (reason) => failures.push(reason)
  };
}

async function flushTasks(): Promise<void> {
  for (let index = 0; index < 40; index += 1) await Promise.resolve();
}

function saved(url = "studio-media://cover/saved.jpg"): HistoryCoverSaveResult {
  return { state: "saved", url };
}

describe("history media resource store", () => {
  it("revalidates a changed source after a stale save before producing its replacement", async () => {
    let lookups = 0; const saves: string[] = [];
    const store = createMediaResourceStore({
      lookup: async () => ({ state: "miss", sourceRevision: `source-${++lookups}` }),
      produce: async (_ref, revision) => thumbnail(revision),
      save: async input => { saves.push(input.sourceRevision); return saves.length === 1 ? { state: "stale" } : saved(); },
      createObjectUrl: () => "blob:source-change"
    });
    const unsubscribe = store.subscribe(mediaRef(), consumer([]));
    await flushTasks(); await flushTasks();
    expect(saves).toEqual(["source-1", "source-2"]); unsubscribe(); store.dispose();
  });
  it("reorders pending videos for the current viewport and retains offscreen jobs until each saves once", async () => {
    const started: string[] = [];
    let finishActive!: (value: ProducedThumbnail) => void;
    let activeSignal!: AbortSignal;
    const save = vi.fn(async (_input: { key: string }) => saved());
    const store = createMediaResourceStore({
      lookup: async (ref) => ({ state: "miss", sourceRevision: ref.key }),
      produce: (ref, _revision, signal) => {
        started.push(ref.key);
        if (ref.key === "active") { activeSignal = signal; return new Promise<ProducedThumbnail>(resolve => { finishActive = resolve; }); }
        return Promise.resolve(thumbnail(ref.key));
      }, save, createObjectUrl: () => "blob:queued"
    });
    const ref = (key: string) => mediaRef({ key, kind: "video", sourceUrl: `studio-media://history/${key}.mp4` });
    const active = store.subscribe(ref("active"), consumer([], [], "prefetch")); await flushTasks();
    const oldVisible = store.subscribe(ref("old-visible"), consumer([], [], "viewport"));
    const nextVisible = store.subscribe(ref("next-visible"), consumer([], [], "prefetch"));
    const retained = store.subscribe(ref("retained"), consumer([], [], "prefetch"));
    await flushTasks(); oldVisible(); nextVisible.reprioritize?.("viewport"); active();
    expect(activeSignal.aborted).toBe(false); expect(started).toEqual(["active"]);
    finishActive(thumbnail("active")); await flushTasks(); await flushTasks();
    expect(started).toEqual(["active", "next-visible", "retained", "old-visible"]);
    expect(save).toHaveBeenCalledTimes(4);
    expect(save.mock.calls.map(([input]) => input.key).sort()).toEqual(["active", "next-visible", "old-visible", "retained"]);
    nextVisible(); retained(); store.dispose();
  });

  it("continues video refinement after publishing a preview even if its only consumer leaves", async () => {
    let finish!: (value: ProducedThumbnail) => void;
    let signal!: AbortSignal;
    const save = vi.fn(async () => saved()); const shown: Presentation[] = [];
    const store = createMediaResourceStore({
      lookup: async () => ({ state: "miss", sourceRevision: "preview-background" }),
      produce: async (_ref, revision, taskSignal, hooks) => {
        signal = taskSignal; await hooks.publishPreview?.(thumbnail(revision));
        return new Promise<ProducedThumbnail>(resolve => { finish = resolve; });
      }, save, createObjectUrl: () => "blob:preview-background"
    });
    const unsubscribe = store.subscribe(mediaRef({ kind: "video" }), consumer(shown)); await flushTasks();
    expect(shown.map(p => p.phase)).toEqual(["preview"]);
    unsubscribe(); expect(signal.aborted).toBe(false);
    finish(thumbnail("preview-background")); await flushTasks();
    expect(save).toHaveBeenCalledOnce(); expect(shown.map(p => p.phase)).toEqual(["preview"]);
    store.dispose();
  });

  it("cancels work explicitly on disposal and ignores late completion without deleting saved results", async () => {
    let signal!: AbortSignal; let finish!: (value: ProducedThumbnail) => void;
    const save = vi.fn(async () => saved());
    const store = createMediaResourceStore({
      lookup: async ref => ({ state: "miss", sourceRevision: ref.key }),
      produce: (ref, _revision, taskSignal) => {
        if (ref.key === "saved") return Promise.resolve(thumbnail(ref.key));
        signal = taskSignal; return new Promise<ProducedThumbnail>(resolve => { finish = resolve; });
      }, save, createObjectUrl: () => "blob:exit"
    });
    store.subscribe(mediaRef({ key: "saved" }), consumer([])); await flushTasks(); expect(save).toHaveBeenCalledOnce();
    store.subscribe(mediaRef({ key: "unfinished", kind: "video" }), consumer([])); await flushTasks();
    store.dispose(); expect(signal.aborted).toBe(true);
    finish(thumbnail("unfinished")); await flushTasks(); expect(save).toHaveBeenCalledOnce();
  });

  it("shares one lookup and producer while delivering the result to every consumer", async () => {
    const lookup = vi.fn(async (): Promise<HistoryCoverLookup> => ({
      state: "miss",
      sourceRevision: "revision-1"
    }));
    const produce = vi.fn(async (): Promise<ProducedThumbnail> => thumbnail("revision-1"));
    const save = vi.fn(async (): Promise<HistoryCoverSaveResult> => saved());
    let urlSequence = 0;
    const store = createMediaResourceStore({
      lookup,
      produce,
      save,
      createObjectUrl: () => `blob:history-${++urlSequence}`
    });
    const first: Presentation[] = [];
    const second: Presentation[] = [];
    const third: Presentation[] = [];
    const unsubscriptions = [
      store.subscribe(mediaRef(), consumer(first)),
      store.subscribe(mediaRef(), consumer(second)),
      store.subscribe(mediaRef(), consumer(third))
    ];

    await flushTasks();

    expect(lookup).toHaveBeenCalledOnce();
    expect(produce).toHaveBeenCalledOnce();
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(third).toHaveLength(1);
    expect(first[0]).toMatchObject({
      phase: "final",
      origin: "generated",
      sourceRevision: "revision-1"
    });
    expect(second[0]?.url).toBe(first[0]?.url);
    expect(third[0]?.url).toBe(first[0]?.url);

    unsubscriptions[0]?.();
    unsubscriptions[1]?.();
    unsubscriptions[2]?.();
    store.dispose();
  });

  it("serves a disk hit without starting a decoder or creating an object URL", async () => {
    const lookup = vi.fn(async (): Promise<HistoryCoverLookup> => ({
      state: "hit",
      url: "studio-media://cover/existing.jpg?v=4",
      sourceRevision: "revision-hit"
    }));
    const produce = vi.fn(async (): Promise<ProducedThumbnail> => thumbnail("revision-hit"));
    const createObjectUrl = vi.fn(() => "blob:never");
    const presentations: Presentation[] = [];
    const store = createMediaResourceStore({
      lookup,
      produce,
      save: async () => saved(),
      createObjectUrl
    });

    const unsubscribe = store.subscribe(mediaRef({ kind: "video" }), consumer(presentations));
    await flushTasks();

    expect(lookup).toHaveBeenCalledOnce();
    expect(produce).not.toHaveBeenCalled();
    expect(createObjectUrl).not.toHaveBeenCalled();
    expect(presentations).toEqual([{
      url: "studio-media://cover/existing.jpg?v=4",
      phase: "final",
      origin: "disk",
      sourceRevision: "revision-hit"
    }]);
    unsubscribe();
    store.dispose();
  });

  it("revalidates a failed disk presentation once without falling back to video", async () => {
    let lookupCalls = 0;
    const lookup = vi.fn(async (): Promise<HistoryCoverLookup> => {
      lookupCalls += 1;
      return {
        state: "hit",
        url: lookupCalls === 1
          ? "studio-media://cover/missing.jpg?v=1"
          : "studio-media://cover/recovered.jpg?v=2",
        sourceRevision: "revision-disk-retry"
      };
    });
    const presentations: Presentation[] = [];
    const failures: string[] = [];
    let presentationCalls = 0;
    const store = createMediaResourceStore({
      lookup,
      produce: vi.fn(async (): Promise<ProducedThumbnail> => thumbnail("revision-disk-retry")),
      save: async () => saved()
    });

    const unsubscribe = store.subscribe(mediaRef({ kind: "video" }), {
      priority: "interactive",
      signal: new AbortController().signal,
      onPresentation: (value) => {
        presentationCalls += 1;
        presentations.push(value);
        return presentationCalls > 1;
      },
      onFailure: (reason) => failures.push(reason)
    });
    await flushTasks();

    expect(lookup).toHaveBeenCalledTimes(2);
    expect(presentations.map((item) => item.url)).toEqual([
      "studio-media://cover/missing.jpg?v=1",
      "studio-media://cover/recovered.jpg?v=2"
    ]);
    expect(failures).toEqual([]);
    unsubscribe();
    store.dispose();
  });

  it("does not loop when a revalidated disk presentation still fails", async () => {
    let lookupCalls = 0;
    const lookup = vi.fn(async (): Promise<HistoryCoverLookup> => {
      lookupCalls += 1;
      return {
        state: "hit",
        url: `studio-media://cover/still-missing-${lookupCalls}.jpg?v=${lookupCalls}`,
        sourceRevision: "revision-bounded-retry"
      };
    });
    const failures: string[] = [];
    const store = createMediaResourceStore({
      lookup,
      produce: vi.fn(async (): Promise<ProducedThumbnail> => thumbnail("revision-bounded-retry")),
      save: async () => saved()
    });

    const unsubscribe = store.subscribe(mediaRef({ kind: "video" }), {
      priority: "interactive",
      signal: new AbortController().signal,
      onPresentation: () => false,
      onFailure: (reason) => failures.push(reason)
    });
    await flushTasks();

    expect(lookup).toHaveBeenCalledTimes(2);
    expect(failures).toEqual(["io"]);
    unsubscribe();
    store.dispose();
  });

  it("publishes a video preview before final refinement and persistence", async () => {
    const lookup = vi.fn(async (): Promise<HistoryCoverLookup> => ({
      state: "miss",
      sourceRevision: "revision-video"
    }));
    const save = vi.fn(async (): Promise<HistoryCoverSaveResult> => saved());
    const produce = vi.fn(async (
      _ref: MediaRef,
      _revision: string,
      _signal: AbortSignal,
      hooks: { publishPreview?(value: ProducedThumbnail): Promise<void> | void }
    ): Promise<ProducedThumbnail> => {
      await hooks.publishPreview?.(thumbnail("revision-video"));
      return thumbnail("revision-video");
    });
    const presentations: Presentation[] = [];
    const store = createMediaResourceStore({
      lookup,
      produce,
      save,
      createObjectUrl: (() => {
        let sequence = 0;
        return () => `blob:video-${++sequence}`;
      })()
    });
    const unsubscribe = store.subscribe(mediaRef({
      kind: "video",
      sourceUrl: "studio-media://history/video.mp4"
    }), consumer(presentations));

    await flushTasks();

    expect(presentations.map((item) => item.phase)).toEqual(["preview", "final"]);
    expect(presentations.every((item) => item.origin === "generated")).toBe(true);
    expect(save).toHaveBeenCalledOnce();
    unsubscribe();
    store.dispose();
  });

  it("keeps a usable video preview when final refinement times out", async () => {
    const failures: string[] = [];
    const presentations: Presentation[] = [];
    const save = vi.fn(async (): Promise<HistoryCoverSaveResult> => saved());
    const store = createMediaResourceStore({
      lookup: async () => ({ state: "miss", sourceRevision: "revision-timeout" } as const),
      produce: async (_ref, _revision, _signal, hooks) => {
        await hooks.publishPreview?.(thumbnail("revision-timeout"));
        return null;
      },
      save,
      createObjectUrl: () => "blob:preview-only"
    });
    const unsubscribe = store.subscribe(mediaRef({
      kind: "video",
      sourceUrl: "studio-media://history/slow-video.mp4"
    }), consumer(presentations, failures));

    await flushTasks();

    expect(presentations).toHaveLength(1);
    expect(presentations[0]).toMatchObject({ phase: "preview", origin: "generated" });
    expect(failures).toEqual(["decode"]);
    expect(save).not.toHaveBeenCalled();
    unsubscribe();
    store.dispose();
  });

  it("finishes a running video instead of preempting it when another card becomes interactive", async () => {
    const firstRef = mediaRef({
      key: "prefetch-video",
      kind: "video",
      sourceUrl: "studio-media://history/prefetch.mp4"
    });
    const secondRef = mediaRef({
      key: "interactive-video",
      kind: "video",
      sourceUrl: "studio-media://history/interactive.mp4"
    });
    const lookup = vi.fn(async (ref: MediaRef): Promise<HistoryCoverLookup> => ({
      state: "miss",
      sourceRevision: ref.key
    }));
    let prefetchSignal: AbortSignal | undefined;
    let finishPrefetch!: (value: ProducedThumbnail) => void;
    const produce = vi.fn((ref: MediaRef, _revision: string, signal: AbortSignal) => {
      if (ref.key === firstRef.key) {
        prefetchSignal = signal;
        return new Promise<ProducedThumbnail | null>((resolve) => {
          finishPrefetch = resolve;
        });
      }
      return Promise.resolve(thumbnail(ref.key));
    });
    const store = createMediaResourceStore({
      lookup,
      produce,
      save: async () => saved(),
      createObjectUrl: () => "blob:interactive"
    });
    const firstUnsubscribe = store.subscribe(firstRef, consumer([], [], "prefetch"));
    await flushTasks();
    expect(prefetchSignal).toBeDefined();

    const secondPresentations: Presentation[] = [];
    const secondUnsubscribe = store.subscribe(secondRef, consumer(secondPresentations, [], "interactive"));
    await flushTasks();

    expect(prefetchSignal?.aborted).toBe(false);
    expect(secondPresentations).toHaveLength(0);
    expect(produce).toHaveBeenCalledOnce();
    finishPrefetch(thumbnail(firstRef.key));
    await flushTasks();
    expect(secondPresentations).toHaveLength(1);
    expect(produce).toHaveBeenCalledTimes(2);
    firstUnsubscribe();
    secondUnsubscribe();
    store.dispose();
  });

  it("finishes and persists after the last card leaves, then reuses that disk result", async () => {
    let diskSaved = false;
    const lookup = vi.fn(async (): Promise<HistoryCoverLookup> => diskSaved
      ? { state: "hit", sourceRevision: "revision-retry", url: "studio-media://cover/saved.jpg" }
      : { state: "miss", sourceRevision: "revision-retry" });
    let firstSignal: AbortSignal | undefined;
    let finish!: (value: ProducedThumbnail) => void;
    const produce = vi.fn((_ref: MediaRef, _revision: string, signal: AbortSignal) => {
      firstSignal = signal;
      return new Promise<ProducedThumbnail>((resolve) => { finish = resolve; });
    });
    const save = vi.fn(async () => { diskSaved = true; return saved(); });
    const store = createMediaResourceStore({
      lookup,
      produce,
      save,
      createObjectUrl: () => "blob:retry"
    });
    const first: Presentation[] = [];
    const unsubscribeFirst = store.subscribe(mediaRef(), consumer(first));

    await flushTasks();
    expect(produce).toHaveBeenCalledOnce();
    unsubscribeFirst();
    expect(firstSignal?.aborted).toBe(false);
    finish(thumbnail("revision-retry")); await flushTasks();
    expect(save).toHaveBeenCalledOnce(); expect(first).toHaveLength(0);

    const second: Presentation[] = [];
    const unsubscribeSecond = store.subscribe(mediaRef(), consumer(second));
    await flushTasks();

    expect(produce).toHaveBeenCalledOnce();
    expect(second).toHaveLength(1);
    expect(second[0]?.origin).toBe("disk");
    unsubscribeSecond();
    store.dispose();
  });

  it("shares an unfinished lookup across scrolling away and back without canceling or duplicating it", async () => {
    let resolveFirstLookup!: (result: HistoryCoverLookup) => void;
    let lookupCalls = 0;
    let firstSignal: AbortSignal | undefined;
    const lookup = vi.fn((_ref: MediaRef, signal: AbortSignal) => {
      lookupCalls += 1;
      if (lookupCalls === 1) {
        firstSignal = signal;
        return new Promise<HistoryCoverLookup>((resolve) => {
          resolveFirstLookup = resolve;
        });
      }
      return Promise.resolve<HistoryCoverLookup>({
        state: "hit",
        url: "studio-media://cover/retried.jpg?v=1",
        sourceRevision: "revision-retried"
      });
    });
    const presentations: Presentation[] = [];
    const store = createMediaResourceStore({
      lookup,
      produce: async () => thumbnail("revision-retried"),
      save: async () => saved()
    });
    const first = store.subscribe(mediaRef(), consumer(presentations));
    await flushTasks();
    first();
    expect(firstSignal?.aborted).toBe(false);

    const second = store.subscribe(mediaRef(), consumer(presentations));
    await flushTasks();

    expect(lookup).toHaveBeenCalledOnce();
    resolveFirstLookup({ state: "hit", url: "studio-media://cover/old.jpg", sourceRevision: "old" });
    await flushTasks();
    expect(presentations).toHaveLength(1);
    second();
    store.dispose();
  });

  it("removes a consumer when its signal aborts and does not deliver late results", async () => {
    let resolveLookup!: (result: HistoryCoverLookup) => void;
    const controller = new AbortController();
    const presentations: Presentation[] = [];
    const store = createMediaResourceStore({
      lookup: vi.fn(() => new Promise<HistoryCoverLookup>((resolve) => {
        resolveLookup = resolve;
      })),
      produce: async () => thumbnail("revision-aborted-consumer"),
      save: async () => saved()
    });

    store.subscribe(mediaRef(), {
      priority: "interactive",
      signal: controller.signal,
      onPresentation: (value) => {
        presentations.push(value);
        return true;
      },
      onFailure: vi.fn()
    });
    await flushTasks();
    controller.abort();
    resolveLookup({
      state: "hit",
      url: "studio-media://cover/late.jpg",
      sourceRevision: "revision-aborted-consumer"
    });
    await flushTasks();

    expect(presentations).toHaveLength(0);
    store.dispose();
  });

  it("does not let an in-flight save repopulate an invalidated resource", async () => {
    const nextLookup = new Promise<HistoryCoverLookup>(() => undefined);
    let lookupCalls = 0;
    const lookup = vi.fn(async (): Promise<HistoryCoverLookup> => {
      lookupCalls += 1;
      if (lookupCalls === 1) return { state: "miss", sourceRevision: "revision-delete" };
      return nextLookup;
    });
    let resolveSave!: (result: HistoryCoverSaveResult) => void;
    const save = vi.fn(() => new Promise<HistoryCoverSaveResult>((resolve) => {
      resolveSave = resolve;
    }));
    const revoked: string[] = [];
    const presentations: Presentation[] = [];
    const store = createMediaResourceStore({
      lookup,
      produce: async () => thumbnail("revision-delete"),
      save,
      createObjectUrl: () => "blob:to-revoke",
      revokeObjectUrl: (url) => revoked.push(url)
    });
    const unsubscribe = store.subscribe(mediaRef(), consumer(presentations));
    await flushTasks();
    expect(save).toHaveBeenCalledOnce();

    const countBeforeInvalidate = presentations.length;
    store.invalidate(["history-key"]);
    expect(revoked).toContain("blob:to-revoke");
    resolveSave(saved("studio-media://cover/should-not-return.jpg"));
    await flushTasks();

    expect(presentations).toHaveLength(countBeforeInvalidate);
    unsubscribe();
    store.dispose();
  });

  it("rechecks a previously missed key so an external save can become visible", async () => {
    let lookupCalls = 0;
    const lookup = vi.fn(async (): Promise<HistoryCoverLookup> => {
      lookupCalls += 1;
      return lookupCalls === 1
        ? { state: "miss", sourceRevision: "revision-external" }
        : {
          state: "hit",
          url: "studio-media://cover/external.jpg?v=2",
          sourceRevision: "revision-external"
        };
    });
    const produce = vi.fn(async (): Promise<ProducedThumbnail> => thumbnail("revision-external"));
    const presentations: Presentation[] = [];
    const store = createMediaResourceStore({
      lookup,
      produce,
      save: async () => saved(),
      createObjectUrl: () => "blob:external"
    });
    const unsubscribe = store.subscribe(mediaRef(), consumer(presentations));
    await flushTasks();
    expect(presentations[0]?.origin).toBe("generated");

    store.invalidate(["history-key"]);
    await flushTasks();

    expect(lookup).toHaveBeenCalledTimes(2);
    expect(produce).toHaveBeenCalledOnce();
    expect(presentations.at(-1)).toMatchObject({
      origin: "disk",
      phase: "final",
      url: "studio-media://cover/external.jpg?v=2"
    });
    unsubscribe();
    store.dispose();
  });

  it("keeps generated results bounded when many keys leave the viewport", async () => {
    const revoked: string[] = [];
    let urlSequence = 0;
    const store = createMediaResourceStore({
      lookup: async () => ({ state: "unavailable" } as const),
      produce: async (_ref, sourceRevision) => thumbnail(sourceRevision),
      save: async () => saved(),
      createObjectUrl: () => `blob:lru-${++urlSequence}`,
      revokeObjectUrl: (url) => revoked.push(url)
    });

    for (let index = 0; index < 300; index += 1) {
      const unsubscribe = store.subscribe(mediaRef({
        key: `lru-${index}`,
        sourcePath: "",
        sourceUrl: `studio-media://history/lru-${index}.png`
      }), consumer([]));
      await flushTasks();
      unsubscribe();
    }

    expect(revoked.length).toBeGreaterThanOrEqual(44);
    expect(revoked.length).toBeLessThan(300);
    store.dispose();
  });

  it("can generate a protocol-only source without attempting lookup or persistence", async () => {
    const lookup = vi.fn(async (): Promise<HistoryCoverLookup> => ({
      state: "unavailable"
    }));
    const save = vi.fn(async (): Promise<HistoryCoverSaveResult> => saved());
    const revisions: string[] = [];
    const presentations: Presentation[] = [];
    const store = createMediaResourceStore({
      lookup,
      produce: async (_ref, sourceRevision) => {
        revisions.push(sourceRevision);
        return thumbnail(sourceRevision);
      },
      save,
      createObjectUrl: () => "blob:protocol-only"
    });
    const unsubscribe = store.subscribe(mediaRef({
      sourcePath: "",
      sourceUrl: "studio-media://history/protocol-only.png"
    }), consumer(presentations));

    await flushTasks();

    expect(lookup).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(revisions).toEqual([""]);
    expect(presentations[0]).toMatchObject({ origin: "generated", phase: "final", sourceRevision: "" });
    unsubscribe();
    store.dispose();
  });
});
