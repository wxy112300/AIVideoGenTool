/**
 * Pure state machine for prompt enhancement runtime coordination.
 *
 * This module deliberately does not start, stop, restart, or poll ComfyUI.
 * The ComfyUI runtime controller owns service lifecycle facts; this state
 * machine only records those facts alongside the prompt-model lease and the
 * one prompt operation currently being coordinated.
 */
const defaultServiceFacts = {
    phase: "unknown",
    ownership: "unknown",
    endpoint: "",
    message: "",
    updatedAt: new Date(0).toISOString(),
    operationId: 0
};
const preSubmissionPhases = [
    "preparing-service",
    "warming-model",
    "submitting"
];
const submittedPhases = ["queued", "running"];
function isPromptRuntimePreSubmissionPhase(phase) {
    return preSubmissionPhases.includes(phase);
}
function isPromptRuntimeSubmittedPhase(phase) {
    return submittedPhases.includes(phase);
}
function nonEmpty(value) {
    const normalized = value?.trim() ?? "";
    return normalized ? normalized : null;
}
function validTimestamp(value) {
    return Number.isFinite(value) && value >= 0;
}
function isActiveOperation(operation) {
    return operation.phase !== "idle" && operation.phase !== "terminal";
}
function operationMatches(operation, operationId) {
    return isActiveOperation(operation) && operation.operationId === operationId;
}
function operationOrTerminalMatches(operation, operationId) {
    return operation.phase !== "idle" && operation.operationId === operationId;
}
function initialOperationPhase(state) {
    if (state.service.phase !== "ready")
        return "preparing-service";
    if (state.model.phase !== "resident")
        return "warming-model";
    return "submitting";
}
function canAdvanceOperation(from, to) {
    if (from === to)
        return true;
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
function idleOperation() {
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
function serviceFailed(phase) {
    return phase === "stopped" || phase === "error";
}
function terminalFromServiceFailure(operation, servicePhase) {
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
function replaceService(state, service) {
    if (service.operationId < state.service.operationId)
        return state;
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
function replaceModel(state, event) {
    if (event.operationId !== undefined && !operationOrTerminalMatches(state.operation, event.operationId)) {
        return state;
    }
    if (serviceFailed(state.service.phase))
        return state;
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
            if (!modelId)
                return state;
            return { ...state, model: { phase: event.modelPhase, modelId } };
        }
    }
}
function replaceOperationPhase(state, event) {
    if (!operationMatches(state.operation, event.operationId))
        return state;
    const operation = state.operation;
    if (!canAdvanceOperation(operation.phase, event.phase))
        return state;
    const promptId = nonEmpty(event.promptId) ?? operation.promptId;
    if (isPromptRuntimeSubmittedPhase(event.phase) && !promptId)
        return state;
    return {
        ...state,
        operation: {
            ...operation,
            phase: event.phase,
            promptId
        }
    };
}
function promptSubmitted(state, event) {
    if (!operationMatches(state.operation, event.operationId))
        return state;
    const operation = state.operation;
    if (operation.phase === "cancel-requested")
        return state;
    const promptId = nonEmpty(event.promptId);
    if (!promptId)
        return state;
    if (operation.promptId && operation.promptId !== promptId)
        return state;
    const phase = event.phase ?? "queued";
    if (!canAdvanceOperation(operation.phase, phase))
        return state;
    return {
        ...state,
        operation: {
            ...operation,
            phase,
            promptId
        }
    };
}
function terminalOperation(state, event) {
    if (!operationMatches(state.operation, event.operationId))
        return state;
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
export function createPromptRuntimeState(service = defaultServiceFacts) {
    const state = {
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
export function reducePromptRuntime(state, event) {
    let next;
    switch (event.type) {
        case "begin-operation": {
            const operationId = nonEmpty(event.operationId);
            if (!operationId || !validTimestamp(event.startedAt))
                return state;
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
            if (!operationMatches(state.operation, event.operationId))
                return state;
            if (state.operation.phase === "cancel-requested")
                return state;
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
            if (state.operation.phase !== "terminal" ||
                state.operation.operationId !== event.operationId)
                return state;
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
export function promptOperationIsActive(state) {
    return isActiveOperation(state.operation);
}
export function promptModelStartupIsActive(state, requestPending = false) {
    return requestPending || state.service.phase === "starting" ||
        state.service.phase === "restarting" || state.model.phase === "warming";
}
export function promptCancellationMode(state) {
    if (!isActiveOperation(state.operation) || state.operation.phase === "cancel-requested") {
        return "not-cancellable";
    }
    return state.operation.promptId ? "submitted" : "before-submit";
}
export function promptOperationBelongsTo(state, origin) {
    return isActiveOperation(state.operation) && state.operation.origin === origin;
}
/**
 * Validate the invariants shared by reducer output and future integrations.
 * It throws rather than silently repairing a manually constructed invalid
 * state, making accidental second sources of truth visible in tests.
 */
export function assertPromptRuntimeState(state) {
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
    if ((state.model.phase === "warming" ||
        state.model.phase === "resident" ||
        state.model.phase === "unloading") &&
        !nonEmpty(state.model.modelId)) {
        throw new Error("Invalid prompt runtime state: model phase requires a model ID");
    }
    const operation = state.operation;
    if (operation.phase === "idle") {
        if (operation.operationId !== null ||
            operation.origin !== null ||
            operation.promptId !== null ||
            operation.startedAt !== null ||
            operation.retainModel !== false ||
            operation.terminalStatus !== null ||
            operation.terminalReason !== null ||
            operation.finishedAt !== null) {
            throw new Error("Invalid prompt runtime state: malformed idle operation");
        }
        return;
    }
    if (!nonEmpty(operation.operationId)) {
        throw new Error("Invalid prompt runtime state: operation requires an ID");
    }
    if (!["image-to-video", "video-extension", "image-edit"].includes(operation.origin)) {
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
