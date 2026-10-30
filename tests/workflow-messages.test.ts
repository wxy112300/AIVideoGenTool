import { describe, expect, it } from "vitest";
import { workflowMessage, type WorkflowMessageKey } from "../src/core/runtime/workflow-messages";
import { zhTWWorkflowMessages } from "../src/core/runtime/workflow-messages.zh-TW";

describe("workflow runtime messages", () => {
  it("retains every validation parameter in all three runtime languages", () => {
    const params = (value: string) => [...new Set(value.match(/\{[A-Za-z0-9_.-]+\}/gu) ?? [])].sort();
    for (const key of Object.keys(zhTWWorkflowMessages) as WorkflowMessageKey[]) {
      for (const locale of ["en-US", "zh-TW"] as const) {
        expect.soft(params(workflowMessage(key, {}, locale)), `${locale}: ${key}`)
          .toEqual(params(workflowMessage(key)));
      }
    }
    expect(workflowMessage("continuumDurationFrozen", {duration: 15.1}, "zh-TW"))
      .toBe("此 Continuum Run 的每段時長已固定為 15.1 秒；請建立新序列以選擇其他時長。");
  });
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
