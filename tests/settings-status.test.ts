import { describe, expect, it } from "vitest";
import {
  customNodeStatusTone,
  environmentItemStatusTone,
  modelProfileStatusTone
} from "../src/renderer/shared/status";
import type { CustomNodeStatus, EnvironmentItem, ModelScanProfile } from "../src/types";

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
  it("uses warning for installed image files waiting for runtime validation", () => {
    expect(modelProfileStatusTone(profile({ runtimeVerified: false }), false)).toBe("warning");
    expect(modelProfileStatusTone(profile({ runtimeVerified: true, runtimeReady: true }), true)).toBe("available");
  });

  it("keeps confirmed missing dependencies as errors", () => {
    expect(modelProfileStatusTone(profile({ available: false }), false)).toBe("missing");
    expect(modelProfileStatusTone(profile({ runtimeVerified: true, runtimeReady: false }), false)).toBe("missing");
  });

  it("distinguishes node installation, verification, and load errors", () => {
    expect(customNodeStatusTone(node({ runtimeVerified: false }))).toBe("warning");
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
