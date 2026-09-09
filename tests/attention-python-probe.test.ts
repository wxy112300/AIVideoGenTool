import { describe, expect, it } from "vitest";
import {
  ATTENTION_PROBE_PREFIX,
  inspectAttentionPython,
  type AttentionPythonProbeRunner
} from "../electron/services/attention-python-probe.js";

function line(value: Record<string, unknown>): string {
  return `${ATTENTION_PROBE_PREFIX}${JSON.stringify(value)}`;
}

function runnerFor(
  execution: Awaited<ReturnType<AttentionPythonProbeRunner>>,
  scriptAssertions?: (script: string) => void
): AttentionPythonProbeRunner {
  return async (_python, args) => {
    scriptAssertions?.(String(args[1]));
    return execution;
  };
}

describe("inspectAttentionPython", () => {
  it("ignores noisy stdout and accepts the final valid complete checkpoint", async () => {
    const result = await inspectAttentionPython("python.exe", {
      runner: runnerFor({
        stdout: [
          "torch: loading",
          `${ATTENTION_PROBE_PREFIX}{not json}`,
          line({ probeStage: "metadata", probeState: "running", pythonVersion: "3.12.4", torchVersion: "2.10.0" }),
          "package log: ready",
          line({ probeStage: "kitchen", probeState: "complete", comfyKitchenBackends: ["cuda"], sageNativeReady: true }),
          "unrelated trailing line"
        ].join("\n"),
        exitCode: 0
      })
    });

    expect(result.probeState).toBe("complete");
    expect(result.pythonVersion).toBe("3.12.4");
    expect(result.torchVersion).toBe("2.10.0");
    expect(result.comfyKitchenBackends).toEqual(["cuda"]);
    expect(result.sageNativeReady).toBe(true);
  });

  it("retains metadata and the stage marker when the process times out", async () => {
    const result = await inspectAttentionPython("python.exe", {
      runner: runnerFor({
        stdout: [
          line({ probeStage: "metadata", probeState: "running", pythonVersion: "3.12.4", torchVersion: "2.10.0" }),
          line({ probeStage: "torch", checkpoint: "started", probeState: "running", pythonVersion: "3.12.4", torchVersion: "2.10.0" })
        ].join("\n"),
        timedOut: true,
        error: "spawn timeout"
      })
    });

    expect(result.probeState).toBe("failed");
    expect(result.probeStage).toBe("torch");
    expect(result.pythonVersion).toBe("3.12.4");
    expect(result.torchVersion).toBe("2.10.0");
    expect(result.probeError).toContain("timed out");
    expect(result.errors?.some((error) => error.includes("torch"))).toBe(true);
  });

  it("fails invalid output and nonzero exits with bounded actionable diagnostics", async () => {
    const result = await inspectAttentionPython("python.exe", {
      runner: runnerFor({
        stdout: `${ATTENTION_PROBE_PREFIX}{invalid`,
        stderr: "fatal: " + "x".repeat(2_000),
        exitCode: 17,
        error: "child failed"
      })
    });

    expect(result.probeState).toBe("failed");
    expect(result.probeError).toContain("exited with code 17");
    expect(result.errors?.join(" ")).toContain("no valid prefixed checkpoint");
    expect(result.errors?.every((error) => error.length <= 600)).toBe(true);
  });

  it("does not claim native readiness when sage import fails", async () => {
    const result = await inspectAttentionPython("python.exe", {
      runner: runnerFor({
        stdout: [
          line({ probeStage: "metadata", probeState: "running", pythonVersion: "3.12.4", torchVersion: "2.10.0" }),
          line({ probeStage: "torch", probeState: "running", torchVersion: "2.10.0" }),
          line({ probeStage: "sage", probeState: "running", sageNativeReady: false, sageNativeError: "No module named _fused", errors: ["sage native import: No module named _fused"] }),
          line({ probeStage: "kitchen", probeState: "running", comfyKitchenBackends: ["cuda"] }),
          line({ probeStage: "kitchen", probeState: "complete", sageNativeReady: false, sageNativeError: "No module named _fused", comfyKitchenBackends: ["cuda"] })
        ].join("\n"),
        exitCode: 0
      })
    });

    expect(result.probeState).toBe("complete");
    expect(result.sageNativeReady).toBe(false);
    expect(result.sageNativeError).toContain("_fused");
    expect(result.probeError).toContain("_fused");
    expect(result.errors?.some((error) => error.includes("sage native import"))).toBe(true);
  });

  it("reports an absent Python executable without spawning a retry", async () => {
    let spawned = false;
    const result = await inspectAttentionPython("", {
      runner: async () => {
        spawned = true;
        return {};
      }
    });

    expect(spawned).toBe(false);
    expect(result.probeState).toBe("failed");
    expect(result.probeStage).toBe("python");
    expect(result.probeError).toContain("Python executable");
  });

  it("configures the bounded Windows subprocess and ordered flushed stages", async () => {
    let seenOptions: unknown;
    const result = await inspectAttentionPython("python.exe", {
      runner: async (_python, args, options) => {
        seenOptions = options;
        const script = String(args[1]);
        expect(script.indexOf("emit('torch','started')")).toBeLessThan(script.indexOf("import torch"));
        expect(script.indexOf("emit('sage','started')")).toBeLessThan(script.indexOf("from sageattention"));
        expect(script.indexOf("emit('kitchen','started')")).toBeLessThan(script.indexOf("import comfy_kitchen"));
        expect(script).toContain("def error_text(error):");
        expect(script).toContain("flush=True");
        return { stdout: line({ probeStage: "kitchen", probeState: "complete" }), exitCode: 0 };
      }
    });

    expect(seenOptions).toEqual({ encoding: "utf8", timeout: 30_000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
    expect(result.probeState).toBe("complete");
  });
});
