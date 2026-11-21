import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { JsonStore } from "../electron/store";
import { MigratingUserDataRepository } from "../electron/services/user-data-migration";
import { HistoryMetadataService } from "../electron/services/history-metadata-service";
import { createDefaultState } from "../src/core/defaults";
import { applyHistoryMetadataChanges } from "../src/core/history-metadata";
import { createHistoryPerformanceFixture } from "./fixtures/history-performance";
import type { AppLogger } from "../src/infrastructure/app-logger";

describe("compact history curation", () => {
  it("retains media identities and ignores duplicate/stale replies or deleted items", () => {
    const state = createDefaultState();
    state.history = createHistoryPerformanceFixture(3).videos;
    const item = state.history[0]!;
    const change = { id: item.id, favorite: true, rating: 4 as const, tags: ["scene"], previous: { favorite: item.favorite, rating: item.rating, tags: item.tags } };
    const next = applyHistoryMetadataChanges(state, [change]);
    expect(next.history[0]!.versions).toBe(item.versions);
    expect(next.history[1]).toBe(state.history[1]);
    expect(next.draft).toBe(state.draft);
    expect(applyHistoryMetadataChanges(next, [change])).toBe(next);
    const newer = applyHistoryMetadataChanges(next, [{ ...change, rating: 5, previous: change }]);
    expect(applyHistoryMetadataChanges(newer, [change])).toBe(newer);
    expect(applyHistoryMetadataChanges({ ...next, history: [] }, [change]).history).toEqual([]);
  });

  it("durably edits mixed video/image metadata without cloning or broadcasting the full library", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-curation-test-"));
    const state = createDefaultState(), fixture = createHistoryPerformanceFixture(3);
    state.history = fixture.videos; state.imageHistory = fixture.images.slice(1);
    const filename = path.join(root, "state.json");
    await fs.writeFile(filename, JSON.stringify(state));
    const store = new JsonStore(filename, { libraryDirectory: path.join(root, "library"), onCommittedNeeded: () => false });
    try {
      await store.load();
      const sendState = vi.fn(), sendMetadataChanges = vi.fn();
      const metadata = new HistoryMetadataService({ store: new MigratingUserDataRepository(store), logger: { info: vi.fn() } as unknown as AppLogger, sendState, sendMetadataChanges });
      const get = vi.spyOn(store, "get").mockImplementation(() => { throw Error("full snapshot forbidden"); });
      const clone = structuredClone;
      const spy = vi.spyOn(globalThis, "structuredClone").mockImplementation((value: unknown) => {
        if (value && typeof value === "object" && "history" in value && (value as { history: unknown[] }).history.length) throw Error("full library clone forbidden");
        return clone(value);
      });
      let changes;
      try {
        changes = await metadata.patchMetadata([
          { assetId: fixture.videos[0]!.id, patch: { favorite: true, rating: 4.5, tags: [" scene "] } },
          { assetId: fixture.images[1]!.id, patch: { favorite: true } }
        ]);
        expect(changes).toHaveLength(2);
        expect(Buffer.byteLength(JSON.stringify(changes))).toBeLessThan(1024);
        expect(sendState).not.toHaveBeenCalled();
        expect(sendMetadataChanges).toHaveBeenCalledWith(changes);
        await expect(metadata.patchMetadata([{ assetId: "missing", patch: { favorite: true } }])).rejects.toThrow();
        await expect(store.updateHistoryMetadata([fixture.videos[0]!.id], items => { items[0]!.rating = 1; throw Error("rollback"); })).rejects.toThrow("rollback");
      } finally { spy.mockRestore(); get.mockRestore(); }
      expect(store.get().history[0]).toMatchObject({ favorite: true, rating: 4.5, tags: ["scene"] });
      await store.close();
      const reopened = new JsonStore(filename);
      try {
        const recovered = await reopened.load();
        expect(recovered.history[0]).toMatchObject({ favorite: true, rating: 4.5, tags: ["scene"] });
        expect(recovered.imageHistory[0]!.favorite).toBe(true);
      } finally { await reopened.close(); }
    } finally {
      await store.close();
      if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith("lvs-curation-test-")) throw Error("Unsafe cleanup");
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
