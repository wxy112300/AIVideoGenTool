import { describe, expect, it, vi } from "vitest";
import { ComfyRuntimeStateController } from "../src/infrastructure/comfy-runtime-state";
import { createNativeTranslator } from "../electron/ui-translator";

describe("ComfyUI runtime state controller", () => {
  it.each(["zh-CN", "en-US", "zh-TW"] as const)("keeps ownership and probe hysteresis while changing new messages (%s)", locale => {
    const controller = new ComfyRuntimeStateController(), t = createNativeTranslator(locale).t, endpoint = "http://127.0.0.1:8188";
    const operation = controller.begin("starting", endpoint, "USER_TEXT_原始诊断", "app");
    expect(controller.observeReachability(false, endpoint, "app", false, t).message).toBe("USER_TEXT_原始诊断");
    controller.finish(operation, "ready", "ready", "app");
    expect(controller.observeReachability(false, endpoint, "app", true, t)).toMatchObject({ phase: "ready", ownership: "app", operationId: operation,
      message: expect.stringContaining({ "zh-CN": "正在执行任务", "en-US": "running a task", "zh-TW": "正在執行任務" }[locale]) });
    expect(controller.observeReachability(false, endpoint, "app", false, t)).toMatchObject({ phase: "degraded", ownership: "app",
      message: expect.stringContaining({ "zh-CN": "继续检查", "en-US": "checking again", "zh-TW": "繼續檢查" }[locale]) });
    expect(controller.observeReachability(false, endpoint, "app", false, t)).toMatchObject({ phase: "stopped", ownership: "app",
      message: expect.stringContaining({ "zh-CN": "当前未连接", "en-US": "currently disconnected", "zh-TW": "目前未連線" }[locale]) });
    expect(controller.observeReachability(true, endpoint, "app", false, t)).toMatchObject({ phase: "ready", ownership: "app",
      message: expect.stringContaining({ "zh-CN": "已连接并可用", "en-US": "connected and available", "zh-TW": "已連線且可用" }[locale]) });
    controller.finish(operation, "error", "EACCES · 使用者原文", "app");
    expect(controller.snapshot().message).toBe("EACCES · 使用者原文");
  });
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
