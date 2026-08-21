import { describe, expect, it } from "vitest";
import {
  assertPromptRuntimeState,
  createPromptRuntimeState,
  promptModelStartupIsActive,
  promptCancellationMode,
  promptOperationBelongsTo,
  promptOperationIsActive,
  reducePromptRuntime,
  type PromptRuntimeServiceFacts
} from "../src/core/prompt-runtime-state";

const service = (
  phase: PromptRuntimeServiceFacts["phase"],
  operationId = 1
): PromptRuntimeServiceFacts => ({
  phase,
  ownership: "app",
  endpoint: "http://127.0.0.1:8188",
  message: phase,
  updatedAt: `2026-08-21T00:00:0${operationId}.000Z`,
  operationId
});
function begin(
  state: ReturnType<typeof createPromptRuntimeState>,
  operationId = "operation-1",
  phase?: "preparing-service" | "warming-model" | "submitting"
) {
  return reducePromptRuntime(state, {
    type: "begin-operation",
    operationId,
    origin: "image-to-video",
    startedAt: 100,
    retainModel: true,
    ...(phase ? { phase } : {})
  });
}

describe("prompt runtime state machine", () => {
  it("keeps manual startup pending across the service-ready handoff until model warmup settles", () => {
    let state = createPromptRuntimeState(service("stopped"));
    expect(promptModelStartupIsActive(state, true)).toBe(true);

    state = reducePromptRuntime(state, {
      type: "service-updated",
      service: service("ready", 2)
    });
    expect(promptModelStartupIsActive(state, true)).toBe(true);
    expect(promptModelStartupIsActive(state, false)).toBe(false);

    state = reducePromptRuntime(state, {
      type: "model-updated",
      modelPhase: "warming",
      modelId: "qwen3.8"
    });
    expect(promptModelStartupIsActive(state, false)).toBe(true);

    state = reducePromptRuntime(state, {
      type: "model-updated",
      modelPhase: "resident",
      modelId: "qwen3.8"
    });
    expect(promptModelStartupIsActive(state, false)).toBe(false);
  });

  it("starts with independent service, model, and idle operation sections", () => {
    const state = createPromptRuntimeState();
    expect(state).toEqual({
      service: {
        phase: "unknown",
        ownership: "unknown",
        endpoint: "",
        message: "",
        updatedAt: "1970-01-01T00:00:00.000Z",
        operationId: 0
      },
      model: { phase: "unloaded", modelId: null },
      operation: {
        phase: "idle",
        operationId: null,
        origin: null,
        promptId: null,
        startedAt: null,
        retainModel: false,
        terminalStatus: null,
        terminalReason: null,
        finishedAt: null
      }
    });
    expect(promptOperationIsActive(state)).toBe(false);
    assertPromptRuntimeState(state);
  });

  it("uses service/model facts only to choose a default pre-submit phase", () => {
    const stopped = begin(createPromptRuntimeState(service("stopped")));
    expect(stopped.operation.phase).toBe("preparing-service");

    let resident = createPromptRuntimeState(service("ready"));
    resident = reducePromptRuntime(resident, {
      type: "model-updated",
      modelPhase: "resident",
      modelId: "qwen-vl"
    });
    expect(begin(resident).operation.phase).toBe("submitting");

    const warming = createPromptRuntimeState(service("ready"));
    expect(begin(warming).operation.phase).toBe("warming-model");
  });

  it("preserves operation identity and origin throughout the lifecycle", () => {
    let state = begin(createPromptRuntimeState(service("ready")), "video-1", "submitting");
    expect(state.operation).toMatchObject({
      phase: "submitting",
      operationId: "video-1",
      origin: "image-to-video",
      promptId: null,
      startedAt: 100,
      retainModel: true
    });

    state = reducePromptRuntime(state, {
      type: "prompt-submitted",
      operationId: "video-1",
      promptId: "prompt-1"
    });
    state = reducePromptRuntime(state, {
      type: "operation-phase",
      operationId: "video-1",
      phase: "running"
    });
    expect(state.operation).toMatchObject({
      phase: "running",
      operationId: "video-1",
      origin: "image-to-video",
      promptId: "prompt-1",
      startedAt: 100,
      retainModel: true
    });
    expect(promptOperationBelongsTo(state, "image-to-video")).toBe(true);
    expect(promptOperationBelongsTo(state, "image-edit")).toBe(false);
  });

  it("distinguishes cancellation before ComfyUI acknowledges a prompt", () => {
    let state = begin(createPromptRuntimeState(service("stopped")), "pre-submit");
    expect(promptCancellationMode(state)).toBe("before-submit");

    state = reducePromptRuntime(state, {
      type: "cancel-requested",
      operationId: "pre-submit"
    });
    expect(state.operation).toMatchObject({ phase: "cancel-requested", promptId: null });
    expect(promptCancellationMode(state)).toBe("not-cancellable");

    // A late response from the cancelled preparation path cannot create a
    // prompt ID or move the operation back into ComfyUI's queue.
    const lateSubmit = reducePromptRuntime(state, {
      type: "prompt-submitted",
      operationId: "pre-submit",
      promptId: "late-prompt"
    });
    expect(lateSubmit).toBe(state);
    expect(lateSubmit.operation.promptId).toBeNull();
  });

  it("distinguishes cancellation after submission and keeps the exact prompt ID", () => {
    let state = begin(createPromptRuntimeState(service("ready")), "submitted", "submitting");
    state = reducePromptRuntime(state, {
      type: "prompt-submitted",
      operationId: "submitted",
      promptId: "prompt-42"
    });
    expect(promptCancellationMode(state)).toBe("submitted");

    state = reducePromptRuntime(state, {
      type: "cancel-requested",
      operationId: "submitted"
    });
    expect(state.operation).toMatchObject({
      phase: "cancel-requested",
      promptId: "prompt-42"
    });
    expect(promptCancellationMode(state)).toBe("not-cancellable");
  });

  it("does not imply a service restart when cancellation is requested", () => {
    let state = begin(createPromptRuntimeState(service("ready")), "cancel-no-restart", "submitting");
    state = reducePromptRuntime(state, {
      type: "prompt-submitted",
      operationId: "cancel-no-restart",
      promptId: "prompt-1"
    });
    state = reducePromptRuntime(state, {
      type: "cancel-requested",
      operationId: "cancel-no-restart"
    });
    expect(state.service.phase).toBe("ready");
    expect(state.model).toEqual({ phase: "unloaded", modelId: null });

    state = reducePromptRuntime(state, {
      type: "operation-terminal",
      operationId: "cancel-no-restart",
      status: "cancelled",
      reason: "user-requested",
      finishedAt: 200
    });
    expect(state.service.phase).toBe("ready");
    expect(state.operation).toMatchObject({
      phase: "terminal",
      terminalStatus: "cancelled",
      terminalReason: "user-requested",
      finishedAt: 200
    });
  });

  it("ignores old operation events after a newer operation begins", () => {
    let state = begin(createPromptRuntimeState(service("ready")), "old", "submitting");
    state = reducePromptRuntime(state, {
      type: "prompt-submitted",
      operationId: "old",
      promptId: "old-prompt"
    });
    state = begin(state, "new", "submitting");

    const staleEvents = [
      {
        type: "operation-phase",
        operationId: "old",
        phase: "running"
      },
      {
        type: "cancel-requested",
        operationId: "old"
      },
      {
        type: "operation-terminal",
        operationId: "old",
        status: "failed",
        reason: "late"
      },
      {
        type: "model-updated",
        operationId: "old",
        modelPhase: "resident",
        modelId: "qwen-vl"
      }
    ] as const;

    for (const event of staleEvents) {
      const next = reducePromptRuntime(state, event);
      expect(next).toBe(state);
    }
    expect(state.operation).toMatchObject({
      phase: "submitting",
      operationId: "new",
      promptId: null
    });
  });

  it("terminates an active operation and clears model residency when service stops", () => {
    let state = begin(createPromptRuntimeState(service("ready")), "service-stop", "submitting");
    state = reducePromptRuntime(state, {
      type: "model-updated",
      modelPhase: "resident",
      modelId: "qwen-vl",
      operationId: "service-stop"
    });
    state = reducePromptRuntime(state, {
      type: "prompt-submitted",
      operationId: "service-stop",
      promptId: "prompt-7"
    });
    state = reducePromptRuntime(state, {
      type: "service-updated",
      service: service("stopped", 2)
    });

    expect(state.service.phase).toBe("stopped");
    expect(state.model).toEqual({ phase: "unloaded", modelId: null });
    expect(state.operation).toMatchObject({
      phase: "terminal",
      operationId: "service-stop",
      promptId: "prompt-7",
      terminalStatus: "failed",
      terminalReason: "service-stopped"
    });
    assertPromptRuntimeState(state);
  });

  it("terminates an active operation and clears model residency on service error", () => {
    let state = begin(createPromptRuntimeState(service("ready")), "service-error", "warming-model");
    state = reducePromptRuntime(state, {
      type: "model-updated",
      modelPhase: "warming",
      modelId: "qwen-vl",
      operationId: "service-error"
    });
    state = reducePromptRuntime(state, {
      type: "service-updated",
      service: service("error", 2)
    });
    expect(state.model).toEqual({ phase: "unloaded", modelId: null });
    expect(state.operation).toMatchObject({
      phase: "terminal",
      terminalStatus: "failed",
      terminalReason: "service-error"
    });
  });

  it("ignores an older service lifecycle fact instead of killing a newer operation", () => {
    let state = createPromptRuntimeState(service("ready", 4));
    state = begin(state, "new-operation", "submitting");
    const stale = reducePromptRuntime(state, {
      type: "service-updated",
      service: service("stopped", 3)
    });
    expect(stale).toBe(state);
    expect(stale.service.phase).toBe("ready");
    expect(stale.operation.phase).toBe("submitting");
  });

  it("keeps model transitions orthogonal to operation transitions", () => {
    let state = createPromptRuntimeState(service("ready"));
    state = reducePromptRuntime(state, {
      type: "model-updated",
      modelPhase: "warming",
      modelId: "qwen-vl"
    });
    expect(state.operation.phase).toBe("idle");
    state = reducePromptRuntime(state, {
      type: "model-updated",
      modelPhase: "resident",
      modelId: "qwen-vl"
    });
    expect(state.model).toEqual({ phase: "resident", modelId: "qwen-vl" });
    expect(state.operation.phase).toBe("idle");

    state = begin(state, "resident-operation");
    state = reducePromptRuntime(state, {
      type: "operation-terminal",
      operationId: "resident-operation",
      status: "completed"
    });
    expect(state.model).toEqual({ phase: "resident", modelId: "qwen-vl" });
    expect(state.operation.phase).toBe("terminal");
  });

  it("requires an exact prompt ID before entering queued or running", () => {
    let state = begin(createPromptRuntimeState(service("ready")), "queue-guard", "submitting");
    const invalid = reducePromptRuntime(state, {
      type: "operation-phase",
      operationId: "queue-guard",
      phase: "queued"
    });
    expect(invalid).toBe(state);
    expect(invalid.operation.phase).toBe("submitting");

    state = reducePromptRuntime(state, {
      type: "operation-phase",
      operationId: "queue-guard",
      phase: "queued",
      promptId: "prompt-8"
    });
    expect(state.operation).toMatchObject({ phase: "queued", promptId: "prompt-8" });
  });

  it("does not allow operation phases to move backwards or escape cancellation", () => {
    let state = begin(createPromptRuntimeState(service("ready")), "ordering", "submitting");
    state = reducePromptRuntime(state, {
      type: "prompt-submitted",
      operationId: "ordering",
      promptId: "prompt-9"
    });
    const backwards = reducePromptRuntime(state, {
      type: "operation-phase",
      operationId: "ordering",
      phase: "warming-model"
    });
    expect(backwards).toBe(state);

    state = reducePromptRuntime(state, {
      type: "cancel-requested",
      operationId: "ordering"
    });
    const escaped = reducePromptRuntime(state, {
      type: "operation-phase",
      operationId: "ordering",
      phase: "running"
    });
    expect(escaped).toBe(state);
    expect(escaped.operation.phase).toBe("cancel-requested");
  });

  it("keeps terminal results until explicitly reset and ignores stale reset events", () => {
    let state = begin(createPromptRuntimeState(service("ready")), "terminal-1", "submitting");
    state = reducePromptRuntime(state, {
      type: "operation-terminal",
      operationId: "terminal-1",
      status: "completed",
      finishedAt: 300
    });
    expect(promptOperationIsActive(state)).toBe(false);
    expect(reducePromptRuntime(state, { type: "reset-terminal", operationId: "other" })).toBe(state);

    state = reducePromptRuntime(state, {
      type: "reset-terminal",
      operationId: "terminal-1"
    });
    expect(state.operation.phase).toBe("idle");
    assertPromptRuntimeState(state);
  });

  it("does not accept model events from an old operation", () => {
    let state = begin(createPromptRuntimeState(service("ready")), "old-model", "warming-model");
    state = begin(state, "new-model", "warming-model");
    const stale = reducePromptRuntime(state, {
      type: "model-updated",
      operationId: "old-model",
      modelPhase: "resident",
      modelId: "qwen-vl"
    });
    expect(stale).toBe(state);
    expect(stale.model).toEqual({ phase: "unloaded", modelId: null });
  });
});
