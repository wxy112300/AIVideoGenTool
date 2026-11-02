// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { LibraryRefresh } from "../src/web/refresh";
import { mediaTimestamp } from "../src/web/ui";
import type { BrowseLibraryInfo } from "../src/core/lan-browser";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const info = (revision: string, refreshError = false): BrowseLibraryInfo =>
  ({ revision, refreshError, count: 1, locale: "zh-CN", models: [], tags: [] });
function fixture() {
  const deps = { info: vi.fn(async () => info("new")), load: vi.fn(async () => true),
    accept: vi.fn(), failed: vi.fn(), canRefresh: vi.fn(() => true) };
  return { deps, refresh: new LibraryRefresh("old", deps) };
}
it("automatically loads changed revisions, preserves the list, and retries a failed load", async () => {
  const f = fixture(); f.deps.load.mockResolvedValueOnce(false);
  await f.refresh.check(); expect(f.deps.accept).not.toHaveBeenCalled();
  await f.refresh.check(); expect(f.deps.load).toHaveBeenCalledTimes(2);
  await f.refresh.check(); expect(f.deps.load).toHaveBeenCalledTimes(2);
  expect(f.deps.accept).toHaveBeenCalledWith(info("new"));
  await f.refresh.check(true);
  expect(f.deps.info).toHaveBeenLastCalledWith(true);
  expect(f.deps.load).toHaveBeenCalledTimes(3);
});
it("defers updates while playing, filtering or hidden, including a response arriving after opening the player", async () => {
  const f = fixture(); f.deps.canRefresh.mockReturnValue(false);
  await f.refresh.check(); expect(f.deps.info).not.toHaveBeenCalled();
  f.deps.canRefresh.mockReturnValue(true);
  let resolve!: (value: BrowseLibraryInfo) => void;
  f.deps.info.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const checking = f.refresh.check(); f.deps.canRefresh.mockReturnValue(false); resolve(info("new")); await checking;
  expect(f.deps.load).not.toHaveBeenCalled();
  f.deps.canRefresh.mockReturnValue(true); await f.refresh.check();
  expect(f.deps.load).toHaveBeenCalledOnce();
});
it("performs a forced disk check requested during an automatic request without parallel list loads", async () => {
  const f = fixture();
  let resolve!: (value: BrowseLibraryInfo) => void;
  f.deps.info.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const checking = f.refresh.check();
  const manual = f.refresh.check(true);
  expect(manual).toBe(checking); expect(f.deps.info).toHaveBeenCalledOnce();
  resolve(info("old")); await manual;
  expect(f.deps.info.mock.calls).toEqual([[false], [true]]);
  expect(f.deps.load).toHaveBeenCalledOnce();
});
it("keeps the last valid data on incomplete synchronization and allows a later retry", async () => {
  const f = fixture(); f.deps.info.mockResolvedValueOnce(info("old", true));
  await f.refresh.check(true); expect(f.deps.failed).toHaveBeenCalledWith(true);
  f.deps.info.mockRejectedValueOnce(new Error("offline"));
  await f.refresh.check(true); expect(f.deps.failed).toHaveBeenLastCalledWith(false);
  await f.refresh.check(); expect(f.deps.accept).toHaveBeenLastCalledWith(info("new"));
});
it("shows render completion date and seconds in local time and omits invalid dates", () => {
  const local = new Date(2026, 10, 3, 4, 5, 6);
  expect(mediaTimestamp(local.toISOString())).toEqual({ date: "2026-11-03", time: "04:05:06" });
  expect(mediaTimestamp("invalid")).toBeNull(); expect(mediaTimestamp("")).toBeNull();
});
