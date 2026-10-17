import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { describe, it, expect, vi, afterEach } from "vitest";
import { agentDefaults } from "../electron/services/strata-agent-settings.js";

const fake = vi.hoisted(() => ({ doctor: vi.fn(), cloudStart: vi.fn(), cloudStop: vi.fn(), adapter: vi.fn() }));
vi.mock("../electron/services/strata-agent-doctor.js", () => ({ agentDoctor: fake.doctor }));
vi.mock("../electron/services/strata-agent-cloud.js", () => ({ verifyCloudAdapter: fake.adapter, AgentCloud: class {
  running = false;
  async start(input: unknown, signal: AbortSignal) { this.running = true; return fake.cloudStart(input, signal); }
  async stop() { await fake.cloudStop(); this.running = false; }
} }));
import { AgentController } from "../electron/services/strata-agent-controller.js";
const directories: string[] = [];
const controllers: AgentController[] = [];
afterEach(async () => {
  for (const controller of controllers.splice(0)) await controller.stop(true);
  vi.restoreAllMocks(); vi.clearAllMocks();
  for (const directory of directories.splice(0)) await fs.rm(directory, { recursive: true, force: true });
});
async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "strata-controller-unit-")); directories.push(directory);
  const controller = new AgentController("unused-tool", vi.fn(), directory); controllers.push(controller);
  fake.doctor.mockResolvedValue({ cloud: { available: true, path: directory, version: "1.37.5", sdkVersion: "0.3.165" }, claude: { available: true, compatible: true, version: "2.1.165", path: "selected-cli" }, git: "git", ports: { guiPortBusy: false } });
  fake.adapter.mockResolvedValue(undefined); fake.cloudStart.mockResolvedValue({ origin: "http://127.0.0.1:43128", pid: 123 }); fake.cloudStop.mockResolvedValue(undefined);
  // All product process starts are replaced; this fixture never acquires GPU or launches a service/CLI.
  const engine = vi.spyOn(controller as any, "startEngine").mockImplementation(async () => {
    (controller as any).currentToken = "fixture-token";
    return { origin: "http://127.0.0.1:43127" };
  });
  const stopEngine = vi.spyOn((controller as any).service, "stop");
  return { controller, engine, stopEngine, preferences: agentDefaults() };
}
describe("one-click transaction using process mocks only", () => {
  it("checks all dependencies before loading an engine and passes only child-scoped routing to the GUI", async () => {
    const { controller, preferences, engine } = await fixture();
    const result = await controller.dispatch({ action: "start", preferences }) as any;
    expect(engine).toHaveBeenCalledOnce(); expect(fake.adapter).toHaveBeenCalledBefore(engine);
    expect(fake.cloudStart).toHaveBeenCalledWith(expect.objectContaining({ token: "fixture-token", cli: "selected-cli", guiPort: 43128, strataPort: 43127 }), expect.any(AbortSignal));
    expect(result.pages).toEqual(["http://127.0.0.1:43128", "http://127.0.0.1:43127"]);
    expect(JSON.stringify(result)).not.toContain("fixture-token");
  });
  it("unwinds GUI before engine when the final component fails and never advertises full startup", async () => {
    const { controller, preferences, stopEngine } = await fixture();
    fake.cloudStart.mockRejectedValueOnce(new Error("fixture GUI failure"));
    await expect(controller.dispatch({ action: "start", preferences })).rejects.toThrow("fixture GUI failure");
    expect(fake.cloudStop).toHaveBeenCalledBefore(stopEngine);
    expect((controller as any).currentToken).toBe("");
  });
  it("requires explicit stop confirmation while GUI may own tools and preserves the running session if declined", async () => {
    const { controller, preferences, stopEngine } = await fixture();
    await controller.dispatch({ action: "start", preferences });
    const stops = fake.cloudStop.mock.calls.length;
    expect(await controller.dispatch({ action: "stop" })).toMatchObject({ requiresConfirmation: true });
    expect(fake.cloudStop).toHaveBeenCalledTimes(stops); expect(stopEngine).not.toHaveBeenCalled();
    await controller.dispatch({ action: "stop", confirmed: true });
    expect(fake.cloudStop).toHaveBeenCalledBefore(stopEngine);
  });
  it("refuses an incompatible CLI or occupied GUI port before any engine preparation", async () => {
    const { controller, preferences, engine } = await fixture();
    const base = await fake.doctor();
    fake.doctor.mockResolvedValueOnce({ ...base, claude: { available: true, compatible: false } });
    await expect(controller.dispatch({ action: "start", preferences })).rejects.toThrow("请先安装缺失软件");
    fake.doctor.mockResolvedValueOnce({ ...base, ports: { guiPortBusy: true } });
    await expect(controller.dispatch({ action: "start", preferences })).rejects.toThrow("已占用");
    expect(engine).not.toHaveBeenCalled(); expect(fake.cloudStart).not.toHaveBeenCalled();
  });
  it("still stops the owned model if GUI cleanup fails, while reporting incomplete ownership and allowing retry", async () => {
    const { controller, preferences, stopEngine } = await fixture();
    await controller.dispatch({ action: "start", preferences });
    fake.cloudStop.mockRejectedValueOnce(new Error("fixture GUI stop failure"));
    await expect(controller.dispatch({ action: "stop", confirmed: true })).rejects.toThrow("fixture GUI stop failure");
    expect(stopEngine).toHaveBeenCalledOnce();
    await expect(controller.dispatch({ action: "stop", confirmed: true })).resolves.toMatchObject({ message: expect.stringContaining("自有服务已停止") });
  });
});
