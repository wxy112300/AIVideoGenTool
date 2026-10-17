import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as nodeModule from 'node:module';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../..');
const output = path.join(directory, '.runtime');
const stamp = path.join(output, 'source-fingerprint.json');
const entry = path.join(output, 'electron/services/strata-agent-controller.js');
const digest = createHash('sha256');
const compiler = path.join(root, 'node_modules/typescript/bin/tsc');
const useCompiler = !process.argv.includes('--native-transpile') && Boolean(await fs.stat(compiler).catch(() => null));
digest.update(useCompiler ? 'tsc' : `node-transform:${process.versions.node}`);
const sources = [];
for (const subtree of ['electron', 'src/core', 'src/infrastructure']) {
  for (const name of (await fs.readdir(path.join(root, subtree), { recursive: true })).sort()) {
    if (!name.endsWith('.ts')) continue;
    const filename = path.join(root, subtree, name);
    sources.push({ filename, relative: path.join(subtree, name) });
    const stat = await fs.stat(filename);
    digest.update(`${subtree}/${name}:${stat.size}:${stat.mtimeMs}\n`);
  }
}
for (const name of ['src/types.ts', 'tsconfig.electron.json', 'Tools/Strata-Agent/tsconfig.json', 'package-lock.json']) {
  digest.update(await fs.readFile(path.join(root, name)));
}
const fingerprint = digest.digest('hex');
let previous;
try { previous = JSON.parse(await fs.readFile(stamp, 'utf8')); } catch {}
if (previous?.fingerprint === fingerprint && await fs.stat(entry).catch(() => null)) {
  console.log('工具运行文件已准备，复用本机编译产物。');
} else {
  console.log('首次/源码更新后准备独立 controller；不启动或构建 Electron。');
  if (useCompiler) {
    const child = spawn(process.execPath, [compiler, '-p', path.join(directory, 'tsconfig.json')], { windowsHide: true, cwd: root, stdio: 'inherit' });
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
    if (code !== 0) process.exit(Number(code) || 1);
  } else {
    if (typeof nodeModule.stripTypeScriptTypes !== 'function') throw new Error('需要Node22.15+的内置TypeScript转换器，或已安装的仓库TypeScript编译器；不会自动下载Electron。');
    // Fresh standalone checkout: official Node syntax transform, no Electron/npm/dev-dependency install.
    // Repository typechecks remain the development gate; this is runtime preparation, not a typecheck claim.
    sources.push({ filename: path.join(root, 'src/types.ts'), relative: 'src/types.ts' });
    for (const source of sources) {
      if (source.relative.endsWith('.d.ts')) continue;
      const target = path.join(output, source.relative.replace(/\.ts$/u, '.js'));
      const code = nodeModule.stripTypeScriptTypes(await fs.readFile(source.filename, 'utf8'), { mode: 'transform', sourceUrl: source.filename });
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, code);
    }
    console.log('使用Node内置转换器；未安装或打开Electron。类型正确性由仓库typecheck验证。');
  }
  await fs.writeFile(path.join(output, 'package.json'), JSON.stringify({ type: 'module', private: true }));
  await fs.writeFile(stamp, JSON.stringify({ fingerprint }));
}
