import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { run } = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("node:child_process", async importOriginal => ({
  ...await importOriginal<typeof import("node:child_process")>(),
  execFile: Object.assign(() => {}, { [Symbol.for("nodejs.util.promisify.custom")]: run })
}));
import { forceStopComfyProcesses } from "../electron/services/comfy-shutdown-service";
import { createDefaultSettings } from "../src/core/defaults";
import { getApplicationLogger } from "../src/infrastructure/app-logger";

const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
beforeEach(() => { Object.defineProperty(process, "platform", { ...platform, value: "win32" }); run.mockReset(); });
afterEach(() => { Object.defineProperty(process, "platform", platform); vi.useRealTimers(); vi.restoreAllMocks(); });
const dependencies = { findComfyPython: async () => "C:/fixture/python.exe" };

it("returns immediately after a successful empty inventory and port check", async () => {
  vi.useFakeTimers();
  run.mockResolvedValue({ stdout: "", stderr: "" });
  await expect(forceStopComfyProcesses(createDefaultSettings(), dependencies)).resolves.toMatchObject({ ok: true });
  expect(run.mock.calls.map(call => call[0])).toEqual(["powershell.exe", "netstat.exe"]);
  expect(vi.getTimerCount()).toBe(0);
});

it("does not mistake a failed inventory for an empty runtime", async () => {
  vi.useFakeTimers();
  run.mockRejectedValueOnce(new Error("inventory timed out")).mockResolvedValue({ stdout: "", stderr: "" });
  const stopped = forceStopComfyProcesses(createDefaultSettings(), dependencies);
  await vi.advanceTimersByTimeAsync(500);
  await expect(stopped).resolves.toMatchObject({ ok: true });
  expect(run.mock.calls.map(call => call[0])).toEqual(["powershell.exe", "netstat.exe", "powershell.exe", "netstat.exe"]);
});

it("does not skip the recheck when the port query fails", async () => {
  vi.useFakeTimers();
  run.mockResolvedValueOnce({ stdout: "", stderr: "" }).mockRejectedValueOnce(new Error("port query failed"))
    .mockResolvedValue({ stdout: "", stderr: "" });
  const stopped = forceStopComfyProcesses(createDefaultSettings(), dependencies);
  await vi.advanceTimersByTimeAsync(500);
  await expect(stopped).resolves.toMatchObject({ ok: true });
  expect(run).toHaveBeenCalledTimes(4);
});

it("still terminates an identified process and verifies it has stopped", async () => {
  vi.useFakeTimers();
  run.mockResolvedValueOnce({ stdout: JSON.stringify({ ProcessId: 4100, ParentProcessId: 1, Name: "python.exe", CommandLine: "ComfyUI/main.py" }), stderr: "" })
    .mockResolvedValue({ stdout: "", stderr: "" });
  const stopped = forceStopComfyProcesses(createDefaultSettings(), dependencies);
  await vi.advanceTimersByTimeAsync(500);
  await expect(stopped).resolves.toMatchObject({ ok: true });
  expect(run.mock.calls.map(call => call[0])).toEqual(["powershell.exe", "netstat.exe", "taskkill.exe", "powershell.exe", "netstat.exe"]);
});

it("accepts a child process that the preceding tree termination already removed", async () => {
  vi.useFakeTimers();
  const processes = [
    { ProcessId: 4100, ParentProcessId: 1, Name: "python.exe", CommandLine: "ComfyUI/main.py" },
    { ProcessId: 4101, ParentProcessId: 4100, Name: "python.exe", CommandLine: "ComfyUI/main.py" }
  ];
  const empty = { stdout: "", stderr: "" };
  run.mockResolvedValueOnce({ ...empty, stdout: JSON.stringify(processes) })
    .mockResolvedValueOnce(empty).mockResolvedValueOnce(empty)
    .mockRejectedValueOnce(new Error("child already exited")).mockResolvedValue(empty);
  vi.spyOn(process, "kill").mockImplementation(() => { throw Object.assign(new Error("no such process"), { code: "ESRCH" }); });
  const warnings = vi.spyOn(getApplicationLogger(), "warn");
  const stopped = forceStopComfyProcesses(createDefaultSettings(), dependencies);
  await vi.advanceTimersByTimeAsync(500);
  await expect(stopped).resolves.toMatchObject({ ok: true });
  expect(process.kill).toHaveBeenCalledWith(4101, "SIGKILL");
  expect(warnings).not.toHaveBeenCalled();
});
