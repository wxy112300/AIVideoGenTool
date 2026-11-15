import { EventEmitter } from "node:events";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn }));
import { launchDesktopApplication, launchDetached } from "../electron/services/local-service-process";

afterEach(() => { vi.unstubAllEnvs(); spawn.mockReset(); });

describe("external Desktop launch", () => {
  function child() {
    const process = Object.assign(new EventEmitter(), { pid: 123, unref: vi.fn() });
    spawn.mockImplementationOnce(() => {
      queueMicrotask(() => process.emit("spawn"));
      return process;
    });
    return process;
  }

  it("opens the GUI from its own directory without inheriting Electron Node mode", async () => {
    vi.stubEnv("ELECTRON_RUN_AS_NODE", "1");
    vi.stubEnv("ELECTRON_NO_ASAR", "1");
    vi.stubEnv("NODE_OPTIONS", "--require=parent-hook.js");
    vi.stubEnv("HTTPS_PROXY", "http://127.0.0.1:7890");
    const launched = child();
    const executable = path.resolve("Desktop install", "Comfy Desktop.exe");
    await expect(launchDesktopApplication(executable)).resolves.toBe(123);
    expect(spawn).toHaveBeenCalledWith(executable, [], expect.objectContaining({
      cwd: path.dirname(executable), windowsHide: false, detached: true
    }));
    const environment = spawn.mock.calls[0][2].env;
    expect(environment.ELECTRON_RUN_AS_NODE).toBeUndefined();
    expect(environment.ELECTRON_NO_ASAR).toBeUndefined();
    expect(environment.NODE_OPTIONS).toBeUndefined();
    expect(environment.HTTPS_PROXY).toBe("http://127.0.0.1:7890");
    expect(process.env.ELECTRON_RUN_AS_NODE).toBe("1");
    expect(launched.unref).toHaveBeenCalledOnce();
  });

  it("keeps background service launches hidden", async () => {
    child();
    await launchDetached("python.exe", ["main.py"]);
    expect(spawn.mock.calls[0][2].windowsHide).toBe(true);
  });

  it("reports OS launch failures instead of resolving success", async () => {
    spawn.mockImplementationOnce(() => {
      const process = new EventEmitter();
      queueMicrotask(() => process.emit("error", new Error("ENOENT")));
      return process;
    });
    await expect(launchDesktopApplication("missing.exe")).rejects.toThrow("ENOENT");
  });
});
