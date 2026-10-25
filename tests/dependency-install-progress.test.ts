import { describe, expect, it } from "vitest";
import { gitInstallProgress } from "../src/core/dependency-install-progress";
import { createProcessOutputReporter } from "../electron/services/process-output";

describe("Git installation progress", () => {
  it("uses the current Git stage and resets during dependency checks", () => {
    expect(gitInstallProgress("remote: Counting objects: 100% (25/25), done.\rReceiving objects: 42% (11/25)\r"))
      .toEqual({ stage: "Receiving objects", percent: 42 });
    expect(gitInstallProgress("Receiving objects: 100% (25/25), done.\nResolving deltas: 10% (1/10)"))
      .toEqual({ stage: "Resolving deltas", percent: 10 });
    expect(gitInstallProgress("Receiving objects: 100% (25/25)\n正在检查 Python 依赖" )).toBeNull();
    expect(gitInstallProgress("Receiving objects: 101% (26/25)")).toBeNull();
    expect(gitInstallProgress("Already up to date.")).toBeNull();
  });
  it("streams carriage-return progress across byte chunks without mangling UTF-8 or losing the last line", () => {
    const lines: string[] = [];
    const output = createProcessOutputReporter(line => lines.push(line));
    const bytes = Buffer.from("准备\nReceiving objects: 4% (1/25)\rReceiving objects: 8% (2/25)\r\ncomplete");
    for (const byte of bytes) output.append(Buffer.from([byte]));
    expect(lines).toEqual(["准备", "Receiving objects: 4% (1/25)", "Receiving objects: 8% (2/25)"]);
    output.flush(); output.flush();
    expect(lines.at(-1)).toBe("complete");
    expect(lines).toHaveLength(4);
  });
});
