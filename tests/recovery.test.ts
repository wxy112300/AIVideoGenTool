import { describe, expect, it } from "vitest";
import {
  classifyFailureForRecovery,
  nextAutomaticRetryAttempt
} from "../src/core/recovery.js";

describe("queue failure recovery classification", () => {
  it("force-stops a poisoned CUDA context", () => {
    expect(classifyFailureForRecovery(new Error("CUDA error: an illegal memory access was encountered"))).toMatchObject({
      kind: "cuda-context",
      recoverable: true,
      requiresRestart: true,
      forceStop: true
    });
    expect(classifyFailureForRecovery(new Error("hostbuf_file_reader_read failed"))).toMatchObject({
      kind: "cuda-context",
      forceStop: true
    });
  });

  it("restarts and retries transient GPU or service failures", () => {
    expect(classifyFailureForRecovery(new Error("CUDA out of memory"))).toMatchObject({
      kind: "gpu-memory",
      recoverable: true
    });
    expect(classifyFailureForRecovery(new Error("fetch failed: ECONNRESET"))).toMatchObject({
      kind: "service-transient",
      recoverable: true
    });
    expect(classifyFailureForRecovery(new Error("no progress"), true)).toMatchObject({
      kind: "service-stalled",
      recoverable: true
    });
  });

  it("does not retry deterministic workflow errors", () => {
    expect(classifyFailureForRecovery(new Error("缺少工作流节点 MiniMaxH3ImageToVideo"))).toEqual({
      kind: "none",
      recoverable: false,
      requiresRestart: false,
      forceStop: false
    });
  });

  it("bounds unattended retries and treats the setting as retry count", () => {
    expect(nextAutomaticRetryAttempt({
      enabled: true,
      recoverable: true,
      currentAttempt: 0,
      retryLimit: 2
    })).toBe(1);
    expect(nextAutomaticRetryAttempt({
      enabled: true,
      recoverable: true,
      currentAttempt: 1,
      retryLimit: 2
    })).toBe(2);
    expect(nextAutomaticRetryAttempt({
      enabled: true,
      recoverable: true,
      currentAttempt: 2,
      retryLimit: 2
    })).toBeNull();
    expect(nextAutomaticRetryAttempt({
      enabled: false,
      recoverable: true,
      currentAttempt: 0,
      retryLimit: 2
    })).toBeNull();
  });
});
