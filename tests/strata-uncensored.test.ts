import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STRATA_UNCENSORED_VECTOR, supportsStrataUncensored } from "../src/core/strata-uncensored.js";
import * as vectorTools from "../electron/services/strata-uncensored.js";
import { prepareStrataLaunch, StrataService } from "../electron/services/strata-service.js";
import { STRATA_ENGINE_SHA256, STRATA_REVISION } from "../src/core/catalog/dependencies/strata.js";
import { writeStrataPreparedFixture } from "./helpers/strata-pack-fixture.js";

const modelId = "strata/qwen3.8-flash-next-iq3_xxs";
const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true }))); });
async function root() { const dir = await fs.mkdtemp(path.join(os.tmpdir(), "strata-cvec-")); roots.push(dir); return dir; }

describe("Strata uncensored integrity and compatibility", () => {
  it("does not treat arbitrary Flash names, Swift or existing abliterated weights as compatible", () => {
    expect(supportsStrataUncensored(modelId)).toBe(true);
    expect(supportsStrataUncensored("strata/qwen3.8-flash-next-iq2_xs")).toBe(true);
    for (const id of ["qwen/qwen3.8-27b", "strata/swift-iq3_xxs", "strata/flash-next-future", "strata/qwen3.8-flash-next-iq3_xxs-abliterated"])
      expect(supportsStrataUncensored(id)).toBe(false);
  });
  it("refuses a missing, truncated or same-size corrupted vector with a repair action", async () => {
    const dir = await root(), file = path.join(dir, STRATA_UNCENSORED_VECTOR.relativePath);
    await expect(vectorTools.verifyStrataControlVector(dir)).rejects.toThrow("重新安装");
    await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, "GGUF");
    await expect(vectorTools.verifyStrataControlVector(dir)).rejects.toThrow("大小");
    const corrupt = Buffer.alloc(STRATA_UNCENSORED_VECTOR.bytes); corrupt.write("GGUF"); await fs.writeFile(file, corrupt);
    await expect(vectorTools.verifyStrataControlVector(dir)).rejects.toThrow("SHA-256");
  });
  it("requires this load's exact projection mode, direction and layer count, not an old log", async () => {
    const dir = await root(), file = path.join(dir, "engine.log");
    const vector = { ...STRATA_UNCENSORED_VECTOR, filename: "fixture.gguf" };
    const line = "strata generate: control vector mode = project, dir = per-layer, layers 4..44 (41 steered)\n";
    await fs.writeFile(file, line);
    const offset = (await fs.stat(file)).size;
    await expect(vectorTools.assertStrataControlVectorLog(file, offset, vector)).rejects.toThrow("未确认");
    await fs.appendFile(file, line.replace("project", "add"));
    await expect(vectorTools.assertStrataControlVectorLog(file, offset, vector)).rejects.toThrow("未确认");
    await fs.appendFile(file, line);
    await expect(vectorTools.assertStrataControlVectorLog(file, offset, vector)).resolves.toBeUndefined();
  });
  it("uses a disposable launch overlay, preserving the verified base config and pack receipt", async () => {
    const dir = await root(), config = path.join(dir, "pack", "runtime.json");
    for (const name of [".venv/Scripts/python.exe", "serve/server.py"]) {
      const filename = path.join(dir, name); await fs.mkdir(path.dirname(filename), { recursive: true }); await fs.writeFile(filename, "fixture");
    }
    await fs.writeFile(path.join(dir, "lvs-strata-install.json"), JSON.stringify({ owner: "local-video-studio", revision: STRATA_REVISION, engineSha256: STRATA_ENGINE_SHA256, installedAt: "fixture" }));
    await writeStrataPreparedFixture(dir, config);
    const base = await fs.readFile(config, "utf8"), receiptFile = path.join(path.dirname(config), "lvs-strata-model.json"), receipt = await fs.readFile(receiptFile, "utf8");
    const vector = { ...STRATA_UNCENSORED_VECTOR, filename: path.join(dir, STRATA_UNCENSORED_VECTOR.relativePath) };
    const verify = vi.spyOn(vectorTools, "verifyStrataControlVector").mockResolvedValue(vector);
    const stock = await prepareStrataLaunch({ strataInstallDirectory: dir, strataPort: 43127 }, config);
    expect(stock.controlVector).toBeUndefined(); expect(verify).not.toHaveBeenCalled();
    const enabled = await prepareStrataLaunch({ strataInstallDirectory: dir, strataPort: 43127, strataUncensored: true }, config);
    expect(enabled.controlVector).toMatchObject({ id: vector.id, sha256: vector.sha256 });
    const overlay = JSON.parse(await fs.readFile(enabled.temporaryConfig!, "utf8"));
    expect(overlay.args).toEqual(expect.arrayContaining(["--control-vector-scaled", `${vector.filename}:1.0`, "--control-vector-layer-range", "4", "44", "--cvec-mode", "project"]));
    expect(overlay.sampling.experimental_speed_projection).toBe(false);
    expect(await fs.readFile(config, "utf8")).toBe(base); expect(await fs.readFile(receiptFile, "utf8")).toBe(receipt);
  });
});

describe("Strata mode requests and facts", () => {
  it.each([true, false])("refuses a missing engine confirmation and clears activation after stop (confirmation=%s)", async confirmed => {
    const dir = await root(), log = path.join(dir, "engine.log"); await fs.writeFile(log, "");
    let alive = false, loaded = false;
    const launch = vi.fn(async () => { alive = true; return { pid: 123, running: () => alive, stop: async () => { alive = false; } }; });
    const modes: boolean[] = [], diagnostics = vi.fn();
    const fetchMock = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
      if (String(url).endsWith("/v1/load")) {
        loaded = true;
        if (confirmed) await fs.appendFile(log, "control vector mode = project, dir = per-layer, layers 4..44 (41 steered)\n");
        return new Response('{"status":"loaded"}');
      }
      if (String(url).endsWith("/v1/chat/completions")) {
        modes.push(JSON.parse(options!.body as string).experimental_speed_projection);
        return new Response('data: {"choices":[{"index":0,"delta":{"content":"final"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', { headers: { "content-type": "text/event-stream" } });
      }
      return new Response(JSON.stringify(String(url).endsWith("/health") ? { service: "strata", status: "ok", loaded, api_key: true } : { object: "list", data: [] }));
    });
    const service = new StrataService({ launch, portInUse: async () => false, fetch: fetchMock, onDiagnostics: diagnostics });
    await service.start({ executable: "fixture", cwd: dir, args: [], modelId, apiKey: "private-key", port: 43127,
      engineLog: log, uncensoredRequested: true, controlVector: { ...STRATA_UNCENSORED_VECTOR, filename: "fixture.gguf" } });
    try {
      expect(service.snapshot().uncensored).toMatchObject({ requested: true, vectorLoaded: false, applied: null });
      if (!confirmed) {
        await expect(service.load()).rejects.toThrow("未确认"); expect(service.snapshot().pid).toBeNull(); return;
      }
      await service.load();
      const base = { modelId, messages: [{ role: "user" as const, content: "ordinary scene" }], maxTokens: 100, temperature: .7 };
      for (const uncensored of [true, false, true]) {
        expect(await service.chat({ ...base, uncensored })).toBe("final");
        expect(service.snapshot().uncensored).toMatchObject({ requested: uncensored, applied: uncensored, vectorLoaded: true });
      }
      expect(modes).toEqual([true, false, true]); expect(launch).toHaveBeenCalledOnce();
      expect(diagnostics.mock.calls.map(([d]) => d.uncensored.applied)).toEqual([true, false, true]);
      expect(JSON.stringify(diagnostics.mock.calls)).not.toMatch(/ordinary scene|private-key|final/u);
      fetchMock.mockResolvedValueOnce(new Response('data: {"choices":[{"index":0,"delta":{},"finish_reason":"length"}]}\n\n', { headers: { "content-type": "text/event-stream" } }));
      await expect(service.chat({ ...base, uncensored: true })).rejects.toThrow("token 上限");
      expect(diagnostics.mock.calls.at(-1)![0].uncensored).toMatchObject({ requested: true, vectorLoaded: true, applied: null });
    } finally { await service.stop(); expect(service.snapshot().uncensored).toMatchObject({ vectorLoaded: false, applied: null }); }
  });
  it("never silently sends an enabled request without a confirmed loaded vector", async () => {
    let alive = true;
    const fetchMock = vi.fn(async (url: string | URL | Request) => new Response(JSON.stringify(String(url).endsWith("/health")
      ? { service: "strata", status: "ok", loaded: true, api_key: true } : { object: "list", data: [] })));
    const service = new StrataService({ launch: async () => ({ pid: 123, running: () => alive, stop: async () => { alive = false; } }), portInUse: async () => false, fetch: fetchMock });
    await service.start({ executable: "fixture", cwd: "fixture", args: [], modelId, port: 43127, apiKey: "secret" });
    await expect(service.chat({ modelId, messages: [{ role: "user", content: "scene" }], maxTokens: 100, temperature: .7, uncensored: true })).rejects.toThrow("尚未确认");
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/v1/chat/completions"))).toBe(false);
    expect(service.snapshot().pid).toBeNull();
  });
});
