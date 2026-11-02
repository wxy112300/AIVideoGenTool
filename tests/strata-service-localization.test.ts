import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { afterEach, expect, it, vi } from "vitest";
import { StrataService, prepareStrataLaunch, assertStrataResidentLog, type StrataLaunchPlan } from "../electron/services/strata-service.js";
import { verifyStrataControlVector, assertStrataControlVectorLog } from "../electron/services/strata-uncensored.js";
import { strataVectorForMode } from "../src/core/strata-uncensored.js";
import { createNativeTranslator } from "../electron/ui-translator.js";
import type { UiLocale } from "../src/types.js";
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });
async function temporary() { const root = await fs.mkdtemp(path.join(os.tmpdir(), "strata-service-locale-")); roots.push(root); return root; }
function fixture(getUiLocale: () => UiLocale) {
  let alive = true, loaded = false;
  const child = { pid: 12345, running: () => alive, stop: vi.fn(async () => { alive = false; }) };
  const launch = vi.fn(async (_plan: StrataLaunchPlan, output: (line: string) => void) => { output("fixture-secret startup"); return child; });
  const fetch = vi.fn(async (url: string | URL | Request, _options?: RequestInit) => {
    const endpoint = String(url);
    if (endpoint.endsWith("/health")) return new Response(JSON.stringify({ service: "strata", status: "ok", loaded, api_key: true }));
    if (endpoint.endsWith("/v1/load")) { loaded = true; return new Response('{"status":"loaded"}'); }
    if (endpoint.endsWith("/v1/chat/completions")) return new Response('data: {"choices":[{"index":0,"delta":{"content":"用户输出"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', { headers: { "content-type": "text/event-stream" } });
    return new Response('{"object":"list","data":[]}');
  });
  const service = new StrataService({ getUiLocale, launch, fetch, portInUse: async () => false });
  const plan: StrataLaunchPlan = { executable: "fixture.exe", cwd: "fixture", args: ["--lazy"], port: 43127, apiKey: "fixture-secret", modelId: "fixture-model" };
  return { service, child, launch, fetch, plan };
}

it("reads live locale changes without changing requests, authentication, residency or generated user text", async () => {
  const bodies: unknown[] = [];
  for (const uiLocale of ["zh-CN", "en-US", "zh-TW"] as const) {
    let language: UiLocale = "zh-CN"; const f = fixture(() => language); language = uiLocale;
    try {
      const ready = await f.service.start(f.plan);
      expect(ready.message).toContain(uiLocale === "en-US" ? "HTTP service is ready" : uiLocale === "zh-TW" ? "HTTP 服務就緒" : "HTTP 服务就绪");
      expect(ready.log).not.toContain("fixture-secret");
      const loaded = await f.service.load();
      expect(loaded).toMatchObject({ phase: "ready", modelLoaded: true, pid: 12345 });
      expect(loaded.message).toContain(uiLocale === "en-US" ? "Uncensored disabled" : uiLocale === "zh-TW" ? "uncensored 未啟用" : "uncensored 未启用");
      const load = f.fetch.mock.calls.find(([url]) => String(url).endsWith("/v1/load"))!;
      expect(JSON.parse(load[1]!.body as string)).toEqual({ model: "fixture-model" });
      expect(new Headers(load[1]!.headers).get("Authorization")).toBe("Bearer fixture-secret");
      const before = f.fetch.mock.calls.length;
      await expect(f.service.chat({ modelId: "fixture-model", messages: [], maxTokens: 0, temperature: .7 })).rejects.toThrow(uiLocale === "en-US" ? "Invalid Strata prompt request" : uiLocale === "zh-TW" ? "提示詞請求參數無效" : "提示词请求参数无效");
      expect(f.fetch).toHaveBeenCalledTimes(before); expect(f.child.stop).not.toHaveBeenCalled();
      expect(await f.service.chat({ modelId: "fixture-model", messages: [{ role: "user", content: "保留故乡招牌" }], maxTokens: 100, temperature: .7 })).toBe("用户输出");
      bodies.push(JSON.parse(f.fetch.mock.calls.find(([url]) => String(url).endsWith("/v1/chat/completions"))![1]!.body as string));
      expect(f.launch).toHaveBeenCalledOnce(); expect(f.child.stop).not.toHaveBeenCalled();
      language = "zh-CN"; expect((await f.service.stop()).message).toBe("Strata 服务已停止。");
      expect(f.child.stop).toHaveBeenCalledOnce();
    } finally { await f.service.stop(); }
  }
  expect(bodies[1]).toEqual(bodies[0]); expect(bodies[2]).toEqual(bodies[0]);
  expect(JSON.stringify(bodies[0])).toContain("保留故乡招牌");
});

it.each(["en-US", "zh-TW"] as const)("redacts raw load failures and stops only the owned child (%s)", async uiLocale => {
  const f = fixture(() => uiLocale); await f.service.start(f.plan);
  f.fetch.mockResolvedValueOnce(new Response('{"error":{"message":"EACCES 外部诊断 fixture-secret"}}', { status: 503 }));
  const failure = await f.service.load().then(() => null, error => error);
  expect(failure.message).toContain(uiLocale === "en-US" ? "model loading failed (HTTP 503)" : "模型載入失敗（HTTP 503）");
  expect(failure.message).toContain("EACCES 外部诊断 [redacted]");
  expect(failure.message).not.toContain("fixture-secret");
  expect(f.child.stop).toHaveBeenCalledOnce();
  expect(f.service.snapshot()).toMatchObject({ phase: "stopped", pid: null, modelLoaded: null });
  const t = createNativeTranslator(uiLocale).t;
  await expect(prepareStrataLaunch({ strataInstallDirectory: "unused", strataPort: 0, uiLocale }, "unused")).rejects.toThrow(uiLocale === "en-US" ? "port must be an integer" : "連接埠應為");
  const file = path.join(await temporary(), "使用者日志.txt"); await fs.writeFile(file, "");
  await expect(assertStrataResidentLog(file, 0, false, t)).rejects.toThrow(uiLocale === "en-US" ? "No expert residency log" : "未取得本次 Strata 專家常駐日誌");
  expect(await fs.readFile(file, "utf8")).toBe("");
});

it.each(["zh-CN", "en-US", "zh-TW"] as const)("keeps control-vector hashes, layer evidence and file bytes intact (%s)", async uiLocale => {
  const root = await temporary(), t = createNativeTranslator(uiLocale).t, vector = strataVectorForMode("builtin");
  const file = path.join(root, vector.relativePath); await fs.mkdir(path.dirname(file), { recursive: true });
  await expect(verifyStrataControlVector(root, "builtin", t)).rejects.toThrow(uiLocale === "en-US" ? "wrong size" : uiLocale === "zh-TW" ? "大小不符" : "大小不符");
  const corrupt = Buffer.alloc(vector.bytes); corrupt.write("GGUF"); await fs.writeFile(file, corrupt);
  await expect(verifyStrataControlVector(root, "builtin", t)).rejects.toThrow("SHA-256");
  expect(await fs.readFile(file)).toEqual(corrupt);
  const log = path.join(root, "engine.log"); await fs.writeFile(log, "Unconfirmed fixture");
  const descriptor = { ...vector, filename: file };
  await expect(assertStrataControlVectorLog(log, 0, descriptor, t)).rejects.toThrow(uiLocale === "en-US" ? "did not confirm" : uiLocale === "zh-TW" ? "未確認" : "未确认");
  const line = `control vector mode = project, dir = per-layer, layers ${vector.firstLayer}..${vector.lastLayer} (${vector.lastLayer - vector.firstLayer + 1} steered)`;
  await fs.appendFile(log, "\n" + line);
  await expect(assertStrataControlVectorLog(log, 0, descriptor, t)).resolves.toBeUndefined();
  expect(await fs.readFile(log, "utf8")).toBe("Unconfirmed fixture\n" + line);
});
