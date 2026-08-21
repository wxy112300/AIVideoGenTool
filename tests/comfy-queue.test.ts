import { describe, expect, it } from "vitest";
import {
  appPromptIdsInComfyQueue,
  comfyPromptQueueLocation,
  comfyQueueContainsAnyPromptId
} from "../src/core/comfy-queue";

describe("ComfyUI prompt queue selectors", () => {
  const snapshot = {
    queue_running: [[1, "prompt-running", {}, { client_id: "local-video-studio-qwenvl-prompt-operation" }]],
    queue_pending: [
      [2, "video-pending", {}, { client_id: "local-video-studio-queue-task" }],
      [3, "prompt-pending", {}, { client_id: "local-video-studio-qwen36-prompt-operation" }]
    ]
  };

  it("selects only app-owned prompt workflows", () => {
    expect(appPromptIdsInComfyQueue(snapshot)).toEqual(["prompt-running", "prompt-pending"]);
  });

  it("checks running and pending entries by exact prompt id", () => {
    expect(comfyQueueContainsAnyPromptId(snapshot, new Set(["prompt-pending"]))).toBe(true);
    expect(comfyQueueContainsAnyPromptId(snapshot, new Set(["video-pending"]))).toBe(true);
    expect(comfyQueueContainsAnyPromptId(snapshot, new Set(["missing"]))).toBe(false);
  });

  it("tolerates malformed queue responses", () => {
    expect(appPromptIdsInComfyQueue({ queue_running: "invalid" })).toEqual([]);
    expect(comfyQueueContainsAnyPromptId(null, new Set(["prompt-running"]))).toBe(false);
  });
});

describe("comfyPromptQueueLocation", () => {
  const snapshot = {
    queue_running: [[1, "running-id", {}, { client_id: "client" }]],
    queue_pending: [[2, "pending-id", {}, { client_id: "client" }]]
  };

  it("distinguishes the exact running and pending prompt", () => {
    expect(comfyPromptQueueLocation(snapshot, "running-id")).toBe("running");
    expect(comfyPromptQueueLocation(snapshot, "pending-id")).toBe("pending");
    expect(comfyPromptQueueLocation(snapshot, "other-id")).toBe("absent");
  });
});
