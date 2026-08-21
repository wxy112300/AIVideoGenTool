import { describe, expect, it, vi } from "vitest";
import { PromptRuntimeManager } from "../electron/services/prompt-runtime-manager";
import type { PromptRuntimeServiceFacts } from "../src/core/prompt-runtime-state";

function service(
  phase: PromptRuntimeServiceFacts["phase"] = "ready",
  operationId = 1
): PromptRuntimeServiceFacts {
  return {
    phase,
    ownership: "app",
    endpoint: "http://127.0.0.1:8188",
    message: phase,
    updatedAt: new Date(operationId).toISOString(),
    operationId
  };
}

describe("PromptRuntimeManager", () => {
  it("owns one operation and exposes the exact submitted prompt ID", () => {
    const manager = new PromptRuntimeManager(service());
    const lease = manager.beginOperation("video-create", true, "submitting");
    manager.markSubmitted(lease.operationId, "prompt-42");

    const cancellation = manager.requestCancellation();
    expect(cancellation).toMatchObject({
      operationId: lease.operationId,
      promptId: "prompt-42",
      phase: "queued"
    });
    expect(lease.signal.aborted).toBe(true);
    expect(manager.snapshot().service.phase).toBe("ready");
  });

  it("cancels startup before a prompt exists without inventing a queue ID", () => {
    const manager = new PromptRuntimeManager(service("stopped"));
    const lease = manager.beginOperation("image-edit", true);
    const cancellation = manager.requestCancellation();

    expect(cancellation.promptId).toBeNull();
    expect(cancellation.phase).toBe("preparing-service");
    expect(lease.signal.aborted).toBe(true);
    manager.markSubmitted(lease.operationId, "late-prompt");
    expect(manager.snapshot().operation.promptId).toBeNull();
  });

  it("immediately invalidates the model and operation when ComfyUI exits", () => {
    const manager = new PromptRuntimeManager(service());
    const listener = vi.fn();
    manager.subscribe(listener);
    manager.setModel("resident", "qwen-vl");
    const lease = manager.beginOperation("video-create", true, "submitting");

    manager.observeService(service("stopped", 2));

    expect(lease.signal.aborted).toBe(true);
    expect(manager.snapshot()).toMatchObject({
      service: { phase: "stopped" },
      model: { phase: "unloaded", modelId: null },
      operation: { phase: "terminal", terminalStatus: "failed" }
    });
    expect(listener).toHaveBeenCalled();
  });

  it("rejects a second concurrent prompt operation", () => {
    const manager = new PromptRuntimeManager(service());
    manager.beginOperation("video-create", true);
    expect(() => manager.beginOperation("image-edit", true)).toThrow(
      "当前已有提示词任务正在运行。"
    );
  });
});
