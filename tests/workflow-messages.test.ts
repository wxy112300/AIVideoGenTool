import { describe, expect, it } from "vitest";
import { workflowMessage } from "../src/core/runtime/workflow-messages";

describe("workflow runtime messages", () => {
  it("interpolates safety values without changing the default Chinese catalog", () => {
    expect(workflowMessage("durationLimit", { maxDurationSeconds: 10 })).toBe(
      "当前单段输出最长 10 秒；更长视频需要插帧、续写或分段生成。"
    );
    expect(workflowMessage("nodeNotObject", { nodeId: "42" })).toContain("节点 42");
  });

  it("uses the English runtime catalog with the same interpolation contract", () => {
    expect(workflowMessage("promptPlaceholderMissing", {}, "en-US")).toBe(
      "Missing {{PROMPT}}; the GUI cannot inject the current prompt"
    );
    expect(workflowMessage("durationLimit", { maxDurationSeconds: 10 }, "en-US")).toContain("10 seconds");
  });
});
