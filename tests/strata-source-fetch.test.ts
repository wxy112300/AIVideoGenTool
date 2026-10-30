import { afterEach, expect, it, vi } from "vitest";
import { fetchStrataSource } from "../electron/services/strata-source-fetch";
import { InstallationCancellation } from "../electron/services/installation-cancellation";

afterEach(() => vi.restoreAllMocks());
const args = ["--depth=1", "origin", "a".repeat(40)];
const failed = (stdout: string) => Object.assign(new Error("命令退出，代码 128"), { stdout, code: 128 });

it("retries the reported HTTP/2 truncated pack using HTTP/1.1 without changing the commit", async () => {
  const run = vi.fn().mockRejectedValueOnce(failed("error: RPC failed; curl 92 HTTP/2 stream 5 was not closed cleanly: CANCEL (err 8)\nfatal: early EOF\nfatal: fetch-pack: invalid index-pack output")).mockResolvedValue("");
  const log = vi.fn(), wait = vi.fn(async () => undefined);
  await fetchStrataSource("C:/fixture", args, run, log, undefined, wait);
  expect(run).toHaveBeenCalledTimes(2);
  for (const [exe, actual, cwd, timeout] of run.mock.calls) {
    expect(exe).toBe("git.exe");
    expect(actual).toEqual(["-c", "http.version=HTTP/1.1", "fetch", ...args]);
    expect(cwd).toBe("C:/fixture");
    expect(timeout).toBeGreaterThan(0); expect(timeout).toBeLessThanOrEqual(600_000);
  }
  expect(wait).toHaveBeenCalledWith(1000, undefined);
  expect(log).toHaveBeenCalledTimes(1);
});

it("stops after three transient failures and preserves the original diagnostic", async () => {
  const error = failed("fatal: early EOF");
  const run = vi.fn().mockRejectedValue(error), wait = vi.fn(async () => undefined);
  await expect(fetchStrataSource("fixture", args, run, vi.fn(), undefined, wait)).rejects.toBe(error);
  expect(run).toHaveBeenCalledTimes(3);
  expect(wait.mock.calls.map(call => call[0])).toEqual([1000, 2000]);
});

it.each(["fatal: Authentication failed", "fatal: repository 'https://example.invalid/repo' not found", "SSL certificate problem", "fatal: couldn't find remote ref main", "fatal: detected dubious ownership", "fatal: unknown command"])("does not retry a permanent or unknown error: %s", async detail => {
  const error = failed(detail), run = vi.fn().mockRejectedValue(error), wait = vi.fn(async () => undefined);
  await expect(fetchStrataSource("fixture", args, run, vi.fn(), undefined, wait)).rejects.toBe(error);
  expect(run).toHaveBeenCalledTimes(1); expect(wait).not.toHaveBeenCalled();
});

it("bounds all attempts by one ten-minute deadline", async () => {
  let now = 0; vi.spyOn(Date, "now").mockImplementation(() => now);
  const run = vi.fn(async () => { now = 600_001; throw failed("early EOF"); });
  await expect(fetchStrataSource("fixture", args, run, vi.fn())).rejects.toThrow("128");
  expect(run).toHaveBeenCalledTimes(1);
});

it("cancels during retry backoff without issuing a second fetch", async () => {
  const registry = new InstallationCancellation();
  const run = vi.fn().mockRejectedValue(failed("early EOF"));
  let waiting!: () => void;
  const entered = new Promise<void>(resolve => { waiting = resolve; });
  const pending = registry.run("strata", async () => {
    await fetchStrataSource("fixture", args, run, vi.fn(), undefined, async (_ms, signal) => {
      waiting();
      await new Promise<void>((_resolve, reject) => signal!.addEventListener("abort", () => reject(signal!.reason), { once: true }));
    });
    return { ok: true, message: "installed" };
  });
  await entered;
  expect(await registry.cancel("strata")).toMatchObject({ ok: true, cancelled: true });
  expect(await pending).toMatchObject({ ok: false, cancelled: true });
  expect(run).toHaveBeenCalledTimes(1);
});

it("does not launch another fetch when backoff exhausts the shared deadline", async () => {
  let now = 0; vi.spyOn(Date, "now").mockImplementation(() => now);
  const error = failed("early EOF"), run = vi.fn(async () => { now = 599_999; throw error; });
  await expect(fetchStrataSource("fixture", args, run, vi.fn(), undefined, async () => { now += 1000; })).rejects.toBe(error);
  expect(run).toHaveBeenCalledTimes(1);
});
