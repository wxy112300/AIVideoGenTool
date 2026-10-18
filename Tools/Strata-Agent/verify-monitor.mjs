// Actual pinned Python HTTP/guard, scripted CPU engine. No Claude, weights or GPU.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolvedStrataDirectory } from './.runtime/electron/services/strata-installation.js';
import { StrataService } from './.runtime/electron/services/strata-service.js';
import { AgentRuntimeMonitor } from './.runtime/electron/services/strata-agent-monitor.js';
const tool = path.dirname(fileURLToPath(import.meta.url));
const install = resolvedStrataDirectory({ strataInstallDirectory: '' });
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'strata-monitor-cpu-'));
const reservation = net.createServer();
await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const secret = randomBytes(32).toString('hex'), delayed = process.argv.includes('--long'), crash = process.argv.includes('--crash');
const config = path.join(directory, 'runtime.json'), wrapper = path.join(directory, 'fixture.py');
await fs.writeFile(config, JSON.stringify({ model_name: 'cpu-monitor-only', host: '127.0.0.1', port }));
await fs.writeFile(wrapper, `import sys, time\nsys.path.insert(0, ${JSON.stringify(install)})\nfrom serve import server\nsys.path.insert(0, ${JSON.stringify(tool)})\nimport guard\noriginal = server.MockEngine.generate\ndef generate(self, *args, **kwargs):\n    time.sleep(${delayed ? 125 : 0.1})\n    yield from original(self, *args, **kwargs)\nserver.MockEngine.generate = generate\nraise SystemExit(guard.serve(${JSON.stringify(install)}, sys.argv[1:]))\n`);
if (crash) {
  const source = await fs.readFile(wrapper, 'utf8');
  await fs.writeFile(wrapper, source.replace('import guard\n', 'import guard, os, threading\nthreading.Timer(2.0, lambda: os._exit(17)).start()\n'));
}
let output = '';
const service = new StrataService({ onOutput: chunk => { output += chunk; } });
const monitor = new AgentRuntimeMonitor();
const started = Date.now();
try {
  await service.start({ executable: path.join(install, '.venv/Scripts/python.exe'), cwd: install, port, apiKey: secret,
    args: ['-B', '-u', wrapper, '--engine', 'mock', '--config', config, '--host', '127.0.0.1', '--port', String(port), '--script', 'CPU transport complete'],
    env: { STRATA_API_KEY: secret } });
  if (crash) {
    const deadline = Date.now() + 10000;
    while (service.snapshot().phase !== 'error' && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(service.snapshot().phase, 'error');
    assert(output.includes('code=17'));
    for (let n = 0; n < 3; n++) await monitor.read(port, secret);
    assert.equal((await monitor.read(port, secret)).connection, 'unreachable');
    console.log(JSON.stringify({ passed: true, layer: 'actual owned Python exit injection ONLY', elapsedMs: Date.now() - started, exitCode: 17, state: 'error', gpuLoaded: false }));
  } else {
  let done = false;
  const stream = fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
    method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(150000), body: JSON.stringify({ model: 'cpu-monitor-only', messages: [{ role: 'user', content: 'transport fixture' }], max_tokens: 64, stream: true })
  }).then(async response => { assert(response.ok); const text = await response.text(); assert(text.includes('[DONE]')); done = true; });
  // Attach the rejection handler immediately; don't leave a rejected stream unobserved while polling.
  let failure;
  const completion = stream.catch(error => { failure = error; done = true; });
  let samples = 0, sawBusy = false;
  while (!done) {
    const state = await monitor.read(port, secret);
    assert.equal(state.connection, 'online'); sawBusy ||= state.busy === true; samples++;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  await completion; if (failure) throw failure;
  assert(service.snapshot().phase === 'ready');
  if (delayed) { assert(Date.now() - started >= 125000); assert(sawBusy); }
  await service.stop();
  assert(output.includes('[Strata process exited]'));
  assert(!output.includes(secret));
  for (let n = 0; n < 3; n++) await monitor.read(port, secret);
  assert.equal((await monitor.read(port, secret)).connection, 'unreachable');
  console.log(JSON.stringify({ passed: true, layer: 'actual Python HTTP + CPU scripted engine ONLY', elapsedMs: Date.now() - started, samples, sawBusy, exitRecorded: true, gpuLoaded: false, agentInference: false }));
  }
} finally {
  await service.stop();
  await fs.rm(directory, { recursive: true, force: true });
}
