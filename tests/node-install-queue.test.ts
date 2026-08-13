import { describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import {
  CustomNodeInstallQueue,
  customNodeIdsForBulkAction
} from "../src/renderer/pages/settings/node-install-queue";
import type { CustomNodeStatus, EnvironmentScanResult } from "../src/types";

function nodeStatus(id: string, patch: Partial<CustomNodeStatus> = {}): CustomNodeStatus {
  return {
    id,
    name: id,
    purpose: "test",
    repositoryUrl: "https://example.test/node.git",
    installed: true,
    loaded: true,
    runtimeVerified: true,
    loadError: "",
    directory: `C:\\ComfyUI\\custom_nodes\\${id}`,
    required: false,
    version: "1.0.0",
    minimumVersion: "",
    recommendedVersion: "",
    latestVersion: "1.0.0",
    updateAvailable: false,
    ...patch
  };
}

function scanWithLoadedNodes(...nodeIds: string[]): EnvironmentScanResult {
  return {
    customNodes: nodeIds.map((id) => ({
      id,
      name: id,
      purpose: "test",
      repositoryUrl: "https://example.test/node.git",
      installed: true,
      loaded: true,
      runtimeVerified: true,
      loadError: "",
      directory: `C:\\ComfyUI\\custom_nodes\\${id}`,
      required: false,
      version: "1.0.0",
      minimumVersion: "",
      recommendedVersion: "",
      latestVersion: "1.0.0",
      updateAvailable: false
    }))
  } as EnvironmentScanResult;
}

function messages() {
  return {
    queued: (name: string, position: number) => `queued ${name} ${position}`,
    processing: "processing",
    restartLog: (message: string) => `restart ${message}`,
    installFailed: (name: string, message: string) => `failed ${name}: ${message}`,
    restartFailed: (message: string) => `restart failed: ${message}`,
    readyCheckFailed: (name: string) => `verify failed: ${name}`,
    completed: (success: number, failed: number) => `completed ${success}/${failed}`
  };
}

describe("CustomNodeInstallQueue", () => {
  it("bulk-selects only missing, unloaded, or outdated nodes until everything is healthy", () => {
    const nodes = [
      nodeStatus("healthy"),
      nodeStatus("missing", { installed: false, loaded: false }),
      nodeStatus("unloaded", { loaded: false }),
      nodeStatus("outdated", { updateAvailable: true })
    ];
    expect(customNodeIdsForBulkAction(nodes)).toEqual(["missing", "unloaded", "outdated"]);
    expect(customNodeIdsForBulkAction(nodes.slice(0, 1))).toEqual(["healthy"]);
  });

  it("installs queued nodes serially, then restarts and scans once", async () => {
    const settings = createDefaultState().settings;
    const calls: string[] = [];
    let concurrent = 0;
    let maxConcurrent = 0;
    const logs: Record<string, string> = {};
    const notify = vi.fn();
    const restart = vi.fn(async () => ({ ok: true, message: "restarted" }));
    const scan = vi.fn(async () => scanWithLoadedNodes("node-a", "node-b", "node-c"));
    const queue = new CustomNodeInstallQueue({
      install: async (nodeId) => {
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        calls.push(nodeId);
        await Promise.resolve();
        concurrent -= 1;
        return { ok: true, message: `${nodeId} installed` };
      },
      restart,
      scan,
      nodeName: (nodeId) => nodeId,
      getLog: (nodeId) => logs[nodeId] ?? "",
      setLog: (nodeId, log) => { logs[nodeId] = log; },
      setEnvironmentScan: vi.fn(),
      notify,
      onSnapshot: vi.fn(),
      messages: messages()
    });

    expect(queue.enqueue("node-a", settings)).toEqual({ accepted: true, position: 1 });
    expect(queue.enqueue("node-b", settings)).toEqual({ accepted: true, position: 2 });
    expect(queue.enqueue("node-c", settings)).toEqual({ accepted: true, position: 3 });
    expect(queue.enqueue("node-b", settings)).toEqual({ accepted: false, position: 0 });
    await queue.waitForIdle();

    expect(calls).toEqual(["node-a", "node-b", "node-c"]);
    expect(maxConcurrent).toBe(1);
    expect(restart).toHaveBeenCalledTimes(1);
    expect(scan).toHaveBeenCalledTimes(1);
    expect(queue.snapshot()).toEqual({
      phase: "idle",
      activeNodeId: "",
      queuedNodeIds: [],
      batchNodeIds: []
    });
    expect(notify).toHaveBeenLastCalledWith("completed 3/0", "info");
  });

  it("continues after one install fails and keeps the batch settings snapshot", async () => {
    const firstSettings = createDefaultState().settings;
    firstSettings.comfyInstallDirectory = "C:\\Comfy-A";
    const laterSettings = structuredClone(firstSettings);
    laterSettings.comfyInstallDirectory = "D:\\Comfy-B";
    const receivedDirectories: string[] = [];
    const logs: Record<string, string> = {};
    const notify = vi.fn();
    const queue = new CustomNodeInstallQueue({
      install: async (nodeId, settings) => {
        receivedDirectories.push(settings.comfyInstallDirectory);
        return nodeId === "broken"
          ? { ok: false, message: "pip failed" }
          : { ok: true, message: "installed" };
      },
      restart: async () => ({ ok: true, message: "restarted" }),
      scan: async () => scanWithLoadedNodes("healthy"),
      nodeName: (nodeId) => nodeId,
      getLog: (nodeId) => logs[nodeId] ?? "",
      setLog: (nodeId, log) => { logs[nodeId] = log; },
      setEnvironmentScan: vi.fn(),
      notify,
      onSnapshot: vi.fn(),
      messages: messages()
    });

    queue.enqueue("broken", firstSettings);
    queue.enqueue("healthy", laterSettings);
    await queue.waitForIdle();

    expect(receivedDirectories).toEqual(["C:\\Comfy-A", "C:\\Comfy-A"]);
    expect(notify).toHaveBeenCalledWith("failed broken: pip failed", "error");
    expect(notify).toHaveBeenLastCalledWith("completed 1/1", "warning");
  });
});
