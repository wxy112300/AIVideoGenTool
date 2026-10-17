// Run after prepare.mjs. Real separate processes, isolated coordination root; no GPU or user state.
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import assert from 'node:assert/strict';
import { GpuResourceLease } from './.runtime/electron/services/gpu-resource-lease.js';
const filename = fileURLToPath(import.meta.url);
if (process.argv[2] === '--holder') {
  const lease = new GpuResourceLease('agent', async () => false, { directory: process.argv[3] });
  await lease.acquire();
  console.log('held');
  const lines = createInterface({ input: process.stdin });
  lines.on('line', () => { void lease.release().then(() => process.exit(0), () => process.exit(2)); });
} else {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'strata-agent-lease-live-'));
  const child = spawn(process.execPath, [filename, '--holder', directory], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const childExit = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`Holder exited ${code}`))); });
  const lease = new GpuResourceLease('studio', async () => false, { directory });
  try {
    const lines = createInterface({ input: child.stdout });
    await Promise.race([new Promise((resolve) => lines.once('line', (line) => { assert.equal(line, 'held'); resolve(); })), childExit.then(() => { throw new Error('Holder ended too early'); }), new Promise((_, reject) => setTimeout(() => reject(new Error('Holder timeout')), 10000).unref())]);
    const started = Date.now();
    await assert.rejects(lease.acquire(), /未中止活跃 Agent/);
    assert.equal(child.exitCode, null);
    child.stdin.end('explicit-owner-stop\n');
    await childExit;
    await lease.acquire(); assert(lease.held); await lease.release();
    lines.close();
    console.log(JSON.stringify({ passed: true, separateProcesses: true, activeOwnerPreserved: true, explicitReleaseAndRetry: true, elapsedMs: Date.now() - started, gpuLoaded: false }));
  } finally {
    if (child.exitCode === null) { child.stdin.end('cleanup\n'); await childExit; }
    await lease.release();
    await fs.rm(directory, { recursive: true, force: true });
  }
}
