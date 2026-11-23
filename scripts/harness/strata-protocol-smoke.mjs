// Installed upstream server + real prepared tokenizer, scripted engine only. No GPU or queue work.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { StrataService } from "../../dist/electron/electron/services/strata-service.js";
import { buildStrataPromptRequest } from "../../dist/electron/electron/services/strata-prompt.js";
import { managedStrataDirectory, strataInstalledRelease, strataSourceDirectory } from "../../dist/electron/electron/services/strata-installation.js";
import { strataDerivedDataDirectory, validatePreparedStrataRuntime, buildStrataRuntimeConfig } from "../../dist/electron/electron/services/strata-model-preparation.js";
import { strataModelGeometry } from "../../dist/electron/src/core/catalog/models/strata.js";
import { createDefaultSettings } from "../../dist/electron/src/core/defaults.js";
import { isLocalPortInUse } from "../../dist/electron/electron/services/local-service-process.js";
import { verifyStrataControlVector } from "../../dist/electron/electron/services/strata-uncensored.js";
import { strataCompatibilityEnvironment } from "../../dist/electron/src/core/catalog/dependencies/strata.js";

if (process.argv.includes("--help")) {
  console.log("node scripts/harness/strata-protocol-smoke.mjs [--tokenizer-only] [--source-directory <checkout>] [--native-engine-directory <component>]\nRequires installed managed Strata and a completed Qwen pack. --tokenizer-only permits its tokenizer from an older source revision without validating or rebuilding weights. --source-directory tests a separate official checkout using the installed Python, without upgrading the installed runtime. --native-engine-directory additionally checks real native arguments via trailing --help and an unloaded lazy HTTP backend. Tests auth, HTTP/SSE, thinking, automatic output budget, repeated calls, monitor, cancellation retention and explicit stop/restart with upstream --engine mock. Never loads weights, starts a queue or changes user settings. Reports under ignored temp/. This is not neural/vision/performance validation.");
  process.exit(0);
}

const install = managedStrataDirectory(), data = strataDerivedDataDirectory();
const sourceIndex = process.argv.indexOf("--source-directory");
assert.ok(sourceIndex < 0 || (process.argv[sourceIndex + 1] && !process.argv[sourceIndex + 1].startsWith("--")), "--source-directory requires a checkout path");
const checkout = sourceIndex < 0 ? install : path.resolve(process.argv[sourceIndex + 1]);
const source = sourceIndex < 0 ? strataSourceDirectory(install)
  : await fs.stat(path.join(checkout, "terminal/serve/server.py")).then(() => path.join(checkout, "terminal")).catch(() => checkout);
assert.ok((await fs.stat(path.join(source, "serve/server.py"))).isFile());
const tokenizerOnly = process.argv.includes("--tokenizer-only");
let prepared;
for (const entry of (await fs.readdir(data, { withFileTypes: true })).filter(e => e.isDirectory() && !e.isSymbolicLink()).slice(-1000).reverse()) {
  const config = path.join(data, entry.name, "runtime.json");
  try {
    const candidate = JSON.parse(await fs.readFile(config, "utf8"));
    // This scripted completion uses Qwen's end-of-turn and thinking delimiters.
    if (!candidate.model_name?.startsWith("strata/qwen3.8-flash-next-")) continue;
    if (tokenizerOnly) {
      const receipt = JSON.parse(await fs.readFile(path.join(data, entry.name, "lvs-strata-model.json"), "utf8"));
      assert.equal(receipt.owner, "local-video-studio"); assert.equal(receipt.modelId, candidate.model_name);
      assert.equal(path.resolve(candidate.tokenizer), path.resolve(data, entry.name, "tokenizer"));
      for (const name of ["vocab.json", "merges.txt", "tokenizer.json"]) assert.ok((await fs.stat(path.join(candidate.tokenizer, name))).size > 0);
    } else await validatePreparedStrataRuntime(config, install);
    prepared = candidate; break;
  }
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
const launch = () => ({ executable: path.join(install, ".venv", "Scripts", "python.exe"), cwd: source, port, apiKey,
  args: ["-B", "-u", "-m", "serve.server", "--engine", "mock", "--config", config, "--host", "127.0.0.1",
    "--port", String(port), "--api-key", apiKey, "--api-monitor", "--script-delay", "0.005",
    "--script", "A scripted fixture thought.</think>\n\n" + "Fixture detail. ".repeat(30) + "Official fixture final." ] });
const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
// Windows can complete process-tree termination before TCP teardown is visible.
// Still require the port to close within a bounded interval; never accept a leftover listener.
async function assertPortClosed() {
  const deadline = Date.now() + 2000;
  while (await isLocalPortInUse(port)) {
    assert.ok(Date.now() < deadline, `Owned Strata port ${port} remained open after stopping`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}
const api = async (route, options = {}) => fetch(`http://127.0.0.1:${port}${route}`, { ...options, headers: { ...headers, ...options.headers } });
let pid, restartedPid, nativePreflight;
try {
  const nativeIndex = process.argv.indexOf("--native-engine-directory");
  if (nativeIndex >= 0) {
    assert.ok(process.argv[nativeIndex + 1] && !process.argv[nativeIndex + 1].startsWith("--"), "--native-engine-directory requires a component directory");
    const engine = path.resolve(process.argv[nativeIndex + 1]);
    const receipt = JSON.parse(await fs.readFile(path.join(path.dirname(prepared.tokenizer), "lvs-strata-model.json"), "utf8"));
    const geometry = strataModelGeometry(prepared.model_name);
    const nativeConfig = buildStrataRuntimeConfig({ installDirectory: checkout, packDirectory: path.dirname(prepared.tokenizer),
      shards: receipt.assets.slice(0, geometry.shardCount).map(asset => asset.filename), pleShard: receipt.assets[receipt.pleShard].filename,
      projector: receipt.assets[geometry.shardCount].filename, modelId: prepared.model_name, port, policy: receipt.policy,
      mtpDirectory: receipt.mtp && receipt.mtp.directory });
    nativeConfig.exe = path.join(engine, "strata.exe"); nativeConfig.lib_dirs = [engine];
    nativeConfig.log = path.join(directory, "native-preflight.log");
    nativeConfig.args[nativeConfig.args.indexOf("--expert-profile") + 1] = path.join(source, "data/expert-profile.bin");
    nativeConfig.vision = { ...nativeConfig.vision, exe: path.join(engine, "strata-vision.exe"), gpu: false };
    nativeConfig.lazy_load = true;
    nativeConfig.env = strataCompatibilityEnvironment();
    const builtin = await verifyStrataControlVector(checkout, "builtin");
    const community = await verifyStrataControlVector(install, "community");
    // Audited native main parses these arguments before --help and before device/weight initialization.
    for (const vector of [null, builtin, community]) {
      const args = [...nativeConfig.args, ...(vector ? ["--control-vector-scaled", `${vector.filename}:1.0`,
        "--control-vector-layer-range", String(vector.firstLayer), String(vector.lastLayer), "--cvec-mode", "project", "--cvec-dir", "per-layer"] : []), "--help"];
      await promisify(execFile)(nativeConfig.exe, args, { cwd: source, env: { ...process.env, ...nativeConfig.env, CUDA_VISIBLE_DEVICES: "" },
        windowsHide: true, timeout: 15000, maxBuffer: 1024 ** 2 });
    }
    await promisify(execFile)(nativeConfig.vision.exe, ["--version"], { cwd: source, env: { ...process.env, CUDA_VISIBLE_DEVICES: "" },
      windowsHide: true, timeout: 15000, maxBuffer: 1024 ** 2 });
    const nativeFile = path.join(directory, "native-preflight.json");
    await fs.writeFile(nativeFile, JSON.stringify(nativeConfig));
    await service.start({ ...launch(), installDirectory: checkout, env: { ...nativeConfig.env, CUDA_VISIBLE_DEVICES: "" }, args: ["-B", "-u", "-m", "serve.server", "--engine", "strata",
      "--config", nativeFile, "--host", "127.0.0.1", "--port", String(port), "--api-key", apiKey, "--api-monitor", "--lazy"] });
    assert.equal(service.snapshot().modelLoaded, false);
    if (nativeConfig.env.STRATA_HC_Q8_TC === "0") assert.ok(service.snapshot().log.includes("HC Q8 Tensor Core paths disabled"));
    assert.equal((await api("/v1/status")).status, 200);
    await service.stop(); await assertPortClosed();
    nativePreflight = { argumentModes: 3, currentRecipe: true, compatibilityEnv: nativeConfig.env, visionExecutable: true, lazyBackendStarted: true, weightsLoaded: false };
  }
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
  assert.equal(service.snapshot().phase, "ready");
  assert.equal(service.snapshot().modelLoaded, true);
  assert.equal(service.snapshot().pid, pid);
  assert.ok((await service.chat(request)).endsWith("Official fixture final."));
  assert.equal(service.snapshot().pid, pid);
  await service.stop(); await assertPortClosed();
  assert.throws(() => process.kill(pid, 0));
  restartedPid = (await service.start(launch())).pid;
  assert.ok((await service.chat(request)).endsWith("Official fixture final."));
  const report = { ok: true, layer: "installed official HTTP/template/model tokenizer + scripted mock engine; no neural/vision/performance claim",
    installedVersion: strataInstalledRelease(install)?.version, sourceDirectory: source, nativePreflight,
    sourceHead: (await fs.readFile(path.join(checkout, ".git/HEAD"), "utf8").catch(() => "unknown")).trim(), tokenizerOnly, pid, restartedPid, port, repeatedCalls: calls,
    monitor: true, auth: true, contextOverflowRecovery: true, controlFieldsVisible: true, cancellationRetainedModel: true, explicitStopAndRestart: true };
  await fs.writeFile(path.join(directory, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, directory }));
} catch (error) {
  await fs.writeFile(path.join(directory, "report.json"), JSON.stringify({ ok: false, error: error.message, calls, diagnostics, wire }, null, 2));
  console.error(JSON.stringify({ directory, error: error.message }));
  throw error;
} finally {
  await service.stop(); await assertPortClosed();
  for (const ownedPid of [pid, restartedPid].filter(Boolean)) assert.throws(() => process.kill(ownedPid, 0));
  console.log(JSON.stringify({ cleanup: true }));
}
