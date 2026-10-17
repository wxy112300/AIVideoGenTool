// Static adapter verification. Never evaluates upstream CloudCLI modules or starts a listener.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { transformCloudSource } from './cloudcli-transform.mjs';

const tool = path.dirname(fileURLToPath(import.meta.url));
if (!process.argv[2] || !process.argv[3]) throw new Error('Pass CloudCLI and shared Agent SDK package directories (read-only).');
const root = path.resolve(process.argv[2]);
const sdkEntry = path.resolve(process.argv[3], 'sdk.mjs');
const manifest = JSON.parse(fs.readFileSync(path.join(tool, 'cloudcli-reviewed.json'), 'utf8'));
for (const [name, digest] of Object.entries(manifest)) {
  const input = fs.readFileSync(path.join(root, 'dist-server', 'server', name));
  if (createHash('sha256').update(input).digest('hex') !== digest) throw new Error(`${name}: digest mismatch`);
  const output = transformCloudSource(name, input.toString('utf8'), pathToFileURL(path.join(tool, 'cloudcli-policy.mjs')).href);
  const check = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: output, encoding: 'utf8', timeout: 10000 });
  if (check.status !== 0) throw new Error(`${name}: ${check.stderr}`);
  if (name.endsWith('provider.registry.js') && /new CodexProvider|new CursorProvider|new OpenCodeProvider/u.test(output)) throw new Error('Non-Claude provider was retained');
  if (name.endsWith('shell-websocket.service.js') && output.includes('--dangerously-skip-permissions')) throw new Error('Terminal bypass was retained');
}
// Verify that Node really invokes our loader (including Windows path casing). A second hook
// inspects its result and replaces ALL upstream code before evaluation, including the shebang entry.
const entry = path.join(root, 'dist-server', 'server', process.platform === 'win32' ? 'INDEX.JS' : 'index.js');
const probe = `import {registerHooks} from 'node:module';
registerHooks({load(url,context,next){const result=next(url,context);
  if(url.toLowerCase().endsWith('/index.js')){
    if(!String(result.source).includes('app.use(strata.httpGuard)'))throw Error('Adapter not applied');
    return {format:'module',source:"import {verified} from '@anthropic-ai/claude-agent-sdk'; export {verified};",shortCircuit:true};
  }
  if(url.toLowerCase()===${JSON.stringify(pathToFileURL(sdkEntry).href.toLowerCase())})return {format:'module',source:'export const verified=true;',shortCircuit:true};
  return result;
}});
const stub=await import(${JSON.stringify(pathToFileURL(entry).href)});
if(!stub.verified)throw Error('Stub was not used');`;
const check = spawnSync(process.execPath, ['--import', pathToFileURL(path.join(tool, 'cloudcli-loader.mjs')).href, '--input-type=module', '-e', probe], {
  input: 'strata-job-ready\n', encoding: 'utf8', timeout: 10000,
  env: { ...process.env, STRATA_CLOUD_PACKAGE: root, STRATA_AGENT_SDK_ENTRY: sdkEntry, STRATA_AGENT_SDK_SHA256: createHash('sha256').update(fs.readFileSync(sdkEntry)).digest('hex'), STRATA_CLOUD_DATA_ROOT: path.join(root, 'unused-data'), STRATA_CLAUDE_SETTINGS: path.join(root, 'unused-settings.json') }
});
if (check.status !== 0) throw new Error(check.stderr || 'Loader probe failed');
console.log(`${Object.keys(manifest).length} source digests, adapter shapes and generated syntax passed; Node loader probe passed. Upstream modules were replaced before evaluation; no services/CLI/model started.`);
