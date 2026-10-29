// Installed upstream server + real prepared tokenizer, scripted engine only. No GPU or queue work.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import { StrataService } from "../../dist/electron/electron/services/strata-service.js";
import { buildStrataPromptRequest } from "../../dist/electron/electron/services/strata-prompt.js";
import { managedStrataDirectory, strataInstalledRelease } from "../../dist/electron/electron/services/strata-installation.js";
import { strataDerivedDataDirectory, validatePreparedStrataRuntime } from "../../dist/electron/electron/services/strata-model-preparation.js";
import { createDefaultSettings } from "../../dist/electron/src/core/defaults.js";
import { isLocalPortInUse } from "../../dist/electron/electron/services/local-service-process.js";

if (process.argv.includes("--help")) {
  console.log("node scripts/harness/strata-protocol-smoke.mjs\nRequires an installed managed Strata and a completed model pack. Tests real model tokenizer/template, auth, HTTP/SSE, thinking, automatic output budget, repeated calls, monitor and cancel/restart with upstream --engine mock. Never loads weights, starts a queue or changes user settings. Reports under ignored temp/. This is not neural/vision/performance validation.");
  process.exit(0);
}

const install = managedStrataDirectory(), data = strataDerivedDataDirectory();
let prepared;
for (const entry of (await fs.readdir(data, { withFileTypes: true })).filter(e => e.isDirectory() && !e.isSymbolicLink()).slice(-1000).reverse()) {
  const config = path.join(data, entry.name, "runtime.json");
  try { await validatePreparedStrataRuntime(config, install); prepared = JSON.parse(await fs.readFile(config, "utf8")); break; }
  catch { /* Do not repair a pack or download anything for a protocol smoke. */ }
}
assert.ok(prepared, "No completed compatible Strata pack; prepare one before this opt-in protocol check");
const directory = await fs.mkdtemp(path.resolve("temp/strata-protocol-smoke-"));
const config = path.join(directory, "mock.json");
await fs.writeFile(config, JSON.stringify({ tokenizer: prepared.tokenizer, model_name: prepared.model_name, fit_max_tokens: true }));
const socket = createServer(); await new Promise(r => socket.listen(0, "127.0.0.1", r));
const port = socket.address().port; await new Promise(r => socket.close(r)); assert.notEqual(port, 8080);
const apiKey = randomBytes(32).toString("hex"), diagnostics = [], wire = [], calls = [];
const service = new StrataService({ startupTimeoutMs: 15000, requestTimeoutMs: 15000,
  onDiagnostics: value => diagnostics.push(value), fetch: async (url, options) => {
    if (String(url).endsWith("/v1/chat/completions")) {
      const body = JSON.parse(options.body);
      wire.push({ maxTokens: body.max_tokens, effort: body.reasoning_effort ?? null,
        budget: body.reasoning_budget_tokens ?? null, thinking: body.chat_template_kwargs?.enable_thinking });
    }
    return fetch(url, options);
  } });
const launch = () => ({ executable: path.join(install, ".venv", "Scripts", "python.exe"), cwd: install, port, apiKey,
  args: ["-B", "-u", "-m", "serve.server", "--engine", "mock", "--config", config, "--host", "127.0.0.1",
    "--port", String(port), "--api-key", apiKey, "--api-monitor", "--script-delay", "0.005",
    "--script", "A scripted fixture thought.</think>\n\nOfficial fixture final." ] });
const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
const api = async (route, options = {}) => fetch(`http://127.0.0.1:${port}${route}`, { ...options, headers: { ...headers, ...options.headers } });
let pid, restartedPid;
try {
  pid = (await service.start(launch())).pid;
  const unauthorized = await fetch(`http://127.0.0.1:${port}/v1/models`);
  assert.equal(unauthorized.status, 401);
  for (const route of ["/api-monitor", "/web/monitor.js", "/web/tokens.css", "/web/favicon.svg", "/v1/status"]) {
    const response = await api(route); assert.equal(response.status, 200, route); await response.arrayBuffer();
  }
  for (const effort of ["off", "low", "medium", "high", "medium", "medium"]) {
    const request = await buildStrataPromptRequest({ mode: "h3-vision", modelId: "minimax_h3_fl2va", h3PromptMode: "T2VA",
      h3PromptPreset: "detailed-cinematic", durationSeconds: 15,
      prompt: "A courier crosses a rain-soaked market, hands a parcel to a cyclist, then turns as a tram passes. Preserve identities and action continuity across three shots." },
    { ...createDefaultSettings(), promptModelId: prepared.model_name, strataReasoningEffort: effort }, new AbortController().signal);
    const output = await service.chat(request);
    assert.ok(output.endsWith("Official fixture final."));
    const row = diagnostics.at(-1), sent = wire.at(-1);
    assert.equal(row.reasoningRequested, effort !== "off");
    assert.equal(sent.thinking, effort !== "off");
    assert.ok(row.maxTokens > row.requestedMaxTokens);
    assert.equal(row.finishReason, "stop");
    if (effort !== "off") { assert.ok(row.reasoningCharacters > 0); assert.equal(sent.budget, 0); }
    assert.equal(service.snapshot().pid, pid);
    calls.push({ effort, inputTokens: row.inputTokens, outputBudget: row.maxTokens, reasoningSeparated: row.reasoningCharacters > 0 });
  }
  const records = await (await api("/api/requests")).json();
  assert.ok(records.requests.length >= calls.length);
  const detail = await (await api(`/api/requests?id=${records.requests[0].id}`)).json();
  assert.ok(detail.reasoning.includes("fixture thought"));
  const control = { model: prepared.model_name, stream: true, max_tokens: 8192, reasoning_effort: "medium",
    reasoning_budget_tokens: 0, chat_template_kwargs: { enable_thinking: true },
    messages: [{ role: "user", content: "Unrelated fixture word. ".repeat(50000) }] };
  const overflow = await api("/v1/chat/completions", { method: "POST", body: JSON.stringify(control) });
  assert.equal(overflow.status, 400); await overflow.arrayBuffer();
  const latest = (await (await api("/api/requests")).json()).requests[0];
  const captured = await (await api(`/api/requests?id=${latest.id}`)).json();
  assert.equal(captured.input_truncated, true);
  for (const field of ["reasoning_effort", "reasoning_budget_tokens", "chat_template_kwargs", "max_tokens"]) assert.ok(captured.input.includes(field));
  assert.equal(service.snapshot().pid, pid);
  const request = { modelId: prepared.model_name, messages: [{ role: "user", content: "Fixture cancellation." }],
    maxTokens: 2048, temperature: 1, reasoning: { effort: "medium", budgetTokens: 0 } };
  const controller = new AbortController();
  await assert.rejects(service.chat(request, controller.signal, () => controller.abort(new Error("fixture cancellation"))), /fixture cancellation/u);
  assert.equal(service.snapshot().phase, "stopped"); assert.equal(await isLocalPortInUse(port), false);
  assert.throws(() => process.kill(pid, 0));
  restartedPid = (await service.start(launch())).pid;
  assert.ok((await service.chat(request)).endsWith("Official fixture final."));
  const report = { ok: true, layer: "installed official HTTP/template/model tokenizer + scripted mock engine; no neural/vision/performance claim",
    version: strataInstalledRelease(install)?.version, pid, restartedPid, port, repeatedCalls: calls,
    monitor: true, auth: true, contextOverflowRecovery: true, controlFieldsVisible: true, cancellationCleanupAndRestart: true };
  await fs.writeFile(path.join(directory, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, directory }));
} finally {
  await service.stop(); assert.equal(await isLocalPortInUse(port), false);
  for (const ownedPid of [pid, restartedPid].filter(Boolean)) assert.throws(() => process.kill(ownedPid, 0));
  console.log(JSON.stringify({ cleanup: true }));
}
