/**
 * Pure renderer projection for the two prompt-runtime controls.
 *
 * The runtime controller owns service/model/operation state.  This module does
 * not mutate that state and does not know about DOM or i18n.  `title` values
 * are semantic keys so the renderer can translate them at the boundary.
 */

import type {
  PromptModelPhase,
  PromptOperationOrigin,
  PromptRuntimeActiveOperation,
  PromptRuntimeActivePhase,
  PromptRuntimeOperation,
  PromptRuntimeServicePhase,
  PromptRuntimeState
} from "./prompt-runtime-state.js";

export type PromptRuntimeControlIcon = "play" | "square" | "refresh-cw" | "sparkles" | "x";
export type PromptRuntimeModelIntent = "start" | "stop" | "none";
export type PromptRuntimePromptAction = "enhance" | "cancel" | "none";

/** Semantic title keys. Translate these in the renderer rather than adding
 * locale coupling to this core selector. */
export type PromptRuntimeViewTitle =
  | "prompt-runtime.start"
  | "prompt-runtime.stop"
  | "prompt-runtime.stop-task"
  | "prompt-runtime.transition"
  | "prompt-runtime.enhance"
  | "prompt-runtime.cancel"
  | "prompt-runtime.cancelling"
  | "prompt-runtime.another-page"
  | "prompt-runtime.unavailable";

export interface PromptRuntimeModelButtonProjection {
  icon: PromptRuntimeControlIcon;
  disabled: boolean;
  busy: boolean;
  title: PromptRuntimeViewTitle;
  intent: PromptRuntimeModelIntent;
}

export interface PromptRuntimePromptButtonProjection {
  icon: PromptRuntimeControlIcon;
  disabled: boolean;
  busy: boolean;
  title: PromptRuntimeViewTitle;
  action: PromptRuntimePromptAction;
  showElapsed: boolean;
}

export interface PromptRuntimeViewProjection {
  left: PromptRuntimeModelButtonProjection;
  right: PromptRuntimePromptButtonProjection;
}

const activeOperationPhases: ReadonlySet<PromptRuntimeActivePhase> = new Set([
  "preparing-service",
  "warming-model",
  "submitting",
  "queued",
  "running",
  "cancel-requested"
]);

const cancellableOperationPhases: ReadonlySet<PromptRuntimeActivePhase> = new Set([
  "preparing-service",
  "warming-model",
  "submitting",
  "queued",
  "running"
]);

function activeOperation(
  operation: PromptRuntimeOperation,
  servicePhase: PromptRuntimeServicePhase
): PromptRuntimeActiveOperation | null {
  // A stopped service is authoritative after a forced close.  Ignoring a stale
  // operation here is what removes the timer and returns both buttons to their
  // recoverable state without waiting for a renderer-side timeout.
  if (servicePhase === "stopped" || servicePhase === "error") return null;
  if (operation.phase === "idle" || operation.phase === "terminal") return null;
  return activeOperationPhases.has(operation.phase) ? operation : null;
}

function serviceUsable(phase: PromptRuntimeServicePhase): boolean {
  return phase === "ready";
}

function serviceTransitioning(phase: PromptRuntimeServicePhase): boolean {
  return phase === "starting" || phase === "restarting" || phase === "stopping";
}

function modelTransitioning(phase: PromptModelPhase): boolean {
  return phase === "warming" || phase === "unloading";
}

function transitionModelButton(): PromptRuntimeModelButtonProjection {
  return {
    icon: "refresh-cw",
    disabled: true,
    busy: true,
    title: "prompt-runtime.transition",
    intent: "none"
  };
}

function transitionPromptButton(): PromptRuntimePromptButtonProjection {
  return {
    icon: "sparkles",
    disabled: true,
    busy: true,
    title: "prompt-runtime.transition",
    action: "none",
    showElapsed: false
  };
}

/**
 * Project one authoritative runtime snapshot into the two Create-page
 * controls.
 *
 * `currentOrigin` only affects the prompt button.  The model control remains
 * global because model residency is shared by video and image creation pages.
 */
export function projectPromptRuntimeView(
  snapshot: PromptRuntimeState,
  currentOrigin: PromptOperationOrigin
): PromptRuntimeViewProjection {
  const servicePhase = snapshot.service.phase;
  const modelPhase = snapshot.model.phase;
  const operation = activeOperation(snapshot.operation, servicePhase);

  // Cancellation and unload are a single serialized transition.  Neither
  // button can enqueue another command until the controller publishes a new
  // settled snapshot.
  if (operation?.phase === "cancel-requested" || modelPhase === "unloading") {
    return {
      left: transitionModelButton(),
      right: {
        icon: "refresh-cw",
        disabled: true,
        busy: true,
        title: operation?.phase === "cancel-requested"
          ? "prompt-runtime.cancelling"
          : "prompt-runtime.transition",
        action: "none",
        showElapsed: operation?.origin === currentOrigin
      }
    };
  }

  if (operation) {
    const owner = operation.origin === currentOrigin;
    const left: PromptRuntimeModelButtonProjection = {
      icon: "square",
      disabled: false,
      // The square is an action icon, not a spinner.  This avoids the rotating
      // close/stop affordance that made the previous interaction confusing.
      busy: false,
      title: "prompt-runtime.stop-task",
      intent: "stop"
    };
    if (owner && cancellableOperationPhases.has(operation.phase)) {
      return {
        left,
        right: {
          icon: "x",
          disabled: false,
          // `busy` describes the task, while the x icon remains visually still.
          busy: true,
          title: "prompt-runtime.cancel",
          action: "cancel",
          showElapsed: true
        }
      };
    }
    return {
      left,
      right: {
        icon: "sparkles",
        disabled: true,
        busy: false,
        title: "prompt-runtime.another-page",
        action: "none",
        showElapsed: false
      }
    };
  }

  if (serviceTransitioning(servicePhase) || modelTransitioning(modelPhase)) {
    return {
      left: transitionModelButton(),
      right: transitionPromptButton()
    };
  }

  // A normal stopped service is recoverable: both controls return to their
  // ordinary affordances, and the enhance action is allowed to start ComfyUI
  // and warm the model as one operation.
  if (servicePhase === "stopped") {
    return {
      left: {
        icon: "play",
        disabled: false,
        busy: false,
        title: "prompt-runtime.start",
        intent: "start"
      },
      right: {
        icon: "sparkles",
        disabled: false,
        busy: false,
        title: "prompt-runtime.enhance",
        action: "enhance",
        showElapsed: false
      }
    };
  }

  if (serviceUsable(servicePhase)) {
    const resident = modelPhase === "resident";
    return {
      left: {
        icon: resident ? "square" : "play",
        disabled: false,
        busy: false,
        title: resident ? "prompt-runtime.stop" : "prompt-runtime.start",
        intent: resident ? "stop" : "start"
      },
      right: {
        icon: "sparkles",
        disabled: false,
        busy: false,
        title: "prompt-runtime.enhance",
        action: "enhance",
        showElapsed: false
      }
    };
  }

  return {
    left: {
      icon: "play",
      disabled: true,
      busy: false,
      title: "prompt-runtime.unavailable",
      intent: "none"
    },
    right: {
      icon: "sparkles",
      disabled: true,
      busy: false,
      title: "prompt-runtime.unavailable",
      action: "none",
      showElapsed: false
    }
  };
}

/** Short alias for callers that prefer selector naming. */
export const promptRuntimeViewFor = projectPromptRuntimeView;
