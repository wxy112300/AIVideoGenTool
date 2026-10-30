import { createNativeTranslator } from "../ui-translator.js";
import type { Translate } from "../../src/core/i18n.js";
import { uiKeys } from "../../src/core/i18n-keys.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { STRATA_LLAMA_REVISION } from "../../src/core/catalog/dependencies/strata.js";
import { fetchStrataSource } from "./strata-source-fetch.js";

/** Software installation only. Sparse checkout of the parser used by upstream MTP;
 * no llama build, models, setup.py, pip, or network during prompt preparation. */
export async function installStrataGgufPython(root: string,
  run: (executable: string, args: string[], cwd: string, timeoutMs?: number) => Promise<string>,
  log: (message: string) => void, t: Translate = createNativeTranslator(undefined).t): Promise<void> {
  const directory = path.join(root, "third_party", "llama.cpp");
  if (await fs.lstat(directory).catch(() => null)) throw new Error(t(uiKeys.strataRuntime.parserTargetExists));
  await fs.mkdir(directory, { recursive: true });
  log(t(uiKeys.strataRuntime.parserInstalling));
  await run("git.exe", ["init", directory], directory);
  await run("git.exe", ["remote", "add", "origin", "https://github.com/ggml-org/llama.cpp.git"], directory);
  await run("git.exe", ["config", "core.longpaths", "true"], directory);
  // Sparse checkout can lazily fetch blobs as well as the explicit fetch below.
  await run("git.exe", ["config", "http.version", "HTTP/1.1"], directory);
  await run("git.exe", ["sparse-checkout", "init", "--cone"], directory);
  await run("git.exe", ["sparse-checkout", "set", "gguf-py"], directory);
  await fetchStrataSource(directory, ["--depth=1", "--filter=blob:none", "origin", STRATA_LLAMA_REVISION], run, log, t);
  await run("git.exe", ["checkout", "--detach", "FETCH_HEAD"], directory);
  if ((await run("git.exe", ["rev-parse", "HEAD"], directory)).trim() !== STRATA_LLAMA_REVISION)
    throw new Error(t(uiKeys.strataRuntime.parserRevisionMismatch));
  if (!(await fs.stat(path.join(directory, "gguf-py", "gguf", "__init__.py")).catch(() => null))?.isFile())
    throw new Error(t(uiKeys.strataRuntime.parserMissing));
}
