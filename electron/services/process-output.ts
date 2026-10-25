import { StringDecoder } from "node:string_decoder";

/** Pipe chunks can split UTF-8 characters and Git's carriage-return progress lines. */
export function createProcessOutputReporter(report?: (line: string) => void) {
  const decoder = new StringDecoder("utf8");
  let pending = "";
  const drain = () => {
    const lines = pending.split(/[\r\n]/);
    pending = lines.pop() ?? "";
    for (const line of lines) if (line) report?.(line);
  };
  return {
    append(chunk: Buffer) { pending += decoder.write(chunk); drain(); },
    flush() { pending += decoder.end(); drain(); if (pending) report?.(pending); pending = ""; }
  };
}
