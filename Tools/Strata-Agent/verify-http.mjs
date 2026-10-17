// CPU MOCK transport/guard test ONLY. Never Agent inference evidence.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { resolvedStrataDirectory } from './.runtime/electron/services/strata-installation.js';
import { launchStrataProcess } from './.runtime/electron/services/strata-service.js';
const tool = path.dirname(fileURLToPath(import.meta.url));
const install = resolvedStrataDirectory({ strataInstallDirectory: '' });
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'strata-agent-http-mock-'));
const reservation = net.createServer();
await new Promise((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve); });
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const token = randomBytes(32).toString('hex');
const model = `cpu-mock-${randomUUID()}`;
const config = path.join(directory, 'runtime.json');
await fs.writeFile(config, JSON.stringify({ model_name: model, host: '127.0.0.1', port, lazy_load: true }));
let child;
try {
  child = await launchStrataProcess({ executable: path.join(install, '.venv/Scripts/python.exe'), cwd: install,
    args: ['-B', '-u', path.join(tool, 'guard.py'), '--serve', install, '--engine', 'mock', '--config', config,
      '--host', '127.0.0.1', '--port', String(port), '--lazy'],
    port, apiKey: token, env: { STRATA_API_KEY: token } }, () => {});
  const origin = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let n = 0; n < 50 && child.running(); n++) {
    try { const health = await (await fetch(`${origin}/health`, { signal: AbortSignal.timeout(500) })).json(); if (health.service === 'strata' && health.model === model) { ready = true; break; } } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert(ready, 'Owned mock listener identity did not become ready');
  assert.equal((await fetch(`${origin}/v1/models`)).status, 401);
  for (const route of ['/config', '/v1/vram', '/mcp']) {
    const response = await fetch(`${origin}${route}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Origin: origin }, body: '{}' });
    assert.equal(response.status, 409, `${route} must not mutate protected Agent configuration`);
  }
  assert.equal((await fetch(`${origin}/`, { signal: AbortSignal.timeout(1000) })).status, 200);
  assert(!(await fs.readFile(config, 'utf8')).includes(token));
  console.log(JSON.stringify({ passed: true, layer: 'CPU MOCK HTTP only', unauthorizedRejected: true, protectedManagementRejected: true, nativePageServed: true, agentInference: false, gpuLoaded: false }));
} finally {
  await child?.stop();
  assert(!child?.running());
  await fs.rm(directory, { recursive: true, force: true });
}
