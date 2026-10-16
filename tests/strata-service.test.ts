import { promises as fs } from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STRATA_ENGINE_SHA256, STRATA_REVISION } from "../src/core/catalog/dependencies/strata.js";
import { assertStrataResidentLog, prepareStrataLaunch, StrataService, type StrataLaunchPlan } from "../electron/services/strata-service.js";
import { isLocalPortInUse } from "../electron/services/local-service-process.js";
import { writeStrataPreparedFixture } from "./helpers/strata-pack-fixture.js";
import { planStrataResources } from "../src/core/strata-resource-policy.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });
const plan = (): StrataLaunchPlan => ({ executable: "python.exe", cwd: "fixture", args: ["--lazy", "--api-monitor"], port: 43127, apiKey: "fixture-secret" });
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
  it("keeps monitor credentials main-only and revokes them on stop", async () => {
    const f = fixture();
    expect(f.service.monitorConnection()).toBeNull();
    await f.service.start(plan());
    expect(f.service.monitorConnection()).toEqual({ origin: "http://127.0.0.1:43127", apiKey: "fixture-secret" });
    expect(JSON.stringify(f.service.snapshot())).not.toContain("fixture-secret");
    await f.service.stop(); expect(f.service.monitorConnection()).toBeNull();
    const legacy = fixture(); await legacy.service.start({ ...plan(), args: ["--lazy"] });
    expect(legacy.service.monitorConnection()).toBeNull(); await legacy.service.stop();
  });
  it("rejects changed resources after GPU handoff without sending /v1/load and stops only its child", async () => {
    const f = fixture();
    const safe = {memoryAvailableBytes:100*1024**3,commitAvailableBytes:100*1024**3,vramAvailableBytes:21.5*1024**3,vramTotalBytes:24*1024**3};
    const service = new StrataService({launch:f.launch,portInUse:f.portInUse,fetch:f.fetchMock as typeof fetch,
      readResources:async()=>({...safe,vramAvailableBytes:18*1024**3})});
    await service.start({...plan(),resourcePlan:planStrataResources(safe,2048)});
    await expect(service.load()).rejects.toThrow("资源已变化");
    expect(f.fetchMock.mock.calls.some(([url])=>String(url).endsWith("/v1/load"))).toBe(false);
    expect(f.child.stop).toHaveBeenCalledOnce(); expect(service.snapshot().pid).toBeNull();
  });
  it("ignores old warnings but refuses a fresh partial-residency fallback before chat", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "strata-resident-log-")); roots.push(root);
    const filename = path.join(root, "engine.log");
    await fs.writeFile(filename, "WARNING: the whole resident RAM mode does not fit (old run)\n");
    const offset = (await fs.stat(filename)).size;
    await fs.appendFile(filename, "resident RAM mode: complete complement ready\n");
    await expect(assertStrataResidentLog(filename, offset)).resolves.toBeUndefined();
    const next = (await fs.stat(filename)).size;
    await fs.appendFile(filename, "WARNING: the whole resident RAM mode does not fit (available commit)\n");
    await expect(assertStrataResidentLog(filename, next)).rejects.toThrow("提交容量");
    await expect(assertStrataResidentLog(filename, (await fs.stat(filename)).size)).rejects.toThrow("本次");
  });
  it("preflights a long request with the matching thinking template without loading GPU", async () => {
    const f = fixture(); await f.service.start(plan());
    f.fetchMock.mockImplementationOnce(async (url, options) => {
      expect(String(url)).toContain("count_tokens");
      expect(JSON.parse(options!.body as string)).toMatchObject({ thinking: { type: "enabled" }, output_config: { effort: "medium" } });
      return new Response('{"input_tokens":21198}');
    });
    await f.service.preflight({ modelId: "fixture", messages: [{ role: "user", content: "long dossier" }],
      maxTokens: 8192, temperature: 1, contextSize: 32768, visionTokensPerImage: 1024,
      reasoning: { effort: "medium", budgetTokens: 2048 } });
    expect(f.service.snapshot().modelLoaded).toBe(false);
    expect(f.fetchMock.mock.calls.some(([url]) => /\/v1\/(load|chat)/u.test(String(url)))).toBe(false);
    await f.service.stop();
  });
  it("uses the official thinking profile, bounded reasoning and does not expose reasoning as prompt text", async () => {
    const f = fixture(); await f.service.start(plan()); f.load();
    f.fetchMock.mockImplementationOnce(async (_url, options) => {
      expect(JSON.parse(options!.body as string)).toMatchObject({ temperature: 1, top_p: .95, presence_penalty: 0,
        reasoning_effort: "medium", reasoning_budget_tokens: 2048, chat_template_kwargs: { enable_thinking: true }, max_tokens: 8192 });
      const events = [ { delta: { reasoning_content: "private planning" }, finish_reason: null },
        { delta: { content: "final H3" }, finish_reason: "stop" } ];
      return new Response(events.map(event => `data: ${JSON.stringify({ choices: [{ index: 0, ...event }] })}\n\n`).join("") + "data: [DONE]\n\n",
        { headers: { "Content-Type": "text/event-stream" } });
    });
    expect(await f.service.chat({ modelId: "fixture", messages: [{ role: "user", content: "brief" }], maxTokens: 8192,
      temperature: 1, reasoning: { effort: "medium", budgetTokens: 2048 } })).toBe("final H3");
    await f.service.stop();
  });
  it("preserves a bounded upstream loading error, redacts the secret and stops the owned service", async () => {
    const f=fixture(); await f.service.start(plan());
    f.fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({error:{message:"native IQ needs --spec >= 2 fixture-secret"}}),{status:400}));
    const error = await f.service.load().catch(error => error);
    expect(error.message).toContain("HTTP 400");
    expect(error.message).toContain("native IQ needs");
    expect(error.message).toContain("engine.log");
    expect(error.message).not.toContain("fixture-secret");
    expect(f.child.stop).toHaveBeenCalledOnce();
    expect(f.service.snapshot().phase).toBe("stopped");
  });
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
      expect(JSON.parse(options!.body as string)).toMatchObject({ max_tokens: 8192, stream: true,
        temperature: 0.7, top_p: 0.8, top_k: 20, min_p: 0, presence_penalty: 1.5, repetition_penalty: 1,
        chat_template_kwargs: { enable_thinking: false } });
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
    const legacy = await prepareStrataLaunch(settings, config);
    expect(legacy.args).not.toContain("--api-monitor");
    await fs.writeFile(path.join(root, "serve", "server.py"), 'ap.add_argument("--api-monitor")');
    await fs.mkdir(path.join(root, "serve", "web"), { recursive: true });
    for (const name of ["monitor.html", "monitor.js", "tokens.css"]) await fs.writeFile(path.join(root, "serve", "web", name), "fixture");
    const result = await prepareStrataLaunch(settings, config);
    expect(result.executable).toBe(path.join(root, ".venv", "Scripts", "python.exe"));
    expect(result.args).toEqual(["-B", "-u", "-m", "serve.server", "--engine", "strata", "--config", config, "--host", "127.0.0.1", "--port", "43127", "--lazy", "--api-monitor", "--api-key", result.apiKey]);
    expect(result.apiKey).toHaveLength(64);
    expect((await prepareStrataLaunch(settings, config)).apiKey).not.toBe(result.apiKey);
    const before = await fs.readFile(config, "utf8");
    for (const [available,mode] of [[100,"arena"],[40,"resident"]] as const) {
      const session = await prepareStrataLaunch(settings,config,{adaptive:true,readResources:async()=>({memoryAvailableBytes:available*1024**3,
        commitAvailableBytes:100*1024**3,vramAvailableBytes:21.5*1024**3,vramTotalBytes:24*1024**3})});
      const derived=JSON.parse(await fs.readFile(session.temporaryConfig!,"utf8"));
      expect(derived.args.includes("--resident-experts")).toBe(mode==="resident");
      expect(derived.args[derived.args.indexOf("--vram-reserve-mib")+1]).toBe("5120");
      expect(derived.args[derived.args.indexOf("--expert-cache")+1]).toBe("auto");
      expect(session.env).toMatchObject({STRATA_RESIDENT_HEADROOM_GIB:"6"});
      expect(await fs.readFile(config,"utf8")).toBe(before);
      const f=fixture();await f.service.start(session);await f.service.stop();
      await expect(fs.stat(session.temporaryConfig!)).rejects.toMatchObject({code:"ENOENT"});
    }
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
