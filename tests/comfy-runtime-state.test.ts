import { describe, expect, it, vi } from "vitest";
import { ComfyRuntimeStateController } from "../electron/services/comfy-runtime-state";

describe("ComfyUI runtime state controller", () => {
  it("does not let an old operation overwrite a newer transition", () => {
    const controller = new ComfyRuntimeStateController();
    const first = controller.begin("starting", "http://127.0.0.1:8188", "starting", "app");
    const second = controller.begin("restarting", "http://127.0.0.1:8188", "restarting", "app");

    controller.finish(first, "ready", "stale ready", "app");
    expect(controller.snapshot().phase).toBe("restarting");
    controller.finish(second, "ready", "ready", "app");
    expect(controller.snapshot()).toMatchObject({ phase: "ready", ownership: "app" });
  });

  it("keeps starting authoritative while a health probe still sees the port offline", () => {
    const controller = new ComfyRuntimeStateController();
    controller.begin("starting", "http://127.0.0.1:8188", "starting", "app");
    controller.observeReachability(false, "http://127.0.0.1:8188");
    expect(controller.snapshot().phase).toBe("starting");
  });

  it("marks a previously ready service degraded instead of claiming it stopped after one failed probe", () => {
    const controller = new ComfyRuntimeStateController();
    const operation = controller.begin("starting", "http://127.0.0.1:8188", "starting", "app");
    controller.finish(operation, "ready", "ready", "app");
    controller.observeReachability(false, "http://127.0.0.1:8188");
    expect(controller.snapshot()).toMatchObject({ phase: "degraded", ownership: "app" });
  });

  it("marks a service stopped after a second consecutive failed probe", () => {
    const controller = new ComfyRuntimeStateController();
    controller.observeReachability(true, "http://127.0.0.1:8188", "external");
    controller.observeReachability(false, "http://127.0.0.1:8188", "external");
    controller.observeReachability(false, "http://127.0.0.1:8188", "external");
    expect(controller.snapshot()).toMatchObject({ phase: "stopped", ownership: "external" });
  });

  it("keeps an app-owned runtime ready while an active task blocks HTTP probes", () => {
    const controller = new ComfyRuntimeStateController();
    const operation = controller.begin("starting", "http://127.0.0.1:8188", "starting", "app");
    controller.finish(operation, "ready", "ready", "app");

    controller.observeReachability(false, "http://127.0.0.1:8188", "app", true);
    controller.observeReachability(false, "http://127.0.0.1:8188", "app", true);

    expect(controller.snapshot()).toMatchObject({
      phase: "ready",
      ownership: "app",
      message: "ComfyUI 正在执行任务；接口可能暂时无法响应。"
    });
  });

  it("publishes transitions and resolves startup waiters only after settling", async () => {
    vi.useFakeTimers();
    const controller = new ComfyRuntimeStateController();
    const listener = vi.fn();
    controller.subscribe(listener);
    const operation = controller.begin("starting", "http://127.0.0.1:8188", "starting", "app");
    const settled = controller.waitForSettled(5_000);
    controller.finish(operation, "ready", "ready", "app");
    await expect(settled).resolves.toMatchObject({ phase: "ready" });
    expect(listener).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
