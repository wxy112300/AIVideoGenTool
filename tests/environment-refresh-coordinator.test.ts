import { describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import {
  EnvironmentRefreshCoordinator,
  environmentScanScopeForReason
} from "../src/renderer/environment-refresh-coordinator";
import type { EnvironmentScanResult } from "../src/types";

function scanResult(scannedAt: string): EnvironmentScanResult {
  return { scannedAt } as EnvironmentScanResult;
}

describe("EnvironmentRefreshCoordinator", () => {
  it("maps refresh reasons to the narrowest safe scan scope", () => {
    expect(environmentScanScopeForReason("startup")).toBe("full");
    expect(environmentScanScopeForReason("manual")).toBe("full");
    expect(environmentScanScopeForReason("settings-change")).toBe("full");
    expect(environmentScanScopeForReason("service-change")).toBe("runtime");
    expect(environmentScanScopeForReason("dependency-change")).toBe("dependencies");
  });

  it("commits only the latest overlapping scan", async () => {
    let resolveFirst!: (scan: EnvironmentScanResult) => void;
    let resolveSecond!: (scan: EnvironmentScanResult) => void;
    const firstScan = new Promise<EnvironmentScanResult>((resolve) => {
      resolveFirst = resolve;
    });
    const secondScan = new Promise<EnvironmentScanResult>((resolve) => {
      resolveSecond = resolve;
    });
    const commit = vi.fn();
    const setScanning = vi.fn();
    const scan = vi.fn()
      .mockReturnValueOnce(firstScan)
      .mockReturnValueOnce(secondScan);
    const coordinator = new EnvironmentRefreshCoordinator({
      scan,
      setScanning,
      setError: vi.fn(),
      commit,
      afterCommit: vi.fn(),
      notify: vi.fn(),
      scanningMessage: () => "scanning",
      completedMessage: () => "complete",
      failedMessage: () => "failed",
      requestRender: vi.fn(),
      reportScan: vi.fn()
    });
    const settings = createDefaultState().settings;

    const first = coordinator.refresh(settings, "manual");
    const second = coordinator.refresh(settings, "settings-change");
    resolveFirst(scanResult("old"));
    await first;
    expect(commit).not.toHaveBeenCalled();
    resolveSecond(scanResult("new"));
    await second;

    expect(commit).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledWith(expect.objectContaining({ scannedAt: "new" }));
    expect(setScanning).toHaveBeenLastCalledWith(false);
    expect(scan).toHaveBeenNthCalledWith(1, settings, "full");
    expect(scan).toHaveBeenNthCalledWith(2, settings, "full");
  });
});
