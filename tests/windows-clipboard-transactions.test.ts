import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
const native = vi.hoisted(() => ({ calls: [] as Array<{ paths: string[]; done: (error: Error | null, stdout?: string) => void }> }));
vi.mock("node:child_process", () => ({ execFile: vi.fn((_file, _args, options, done) => native.calls.push({ paths: JSON.parse(options.env.AIVIDEO_CLIPBOARD_FILES_JSON), done })) }));
import { copyFilesToWindowsClipboard } from "../electron/services/windows-clipboard";
const roots: string[] = [];
afterEach(async () => {
  native.calls.length = 0;
  const parent = path.resolve("temp");
  for (const root of roots.splice(0)) { if (path.dirname(root) !== parent) throw new Error("Unexpected test cleanup root"); await fs.rm(root, { recursive: true, force: true }); }
});
it("serializes writes and retains previous file-drop paths for an in-progress paste", async () => {
  const root = await fs.mkdtemp(path.resolve("temp", "clipboard-test-")); roots.push(root);
  const file = path.join(root, "source.txt"); await fs.writeFile(file, "original");
  const staging = path.join(root, "staging");
  const first = copyFilesToWindowsClipboard([file], staging), second = copyFilesToWindowsClipboard([file], staging);
  await vi.waitFor(() => expect(native.calls).toHaveLength(1));
  native.calls[0]!.done(null, ""); await first;
  await vi.waitFor(() => expect(native.calls).toHaveLength(2));
  expect(await fs.readFile(native.calls[0]!.paths[0]!, "utf8")).toBe("original");
  native.calls[1]!.done(null, ""); await second;
  expect(await fs.readFile(native.calls[1]!.paths[0]!, "utf8")).toBe("original");
  expect(await fs.readFile(file, "utf8")).toBe("original");
  expect(await fs.readFile(native.calls[0]!.paths[0]!, "utf8")).toBe("original");
  expect(await fs.readdir(staging)).toHaveLength(2);
});
it("prunes expired staging without removing recent or current clipboard files", async () => {
  const root = await fs.mkdtemp(path.resolve("temp", "clipboard-test-")); roots.push(root);
  const file = path.join(root, "source.txt"); await fs.writeFile(file, "original");
  const staging = path.join(root, "staging");
  const expired = path.join(staging, "expired"); await fs.mkdir(expired, { recursive: true });
  await fs.writeFile(path.join(expired, "old.txt"), "old");
  const old = new Date(Date.now() - 48 * 60 * 60 * 1000); await fs.utimes(expired, old, old);
  const copying = copyFilesToWindowsClipboard([file], staging);
  await vi.waitFor(() => expect(native.calls).toHaveLength(1));
  native.calls[0]!.done(null, ""); await copying;
  expect(await fs.readdir(staging)).toEqual([path.basename(path.dirname(native.calls[0]!.paths[0]!))]);
  expect(await fs.readFile(file, "utf8")).toBe("original");
});
it("does not poison the clipboard queue after a failed native write", async () => {
  const root = await fs.mkdtemp(path.resolve("temp", "clipboard-test-")); roots.push(root);
  const file = path.join(root, "source.txt"); await fs.writeFile(file, "original");
  const first = copyFilesToWindowsClipboard([file], path.join(root, "staging"));
  const rejected = expect(first).rejects.toThrow("busy");
  const second = copyFilesToWindowsClipboard([file], path.join(root, "staging"));
  await vi.waitFor(() => expect(native.calls).toHaveLength(1));
  native.calls[0]!.done(new Error("busy")); await rejected;
  await vi.waitFor(() => expect(native.calls).toHaveLength(2));
  native.calls[1]!.done(null, ""); await second;
  expect(await fs.readFile(native.calls[1]!.paths[0]!, "utf8")).toBe("original");
});
