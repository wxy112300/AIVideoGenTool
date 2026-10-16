import { describe, expect, it } from "vitest";
import { StrataChatStream } from "../src/core/strata-chat-stream.js";

const event = (delta: unknown, finish_reason: string | null = null) =>
  `data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason }] })}\r\n\r\n`;

describe("Strata provisional SSE text", () => {
  it("retains stop/usage/count diagnostics without exposing reasoning or content", () => {
    const parser = new StrataChatStream();
    parser.push(event({ reasoning_content: "private" }) + event({ content: "final" }));
    parser.push(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { completion_tokens: 12 } })}\n\n`);
    parser.push("data: [DONE]\n\n");
    expect(parser.result()).toBe("final");
    expect(parser.diagnostics()).toEqual({ finishReason: "stop", completionTokens: 12, reasoningCharacters: 7, contentCharacters: 5 });
    expect(JSON.stringify(parser.diagnostics())).not.toMatch(/private|final/u);
  });
  it("preserves an explicit length reason even when rejecting truncated output", () => {
    const parser = new StrataChatStream();
    expect(() => parser.push(event({ content: "partial" }, "length"))).toThrow("token 上限");
    expect(parser.diagnostics()).toMatchObject({ finishReason: "length", contentCharacters: 7, completionTokens: null });
  });
  it("handles fragmented CRLF, comments and reasoning without mixing thought text into the result", () => {
    const parser = new StrataChatStream();
    const source = ": keep-alive\r\n\r\n" + event({ reasoning_content: "private" }) +
      event({ content: "镜头" }) + event({ content: "前移。" }) + event({}, "stop") + "data: [DONE]\r\n\r\n";
    const deltas = [...source].flatMap((letter) => parser.push(letter));
    expect(deltas.join("")).toBe("镜头前移。");
    expect(parser.result()).toBe("镜头前移。");
  });

  it.each([
    [event({ content: "partial" }), "完整结束"],
    ["data: [DONE]\n\n", "停止确认"],
    [event({ content: "partial" }, "length"), "token 上限"],
    [event({}, "tool_calls"), "未正常完成"],
    [event({ tool_calls: [] }), "可用提示词"],
    [event({ refusal: "no" }), "可用提示词"],
    ["data: {}\n\n", "协议不兼容"],
    ["data: not-json\n\n", "JSON"],
    ["data: {\"error\":{\"message\":\"secret\"}}\n\n", "推理返回错误"],
    [event({}, "stop") + "data: [DONE]\n\n", "未返回提示词"],
    [event({ content: "x" }, "stop") + event({ content: "extra" }), "顺序无效"],
    ["data: " + "x".repeat(1_048_577), "消息过大"]
  ])("fails closed for an incomplete or unusable response (%s)", (source, message) => {
    const parser = new StrataChatStream();
    expect(() => { parser.push(source); parser.result(); }).toThrow(message);
  });
});
