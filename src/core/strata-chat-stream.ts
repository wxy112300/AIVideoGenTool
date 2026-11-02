import { createTranslator } from "./i18n.js";
import type { Translate } from "./i18n.js";
import { uiKeys } from "./i18n-keys.js";
/** OpenAI SSE text only. Streamed deltas are provisional until a stop + DONE envelope. */
export class StrataChatStream {
  constructor(private readonly t: Translate = createTranslator().t) {}
  private buffer = "";
  private text = "";
  private stopped = false;
  private finishReason: "stop" | "length" | "other" | null = null;
  private completionTokens: number | null = null;
  private reasoningCharacters = 0;
  done = false;

  push(chunk: string): string[] {
    this.buffer += chunk;
    const deltas: string[] = [];
    let boundary: RegExpExecArray | null;
    while ((boundary = /\r?\n\r?\n/u.exec(this.buffer))) {
      const event = this.buffer.slice(0, boundary.index);
      this.buffer = this.buffer.slice(boundary.index + boundary[0].length);
      if (event.length > 1_048_576) throw new Error(this.t(uiKeys.strataCore.largeMessage));
      const data = event.split(/\r?\n/u).filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /u, "")).join("\n");
      if (!data) continue;
      if (this.done) throw new Error(this.t(uiKeys.strataCore.afterDone));
      if (data === "[DONE]") {
        if (!this.stopped) throw new Error(this.t(uiKeys.strataCore.stopMissing));
        this.done = true;
        continue;
      }
      let payload;
      try { payload = JSON.parse(data); } catch { throw new Error(this.t(uiKeys.strataCore.invalidJson)); }
      if (!payload || payload.error) throw new Error(this.t(uiKeys.strataCore.inferenceError));
      if (Number.isSafeInteger(payload.usage?.completion_tokens) && payload.usage.completion_tokens >= 0)
        this.completionTokens = payload.usage.completion_tokens;
      if (!Array.isArray(payload.choices) || payload.choices.length !== 1) throw new Error(this.t(uiKeys.strataCore.streamProtocol));
      const choice = payload.choices[0];
      if (choice?.index !== 0 || !choice.delta || typeof choice.delta !== "object" || this.stopped) {
        throw new Error(this.t(uiKeys.strataCore.streamOrder));
      }
      if (choice.delta.tool_calls || choice.delta.refusal) throw new Error(this.t(uiKeys.strataCore.unusableText));
      const content = choice.delta.content;
      if (typeof choice.delta.reasoning_content === "string") this.reasoningCharacters += choice.delta.reasoning_content.length;
      if (content != null && typeof content !== "string") throw new Error(this.t(uiKeys.strataCore.textFormat));
      if (content) {
        this.text += content;
        if (this.text.length > 2_097_152) throw new Error(this.t(uiKeys.strataCore.outputLarge));
        deltas.push(content);
      }
      if (choice.finish_reason != null) {
        this.finishReason = choice.finish_reason === "stop" || choice.finish_reason === "length" ? choice.finish_reason : "other";
        if (choice.finish_reason === "length") throw new Error(this.t(uiKeys.strataCore.truncated));
        if (choice.finish_reason !== "stop") throw new Error(this.t(uiKeys.strataCore.notStopped));
        this.stopped = true;
      }
    }
    if (this.buffer.length > 1_048_576) throw new Error(this.t(uiKeys.strataCore.largeMessage));
    return deltas;
  }

  result(): string {
    if (!this.done || !this.stopped || this.buffer.trim()) throw new Error(this.t(uiKeys.strataCore.incomplete));
    if (!this.text.trim()) throw new Error(this.t(uiKeys.strataCore.empty));
    return this.text.trim();
  }

  /** Counts only: diagnostics must not persist model output or private reasoning. */
  diagnostics() {
    return { finishReason: this.finishReason, completionTokens: this.completionTokens,
      contentCharacters: this.text.length, reasoningCharacters: this.reasoningCharacters };
  }
}
