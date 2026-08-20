import { describe, expect, it } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import {
  customNodeStatusTone,
  environmentItemStatusTone,
  modelProfileEvidence,
  modelProfileStatusTone,
  promptModelStatus
} from "../src/renderer/shared/status";
import { deriveEnvironmentOverviewItems } from "../src/renderer/pages/settings/selectors";
import type { CustomNodeStatus, EnvironmentItem, EnvironmentScanResult, ModelScanProfile } from "../src/types";

function profile(overrides: Partial<ModelScanProfile> = {}): ModelScanProfile {
  return {
    id: "test-model",
    name: "Test model",
    category: "image",
    managedBy: "comfyui",
    badge: "test",
    description: "",
    vram: "",
    available: true,
    integrated: true,
    components: [],
    ...overrides
  };
}

function node(overrides: Partial<CustomNodeStatus> = {}): CustomNodeStatus {
  return {
    id: "test-node",
    name: "Test node",
    purpose: "",
    repositoryUrl: "",
    installed: true,
    loaded: true,
    runtimeVerified: true,
    loadError: "",
    updateNotice: "",
    directory: "",
    required: true,
    version: "",
    minimumVersion: "",
    recommendedVersion: "",
    latestVersion: "",
    runtimeRequirement: "",
    bulkInstall: true,
    updateAvailable: false,
    ...overrides
  };
}

describe("settings status tones", () => {
  it("blocks prompt startup for missing nodes but permits pending runtime validation", () => {
    const settings = {
      ...createDefaultState().settings,
      promptModelId: "test-model"
    };
    const missingNodeProfile = profile({
      category: "prompt",
      requiredCustomNodeIds: ["test-node"],
      missingCustomNodeIds: ["test-node"],
      missingCustomNodeNames: ["Test node"]
    });
    expect(promptModelStatus(settings, {
      modelProfiles: [missingNodeProfile]
    } as EnvironmentScanResult).ready).toBe(false);

    const pendingProfile = profile({
      category: "prompt",
      requiredCustomNodeIds: ["test-node"],
      customNodeCompatibility: "supported",
      runtimeVerified: false
    });
    expect(promptModelStatus(settings, {
      modelProfiles: [pendingProfile]
    } as EnvironmentScanResult).ready).toBe(true);
  });

  it("projects live ComfyUI connectivity without rewriting the scan snapshot", () => {
    const scan = {
      scannedAt: "2026-08-20T00:00:00.000Z",
      comfyUrl: "http://127.0.0.1:8188",
      modelProfiles: [profile()],
      items: [
        { id: "comfyui-api", label: "ComfyUI 服务", ok: false, detail: "旧的离线结果" },
        { id: "nvidia", label: "NVIDIA", ok: true, detail: "已连接" }
      ]
    } as EnvironmentScanResult;

    const originalScan = structuredClone(scan);
    const liveItems = deriveEnvironmentOverviewItems(scan, true);
    expect(liveItems.find((item) => item.id === "comfyui-api")).toMatchObject({
      ok: true,
      status: "available",
      tone: "available",
      detail: "http://127.0.0.1:8188/system_stats",
      liveState: "running"
    });
    const offlineItems = deriveEnvironmentOverviewItems(scan, false);
    expect(offlineItems.find((item) => item.id === "comfyui-api")).toMatchObject({
      ok: false,
      status: "warning",
      tone: "warning",
      detail: "http://127.0.0.1:8188/system_stats",
      liveState: "unavailable"
    });
    expect(offlineItems.find((item) => item.id === "nvidia")).toMatchObject({
      ok: true,
      detail: "已连接"
    });
    expect(deriveEnvironmentOverviewItems(scan)).toMatchObject(scan.items);
    expect(scan).toEqual(originalScan);
  });

  it("keeps installed model files ready while runtime validation is pending", () => {
    expect(modelProfileStatusTone(profile({ runtimeVerified: false }))).toBe("available");
    expect(modelProfileEvidence(profile({ runtimeVerified: false }))).toMatchObject({
      files: "ready",
      runtime: "pending"
    });
    expect(modelProfileStatusTone(profile({ runtimeVerified: true, runtimeReady: true }))).toBe("available");
  });

  it("distinguishes file-only models from models that require runtime nodes", () => {
    expect(modelProfileEvidence(profile())).toMatchObject({
      files: "ready",
      nodePackage: "not-required",
      runtime: "not-required"
    });
    const installedNodePendingRuntime = profile({
      requiredCustomNodeIds: ["required-node"],
      missingCustomNodeIds: [],
      customNodeCompatibility: "supported",
      runtimeVerified: false
    });
    expect(modelProfileEvidence(installedNodePendingRuntime)).toMatchObject({
      files: "ready",
      nodePackage: "ready",
      runtime: "pending"
    });
    expect(modelProfileStatusTone(installedNodePendingRuntime)).toBe("available");
    const legacyInstalledNodePendingRuntime = profile({
      requiredCustomNodeIds: ["required-node"],
      missingCustomNodeIds: [],
      customNodeCompatibility: "unknown",
      runtimeVerified: false
    });
    expect(modelProfileEvidence(legacyInstalledNodePendingRuntime)).toMatchObject({
      nodePackage: "ready",
      runtime: "pending"
    });
    expect(modelProfileStatusTone(legacyInstalledNodePendingRuntime)).toBe("available");
    expect(modelProfileStatusTone(profile({ integrated: false }))).toBe("warning");
    expect(modelProfileStatusTone(profile({
      requiredCustomNodeIds: ["required-node"],
      missingCustomNodeIds: [],
      customNodeCompatibility: "warning"
    }))).toBe("warning");
    expect(modelProfileStatusTone(profile({
      requiredCustomNodeIds: ["required-node"],
      missingCustomNodeIds: [],
      customNodeCompatibility: "error"
    }))).toBe("missing");
  });

  it("keeps confirmed missing dependencies as errors", () => {
    expect(modelProfileStatusTone(profile({ available: false }))).toBe("missing");
    expect(modelProfileStatusTone(profile({ runtimeVerified: true, runtimeReady: false }))).toBe("missing");
    const missingNodeWithCompleteFiles = profile({
      requiredCustomNodeIds: ["required-node"],
      missingCustomNodeIds: ["required-node"]
    });
    expect(modelProfileEvidence(missingNodeWithCompleteFiles).nodePackage).toBe("missing");
    expect(modelProfileStatusTone(missingNodeWithCompleteFiles)).toBe("missing");
  });

  it("distinguishes node installation, verification, and load errors", () => {
    expect(customNodeStatusTone(node({ runtimeVerified: false }))).toBe("available");
    expect(customNodeStatusTone(node({ updateAvailable: true }))).toBe("warning");
    expect(customNodeStatusTone(node({ loadError: "previous import failed" }), true)).toBe("warning");
    expect(customNodeStatusTone(node({ installed: false, loaded: false }))).toBe("missing");
    expect(customNodeStatusTone(node({ loadError: "import failed", loaded: false }))).toBe("missing");
    expect(customNodeStatusTone(node())).toBe("available");
  });

  it("renders optional environment checks as warnings rather than failures", () => {
    const optional: EnvironmentItem = { id: "comfyui-api", label: "API", ok: false, detail: "", optional: true };
    const required: EnvironmentItem = { id: "nvidia", label: "GPU", ok: false, detail: "" };
    const offlineService: EnvironmentItem = { id: "comfyui-api", label: "API", ok: false, detail: "", status: "warning" };
    expect(environmentItemStatusTone(optional)).toBe("warning");
    expect(environmentItemStatusTone(required)).toBe("missing");
    expect(environmentItemStatusTone(offlineService)).toBe("warning");
  });
});
