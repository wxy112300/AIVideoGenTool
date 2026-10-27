import { describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import {
  EnvironmentRefreshCoordinator,
  environmentScanOptionsForReason,
  environmentScanScopeForReason
} from "../src/renderer/environment-refresh-coordinator";
import type { EnvironmentScanProgress, EnvironmentScanResult } from "../src/types";

function scanResult(scannedAt: string): EnvironmentScanResult {
  return { scannedAt } as EnvironmentScanResult;
}

describe("EnvironmentRefreshCoordinator", () => {
  it("updates only the current scan's keyed notice and ignores events after completion", async () => {
    const callbacks: Array<(progress: EnvironmentScanProgress) => void> = [];
    const finishes: Array<(result: EnvironmentScanResult) => void> = [];
    const scan = vi.fn((_settings, _scope, _options, progress) => {
      callbacks.push(progress);
      return new Promise<EnvironmentScanResult>(resolve => finishes.push(resolve));
    });
    const notify = vi.fn(), requestRender = vi.fn();
    const coordinator = new EnvironmentRefreshCoordinator({
      scan, notify, requestRender, setScanning: vi.fn(), setError: vi.fn(), commit: vi.fn(), afterCommit: vi.fn(),
      scanningMessage: () => "scanning", progressMessage: p => p.stage,
      completedMessage: () => "complete", failedMessage: () => "failed", reportScan: vi.fn()
    });
    const settings = createDefaultState().settings;
    const first = coordinator.refresh(settings, "startup"), second = coordinator.refresh(settings, "manual");
    const before = notify.mock.calls.length;
    callbacks[0]!({ stage: "files", completed: 1, total: 4 });
    expect(notify).toHaveBeenCalledTimes(before);
    callbacks[1]!({ stage: "attention", completed: 2, total: 4 });
    expect(notify).toHaveBeenLastCalledWith("attention", expect.objectContaining({ key: "environment-scan", renderPage: false, progress: { stage: "attention", completed: 2, total: 4 } }));
    expect(requestRender).toHaveBeenCalledTimes(2);
    finishes[1]!(scanResult("new")); await second;
    const completeCount = notify.mock.calls.length;
    callbacks[1]!({ stage: "system", completed: 3, total: 4 });
    expect(notify).toHaveBeenCalledTimes(completeCount);
    finishes[0]!(scanResult("old")); await first;
  });

  it("rechecks failed Python evidence on service change and returns to lightweight refresh after recovery", async () => {
    const failed = { ...scanResult("failed"), attentionAcceleration: { probeState: "failed", probeError: "timeout" } } as EnvironmentScanResult;
    const recovered = { ...scanResult("recovered"), attentionAcceleration: { probeState: "complete", ready: true } } as EnvironmentScanResult;
    const scan = vi.fn().mockResolvedValueOnce(failed).mockResolvedValue(recovered);
    const commit = vi.fn();
    const coordinator = new EnvironmentRefreshCoordinator({
      scan, commit, setScanning: vi.fn(), setError: vi.fn(), afterCommit: vi.fn(), notify: vi.fn(),
      scanningMessage: () => "scanning", completedMessage: () => "complete", failedMessage: () => "failed",
      requestRender: vi.fn(), reportScan: vi.fn()
    });
    const settings = createDefaultState().settings;
    await coordinator.refresh(settings, "startup");
    await coordinator.refresh(settings, "service-change");
    expect(scan).toHaveBeenNthCalledWith(2, settings, "dependencies");
    expect(commit).toHaveBeenLastCalledWith(recovered);
    await coordinator.refresh(settings, "service-change");
    expect(scan).toHaveBeenNthCalledWith(3, settings, "runtime");
  });

  it("refreshes releases only for an explicit manual scan", () => {
    expect(environmentScanOptionsForReason("manual")).toEqual({ refreshReleaseVersions: true });
    expect(environmentScanOptionsForReason("startup")).toBeUndefined();
    expect(environmentScanOptionsForReason("dependency-change")).toBeUndefined();
    expect(environmentScanOptionsForReason("runtime-verification")).toEqual({ forcePythonProbe: true });
  });
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
    expect(scan).toHaveBeenNthCalledWith(1, settings, "full", { refreshReleaseVersions: true });
    expect(scan).toHaveBeenNthCalledWith(2, settings, "full");
  });
});
