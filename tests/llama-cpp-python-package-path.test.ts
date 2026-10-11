import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { inspectLlamaCppPython } from "../electron/services/llama-cpp-python";

const exec = promisify(execFile);
const python = process.platform === "win32" ? "python" : "python3";
describe("actual Python package location probe", () => {
  it("discovers each selected environment's package even when its native import is broken", async () => {
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), "lvs-llama-location-"));
    try {
      for (const name of ["environment A", "environment B"]) {
        const site = path.join(folder, name), module = path.join(site, "llama_cpp"), metadata = path.join(site, "llama_cpp_python-0.3.46.dist-info");
        await fs.mkdir(module, { recursive: true }); await fs.mkdir(metadata);
        await fs.writeFile(path.join(module, "__init__.py"), "raise RuntimeError('Fixture DLL missing')\n");
        await fs.writeFile(path.join(metadata, "METADATA"), "Metadata-Version: 2.1\nName: llama-cpp-python\nVersion: 0.3.46\n");
        await fs.writeFile(path.join(metadata, "RECORD"), "llama_cpp/__init__.py,,\n");
        const status = await inspectLlamaCppPython(python, async (executable, args) => {
          const code = `import sys\nsys.path.insert(0, ${JSON.stringify(site)})\n${args[1]}`;
          return (await exec(executable, ["-I", "-S", "-c", code], { windowsHide: true, timeout: 10000 })).stdout;
        });
        expect(status).toMatchObject({ installed: true, importable: false, ready: false, packageDirectory: await fs.realpath(module), error: "Fixture DLL missing" });
        await fs.unlink(path.join(module, "__init__.py"));
        const missing = await inspectLlamaCppPython(python, async (executable, args) => (await exec(executable, ["-I", "-S", "-c", `import sys\nsys.path.insert(0, ${JSON.stringify(site)})\n${args[1]}`], { windowsHide: true, timeout: 10000 })).stdout);
        expect(missing.packageDirectory).toBeUndefined();
      }
    } finally { await fs.rm(folder, { recursive: true, force: true }); }
  });
});
