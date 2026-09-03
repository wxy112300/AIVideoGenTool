import { describe, expect, it } from "vitest";
import type { CustomNodeStatus, EnvironmentScanResult } from "../src/types";
import {
  h3CapabilityProfileFor,
  h3NativeResolutionOptionsFor,
  h3NativeSecondSamplingAvailabilityFor
} from "../src/core/h3-capabilities";
import { outputDimensions } from "../src/core/workflow";

function customNode(id: string, overrides: Partial<CustomNodeStatus> = {}): CustomNodeStatus {
  return {
    id,
    name: id,
    purpose: "test",
    repositoryUrl: "",
    installed: true,
    loaded: true,
    runtimeVerified: true,
    loadError: "",
    directory: `C:/ComfyUI/custom_nodes/${id}`,
    required: false,
    version: "",
    minimumVersion: "",
    recommendedVersion: "",
    latestVersion: "",
    updateAvailable: false,
    ...overrides
  };
}

function environment(overrides: Partial<EnvironmentScanResult> = {}): EnvironmentScanResult {
  return {
    scannedAt: "2026-09-02T00:00:00.000Z",
    userHome: "C:/Users/test",
    comfyRoot: "C:/ComfyUI",
    comfyUrl: "http://127.0.0.1:8188",
    comfyInstallDirectory: "C:/ComfyUI",
    comfySourceDirectory: "C:/ComfyUI",
    comfyInstallType: "manual",
    comfyInstallations: [],
    pythonRuntimes: [],
    gpus: [],
    modelDirectory: "C:/ComfyUI/models",
    outputDirectory: "C:/ComfyUI/output",
    llamaServer: {} as EnvironmentScanResult["llamaServer"],
    llamaCppPython: {} as EnvironmentScanResult["llamaCppPython"],
    comfyCompatibility: {
      version: "",
      revision: "",
      h3MinimumVersion: "0.0.0",
      h3MinimumRevision: "",
      h3RecommendedVersion: "",
      h3CoreSupported: true,
      coreNodes: [],
      promptCoreSupported: true,
      promptCoreNodes: [],
      checkedFrom: "api",
      updateMode: "manual",
      updateHint: ""
    },
    attentionAcceleration: {} as EnvironmentScanResult["attentionAcceleration"],
    items: [],
    modelProfiles: [],
    customNodes: [
      customNode("h3-latent-upscaler"),
      customNode("local-video-studio-h3-av")
    ],
    issues: [],
    ...overrides
  } as EnvironmentScanResult;
}

function readyEvidence(scan = environment()) {
  return {
    environment: scan,
    staticWorkflowValidated: true,
    realRunValidated: true
  } as const;
}

describe("H3 native high-resolution capabilities", () => {
  it("keeps 1080p and 1440p disabled without provider evidence", () => {
    expect(h3NativeResolutionOptionsFor("minimax_h3_fl2va", null)).toEqual([
      { value: 1080, enabled: false, reasonCode: "runtime-unverified" },
      { value: 1440, enabled: false, reasonCode: "runtime-unverified" }
    ]);
  });

  it("requires Comfy node/runtime evidence before enabling either target", () => {
    const evidence = readyEvidence();
    const profile = h3CapabilityProfileFor("minimax_h3_fl2va", evidence);
    expect(profile.ready).toBe(true);
    expect(profile.firstPassResolutions).toEqual([720, 768]);
    expect(profile.secondSamplingResolutions).toEqual([1080, 1440]);
    expect(h3NativeResolutionOptionsFor("minimax_h3_fl2va", evidence)).toEqual([
      { value: 1080, enabled: true },
      { value: 1440, enabled: true }
    ]);
  });

  it("keeps high-resolution targets disabled when a required Comfy node is absent", () => {
    const evidence = readyEvidence(environment({
      customNodes: [customNode("local-video-studio-h3-av")]
    }));
    const profile = h3CapabilityProfileFor("minimax_h3_fl2va", evidence);
    expect(profile.ready).toBe(false);
    expect(profile.reasonCode).toBe("node-missing");
    expect(h3NativeResolutionOptionsFor("minimax_h3_fl2va", evidence)).toEqual([
      { value: 1080, enabled: false, reasonCode: "node-missing" },
      { value: 1440, enabled: false, reasonCode: "node-missing" }
    ]);
  });

  it("requires a committed compatible joint AV artifact before native sampling", () => {
    const base = {
      modelId: "minimax_h3_fl2va",
      sourceShortEdge: 768,
      targetShortEdge: 1080,
      artifactCompatible: true,
      conditioningRebuildable: true,
      environment: environment(),
      staticWorkflowValidated: true,
      realRunValidated: true
    };
    expect(h3NativeSecondSamplingAvailabilityFor({
      ...base,
      hasCommittedArtifact: false
    })).toEqual({ enabled: false, reasonCode: "artifact-missing" });
    expect(h3NativeSecondSamplingAvailabilityFor({
      ...base,
      hasCommittedArtifact: true
    })).toEqual({ enabled: true });
    expect(h3NativeSecondSamplingAvailabilityFor({
      ...base,
      modelId: "ltx-video",
      hasCommittedArtifact: true
    })).toEqual({ enabled: false, reasonCode: "model-incompatible" });
  });

  it("calculates native targets as short-edge values for H3 aspect ratios", () => {
    expect(outputDimensions({
      modelId: "minimax_h3_fl2va",
      ratio: "16:9",
      resolution: 1080,
      sourceWidth: 0,
      sourceHeight: 0
    })).toEqual([1920, 1088]);
    expect(outputDimensions({
      modelId: "minimax_h3_fl2va",
      ratio: "16:9",
      resolution: 1440,
      sourceWidth: 0,
      sourceHeight: 0
    })).toEqual([2560, 1440]);
  });
});
