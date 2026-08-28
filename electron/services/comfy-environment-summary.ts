import type {
  ComfyRuntimeOwnership,
  ComfyRuntimeState,
  ComfyUiCompatibility,
  ComfyUiEndpointScope,
  ComfyUiEnvironmentStatus,
  ComfyUiEnvironmentSummary,
  ComfyUiInstallationSummary,
  ComfyUiRepairPlan,
  ComfyUiRepairOperation,
  EnvironmentIssue,
  EnvironmentScanScope,
  PythonRuntimeCandidate
} from "../../src/types.js";
import { localEndpoint } from "./local-service-process.js";

export interface ComfyUiEnvironmentSummaryInput {
  endpoint: string;
  serviceReachable: boolean;
  runtimeState: Pick<ComfyRuntimeState, "phase" | "ownership" | "endpoint">;
  selectedInstallation: ComfyUiInstallationSummary | null;
  comfyRoot: string;
  sourceDirectory: string;
  python?: PythonRuntimeCandidate;
  compatibility: ComfyUiCompatibility;
  issues: readonly EnvironmentIssue[];
}

export interface ComfyUiRepairPlanInput {
  issueId: EnvironmentIssue["id"];
  endpoint: string;
  runtimeState: Pick<ComfyRuntimeState, "phase" | "ownership" | "endpoint">;
  selectedInstallation: ComfyUiInstallationSummary | null;
  comfyRoot: string;
  sourceDirectory: string;
  pythonPath: string;
}

export function comfyUiEndpointScope(endpoint: string): ComfyUiEndpointScope {
  const raw = endpoint.trim();
  if (!raw) return "unconfigured";
  if (localEndpoint(raw, 8188)) return "local";
  try {
    const parsed = new URL(raw);
    return parsed.hostname && ["http:", "https:"].includes(parsed.protocol)
      ? "remote"
      : "unconfigured";
  } catch {
    return "unconfigured";
  }
}

function normalizedEndpoint(value: string): string {
  return value.trim().replace(/\/+$/u, "").toLowerCase();
}

function runtimeForEndpoint(
  endpoint: string,
  runtimeState: Pick<ComfyRuntimeState, "phase" | "ownership" | "endpoint">
): Pick<ComfyRuntimeState, "phase" | "ownership"> {
  const runtimeEndpoint = normalizedEndpoint(runtimeState.endpoint);
  const targetEndpoint = normalizedEndpoint(endpoint);
  if (runtimeEndpoint && targetEndpoint && runtimeEndpoint !== targetEndpoint) {
    return { phase: "unknown", ownership: "unknown" };
  }
  return { phase: runtimeState.phase, ownership: runtimeState.ownership };
}

function compatibilityState(
  compatibility: ComfyUiCompatibility
): ComfyUiEnvironmentSummary["core"]["compatibilityState"] {
  return compatibility.compatibilityState ?? (
    compatibility.version || compatibility.revision || compatibility.checkedFrom
      ? "warning"
      : "unknown"
  );
}

function serviceReachableFromItems(
  items: readonly { id: string; ok: boolean }[]
): boolean {
  return items.some((item) => item.id === "comfyui-api" && item.ok);
}

export function buildComfyUiEnvironmentSummary(input: ComfyUiEnvironmentSummaryInput): ComfyUiEnvironmentSummary {
  const endpoint = input.endpoint.trim();
  const endpointScope = comfyUiEndpointScope(endpoint);
  const runtime = runtimeForEndpoint(endpoint, input.runtimeState);
  const coreState = compatibilityState(input.compatibility);
  const selectedInstallation = input.selectedInstallation;
  const hasInstallation = Boolean(
    input.comfyRoot ||
    selectedInstallation?.directory ||
    selectedInstallation?.sourceDirectory
  );
  const hasError = coreState === "error" || input.issues.some((issue) => issue.severity === "error");
  const status: ComfyUiEnvironmentStatus = !hasInstallation && !input.serviceReachable && endpointScope !== "remote"
      ? "not-found"
      : hasError
        ? "needs-attention"
        : !input.serviceReachable
          ? "offline"
          : input.issues.length > 0 || coreState === "warning"
            ? "needs-attention"
          : coreState === "unknown"
            ? "unknown"
            : "ready";
  const selectedPython = input.python;
  const canControlLocalService = endpointScope === "local";
  const canUseSelectedInstallation = Boolean(
    selectedInstallation && (selectedInstallation.sourceDirectory || selectedInstallation.executable)
  );
  const canUpdate = canControlLocalService && Boolean(
    selectedInstallation && (
      selectedInstallation.type === "desktop" ||
      selectedInstallation.sourceDirectory
    )
  );

  return {
    status,
    endpoint,
    endpointScope,
    serviceReachable: input.serviceReachable,
    runtimePhase: runtime.phase,
    runtimeOwnership: runtime.ownership,
    selectedInstallation,
    core: {
      version: input.compatibility.version,
      revision: input.compatibility.revision,
      checkedFrom: input.compatibility.checkedFrom,
      compatibilityState: coreState
    },
    python: {
      path: selectedPython?.path ?? "",
      version: selectedPython?.version ?? "",
      source: selectedPython?.source ?? "",
      available: Boolean(selectedPython?.path && selectedPython?.version)
    },
    issues: {
      total: input.issues.length,
      errors: input.issues.filter((issue) => issue.severity === "error").length,
      warnings: input.issues.filter((issue) => issue.severity === "warning").length,
      repairable: input.issues.filter((issue) => issue.repairable).length
    },
    operations: {
      canStart: canControlLocalService && canUseSelectedInstallation,
      canRestart: canControlLocalService && canUseSelectedInstallation,
      canStop: canControlLocalService,
      canUpdate,
      canRepair: canControlLocalService && input.issues.some((issue) => issue.repairable)
    }
  };
}

export function repairOperationForIssue(
  issueId: EnvironmentIssue["id"]
): ComfyUiRepairOperation {
  switch (issueId) {
    case "fantasytalking-unicodeescape":
      return "repair-node-source";
    case "comfy-core-pyav":
      return "repair-core-python";
    case "comfy-database":
      return "repair-database";
  }
}

function repairPlanForOperation(
  operation: ComfyUiRepairOperation,
  input: ComfyUiRepairPlanInput,
  endpointScope: ComfyUiEndpointScope,
  runtimeOwnership: ComfyRuntimeOwnership
): ComfyUiRepairPlan {
  const installDirectory = input.selectedInstallation?.directory || input.comfyRoot;
  const sourceDirectory = input.selectedInstallation?.sourceDirectory || input.sourceDirectory;
  const local = endpointScope === "local";
  const common = {
    target: {
      endpoint: input.endpoint.trim(),
      endpointScope,
      installType: (input.selectedInstallation?.type ?? "") as ComfyUiRepairPlan["target"]["installType"],
      installDirectory,
      sourceDirectory,
      dataDirectory: input.comfyRoot,
      pythonPath: input.pythonPath
    },
    service: {
      ownership: runtimeOwnership,
      remoteMutationAllowed: false as const
    },
    rescan: {
      required: true,
      scope: "full" as EnvironmentScanScope,
      waitForService: false
    },
    logging: {
      scope: "environment" as const,
      retainOutputOnFailure: true as const
    }
  };

  switch (operation) {
    case "repair-node-source":
      return {
        operation,
        ...common,
        backup: {
          required: true,
          strategy: "source-file-copy",
          directory: sourceDirectory || installDirectory
        },
        service: {
          ...common.service,
          action: local ? "restart-if-app-owned" : "none"
        }
      };
    case "repair-core-python":
      return {
        operation,
        ...common,
        backup: {
          required: false,
          strategy: "none",
          directory: input.pythonPath
        },
        service: {
          ...common.service,
          action: local ? "restart-if-app-owned" : "none"
        },
        rescan: {
          ...common.rescan,
          waitForService: true
        }
      };
    case "repair-database":
      return {
        operation,
        ...common,
        backup: {
          required: true,
          strategy: "sqlite-family-copy-and-quarantine",
          directory: input.comfyRoot ? `${input.comfyRoot}\\user` : ""
        },
        service: {
          ...common.service,
          action: local ? "start-and-verify" : "none"
        },
        rescan: {
          ...common.rescan,
          waitForService: true
        }
      };
  }
}

export function buildComfyUiRepairPlan(input: ComfyUiRepairPlanInput): ComfyUiRepairPlan {
  const endpointScope = comfyUiEndpointScope(input.endpoint);
  const runtime = runtimeForEndpoint(input.endpoint, input.runtimeState);
  return repairPlanForOperation(
    repairOperationForIssue(input.issueId),
    input,
    endpointScope,
    runtime.ownership
  );
}

export function attachComfyUiRepairPlans(
  issues: readonly EnvironmentIssue[],
  input: Omit<ComfyUiRepairPlanInput, "issueId">
): EnvironmentIssue[] {
  const endpointScope = comfyUiEndpointScope(input.endpoint);
  return issues.map((issue) => {
    if (endpointScope !== "local") {
      return {
        ...issue,
        repairable: false,
        detail: `${issue.detail} 远程 ComfyUI 仅支持连接，应用不会修改远程核心或节点文件。`,
        repairPlan: undefined
      };
    }
    return issue.repairable
      ? {
          ...issue,
          repairPlan: buildComfyUiRepairPlan({ ...input, issueId: issue.id })
        }
      : issue;
  });
}

export function serviceReachableFromEnvironmentItems(
  items: readonly { id: string; ok: boolean }[]
): boolean {
  return serviceReachableFromItems(items);
}
