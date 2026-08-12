import { describe, expect, it } from "vitest";
import {
  collectComfyProcessIds,
  listeningPid,
  parseComfyProcessInfo
} from "../electron/services/comfy-shutdown-service";

describe("ComfyUI shutdown service", () => {
  it("finds only a TCP listener on the requested port", () => {
    const netstat = [
      "  TCP    127.0.0.1:8188    0.0.0.0:0    LISTENING    4100",
      "  TCP    127.0.0.1:8288    0.0.0.0:0    LISTENING    4200",
      "  TCP    127.0.0.1:8188    127.0.0.1:50000    ESTABLISHED    4300"
    ].join("\r\n");

    expect(listeningPid(netstat, 8188)).toBe(4100);
    expect(listeningPid(netstat, 8288)).toBe(4200);
    expect(listeningPid(netstat, 8388)).toBeNull();
  });

  it("deduplicates discovered ComfyUI workers and the listener process", () => {
    const processes = parseComfyProcessInfo(JSON.stringify([
      {
        ProcessId: 4100,
        ParentProcessId: 3000,
        Name: "python.exe",
        ExecutablePath: "D:\\ComfyUI\\.venv\\Scripts\\python.exe",
        CommandLine: "python.exe -s main.py --port 8188"
      },
      {
        ProcessId: 4200,
        ParentProcessId: 4100,
        Name: "python.exe",
        ExecutablePath: "D:\\ComfyUI\\.venv\\Scripts\\python.exe",
        CommandLine: "worker"
      }
    ]));

    expect([...collectComfyProcessIds(processes, 4100)]).toEqual([4100, 4200]);
    expect([...collectComfyProcessIds(processes, 4300)]).toEqual([4100, 4200, 4300]);
  });
});
