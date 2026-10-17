import { registerHooks } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { transformCloudSource } from './cloudcli-transform.mjs';

const root = fs.realpathSync(path.resolve(process.env.STRATA_CLOUD_PACKAGE || ''));
const key = (filename) => process.platform === 'win32' ? path.resolve(filename).toLowerCase() : path.resolve(filename);
// Synchronous one-line parent handshake, before any upstream code can execute.
const gate = Buffer.alloc(17);
let count = 0;
while (count < gate.length) { const n = fs.readSync(0, gate, count, gate.length - count, null); if (!n) throw new Error('CloudCLI Job ownership handshake closed'); count += n; }
if (gate.toString() !== 'strata-job-ready\n') throw new Error('CloudCLI Job ownership handshake failed');
if (!process.env.STRATA_CLOUD_PACKAGE || !process.env.STRATA_CLOUD_DATA_ROOT || !process.env.STRATA_CLAUDE_SETTINGS) throw new Error('Missing private CloudCLI profile');
const manifest = JSON.parse(fs.readFileSync(new URL('./cloudcli-reviewed.json', import.meta.url), 'utf8'));
const sources = new Map();
const sdkEntry = fs.realpathSync(process.env.STRATA_AGENT_SDK_ENTRY || '');
if (!process.env.STRATA_AGENT_SDK_SHA256 || createHash('sha256').update(fs.readFileSync(sdkEntry)).digest('hex') !== process.env.STRATA_AGENT_SDK_SHA256) throw new Error('Unreviewed shared Agent SDK');
for (const [relative, digest] of Object.entries(manifest)) {
  const filename = path.join(root, 'dist-server', 'server', relative);
  const data = fs.readFileSync(filename);
  if (createHash('sha256').update(data).digest('hex') !== digest) throw new Error(`Unreviewed CloudCLI source: ${relative}`);
  sources.set(key(filename), transformCloudSource(relative, data.toString('utf8'), new URL('./cloudcli-policy.mjs', import.meta.url).href));
}
registerHooks({ resolve(specifier, context, next) {
  if (specifier === '@anthropic-ai/claude-agent-sdk' && context.parentURL?.startsWith('file:')) {
    const parent = path.relative(key(root), key(fileURLToPath(context.parentURL)));
    if (parent !== '..' && !parent.startsWith(`..${path.sep}`) && !path.isAbsolute(parent)) return { url: pathToFileURL(sdkEntry).href, shortCircuit: true };
  }
  return next(specifier, context);
}, load(url, context, next) {
  if (url.startsWith('file:')) {
    const source = sources.get(key(fileURLToPath(url)));
    if (source !== undefined) return { format: 'module', source, shortCircuit: true };
  }
  return next(url, context);
} });
