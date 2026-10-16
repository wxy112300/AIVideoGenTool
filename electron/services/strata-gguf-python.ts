import { promises as fs } from "node:fs";
import path from "node:path";
import { STRATA_LLAMA_REVISION } from "../../src/core/catalog/dependencies/strata.js";

/** Software installation only. Sparse checkout of the parser used by upstream MTP;
 * no llama build, models, setup.py, pip, or network during prompt preparation. */
export async function installStrataGgufPython(root: string,
  run: (executable: string, args: string[], cwd: string, timeoutMs?: number) => Promise<string>,
  log: (message: string) => void): Promise<void> {
  const directory = path.join(root, "third_party", "llama.cpp");
  if (await fs.lstat(directory).catch(() => null)) throw new Error("MTP 解析器目标已存在，拒绝覆盖。");
  await fs.mkdir(directory, { recursive: true });
  log("安装官方固定版本 MTP GGUF 解析源码（仅 gguf-py，不下载模型）");
  await run("git.exe", ["init", directory], directory);
  await run("git.exe", ["remote", "add", "origin", "https://github.com/ggml-org/llama.cpp.git"], directory);
  await run("git.exe", ["config", "core.longpaths", "true"], directory);
  await run("git.exe", ["sparse-checkout", "init", "--cone"], directory);
  await run("git.exe", ["sparse-checkout", "set", "gguf-py"], directory);
  await run("git.exe", ["fetch", "--depth=1", "--filter=blob:none", "origin", STRATA_LLAMA_REVISION], directory);
  await run("git.exe", ["checkout", "--detach", "FETCH_HEAD"], directory);
  if ((await run("git.exe", ["rev-parse", "HEAD"], directory)).trim() !== STRATA_LLAMA_REVISION)
    throw new Error("MTP GGUF 解析器源码提交校验失败。");
  if (!(await fs.stat(path.join(directory, "gguf-py", "gguf", "__init__.py")).catch(() => null))?.isFile())
    throw new Error("MTP GGUF 解析器文件缺失。");
}
