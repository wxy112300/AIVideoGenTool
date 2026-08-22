import type { EnvironmentScanResult } from "../../src/types.js";

export interface EnvironmentScanDiagnostics {
  inventory: Record<string, unknown>;
  errors: string[];
  warnings: string[];
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function versionLabel(version: string, fallback = "unknown"): string {
  return version.trim() || fallback;
}

export function buildEnvironmentScanDiagnostics(
  scan: EnvironmentScanResult
): EnvironmentScanDiagnostics {
  const selectedPython = scan.pythonRuntimes.find((runtime) => runtime.selected) ??
    scan.pythonRuntimes[0];
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const item of scan.items) {
    if (item.ok) continue;
    const finding = `system:${item.id} (${item.label}): ${item.detail}`;
    if (item.status === "warning" || item.optional) warnings.push(finding);
    else errors.push(finding);
  }

  if (scan.comfyCompatibility.compatibilityState === "error") {
    errors.push(`comfy-core: ${scan.comfyCompatibility.compatibilityNotice || "incompatible core"}`);
  } else if (
    scan.comfyCompatibility.compatibilityState === "warning" ||
    scan.comfyCompatibility.compatibilityState === "unknown"
  ) {
    warnings.push(`comfy-core: ${scan.comfyCompatibility.compatibilityNotice || "compatibility unknown"}`);
  }
  if (scan.comfyCompatibility.checkedFrom) {
    for (const node of scan.comfyCompatibility.coreNodes.filter((node) => !node.available)) {
      errors.push(`comfy-core-node:${node.id} (${node.label}): missing`);
    }
    for (const node of scan.comfyCompatibility.promptCoreNodes.filter((node) => !node.available)) {
      warnings.push(`comfy-prompt-node:${node.id} (${node.label}): missing`);
    }
  }

  if (scan.llamaCppPython.error) {
    warnings.push(`llama-cpp-python: ${scan.llamaCppPython.error}`);
  } else if (scan.llamaCppPython.installed && !scan.llamaCppPython.ready) {
    warnings.push(`llama-cpp-python: ${scan.llamaCppPython.detail || "installed but not ready"}`);
  }
  if (scan.attentionAcceleration.detail && !scan.attentionAcceleration.ready) {
    warnings.push(`attention-runtime: ${scan.attentionAcceleration.detail}`);
  }

  for (const profile of scan.modelProfiles.filter((profile) => !profile.available)) {
    const requiredComponents = profile.components
      .filter((component) => !component.found && !component.optional)
      .map((component) => component.label);
    const missingNodes = profile.missingCustomNodeNames ?? profile.missingCustomNodeIds ?? [];
    const details = [
      requiredComponents.length ? `components=${requiredComponents.join(", ")}` : "",
      missingNodes.length ? `nodes=${missingNodes.join(", ")}` : "",
      profile.runtimeMissingNodes?.length
        ? `runtime=${profile.runtimeMissingNodes.join(", ")}`
        : ""
    ].filter(Boolean).join("; ");
    warnings.push(`model:${profile.id} (${profile.name}): ${details || "unavailable"}`);
  }

  for (const node of scan.customNodes) {
    if (!node.installed) {
      const finding = `custom-node:${node.id} (${node.name}): not installed`;
      if (node.required) errors.push(finding);
      else warnings.push(finding);
      continue;
    }
    if (node.loadError) {
      errors.push(`custom-node:${node.id} (${node.name}): ${node.loadError}`);
      continue;
    }
    if (node.compatibilityState === "error") {
      errors.push(`custom-node:${node.id} (${node.name}): ${node.compatibilityNotice || "incompatible"}`);
    } else if (
      node.compatibilityState === "warning" ||
      node.runtimeMissingNodeTypes?.length ||
      node.updateAvailable
    ) {
      warnings.push(
        `custom-node:${node.id} (${node.name}): ${node.compatibilityNotice || node.updateNotice ||
          (node.runtimeMissingNodeTypes?.length
            ? `runtime missing ${node.runtimeMissingNodeTypes.join(", ")}`
            : "update recommended")}`
      );
    }
  }

  for (const workflow of scan.workflowDependencies.filter((workflow) => !workflow.installed)) {
    warnings.push(`workflow:${workflow.id} (${workflow.name}): not installed`);
  }
  for (const issue of scan.issues) {
    const finding = `issue:${issue.id} (${issue.label}): ${issue.detail}`;
    if (issue.severity === "error") errors.push(finding);
    else warnings.push(finding);
  }

  return {
    inventory: {
      scannedAt: scan.scannedAt,
      comfyInstallType: scan.comfyInstallType || "unknown",
      comfyCoreVersion: versionLabel(scan.comfyCompatibility.version),
      comfyCoreRevision: versionLabel(scan.comfyCompatibility.revision),
      comfyCheckedFrom: scan.comfyCompatibility.checkedFrom || "unavailable",
      comfyCompatibility: scan.comfyCompatibility.compatibilityState || "unknown",
      selectedPythonVersion: versionLabel(selectedPython?.version ?? ""),
      selectedPythonSource: selectedPython?.source ?? "unknown",
      torchVersion: versionLabel(scan.attentionAcceleration.torchVersion),
      cudaVersion: versionLabel(scan.attentionAcceleration.cudaVersion),
      sageAttentionVersion: versionLabel(
        scan.attentionAcceleration.sageAttentionVersion,
        "not-installed"
      ),
      tritonVersion: versionLabel(scan.attentionAcceleration.tritonVersion, "not-installed"),
      comfyKitchenVersion: versionLabel(
        scan.attentionAcceleration.comfyKitchenVersion ?? "",
        "not-installed"
      ),
      comfyKitchenBackends: scan.attentionAcceleration.comfyKitchenBackends ?? [],
      attentionRuntimeReady: scan.attentionAcceleration.ready,
      llamaCppPythonVersion: versionLabel(scan.llamaCppPython.packageVersion, "not-installed"),
      llamaPythonVersion: versionLabel(scan.llamaCppPython.pythonVersion),
      llamaTorchVersion: versionLabel(scan.llamaCppPython.torchVersion),
      llamaCudaVersion: versionLabel(scan.llamaCppPython.cudaVersion),
      llamaGpuOffload: scan.llamaCppPython.gpuOffload,
      llamaCppPythonReady: scan.llamaCppPython.ready,
      gpuDevices: scan.gpus.map((gpu) =>
        `${gpu.index}:${gpu.name}; driver=${gpu.driverVersion}; vram=${Math.round(gpu.vramTotalBytes / 1024 ** 3)}GiB`
      ),
      systemItems: scan.items.map((item) =>
        `${item.id}:${item.ok ? "ok" : item.status || "missing"}; ${item.detail}`
      ),
      modelProfiles: scan.modelProfiles.length,
      availableModelProfiles: scan.modelProfiles.filter((profile) => profile.available).length,
      customNodes: scan.customNodes.length,
      loadedCustomNodes: scan.customNodes.filter((node) => node.loaded).length,
      customNodeVersions: scan.customNodes
        .filter((node) => node.installed)
        .map((node) => `${node.id}:${versionLabel(node.version)}`),
      workflows: scan.workflowDependencies.length,
      installedWorkflows: scan.workflowDependencies.filter((workflow) => workflow.installed).length
    },
    errors: unique(errors),
    warnings: unique(warnings)
  };
}
