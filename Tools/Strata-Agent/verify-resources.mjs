// Actual Windows/NVML telemetry and owned helper cleanup; does not load a model or CUDA context.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AGENT_RESOURCE_RETRY, AgentResourceSampler } from './.runtime/electron/services/strata-agent-sampler.js';
import { readReliableStrataResources } from './.runtime/electron/services/strata-resources.js';
const python = process.argv[2];
if (!python || !path.isAbsolute(python)) throw Error('Pass the selected installed Strata Python absolute path.');
const sampler = new AgentResourceSampler(), tracked = [], latencies = [];
let last;
try {
  await sampler.start(python, path.join(path.dirname(fileURLToPath(import.meta.url)), 'resources.py'), async pid => { tracked.push(pid); });
  for (let i = 0; i < 120; i++) {
    const at = performance.now();
    last = await readReliableStrataResources(sampler.read, { ...AGENT_RESOURCE_RETRY, onDiagnostic: () => {} });
    latencies.push(performance.now() - at);
    assert(last.memoryAvailableBytes > 0 && last.commitAvailableBytes > 0 && last.vramAvailableBytes > 0);
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  const { stdout } = await promisify(execFile)('nvidia-smi.exe', ['--query-gpu=memory.free,memory.total', '--format=csv,noheader,nounits'], { windowsHide: true, timeout: 5000 });
  const [free, total] = stdout.trim().split(',').map(Number);
  assert.equal(last.vramTotalBytes, total * 1024 ** 2);
  assert(Math.abs(last.vramAvailableBytes - free * 1024 ** 2) < 512 * 1024 ** 2);
  assert.equal(tracked.length, 1);
  console.log(JSON.stringify({ passed: true, samples: latencies.length, ownedHelperProcesses: tracked.length,
    maximumReadMs: Math.round(Math.max(...latencies)), meanReadMs: +(latencies.reduce((a,b)=>a+b,0)/latencies.length).toFixed(2),
    freshRamBytes: last.memoryAvailableBytes, freshCommitBytes: last.commitAvailableBytes, smiVramAgreement: true, modelLoaded: false }));
} finally {
  await sampler.stop();
  await assert.rejects(sampler.read(), /未运行/u);
}
