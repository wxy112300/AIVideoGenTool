import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createPythonProbeFingerprintReader,
  resolveProbeIdentity,
  type ProbeIdentity
} from "../electron/services/python-probe-fingerprint";

const temporaryDirectories: string[] = [];

async function fixture(): Promise<{
  root: string;
  identity: ProbeIdentity;
  pthFile: string;
}> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "local-video-studio-probe-"));
  temporaryDirectories.push(root);
  const pythonPath = path.join(root, "python.exe");
  const sitePackages = path.join(root, "Lib", "site-packages");
  const packageDirectory = path.join(sitePackages, "torch");
  const pthFile = path.join(sitePackages, "comfy-local.pth");
  await fs.mkdir(packageDirectory, { recursive: true });
  await fs.writeFile(pythonPath, "python", "utf8");
  await fs.writeFile(path.join(packageDirectory, "__init__.py"), "torch", "utf8");
  await fs.writeFile(pthFile, "C:/comfy/custom_nodes\n", "utf8");
  await fs.writeFile(path.join(root, "pyvenv.cfg"), "home = C:/Python", "utf8");
  return {
    root,
    pthFile,
    identity: {
      pythonPath,
      coreDirectory: root,
      dataDirectory: root
    }
  };
}

afterEach(async () => {
  while (temporaryDirectories.length) {
    const directory = temporaryDirectories.pop();
    if (directory) await fs.rm(directory, { recursive: true, force: true });
  }
});

describe("python probe fingerprint", () => {
  it("fingerprints the interpreter layout without importing torch", async () => {
    const testFixture = await fixture();
    const calls: string[][] = [];
    const reader = createPythonProbeFingerprintReader({
      runner: async (_python, args) => {
        calls.push([...args]);
        return {
          stdout: `${JSON.stringify({
            pythonPath: testFixture.identity.pythonPath,
            prefix: testFixture.root,
            basePrefix: testFixture.root,
            searchPaths: [path.join(testFixture.root, "Lib", "site-packages")],
            pthFiles: [testFixture.pthFile],
            distributions: [],
            environment: { PYTHONHOME: "", PYTHONPATH: "", PATH: "fixture" }
          })}`.replace(/^/u, "__LOCAL_VIDEO_STUDIO_PYTHON_LAYOUT__")
        };
      }
    });

    const first = await reader.read(testFixture.identity);
    expect(first.cacheable).toBe(true);
    expect(first.manifest?.pthFiles).toContain(path.resolve(testFixture.pthFile).toLowerCase());
    expect(first.manifest?.runtimePaths.length).toBeGreaterThan(0);
    expect(calls[0]?.[1]).not.toContain("import torch");

    await fs.writeFile(testFixture.pthFile, "C:/comfy/custom_nodes\nC:/new\n", "utf8");
    const changed = await reader.read(testFixture.identity, first.manifest);
    expect(changed.cacheable).toBe(true);
    expect(changed.signature).not.toBe(first.signature);
  });

  it("rejects an oversized .pth file instead of caching an incomplete fingerprint", async () => {
    const testFixture = await fixture();
    await fs.writeFile(testFixture.pthFile, "x".repeat(300 * 1024), "utf8");
    const reader = createPythonProbeFingerprintReader({
      runner: async () => ({
        stdout: `__LOCAL_VIDEO_STUDIO_PYTHON_LAYOUT__${JSON.stringify({
          pythonPath: testFixture.identity.pythonPath,
          prefix: testFixture.root,
          basePrefix: testFixture.root,
          searchPaths: [path.join(testFixture.root, "Lib", "site-packages")],
          pthFiles: [testFixture.pthFile],
          distributions: [],
          environment: {}
        })}`
      })
    });
    const result = await reader.read(testFixture.identity);
    expect(result.cacheable).toBe(false);
    expect(result.reason).toBe("fingerprint-budget");
  });

  it("requires stable real paths before a cache identity is accepted", async () => {
    const testFixture = await fixture();
    await expect(resolveProbeIdentity(testFixture.identity)).resolves.toEqual({
      pythonPath: path.resolve(testFixture.identity.pythonPath).toLowerCase(),
      coreDirectory: path.resolve(testFixture.identity.coreDirectory).toLowerCase(),
      dataDirectory: path.resolve(testFixture.identity.dataDirectory).toLowerCase()
    });
    await expect(resolveProbeIdentity({
      ...testFixture.identity,
      pythonPath: path.join(testFixture.root, "missing-python.exe")
    })).resolves.toBeNull();
  });
});
