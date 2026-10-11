/** OpenAI SSE text only. Streamed deltas are provisional until a stop + DONE envelope. */
export class StrataChatStream {
  private buffer = "";
  private text = "";
  private stopped = false;
  done = false;

  push(chunk: string): string[] {
    this.buffer += chunk;
    const deltas: string[] = [];
    let boundary: RegExpExecArray | null;
    while ((boundary = /\r?\n\r?\n/u.exec(this.buffer))) {
      const event = this.buffer.slice(0, boundary.index);
      this.buffer = this.buffer.slice(boundary.index + boundary[0].length);
      if (event.length > 1_048_576) throw new Error("Strata 流式消息过大。");
      const data = event.split(/\r?\n/u).filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /u, "")).join("\n");
      if (!data) continue;
      if (this.done) throw new Error("Strata 在结束标记后继续输出。");
      if (data === "[DONE]") {
        if (!this.stopped) throw new Error("Strata 缺少正常停止确认。");
        this.done = true;
        continue;
      }
      let payload;
      try { payload = JSON.parse(data); } catch { throw new Error("Strata 流式消息不是有效 JSON。"); }
      if (!payload || payload.error) throw new Error("Strata 推理返回错误，未保存部分输出。");
      if (!Array.isArray(payload.choices) || payload.choices.length !== 1) throw new Error("Strata 流式协议不兼容。");
      const choice = payload.choices[0];
      if (choice?.index !== 0 || !choice.delta || typeof choice.delta !== "object" || this.stopped) {
        throw new Error("Strata 流式响应顺序无效。");
      }
      if (choice.delta.tool_calls || choice.delta.refusal) throw new Error("Strata 未返回可用提示词文本。");
      const content = choice.delta.content;
      if (content != null && typeof content !== "string") throw new Error("Strata 输出文本格式无效。");
      if (content) {
        this.text += content;
        if (this.text.length > 2_097_152) throw new Error("Strata 输出超过应用安全大小限制。");
        deltas.push(content);
      }
      if (choice.finish_reason != null) {
        if (choice.finish_reason === "length") throw new Error("Strata 输出达到 token 上限，未保存截断结果。请缩小本次扩写范围后重试。");
        if (choice.finish_reason !== "stop") throw new Error("Strata 未正常完成提示词输出。");
        this.stopped = true;
      }
    }
    if (this.buffer.length > 1_048_576) throw new Error("Strata 流式消息过大。");
    return deltas;
  }

  result(): string {
    if (!this.done || !this.stopped || this.buffer.trim()) throw new Error("Strata 流式输出未完整结束。");
    if (!this.text.trim()) throw new Error("Strata 未返回提示词文本。");
    return this.text.trim();
  }
}
