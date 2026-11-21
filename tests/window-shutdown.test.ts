// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { WindowShutdown } from "../electron/services/window-shutdown";
import { renderWindowCloseDialog } from "../src/renderer/shell/dialogs";
import { createTranslator } from "../src/core/i18n";

it("coalesces close clicks and waits for services then durable storage", async () => {
  let stopped!: () => void, saved!: () => void;
  const stopServices = vi.fn(() => new Promise<void>(resolve => { stopped = resolve; }));
  const saveStorage = vi.fn(() => new Promise<void>(resolve => { saved = resolve; }));
  const onStage = vi.fn(), onComplete = vi.fn(), onError = vi.fn();
  const shutdown = new WindowShutdown({ stopServices, saveStorage, onStage, onComplete, onError });
  const first = shutdown.finish();
  expect(shutdown.finish()).toBe(first);
  await Promise.resolve();
  expect(stopServices).toHaveBeenCalledOnce();
  expect(saveStorage).not.toHaveBeenCalled();
  expect(onStage).toHaveBeenCalledWith("services");
  stopped();
  await vi.waitFor(() => expect(saveStorage).toHaveBeenCalledOnce());
  expect(shutdown.finish()).toBe(first);
  expect(onComplete).not.toHaveBeenCalled();
  saved(); await first;
  expect(onStage.mock.calls.flat()).toEqual(["services", "storage"]);
  expect(onComplete).toHaveBeenCalledOnce();
  expect(onError).not.toHaveBeenCalled();
});

it("retains the window after a storage failure and retries without stopping services again", async () => {
  const failure = new Error("storage unavailable");
  const stopServices = vi.fn(async () => {}), saveStorage = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue(undefined);
  const onError = vi.fn(), onComplete = vi.fn();
  const shutdown = new WindowShutdown({ stopServices, saveStorage, onStage: vi.fn(), onError, onComplete });
  await shutdown.finish();
  expect(onError).toHaveBeenCalledWith(failure);
  expect(onComplete).not.toHaveBeenCalled();
  await shutdown.finish();
  expect(stopServices).toHaveBeenCalledOnce();
  expect(saveStorage).toHaveBeenCalledTimes(2);
  expect(onComplete).toHaveBeenCalledOnce();
});

it("does not close storage when service shutdown fails and allows a retry", async () => {
  const stopServices = vi.fn().mockRejectedValueOnce(new Error("still running")).mockResolvedValue(undefined);
  const saveStorage = vi.fn(async () => {}), onComplete = vi.fn();
  const shutdown = new WindowShutdown({ stopServices, saveStorage, onStage: vi.fn(), onError: vi.fn(), onComplete });
  await shutdown.finish(); expect(saveStorage).not.toHaveBeenCalled();
  await shutdown.finish(); expect(stopServices).toHaveBeenCalledTimes(2); expect(onComplete).toHaveBeenCalledOnce();
});

it("shows shutdown progress without cancellation and exposes recovery only after failure", () => {
  const options = { t: createTranslator("zh-CN").t, responseBusy: false, icon: () => "" };
  document.body.innerHTML = renderWindowCloseDialog({ ...options, request: { kind: "closing", shutdownStage: "storage" } });
  expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  expect(document.querySelector('[role="status"]')?.textContent).toBe("正在保存数据");
  expect(document.querySelector("button")).toBeNull();
  document.body.innerHTML = renderWindowCloseDialog({ ...options, request: { kind: "closing", shutdownError: '<unsafe>write failed' } });
  expect(document.querySelector("unsafe")).toBeNull();
  expect(document.querySelector("#retry-window-close")).not.toBeNull();
  expect(document.querySelector("#cancel-window-close")).toBeNull();
});
