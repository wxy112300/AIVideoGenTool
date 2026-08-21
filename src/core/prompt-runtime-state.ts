/**
 * Pure state machine for prompt enhancement runtime coordination.
 *
 * This module deliberately does not start, stop, restart, or poll ComfyUI.
 * The ComfyUI runtime controller owns service lifecycle facts; this state
 * machine only records those facts alongside the prompt-model lease and the
 * one prompt operation currently being coordinated.
 */

export type PromptRuntimeServicePhase =
  | "unknown"
  | "stopped"
  | "starting"
  | "ready"
  | "degraded"
  | "restarting"
  | "stopping"
  | "error";

export type PromptRuntimeServiceOwnership = "unknown" | "none" | "app" | "external";

/**
 * A structural copy of the ComfyUI runtime facts published by the service
 * controller. Keeping this type local avoids importing Electron code into the
 * core state machine while still allowing `ComfyRuntimeState` to be passed
 * directly to `service-updated`.
 */
export interface PromptRuntimeServiceFacts {
  readonly phase: PromptRuntimeServicePhase;
  readonly ownership: PromptRuntimeServiceOwnership;
  readonly endpoint: string;
  readonly message: string;
  readonly updatedAt: string;
  readonly operationId: number;
}

export type PromptModelPhase =
  | "unloaded"
  | "warming"
  | "resident"
  | "unloading"
  | "unknown";

export interface PromptModelState {
  readonly phase: PromptModelPhase;
  readonly modelId: string | null;
}

export type PromptOperationOrigin = "video-create" | "image-edit";

export type PromptOperationPhase =
  | "idle"
  | "preparing-service"
  | "warming-model"
  | "submitting"
  | "queued"
  | "running"
  | "cancel-requested"
  | "terminal";

export type PromptRuntimeActivePhase = Exclude<
  PromptOperationPhase,
  "idle" | "terminal"
>;

export type PromptRuntimePreSubmissionPhase =
  | "preparing-service"
  | "warming-model"
  | "submitting";

export type PromptRuntimeSubmittedPhase = "queued" | "running";

export type PromptTerminalStatus = "completed" | "cancelled" | "failed";

export interface PromptRuntimeIdleOperation {
  readonly phase: "idle";
  readonly operationId: null;
  readonly origin: null;
  readonly promptId: null;
  readonly startedAt: null;
  readonly retainModel: false;
  readonly terminalStatus: null;
  readonly terminalReason: null;
  readonly finishedAt: null;
}

export interface PromptRuntimeActiveOperation {
  readonly phase: PromptRuntimeActivePhase;
  readonly operationId: string;
  readonly origin: PromptOperationOrigin;
  /** Null means ComfyUI has not acknowledged a prompt submission yet. */
  readonly promptId: string | null;
  readonly startedAt: number;
  readonly retainModel: boolean;
  readonly terminalStatus: null;
  readonly terminalReason: null;
  readonly finishedAt: null;
}

export interface PromptRuntimeTerminalOperation {
  readonly phase: "terminal";
  readonly operationId: string;
  readonly origin: PromptOperationOrigin;
  readonly promptId: string | null;
  readonly startedAt: number;
  readonly retainModel: boolean;
  readonly terminalStatus: PromptTerminalStatus;
  readonly terminalReason: string | null;
  readonly finishedAt: number | null;
}

export type PromptRuntimeOperation =
  | PromptRuntimeIdleOperation
  | PromptRuntimeActiveOperation
  | PromptRuntimeTerminalOperation;

export interface PromptRuntimeState {
  readonly service: PromptRuntimeServiceFacts;
  readonly model: PromptModelState;
  readonly operation: PromptRuntimeOperation;
}

export type PromptRuntimeEvent =
  | {
      readonly type: "begin-operation";
      readonly operationId: string;
      readonly origin: PromptOperationOrigin;
      readonly startedAt: number;
      readonly retainModel: boolean;
      /**
       * The operation has no prompt ID at any of these stages. If omitted,
       * the phase is selected from the current service/model facts.
       */
      readonly phase?: PromptRuntimePreSubmissionPhase;
    }
  | {
      readonly type: "operation-phase";
      readonly operationId: string;
      readonly phase: PromptRuntimePreSubmissionPhase | PromptRuntimeSubmittedPhase;
      /** Allows a queue/running update to carry the first prompt ID. */
      readonly promptId?: string;
    }
  | {
      readonly type: "prompt-submitted";
      readonly operationId: string;
      readonly promptId: string;
      readonly phase?: PromptRuntimeSubmittedPhase;
    }
  | {
      readonly type: "cancel-requested";
      readonly operationId: string;
    }
  | {
      readonly type: "operation-terminal";
      readonly operationId: string;
      readonly status: PromptTerminalStatus;
      readonly reason?: string | null;
      readonly finishedAt?: number | null;
    }
  | {
      readonly type: "reset-terminal";
      readonly operationId: string;
    }
  | {
      readonly type: "service-updated";
      readonly service: PromptRuntimeServiceFacts;
    }
  | {
      readonly type: "model-updated";
      readonly modelPhase: PromptModelPhase;
      readonly modelId?: string | null;
      /** Optional ownership of a model event by a prompt operation. */
      readonly operationId?: string;
    };

export type PromptCancellationMode = "not-cancellable" | "before-submit" | "submitted";

const defaultServiceFacts: PromptRuntimeServiceFacts = {
  phase: "unknown",
  ownership: "unknown",
  endpoint: "",
  message: "",
  updatedAt: new Date(0).toISOString(),
  operationId: 0
};

const preSubmissionPhases: readonly PromptRuntimePreSubmissionPhase[] = [
  "preparing-service",
  "warming-model",
  "submitting"
];

const submittedPhases: readonly PromptRuntimeSubmittedPhase[] = ["queued", "running"];

function isPromptRuntimePreSubmissionPhase(
  phase: PromptRuntimeActivePhase
): phase is PromptRuntimePreSubmissionPhase {
  return preSubmissionPhases.includes(phase as PromptRuntimePreSubmissionPhase);
}

function isPromptRuntimeSubmittedPhase(
  phase: PromptRuntimeActivePhase
): phase is PromptRuntimeSubmittedPhase {
  return submittedPhases.includes(phase as PromptRuntimeSubmittedPhase);
}

function nonEmpty(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized : null;
}

function validTimestamp(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function isActiveOperation(
  operation: PromptRuntimeOperation
): operation is PromptRuntimeActiveOperation {
  return operation.phase !== "idle" && operation.phase !== "terminal";
}

function operationMatches(
  operation: PromptRuntimeOperation,
  operationId: string
): operation is PromptRuntimeActiveOperation {
  return isActiveOperation(operation) && operation.operationId === operationId;
}

function operationOrTerminalMatches(
  operation: PromptRuntimeOperation,
  operationId: string
): operation is PromptRuntimeActiveOperation | PromptRuntimeTerminalOperation {
  return operation.phase !== "idle" && operation.operationId === operationId;
}

function initialOperationPhase(state: PromptRuntimeState): PromptRuntimePreSubmissionPhase {
  if (state.service.phase !== "ready") return "preparing-service";
  if (state.model.phase !== "resident") return "warming-model";
  return "submitting";
}

function canAdvanceOperation(
  from: PromptRuntimeActivePhase,
  to: PromptRuntimeActivePhase
): boolean {
  if (from === to) return true;
  switch (from) {
    case "preparing-service":
      return to === "warming-model" || to === "submitting";
    case "warming-model":
      return to === "submitting";
    case "submitting":
      return to === "queued" || to === "running";
    case "queued":
      return to === "running";
    case "running":
      return false;
    case "cancel-requested":
      return false;
  }
}

function idleOperation(): PromptRuntimeIdleOperation {
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

function serviceFailed(phase: PromptRuntimeServicePhase): boolean {
  return phase === "stopped" || phase === "error";
}

function terminalFromServiceFailure(
  operation: PromptRuntimeActiveOperation,
  servicePhase: PromptRuntimeServicePhase
): PromptRuntimeTerminalOperation {
  return {
    phase: "terminal",
    operationId: operation.operationId,
    origin: operation.origin,
    promptId: operation.promptId,
    startedAt: operation.startedAt,
    retainModel: operation.retainModel,
    terminalStatus: "failed",
    terminalReason: servicePhase === "error" ? "service-error" : "service-stopped",
    finishedAt: null
  };
}

function replaceService(
  state: PromptRuntimeState,
  service: PromptRuntimeServiceFacts
): PromptRuntimeState {
  if (service.operationId < state.service.operationId) return state;

  const operation = serviceFailed(service.phase) && isActiveOperation(state.operation)
    ? terminalFromServiceFailure(state.operation, service.phase)
    : state.operation;
  return {
    service: { ...service },
    model: serviceFailed(service.phase)
      ? { phase: "unloaded", modelId: null }
      : state.model,
    operation
  };
}

function replaceModel(
  state: PromptRuntimeState,
  event: Extract<PromptRuntimeEvent, { type: "model-updated" }>
): PromptRuntimeState {
  if (event.operationId !== undefined && !operationOrTerminalMatches(state.operation, event.operationId)) {
    return state;
  }
  if (serviceFailed(state.service.phase)) return state;

  switch (event.modelPhase) {
    case "unloaded":
      return { ...state, model: { phase: "unloaded", modelId: null } };
    case "unknown":
      return {
        ...state,
        model: {
          phase: "unknown",
          modelId: nonEmpty(event.modelId) ?? state.model.modelId
        }
      };
    case "warming":
    case "resident":
    case "unloading": {
      const modelId = nonEmpty(event.modelId) ?? state.model.modelId;
      if (!modelId) return state;
      return { ...state, model: { phase: event.modelPhase, modelId } };
    }
  }
}

function replaceOperationPhase(
  state: PromptRuntimeState,
  event: Extract<PromptRuntimeEvent, { type: "operation-phase" }>
): PromptRuntimeState {
  if (!operationMatches(state.operation, event.operationId)) return state;
  const operation = state.operation;
  if (!canAdvanceOperation(operation.phase, event.phase)) return state;

  const promptId = nonEmpty(event.promptId) ?? operation.promptId;
  if (isPromptRuntimeSubmittedPhase(event.phase) && !promptId) return state;

  return {
    ...state,
    operation: {
      ...operation,
      phase: event.phase,
      promptId
    }
  };
}

function promptSubmitted(
  state: PromptRuntimeState,
  event: Extract<PromptRuntimeEvent, { type: "prompt-submitted" }>
): PromptRuntimeState {
  if (!operationMatches(state.operation, event.operationId)) return state;
  const operation = state.operation;
  if (operation.phase === "cancel-requested") return state;
  const promptId = nonEmpty(event.promptId);
  if (!promptId) return state;
  if (operation.promptId && operation.promptId !== promptId) return state;

  const phase = event.phase ?? "queued";
  if (!canAdvanceOperation(operation.phase, phase)) return state;
  return {
    ...state,
    operation: {
      ...operation,
      phase,
      promptId
    }
  };
}

function terminalOperation(
  state: PromptRuntimeState,
  event: Extract<PromptRuntimeEvent, { type: "operation-terminal" }>
): PromptRuntimeState {
  if (!operationMatches(state.operation, event.operationId)) return state;
  if (event.finishedAt !== undefined && event.finishedAt !== null && !validTimestamp(event.finishedAt)) {
    return state;
  }
  const operation = state.operation;
  return {
    ...state,
    operation: {
      phase: "terminal",
      operationId: operation.operationId,
      origin: operation.origin,
      promptId: operation.promptId,
      startedAt: operation.startedAt,
      retainModel: operation.retainModel,
      terminalStatus: event.status,
      terminalReason: nonEmpty(event.reason),
      finishedAt: event.finishedAt ?? null
    }
  };
}

/**
 * Create a deterministic initial state. Service facts are supplied by the
 * ComfyUI runtime controller; no service lifecycle is inferred here.
 */
export function createPromptRuntimeState(
  service: PromptRuntimeServiceFacts = defaultServiceFacts
): PromptRuntimeState {
  const state: PromptRuntimeState = {
    service: { ...service },
    model: { phase: "unloaded", modelId: null },
    operation: idleOperation()
  };
  if (serviceFailed(service.phase)) {
    return {
      ...state,
      model: { phase: "unloaded", modelId: null }
    };
  }
  assertPromptRuntimeState(state);
  return state;
}

/**
 * Apply one event without side effects. A stale operation event is ignored by
 * comparing its operation ID with the current active/terminal operation.
 */
export function reducePromptRuntime(
  state: PromptRuntimeState,
  event: PromptRuntimeEvent
): PromptRuntimeState {
  let next: PromptRuntimeState;

  switch (event.type) {
    case "begin-operation": {
      const operationId = nonEmpty(event.operationId);
      if (!operationId || !validTimestamp(event.startedAt)) return state;
      // A repeated begin event for the same operation is an old/replayed
      // event, not permission to reset its phase or identity fields.
      if (state.operation.phase !== "idle" && state.operation.operationId === operationId) {
        return state;
      }
      const phase = event.phase ?? initialOperationPhase(state);
      next = {
        ...state,
        operation: {
          phase,
          operationId,
          origin: event.origin,
          promptId: null,
          startedAt: event.startedAt,
          retainModel: event.retainModel,
          terminalStatus: null,
          terminalReason: null,
          finishedAt: null
        }
      };
      break;
    }
    case "operation-phase":
      next = replaceOperationPhase(state, event);
      break;
    case "prompt-submitted":
      next = promptSubmitted(state, event);
      break;
    case "cancel-requested": {
      if (!operationMatches(state.operation, event.operationId)) return state;
      if (state.operation.phase === "cancel-requested") return state;
      next = {
        ...state,
        operation: {
          ...state.operation,
          phase: "cancel-requested"
        }
      };
      break;
    }
    case "operation-terminal":
      next = terminalOperation(state, event);
      break;
    case "reset-terminal":
      if (
        state.operation.phase !== "terminal" ||
        state.operation.operationId !== event.operationId
      ) return state;
      next = { ...state, operation: idleOperation() };
      break;
    case "service-updated":
      next = replaceService(state, event.service);
      break;
    case "model-updated":
      next = replaceModel(state, event);
      break;
  }

  assertPromptRuntimeState(next);
  return next;
}

/** Alias that reads naturally at call sites that treat events as transitions. */
export const transitionPromptRuntime = reducePromptRuntime;

/** Conventional reducer name for stores that wire this module directly. */
export const promptRuntimeReducer = reducePromptRuntime;

export function promptOperationIsActive(state: PromptRuntimeState): boolean {
  return isActiveOperation(state.operation);
}

export function promptCancellationMode(
  state: PromptRuntimeState
): PromptCancellationMode {
  if (!isActiveOperation(state.operation) || state.operation.phase === "cancel-requested") {
    return "not-cancellable";
  }
  return state.operation.promptId ? "submitted" : "before-submit";
}

export function promptOperationBelongsTo(
  state: PromptRuntimeState,
  origin: PromptOperationOrigin
): boolean {
  return isActiveOperation(state.operation) && state.operation.origin === origin;
}

/**
 * Validate the invariants shared by reducer output and future integrations.
 * It throws rather than silently repairing a manually constructed invalid
 * state, making accidental second sources of truth visible in tests.
 */
export function assertPromptRuntimeState(state: PromptRuntimeState): void {
  if (!state || !state.service || !state.model || !state.operation) {
    throw new Error("Invalid prompt runtime state: missing state section");
  }
  if (!Number.isFinite(state.service.operationId) || state.service.operationId < 0) {
    throw new Error("Invalid prompt runtime state: service operation ID");
  }
  if (serviceFailed(state.service.phase) && state.model.phase !== "unloaded") {
    throw new Error("Invalid prompt runtime state: failed service must have an unloaded model");
  }
  if (state.model.phase === "unloaded" && state.model.modelId !== null) {
    throw new Error("Invalid prompt runtime state: unloaded model cannot have a model ID");
  }
  if (
    (state.model.phase === "warming" ||
      state.model.phase === "resident" ||
      state.model.phase === "unloading") &&
    !nonEmpty(state.model.modelId)
  ) {
    throw new Error("Invalid prompt runtime state: model phase requires a model ID");
  }

  const operation = state.operation;
  if (operation.phase === "idle") {
    if (
      operation.operationId !== null ||
      operation.origin !== null ||
      operation.promptId !== null ||
      operation.startedAt !== null ||
      operation.retainModel !== false ||
      operation.terminalStatus !== null ||
      operation.terminalReason !== null ||
      operation.finishedAt !== null
    ) {
      throw new Error("Invalid prompt runtime state: malformed idle operation");
    }
    return;
  }

  if (!nonEmpty(operation.operationId)) {
    throw new Error("Invalid prompt runtime state: operation requires an ID");
  }
  if (operation.origin !== "video-create" && operation.origin !== "image-edit") {
    throw new Error("Invalid prompt runtime state: operation requires an origin");
  }
  if (!validTimestamp(operation.startedAt)) {
    throw new Error("Invalid prompt runtime state: operation requires a start timestamp");
  }
  if (operation.promptId !== null && !nonEmpty(operation.promptId)) {
    throw new Error("Invalid prompt runtime state: prompt ID cannot be blank");
  }

  if (operation.phase === "terminal") {
    if (!operation.terminalStatus) {
      throw new Error("Invalid prompt runtime state: terminal operation requires a status");
    }
    if (operation.finishedAt !== null && !validTimestamp(operation.finishedAt)) {
      throw new Error("Invalid prompt runtime state: invalid terminal timestamp");
    }
    return;
  }

  if (operation.terminalStatus !== null || operation.terminalReason !== null || operation.finishedAt !== null) {
    throw new Error("Invalid prompt runtime state: active operation cannot have terminal fields");
  }
  if (isPromptRuntimeSubmittedPhase(operation.phase) && !nonEmpty(operation.promptId)) {
    throw new Error("Invalid prompt runtime state: queued/running operation requires a prompt ID");
  }
}
