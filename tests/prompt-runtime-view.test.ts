import { describe, expect, it } from "vitest";
import {
  projectPromptRuntimeView
} from "../src/core/prompt-runtime-view";
import type {
  PromptModelPhase,
  PromptOperationOrigin,
  PromptOperationPhase,
  PromptRuntimeServicePhase,
  PromptRuntimeState
} from "../src/core/prompt-runtime-state";

function snapshot(
  service: PromptRuntimeServicePhase,
  model: PromptModelPhase,
  operation: PromptRuntimeState["operation"] = idleOperation()
): PromptRuntimeState {
  return {
    service: {
      phase: service,
      ownership: "app",
      endpoint: "http://127.0.0.1:8188",
      message: "",
      updatedAt: "2026-08-21T00:00:00.000Z",
      operationId: 1
    },
    model: {
      phase: model,
      modelId: model === "warming" || model === "resident" || model === "unloading"
        ? "prompt-model"
        : null
    },
    operation
  };
}

function operation(
  origin: PromptOperationOrigin,
  phase: PromptOperationPhase
): Exclude<PromptRuntimeState["operation"], { phase: "idle" | "terminal" }> {
  return {
    origin,
    phase: phase as Exclude<PromptOperationPhase, "idle" | "terminal">,
    operationId: "prompt-op-1",
    promptId: phase === "queued" || phase === "running" ? "prompt-1" : null,
    startedAt: 1_000,
    retainModel: true,
    terminalStatus: null,
    terminalReason: null,
    finishedAt: null
  };
}

function idleOperation(): PromptRuntimeState["operation"] {
  return {
    phase: "idle",
    operationId: null,
    origin: null,
    promptId: null,
    startedAt: null,
    retainModel: false,
    terminalStatus: null,
    terminalReason: null,
    finishedAt: null
  };
}

function terminalOperation(origin: PromptOperationOrigin): PromptRuntimeState["operation"] {
  return {
    phase: "terminal",
    operationId: "prompt-op-terminal",
    origin,
    promptId: "prompt-1",
    startedAt: 1_000,
    retainModel: true,
    terminalStatus: "completed",
    terminalReason: null,
    finishedAt: 2_000
  };
}

describe("projectPromptRuntimeView", () => {
  it.each([
    ["stopped", "unloaded"],
    ["stopped", "unknown"],
    ["stopped", "resident"]
  ] as const)("recovers both controls after ComfyUI is %s with model %s", (service, model) => {
    const view = projectPromptRuntimeView(snapshot(service, model), "video-create");

    expect(view.left).toMatchObject({
      icon: "play",
      disabled: false,
      busy: false,
      intent: "start"
    });
    expect(view.right).toMatchObject({
      icon: "sparkles",
      disabled: false,
      busy: false,
      action: "enhance",
      showElapsed: false
    });
  });

  it.each([
    ["ready", "unloaded", "idle"],
    ["ready", "unknown", "idle"],
    ["ready", "resident", "terminal"]
  ] as const)("allows enhancement and model start when service is %s and model is %s after %s operation", (service, model, operationStatus) => {
    const operationState = operationStatus === "terminal" ? terminalOperation("image-edit") : idleOperation();
    const view = projectPromptRuntimeView(snapshot(service, model, operationState), "image-edit");

    expect(view.left).toMatchObject(model === "resident"
      ? { icon: "square", disabled: false, intent: "stop" }
      : { icon: "play", disabled: false, intent: "start" });
    expect(view.right).toMatchObject({ icon: "sparkles", disabled: false, action: "enhance", showElapsed: false });
  });

  it("shows a static stop affordance when the model is resident", () => {
    const view = projectPromptRuntimeView(snapshot("ready", "resident"), "video-create");

    expect(view.left).toMatchObject({
      icon: "square",
      disabled: false,
      busy: false,
      intent: "stop",
      title: "prompt-runtime.stop"
    });
    expect(view.right).toMatchObject({ disabled: false, action: "enhance" });
  });

  it.each([
    ["starting", "unloaded"],
    ["restarting", "resident"],
    ["stopping", "resident"]
  ] as const)("blocks both buttons during service %s", (service, model) => {
    const view = projectPromptRuntimeView(snapshot(service, model), "video-create");

    expect(view.left).toMatchObject({ icon: "refresh-cw", disabled: true, busy: true, intent: "none" });
    expect(view.right).toMatchObject({ disabled: true, busy: true, action: "none", showElapsed: false });
  });

  it.each([
    ["warming", "resident"],
    ["unloading", "resident"]
  ] as const)("blocks both buttons during model %s", (model) => {
    const view = projectPromptRuntimeView(snapshot("ready", model), "image-edit");

    expect(view.left).toMatchObject({ icon: "refresh-cw", disabled: true, busy: true, intent: "none" });
    expect(view.right).toMatchObject({
      icon: model === "unloading" ? "refresh-cw" : "sparkles",
      disabled: true,
      action: "none",
      showElapsed: false
    });
  });

  it.each([
    "preparing-service",
    "warming-model",
    "submitting",
    "queued",
    "running"
  ] as const)("lets the owner cancel a video task during %s", (phase) => {
    const view = projectPromptRuntimeView(
      snapshot("starting", "warming", operation("video-create", phase)),
      "video-create"
    );

    expect(view.left).toMatchObject({ icon: "square", disabled: false, busy: false, intent: "stop" });
    expect(view.right).toMatchObject({
      icon: "x",
      disabled: false,
      busy: true,
      title: "prompt-runtime.cancel",
      action: "cancel",
      showElapsed: true
    });
  });

  it.each([
    "preparing-service",
    "warming-model",
    "submitting",
    "queued",
    "running"
  ] as const)("lets the owner cancel an image task during %s", (phase) => {
    const view = projectPromptRuntimeView(
      snapshot("ready", "resident", operation("image-edit", phase)),
      "image-edit"
    );

    expect(view.right).toMatchObject({ icon: "x", disabled: false, action: "cancel", showElapsed: true });
    expect(view.left.intent).toBe("stop");
  });

  it("disables the other creation page without leaking elapsed time", () => {
    const videoTask = projectPromptRuntimeView(
      snapshot("ready", "resident", operation("video-create", "running")),
      "image-edit"
    );
    const imageTask = projectPromptRuntimeView(
      snapshot("ready", "resident", operation("image-edit", "running")),
      "video-create"
    );

    for (const view of [videoTask, imageTask]) {
      expect(view.left).toMatchObject({ icon: "square", disabled: false, intent: "stop" });
      expect(view.right).toMatchObject({
        icon: "sparkles",
        disabled: true,
        busy: false,
        title: "prompt-runtime.another-page",
        action: "none",
        showElapsed: false
      });
    }
  });

  it("serializes cancellation before unload and does not offer duplicate actions", () => {
    const cancelling = projectPromptRuntimeView(
      snapshot("ready", "resident", operation("video-create", "cancel-requested")),
      "video-create"
    );
    const unloading = projectPromptRuntimeView(
      snapshot("ready", "unloading", operation("video-create", "running")),
      "image-edit"
    );

    expect(cancelling.left).toMatchObject({ icon: "refresh-cw", disabled: true, busy: true, intent: "none" });
    expect(cancelling.right).toMatchObject({ icon: "refresh-cw", disabled: true, busy: true, action: "none", showElapsed: true });
    expect(unloading.left).toMatchObject({ icon: "refresh-cw", disabled: true, busy: true, intent: "none" });
    expect(unloading.right).toMatchObject({ disabled: true, action: "none", showElapsed: false });
  });

  it("ignores a stale operation after a forced service close", () => {
    const view = projectPromptRuntimeView(
      snapshot("stopped", "unloaded", operation("image-edit", "running")),
      "video-create"
    );

    expect(view.left).toMatchObject({ icon: "play", disabled: false, busy: false, intent: "start" });
    expect(view.right).toMatchObject({ icon: "sparkles", disabled: false, busy: false, action: "enhance", showElapsed: false });
  });

  it.each([
    ["unknown", "unknown"],
    ["degraded", "unknown"],
    ["error", "unknown"],
    ["unknown", "unloaded"]
  ] as const)("marks service %s unavailable without inventing an operation", (service, model) => {
    const view = projectPromptRuntimeView(snapshot(service, model), "video-create");

    expect(view.left).toMatchObject({ icon: "play", disabled: true, busy: false, intent: "none", title: "prompt-runtime.unavailable" });
    expect(view.right).toMatchObject({ icon: "sparkles", disabled: true, busy: false, action: "none", showElapsed: false, title: "prompt-runtime.unavailable" });
  });
});
