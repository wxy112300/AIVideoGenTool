import { promises as fs } from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STRATA_ENGINE_SHA256, STRATA_REVISION } from "../src/core/catalog/dependencies/strata.js";
import { prepareStrataLaunch, StrataService, type StrataLaunchPlan } from "../electron/services/strata-service.js";
import { isLocalPortInUse } from "../electron/services/local-service-process.js";
import { writeStrataPreparedFixture } from "./helpers/strata-pack-fixture.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });
const plan = (): StrataLaunchPlan => ({ executable: "python.exe", cwd: "fixture", args: ["--lazy"], port: 43127, apiKey: "fixture-secret" });
function fixture() {
  let alive = true;
  let loaded = false;
  const child = { pid: 12345, running: () => alive, stop: vi.fn(async () => { alive = false; }) };
  const launch = vi.fn(async (_plan: StrataLaunchPlan, output: (chunk: string) => void) => { output("fixture-secret startup\n"); return child; });
  const portInUse = vi.fn(async () => false);
  const fetchMock = vi.fn(async (url: string | URL | Request, _options?: RequestInit) => new Response(JSON.stringify(
    String(url).endsWith("/health") ? { service: "strata", status: "ok", loaded, api_key: true } : { object: "list", data: [] }
  ), { status: 200 }));
  const service = new StrataService({ launch, portInUse, fetch: fetchMock as typeof fetch, startupTimeoutMs: 20, pollMs: 1 });
  return { service, child, launch, portInUse, fetchMock, load: () => { loaded = true; }, exit: () => { alive = false; } };
}

describe("Strata lifecycle foundation (not prompt inference)", () => {
  it("authenticates explicit loading and confirms the actual resident state", async () => {
    const f = fixture(); await f.service.start(plan());
    f.fetchMock.mockImplementationOnce(async (url, options) => {
      expect(String(url)).toContain("/v1/load");
      expect(options).toMatchObject({ method: "POST", headers: { Authorization: "Bearer fixture-secret", Origin: "http://127.0.0.1:43127" } });
      f.load(); return new Response('{"status":"loaded"}');
    });
    expect(await f.service.load()).toMatchObject({ phase: "ready", modelLoaded: true });
    await f.service.stop();
  });
  it("counts text with the official tokenizer, reserves vision/output, and never submits over-context input", async () => {
    const f = fixture(); await f.service.start(plan());
    f.fetchMock.mockImplementationOnce(async (url, options) => {
      expect(String(url)).toContain("/v1/messages/count_tokens");
      expect(JSON.parse(options!.body as string)).toMatchObject({ thinking: { type: "disabled" }, messages: [{ role: "user", content: "enhance" }] });
      return new Response('{"input_tokens":24000}');
    });
    await expect(f.service.chat({ modelId: "fixture", messages: [{ role: "user", content: [{ type: "text", text: "enhance" },
      { type: "image_url", image_url: { url: "data:image/png;base64,YQ==" } }] }], maxTokens: 8192,
      contextSize: 32768, visionTokensPerImage: 1024, temperature: 0.7 })).rejects.toThrow("上下文");
    expect(f.fetchMock.mock.calls.some(([url]) => String(url).includes("/v1/chat/completions"))).toBe(false);
    expect(f.service.snapshot().pid).toBeNull();
  });
  it("refuses remote/file image URLs before sending HTTP", async () => {
    const f = fixture(); await f.service.start(plan());
    await expect(f.service.chat({ modelId: "fixture", messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: "http://localhost/private" } }] }],
      maxTokens: 1, temperature: 0 })).rejects.toThrow("参数");
    expect(f.fetchMock.mock.calls.some(([url]) => String(url).includes("/v1/chat/completions"))).toBe(false);
    await f.service.stop();
  });
  it("streams authenticated text over fragmented UTF-8 and accepts only a complete result", async () => {
    const f = fixture(); await f.service.start(plan()); f.load();
    const chunk = (content: unknown, finish_reason: string | null = null) => `data: ${JSON.stringify({ choices: [{ index: 0, delta: content, finish_reason }] })}\n\n`;
    const bytes = new TextEncoder().encode(chunk({ reasoning_content: "not a prompt" }) + chunk({ content: "镜头前移" }) + chunk({}, "stop") + "data: [DONE]\n\n");
    f.fetchMock.mockImplementationOnce(async (_url, options) => {
      expect(options).toMatchObject({ method: "POST", redirect: "error", headers: { Authorization: "Bearer fixture-secret" } });
      expect(JSON.parse(options!.body as string)).toMatchObject({ max_tokens: 8192, stream: true, chat_template_kwargs: { enable_thinking: false } });
      return new Response(new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); } }), { headers: { "Content-Type": "text/event-stream" } });
    });
    const deltas: string[] = [];
    const result = await f.service.chat({ modelId: "fixture", messages: [{ role: "user", content: "enhance" }], maxTokens: 8192, temperature: 0.7 }, undefined, (text) => deltas.push(text));
    expect(result).toBe("镜头前移"); expect(deltas.join("")).toBe(result);
    expect(f.child.stop).not.toHaveBeenCalled(); await f.service.stop();
  });

  it.each(["abort", "truncated", "length", "timeout"])("stops owned processes instead of accepting partial output on %s", async (failure) => {
    const f = fixture(); await f.service.start(plan());
    const controller = new AbortController();
    const content = 'data: {"choices":[{"index":0,"delta":{"content":"partial"},"finish_reason":null}]}\n\n';
    f.fetchMock.mockImplementationOnce(async (_url, options) => new Response(new ReadableStream({
      start(stream) {
        stream.enqueue(new TextEncoder().encode(content));
        if (failure === "length") stream.enqueue(new TextEncoder().encode('data: {"choices":[{"index":0,"delta":{},"finish_reason":"length"}]}\n\n'));
        if (["truncated", "length"].includes(failure)) stream.close();
        else options!.signal!.addEventListener("abort", () => stream.error(options!.signal!.reason), { once: true });
        if (failure === "timeout") queueMicrotask(() => stream.error(new DOMException("timed out", "TimeoutError")));
      }
    }), { headers: { "Content-Type": "text/event-stream" } }));
    await expect(f.service.chat({ modelId: "fixture", messages: [{ role: "user", content: "enhance" }], maxTokens: 4, temperature: 0 }, controller.signal,
      () => { if (failure === "abort") controller.abort(new Error("cancelled")); })).rejects.toThrow();
    expect(f.child.stop).toHaveBeenCalledOnce();
    expect(f.service.snapshot()).toMatchObject({ phase: "stopped", pid: null, modelLoaded: null });
  });

  it("can cancel service startup before its deadline and cleans up only its child", async () => {
    const f = fixture(), controller = new AbortController();
    f.fetchMock.mockImplementation(async () => { controller.abort(new Error("cancel startup")); throw new Error("not ready"); });
    await expect(f.service.start(plan(), controller.signal)).rejects.toThrow("cancel startup");
    expect(f.child.stop).toHaveBeenCalledOnce(); expect(f.service.snapshot().pid).toBeNull();
  });

  it("builds a lazy loopback launch using only the completed runtime's independent Python", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-strata-service-")); roots.push(root);
    for (const relative of [".venv/Scripts/python.exe", "serve/server.py", "prepared config.json"]) {
      const filename = path.join(root, relative); await fs.mkdir(path.dirname(filename), { recursive: true }); await fs.writeFile(filename, "fixture");
    }
    const settings = { strataInstallDirectory: root, strataPort: 43127 };
    const config = path.join(root, "prepared config.json");
    await expect(prepareStrataLaunch(settings, config)).rejects.toThrow("管理安装未完成");
    await fs.writeFile(path.join(root, "lvs-strata-install.json"), JSON.stringify({ owner: "local-video-studio", revision: STRATA_REVISION, engineSha256: STRATA_ENGINE_SHA256, installedAt: "fixture" }));
    await expect(prepareStrataLaunch(settings, config)).rejects.toThrow();
    await writeStrataPreparedFixture(root, config);
    const result = await prepareStrataLaunch(settings, config);
    expect(result.executable).toBe(path.join(root, ".venv", "Scripts", "python.exe"));
    expect(result.args).toEqual(["-B", "-u", "-m", "serve.server", "--engine", "strata", "--config", config, "--host", "127.0.0.1", "--port", "43127", "--lazy", "--api-key", result.apiKey]);
    expect(result.apiKey).toHaveLength(64);
    expect((await prepareStrataLaunch(settings, config)).apiKey).not.toBe(result.apiKey);
    await fs.rm(config);
    await expect(prepareStrataLaunch(settings, config)).rejects.toThrow("启动文件缺失");
  });

  it.each([8080, 0, 65536, 43127.5])("rejects invalid port %s before spawn or probing", async (port) => {
    const f = fixture();
    await expect(f.service.start({ ...plan(), port })).rejects.toThrow("端口");
    expect(f.launch).not.toHaveBeenCalled(); expect(f.portInUse).not.toHaveBeenCalled();
  });

  it("refuses an occupied port without adopting, probing or terminating its owner", async () => {
    const f = fixture(); f.portInUse.mockResolvedValue(true);
    await expect(f.service.start(plan())).rejects.toThrow("已占用");
    expect(f.launch).not.toHaveBeenCalled(); expect(f.fetchMock).not.toHaveBeenCalled(); expect(f.child.stop).not.toHaveBeenCalled();
  });

  it("distinguishes HTTP ready from loaded, authenticates status and redacts logs", async () => {
    const f = fixture(); const p = plan();
    expect(await f.service.start(p)).toMatchObject({ phase: "ready", modelLoaded: false, pid: 12345, port: 43127, log: "[redacted] startup\n" });
    expect(f.fetchMock.mock.calls.map(([url]) => url)).toEqual(["http://127.0.0.1:43127/health", "http://127.0.0.1:43127/v1/models"]);
    expect(f.fetchMock.mock.calls[1][1]).toMatchObject({ redirect: "error", headers: { Authorization: "Bearer fixture-secret" } });
    f.load(); expect(await f.service.inspect()).toMatchObject({ phase: "ready", modelLoaded: true });
    await f.service.start(p); expect(f.launch).toHaveBeenCalledTimes(1);
    await expect(f.service.start({ ...p, port: 43128 })).rejects.toThrow("先停止");
    expect(await f.service.stop()).toMatchObject({ phase: "stopped", pid: null, port: null, modelLoaded: null });
    await f.service.stop(); expect(f.child.stop).toHaveBeenCalledTimes(1);
  });

  it("serializes concurrent start and stop, leaving no ready or owned child after stop", async () => {
    const f = fixture(); const p = plan();
    const results = await Promise.all([f.service.start(p), f.service.start(p), f.service.stop()]);
    expect(results.map((result) => result.phase)).toEqual(["ready", "ready", "stopped"]);
    expect(f.launch).toHaveBeenCalledTimes(1); expect(f.service.snapshot().pid).toBeNull();
  });

  it.each(["wrong-service", "auth-rejected", "bad-model-protocol"])("cleans up its own process on %s startup failure", async (failure) => {
    const f = fixture();
    f.fetchMock.mockImplementation(async (url) => {
      if (failure === "auth-rejected" && String(url).endsWith("/v1/models")) return new Response("{}", { status: 401 });
      return new Response(JSON.stringify(String(url).endsWith("/health")
        ? { service: failure === "wrong-service" ? "other" : "strata", status: "ok", loaded: false, api_key: true }
        : { object: "bad", data: [] }));
    });
    await expect(f.service.start(plan())).rejects.toThrow("启动超时");
    expect(f.child.stop).toHaveBeenCalledTimes(1);
    expect(f.service.snapshot()).toMatchObject({ phase: "error", pid: null, modelLoaded: null });
  });

  it("preserves ownership after failed cleanup and allows a subsequent stop retry", async () => {
    const f = fixture(); await f.service.start(plan());
    f.child.stop.mockRejectedValueOnce(new Error("fixture stop failed"));
    await expect(f.service.stop()).rejects.toThrow("fixture stop failed");
    expect(f.service.snapshot()).toMatchObject({ phase: "error", pid: 12345 });
    await expect(f.service.start(plan())).rejects.toThrow("先停止");
    expect(await f.service.stop()).toMatchObject({ phase: "stopped", pid: null });
  });

  it("detects process exit and does not retain a stale model-loaded fact", async () => {
    const f = fixture(); f.load(); await f.service.start(plan()); f.exit();
    expect(f.service.snapshot()).toMatchObject({ phase: "error", modelLoaded: null });
    await f.service.stop(); expect(f.service.snapshot().phase).toBe("stopped");
  });

  it("launches and stops a real isolated HTTP child through the production process adapter", async () => {
    const reservation = createServer();
    await new Promise<void>((resolve) => reservation.listen(0, "127.0.0.1", resolve));
    const port = (reservation.address() as { port: number }).port;
    await new Promise<void>((resolve) => reservation.close(() => resolve()));
    const secret = "isolated-process-secret";
    const script = `const http=require('http'); const child=require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'ignore'}); console.log('descendant='+child.pid); http.createServer((req,res)=>{res.setHeader('Content-Type','application/json'); if(req.url==='/health')res.end(JSON.stringify({service:'strata',status:'ok',loaded:false,api_key:true}));else if(req.headers.authorization==='Bearer ${secret}')res.end(JSON.stringify({object:'list',data:[]}));else{res.statusCode=401;res.end('{}');}}).listen(${port},'127.0.0.1');`;
    const service = new StrataService({ startupTimeoutMs: 5_000, pollMs: 10 });
    let descendant = 0;
    try {
      const status = await service.start({ executable: process.execPath, args: ["-e", script], cwd: process.cwd(), port, apiKey: secret });
      expect(status).toMatchObject({ phase: "ready", modelLoaded: false });
      descendant = Number(status.log.match(/descendant=(\d+)/u)?.[1]);
      expect(descendant).toBeGreaterThan(0);
      expect(await isLocalPortInUse(port)).toBe(true);
    } finally { await service.stop(); }
    expect(await isLocalPortInUse(port)).toBe(false);
    if (process.platform === "win32") expect(() => process.kill(descendant, 0)).toThrow();
    else { try { process.kill(descendant, "SIGTERM"); } catch {} }
  }, 15_000);
});
