import { describe, expect, it } from "vitest";
import {
  attachComfyUiRepairPlans,
  buildComfyUiEnvironmentSummary,
  buildComfyUiRepairPlan,
  comfyUiEndpointScope,
  repairOperationForIssue
} from "../electron/services/comfy-environment-summary.js";
import type {
  ComfyRuntimeState,
  ComfyUiCompatibility,
  ComfyUiInstallationSummary,
  EnvironmentIssue
} from "../src/types.js";

const runtimeState: ComfyRuntimeState = {
  phase: "stopped",
  ownership: "none",
  endpoint: "http://127.0.0.1:8188",
  message: "",
  updatedAt: "2026-08-27T00:00:00.000Z",
  operationId: 1
};

const installation: ComfyUiInstallationSummary = {
  type: "manual",
  directory: "C:\\ComfyUI",
  sourceDirectory: "C:\\ComfyUI",
  executable: "",
  desktopVersion: "",
  version: "0.33.1",
  revision: "abc12345",
  selected: true
};

const compatibility: ComfyUiCompatibility = {
  version: "0.33.1",
  revision: "abc12345",
  h3MinimumVersion: "0.31.0",
  h3MinimumRevision: "",
  h3RecommendedVersion: "0.33.1",
  h3CoreSupported: true,
  coreNodes: [],
  promptCoreSupported: true,
  promptCoreNodes: [],
  checkedFrom: "source",
  updateMode: "git",
  updateHint: "",
  compatibilityState: "supported"
};

const issue: EnvironmentIssue = {
  id: "comfy-database",
  label: "ComfyUI 数据库初始化失败",
  detail: "数据库迁移失败",
  severity: "warning",
  repairable: true,
  repairLabel: "智能修复"
};

describe("ComfyUI environment summary", () => {
  it("distinguishes local, remote, and unconfigured endpoints", () => {
    expect(comfyUiEndpointScope("http://127.0.0.1:8188")).toBe("local");
    expect(comfyUiEndpointScope("https://comfy.example.test")).toBe("remote");
    expect(comfyUiEndpointScope("")).toBe("unconfigured");
    expect(comfyUiEndpointScope("not-a-url")).toBe("unconfigured");
  });

  it("reports an offline local installation while keeping local operations available", () => {
    const summary = buildComfyUiEnvironmentSummary({
      endpoint: "http://127.0.0.1:8188",
      serviceReachable: false,
      runtimeState,
      selectedInstallation: installation,
      comfyRoot: "C:\\ComfyUI",
      sourceDirectory: "C:\\ComfyUI",
      python: {
        path: "C:\\ComfyUI\\.venv\\Scripts\\python.exe",
        version: "3.12.11",
        source: "comfy-venv",
        selected: true
      },
      compatibility,
      issues: []
    });

    expect(summary).toMatchObject({
      status: "offline",
      endpointScope: "local",
      runtimePhase: "stopped",
      runtimeOwnership: "none",
      python: {
        version: "3.12.11",
        available: true
      },
      operations: {
        canStart: true,
        canRestart: true,
        canStop: true,
        canUpdate: true,
        canRepair: false
      }
    });
  });

  it("keeps remote environments connection-only", () => {
    const summary = buildComfyUiEnvironmentSummary({
      endpoint: "https://comfy.example.test",
      serviceReachable: true,
      runtimeState: {
        ...runtimeState,
        endpoint: "https://comfy.example.test",
        phase: "ready",
        ownership: "external"
      },
      selectedInstallation: null,
      comfyRoot: "",
      sourceDirectory: "",
      compatibility,
      issues: [issue]
    });

    expect(summary).toMatchObject({
      status: "needs-attention",
      endpointScope: "remote",
      runtimeOwnership: "external",
      operations: {
        canStart: false,
        canRestart: false,
        canStop: false,
        canUpdate: false,
        canRepair: false
      }
    });
  });

  it("describes database repair scope and preserves the selected target", () => {
    const plan = buildComfyUiRepairPlan({
      issueId: "comfy-database",
      endpoint: "http://127.0.0.1:8188",
      runtimeState: {
        ...runtimeState,
        ownership: "app"
      },
      selectedInstallation: installation,
      comfyRoot: "C:\\ComfyUI",
      sourceDirectory: "C:\\ComfyUI",
      pythonPath: "C:\\ComfyUI\\.venv\\Scripts\\python.exe"
    });

    expect(plan).toMatchObject({
      operation: "repair-database",
      target: {
        endpointScope: "local",
        installDirectory: "C:\\ComfyUI",
        sourceDirectory: "C:\\ComfyUI",
        dataDirectory: "C:\\ComfyUI",
        pythonPath: "C:\\ComfyUI\\.venv\\Scripts\\python.exe"
      },
      backup: {
        required: true,
        strategy: "sqlite-family-copy-and-quarantine",
        directory: "C:\\ComfyUI\\user"
      },
      service: {
        ownership: "app",
        action: "start-and-verify",
        remoteMutationAllowed: false
      },
      rescan: {
        required: true,
        scope: "full",
        waitForService: true
      },
      logging: {
        scope: "environment",
        retainOutputOnFailure: true
      }
    });
  });

  it("removes repair actions from issue cards for remote endpoints", () => {
    const remoteIssues = attachComfyUiRepairPlans([issue], {
      endpoint: "https://comfy.example.test",
      runtimeState: {
        ...runtimeState,
        endpoint: "https://comfy.example.test",
        ownership: "external"
      },
      selectedInstallation: null,
      comfyRoot: "",
      sourceDirectory: "",
      pythonPath: ""
    });

    expect(remoteIssues[0]).toMatchObject({
      repairable: false,
      repairPlan: undefined
    });
    expect(remoteIssues[0].detail).toContain("远程 ComfyUI");
    expect(repairOperationForIssue("comfy-core-pyav")).toBe("repair-core-python");
  });
});
