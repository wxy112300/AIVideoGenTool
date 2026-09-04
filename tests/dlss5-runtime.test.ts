import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDefaultState } from "../src/core/defaults.js";
import {
  DLSS5_NODE_REVISION,
  DLSS5_RUNTIME_BUNDLE_ID,
  type Dlss5RuntimeArtifact
} from "../src/core/catalog/index.js";
import {
  installDlss5Runtime,
  parseSevenZipArchiveEntries,
  scanDlss5Runtime,
  uninstallDlss5Runtime,
  validateDlss5ArchiveEntries,
  validateDlss5ArtifactContents,
  type Dlss5RuntimeInstallerDependencies
} from "../electron/services/dlss5-runtime.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true })
    )
  );
});

const settings = {
  ...createDefaultState().settings,
  comfyUrl: "http://127.0.0.1:8188"
};

async function fixtureContext(): Promise<{
  root: string;
  nodeDirectory: string;
  artifact: Dlss5RuntimeArtifact;
  payload: Buffer;
}> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "aivideo-dlss5-runtime-"));
  temporaryDirectories.push(root);
  const nodeDirectory = path.join(root, "custom_nodes", "ComfyUI-DLSS5");
  await fs.mkdir(nodeDirectory, { recursive: true });
  const payload = Buffer.from("local fixture vapourkit archive\n", "utf8");
  const artifact: Dlss5RuntimeArtifact = {
    id: "vapourkit",
    capability: "sr-required",
    repository: "https://fixture.invalid/vapourkit",
    releaseTag: "fixture-release",
    assetName: "Vapourkit-fixture.7z",
    url: "https://fixture.invalid/Vapourkit-fixture.7z",
    sha256: crypto.createHash("sha256").update(payload).digest("hex"),
    bytes: payload.byteLength,
    archive: "7z",
    expectedFiles: ["python.exe", "vsdlsssr.dll", "nvngx_dlss.dll"]
  };
  return { root, nodeDirectory, artifact, payload };
}

function fixtureDependencies(
  context: Awaited<ReturnType<typeof fixtureContext>>,
  overrides: Partial<Dlss5RuntimeInstallerDependencies> = {}
): Dlss5RuntimeInstallerDependencies {
  return {
    platform: "win32",
    artifacts: [context.artifact],
    findComfyPython: async () => "C:\\ComfyUI\\python_embeded\\python.exe",
    findExecutable: async () => "fixture-curl.exe",
    downloadEnvironment: () => ({}),
    runLoggedProcess: async () => {
      throw new Error("fixture should use injected archive hooks");
    },
    renameWithRetry: (source, target) => fs.rename(source, target),
    retryableRenameError: () => true,
    downloadFile: async (_url, destination) => {
      await fs.writeFile(destination, context.payload);
    },
    extractArchive: async (_archive, destination) => {
      await fs.mkdir(destination, { recursive: true });
      await Promise.all([
        fs.writeFile(path.join(destination, "python.exe"), "python"),
        fs.writeFile(path.join(destination, "vsdlsssr.dll"), "sr-plugin"),
        fs.writeFile(path.join(destination, "nvngx_dlss.dll"), "sr-runtime")
      ]);
      return ["python.exe", "vsdlsssr.dll", "nvngx_dlss.dll"];
    },
    ...overrides
  };
}

describe("DLSS5 runtime transaction", () => {
  it("parses native 7-Zip technical listings without the archive header", () => {
    expect(parseSevenZipArchiveEntries([
      "Listing archive: Vapourkit-fixture.7z",
      "Type = 7z",
      "----------",
      "Path = python.exe",
      "Size = 6",
      "Path = nested/vsdlsssr.dll",
      "Size = 9"
    ].join("\n"))).toEqual([
      "python.exe",
      "nested/vsdlsssr.dll"
    ]);
  });

  it("rejects the pinned desktop package before treating it as a portable runtime", () => {
    expect(() => validateDlss5ArtifactContents([
      "resources",
      "resources/app.asar",
      "resources/app.asar.unpacked/node_modules/7zip-bin/win/x64/7za.exe",
      "Vapourkit.exe"
    ], ["python.exe", "vsdlsssr.dll", "nvngx_dlss.dll"]))
      .toThrow("VapourKit 桌面应用包");
  });

  it("fails fast when the catalog marks a runtime asset unavailable", async () => {
    const context = await fixtureContext();
    let downloaded = false;
    const result = await installDlss5Runtime(
      settings,
      context.root,
      context.nodeDirectory,
      fixtureDependencies(context, {
        artifacts: [{
          ...context.artifact,
          unavailableReason: "fixture asset is incomplete"
        }],
        downloadFile: async () => {
          downloaded = true;
        }
      })
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain("fixture asset is incomplete");
    expect(downloaded).toBe(false);
  });

  it("assembles the pinned five-artifact NR runtime and records every source", async () => {
    const context = await fixtureContext();
    const definitions = [
      ["python", "python.zip", ["python.exe", "python313._pth"]],
      ["vapoursynth", "vapoursynth.zip", ["vapoursynth-79-cp312-abi3-win_amd64.whl"]],
      ["numpy", "numpy.whl", ["_multiarray_umath.cp313-win_amd64.pyd"]],
      ["vapourkit", "vsdlssnr.7z", ["vsdlssnr.dll"]],
      ["dlss-nr", "nvngx_dlssnr.zip", ["nvngx_dlssnr.dll"]]
    ] as const;
    const payloads = new Map<string, Buffer>();
    const artifacts = definitions.map(([id, assetName, expectedFiles]) => {
      const payload = Buffer.from(`fixture-${id}\n`, "utf8");
      payloads.set(`https://fixture.invalid/${assetName}`, payload);
      return {
        id,
        capability: id === "python" || id === "vapoursynth" || id === "numpy"
          ? "shared-required"
          : "nr-required",
        repository: `https://fixture.invalid/${id}`,
        releaseTag: `fixture-${id}`,
        assetName,
        url: `https://fixture.invalid/${assetName}`,
        sha256: crypto.createHash("sha256").update(payload).digest("hex"),
        bytes: payload.byteLength,
        archive: assetName.endsWith(".7z") ? "7z" : "zip",
        expectedFiles
      } satisfies Dlss5RuntimeArtifact;
    });
    let selfCheckArgs: string[] = [];
    const result = await installDlss5Runtime(
      settings,
      context.root,
      context.nodeDirectory,
      fixtureDependencies(context, {
        artifacts,
        downloadFile: async (url, destination) => {
          const payload = payloads.get(url);
          if (!payload) throw new Error(`unexpected fixture URL: ${url}`);
          await fs.writeFile(destination, payload);
        },
        extractArchive: async (archive, destination) => {
          await fs.mkdir(destination, { recursive: true });
          const basename = path.basename(archive);
          if (basename === "vapoursynth-79-cp312-abi3-win_amd64.whl") {
            const pluginDirectory = path.join(destination, "vapoursynth");
            await fs.mkdir(pluginDirectory, { recursive: true });
            await fs.writeFile(path.join(pluginDirectory, "vapoursynth.pyd"), "vapoursynth");
            return ["vapoursynth/vapoursynth.pyd"];
          }
          if (basename.includes("python-python.zip")) {
            await fs.writeFile(path.join(destination, "python.exe"), "python");
            await fs.writeFile(path.join(destination, "python313._pth"), "python313.zip\n.\n#import site\n");
            return ["python.exe", "python313._pth"];
          }
          if (basename.includes("vapoursynth-vapoursynth.zip")) {
            const wheelDirectory = path.join(destination, "wheel");
            await fs.mkdir(wheelDirectory, { recursive: true });
            await fs.writeFile(
              path.join(wheelDirectory, "vapoursynth-79-cp312-abi3-win_amd64.whl"),
              "wheel"
            );
            return ["wheel/vapoursynth-79-cp312-abi3-win_amd64.whl"];
          }
          if (basename.includes("numpy-numpy.whl")) {
            const coreDirectory = path.join(destination, "numpy", "_core");
            await fs.mkdir(coreDirectory, { recursive: true });
            await fs.writeFile(
              path.join(coreDirectory, "_multiarray_umath.cp313-win_amd64.pyd"),
              "numpy"
            );
            return ["numpy/_core/_multiarray_umath.cp313-win_amd64.pyd"];
          }
          if (basename.includes("vapourkit-vsdlssnr.7z")) {
            await fs.writeFile(path.join(destination, "vsdlssnr.dll"), "nr-plugin");
            return ["vsdlssnr.dll"];
          }
          if (basename.includes("dlss-nr-nvngx_dlssnr.zip")) {
            await fs.writeFile(path.join(destination, "nvngx_dlssnr.dll"), "nr-runtime");
            return ["nvngx_dlssnr.dll"];
          }
          throw new Error(`unexpected fixture archive: ${archive}`);
        },
        runLoggedProcess: async (_executable, args) => {
          selfCheckArgs = args;
          return "DLSS5_NR_SELF_CHECK_OK";
        }
      })
    );

    expect(result.ok, result.message).toBe(true);
    expect(result.status).toMatchObject({
      state: "ready",
      source: "app-managed",
      nrReady: true,
      srReady: false
    });
    expect(selfCheckArgs.join(" ")).toContain("DLSS5_NR_SELF_CHECK_OK");
    const runtimeDirectory = path.join(context.nodeDirectory, "runtime");
    const config = JSON.parse(await fs.readFile(
      path.join(runtimeDirectory, "config.json"),
      "utf8"
    )) as Record<string, string>;
    expect(config.nr_plugin).toContain("vsdlssnr.dll");
    expect(config.nr_runtime).toContain("nvngx_dlssnr.dll");
    expect(config.sr_plugin).toBeUndefined();
    expect(await fs.readFile(
      path.join(runtimeDirectory, "python", "python313._pth"),
      "utf8"
    )).toContain("Lib\\site-packages");
    const manifest = JSON.parse(await fs.readFile(
      path.join(runtimeDirectory, "install-manifest.json"),
      "utf8"
    )) as { artifacts: unknown[] };
    expect(manifest.artifacts).toHaveLength(5);
    const manualFile = path.join(runtimeDirectory, "manual-extra.dll");
    await fs.writeFile(manualFile, "manual", "utf8");

    const uninstall = await uninstallDlss5Runtime(
      settings,
      context.root,
      context.nodeDirectory
    );
    expect(uninstall.ok, uninstall.message).toBe(true);
    expect(await fs.readFile(manualFile, "utf8")).toBe("manual");
    expect(await fs.stat(path.join(runtimeDirectory, "python"))
      .catch(() => null)).toBeNull();
    expect(await fs.stat(path.join(runtimeDirectory, "Lib"))
      .catch(() => null)).toBeNull();
    expect(await fs.stat(path.join(runtimeDirectory, "plugins"))
      .catch(() => null)).toBeNull();
    expect(await fs.stat(path.join(runtimeDirectory, "install-manifest.json"))
      .catch(() => null)).toBeNull();
  });

  it("installs the pinned SR bundle with the selected ComfyUI Python", async () => {
    const context = await fixtureContext();
    let selectedPython = "";
    const result = await installDlss5Runtime(
      settings,
      context.root,
      context.nodeDirectory,
      fixtureDependencies(context, {
        findComfyPython: async () => {
          selectedPython = "fixture-comfy-python.exe";
          return selectedPython;
        }
      })
    );

    expect(result.ok).toBe(true);
    expect(result.status).toMatchObject({
      state: "ready",
      bundleId: DLSS5_RUNTIME_BUNDLE_ID,
      nodeRevision: DLSS5_NODE_REVISION,
      srReady: true,
      nrReady: false,
      runtimeValidated: false,
      source: "app-managed"
    });
    expect(selectedPython).toBe("fixture-comfy-python.exe");
    const config = JSON.parse(await fs.readFile(
      path.join(context.nodeDirectory, "runtime", "config.json"),
      "utf8"
    )) as Record<string, string>;
    expect(config.python).toContain(`${path.sep}runtime${path.sep}`);
    expect(config.sr_plugin).toContain("vsdlsssr.dll");
    expect(config.sr_runtime).toContain("nvngx_dlss.dll");
    expect(config.nr_plugin).toBeUndefined();
    expect(await fs.stat(
      path.join(context.nodeDirectory, "runtime", "install-manifest.json")
    )).toBeTruthy();
  });

  it("accepts VapourKit's app.asar member as a regular runtime file", async () => {
    const context = await fixtureContext();
    const staleStaging = path.join(
      context.nodeDirectory,
      ".dlss5-runtime-staging-previous-failure",
      "runtime",
      "resources"
    );
    await fs.mkdir(staleStaging, { recursive: true });
    await fs.writeFile(path.join(staleStaging, "app.asar"), "invalid old asar", "utf8");
    const result = await installDlss5Runtime(
      settings,
      context.root,
      context.nodeDirectory,
      fixtureDependencies(context, {
        extractArchive: async (_archive, destination) => {
          await fs.mkdir(path.join(destination, "resources"), { recursive: true });
          await Promise.all([
            fs.writeFile(path.join(destination, "python.exe"), "python"),
            fs.writeFile(path.join(destination, "vsdlsssr.dll"), "sr-plugin"),
            fs.writeFile(path.join(destination, "nvngx_dlss.dll"), "sr-runtime"),
            fs.writeFile(path.join(destination, "resources", "app.asar"), "asar payload")
          ]);
          return [
            "python.exe",
            "vsdlsssr.dll",
            "nvngx_dlss.dll",
            "resources/app.asar"
          ];
        }
      })
    );

    expect(result.ok, result.message).toBe(true);
    expect(await fs.readFile(
      path.join(context.nodeDirectory, "runtime", "resources", "app.asar"),
      "utf8"
    )).toBe("asar payload");
    expect(await fs.stat(path.dirname(path.dirname(staleStaging)))
      .catch(() => null)).toBeNull();
  });

  it("uses HECer's py7zr path before falling back to native 7-Zip", async () => {
    const context = await fixtureContext();
    const processCalls: string[][] = [];
    const nativeExtractor = process.execPath;
    const result = await installDlss5Runtime(
      settings,
      context.root,
      context.nodeDirectory,
      fixtureDependencies(context, {
        findExecutable: async (command) => command === "7z.exe" ? nativeExtractor : "",
        extractArchive: undefined,
        runLoggedProcess: async (_executable, args) => {
          processCalls.push(args);
          if (args.includes("check")) {
            return JSON.stringify(["python.exe", "vsdlsssr.dll", "nvngx_dlss.dll"]);
          }
          if (args.includes("extract")) {
            const destination = args.at(-1)!;
            await fs.mkdir(destination, { recursive: true });
            await Promise.all([
              fs.writeFile(path.join(destination, "python.exe"), "python"),
              fs.writeFile(path.join(destination, "vsdlsssr.dll"), "sr-plugin"),
              fs.writeFile(path.join(destination, "nvngx_dlss.dll"), "sr-runtime")
            ]);
            return "";
          }
          const destinationArg = args.find((argument) => argument.startsWith("-o"));
          const destination = destinationArg?.slice(2);
          if (args[0] === "x" && destination) {
            await fs.mkdir(destination, { recursive: true });
            await Promise.all([
              fs.writeFile(path.join(destination, "python.exe"), "python"),
              fs.writeFile(path.join(destination, "vsdlsssr.dll"), "sr-plugin"),
              fs.writeFile(path.join(destination, "nvngx_dlss.dll"), "sr-runtime")
            ]);
            return "Everything is Ok";
          }
          throw new Error(`unexpected 7-Zip command: ${args.join(" ")}`);
        }
      })
    );

    expect(result.ok).toBe(true);
    expect(processCalls.map((args) => args.includes("check") ? "check" : "extract"))
      .toEqual(["check", "extract"]);
    expect(result.status?.srReady).toBe(true);
  });

  it("rejects hash mismatch and truncated downloads before promotion", async () => {
    const hashContext = await fixtureContext();
    const wrongBytes = Buffer.alloc(hashContext.payload.byteLength, 0x78);
    const hashResult = await installDlss5Runtime(
      settings,
      hashContext.root,
      hashContext.nodeDirectory,
      fixtureDependencies(hashContext, {
        downloadFile: async (_url, destination) => fs.writeFile(destination, wrongBytes)
      })
    );
    expect(hashResult.ok).toBe(false);
    expect(hashResult.message).toContain("SHA-256");
    expect(await fs.stat(path.join(hashContext.nodeDirectory, "runtime"))
      .catch(() => null)).toBeNull();

    const truncatedContext = await fixtureContext();
    const truncatedArtifact = {
      ...truncatedContext.artifact,
      bytes: truncatedContext.payload.byteLength + 1
    } satisfies Dlss5RuntimeArtifact;
    const truncatedResult = await installDlss5Runtime(
      settings,
      truncatedContext.root,
      truncatedContext.nodeDirectory,
      fixtureDependencies(truncatedContext, {
        artifacts: [truncatedArtifact]
      })
    );
    expect(truncatedResult.ok).toBe(false);
    expect(truncatedResult.message).toContain("截断");
    expect(await fs.stat(path.join(truncatedContext.nodeDirectory, "runtime"))
      .catch(() => null)).toBeNull();
  });

  it("rejects archive traversal and cancellation without touching the target", async () => {
    const traversalContext = await fixtureContext();
    const traversalResult = await installDlss5Runtime(
      settings,
      traversalContext.root,
      traversalContext.nodeDirectory,
      fixtureDependencies(traversalContext, {
        extractArchive: async () => ["../outside.txt"]
      })
    );
    expect(traversalResult.ok).toBe(false);
    expect(traversalResult.message).toContain("不安全路径");
    expect(await fs.stat(path.join(traversalContext.root, "outside.txt"))
      .catch(() => null)).toBeNull();
    expect(() => validateDlss5ArchiveEntries(["C:\\outside.dll"])).toThrow("不安全路径");

    const cancelledContext = await fixtureContext();
    const controller = new AbortController();
    controller.abort();
    const cancelledResult = await installDlss5Runtime(
      settings,
      cancelledContext.root,
      cancelledContext.nodeDirectory,
      fixtureDependencies(cancelledContext),
      undefined,
      controller.signal
    );
    expect(cancelledResult.ok).toBe(false);
    expect(cancelledResult.message).toContain("取消");
    expect(await fs.stat(path.join(cancelledContext.nodeDirectory, "runtime"))
      .catch(() => null)).toBeNull();
  });

  it("cancels after download before promoting the runtime", async () => {
    const context = await fixtureContext();
    const controller = new AbortController();
    const result = await installDlss5Runtime(
      settings,
      context.root,
      context.nodeDirectory,
      fixtureDependencies(context, {
        downloadFile: async (_url, destination) => {
          await fs.writeFile(destination, context.payload);
          controller.abort();
        }
      }),
      undefined,
      controller.signal
    );
    expect(result.ok).toBe(false);
    expect(result.message).toContain("取消");
    expect(await fs.stat(path.join(context.nodeDirectory, "runtime"))
      .catch(() => null)).toBeNull();
  });

  it("rolls back the prior runtime when Windows promotion is locked", async () => {
    const context = await fixtureContext();
    const runtimeDirectory = path.join(context.nodeDirectory, "runtime");
    await fs.mkdir(runtimeDirectory, { recursive: true });
    await fs.writeFile(path.join(runtimeDirectory, "previous-runtime.txt"), "keep-old", "utf8");
    const result = await installDlss5Runtime(
      settings,
      context.root,
      context.nodeDirectory,
      fixtureDependencies(context, {
        renameWithRetry: async (source, target) => {
          if (source.includes(".dlss5-runtime-staging-") && path.basename(source) === "runtime") {
            const error = Object.assign(new Error("file is locked"), { code: "EPERM" });
            throw error;
          }
          await fs.rename(source, target);
        }
      })
    );
    expect(result.ok).toBe(false);
    expect(result.message).toContain("原子替换失败");
    expect(await fs.readFile(path.join(runtimeDirectory, "previous-runtime.txt"), "utf8"))
      .toBe("keep-old");
  });

  it("uninstalls only manifest-owned files and preserves manual runtime files", async () => {
    const context = await fixtureContext();
    const install = await installDlss5Runtime(
      settings,
      context.root,
      context.nodeDirectory,
      fixtureDependencies(context)
    );
    expect(install.ok).toBe(true);
    const runtimeDirectory = path.join(context.nodeDirectory, "runtime");
    const manualFile = path.join(runtimeDirectory, "manual-extra.dll");
    await fs.writeFile(manualFile, "manual", "utf8");
    const before = await scanDlss5Runtime(context.root, context.nodeDirectory);
    expect(before.unexpectedFiles).toContain("manual-extra.dll");

    const uninstall = await uninstallDlss5Runtime(
      settings,
      context.root,
      context.nodeDirectory
    );
    expect(uninstall.ok).toBe(true);
    expect(await fs.stat(manualFile)).toBeTruthy();
    expect(await fs.stat(path.join(runtimeDirectory, "config.json"))
      .catch(() => null)).toBeNull();
    expect(await fs.stat(path.join(runtimeDirectory, "install-manifest.json"))
      .catch(() => null)).toBeNull();
  });

  it("keeps SR ready when optional NR configuration is invalid", async () => {
    const context = await fixtureContext();
    const install = await installDlss5Runtime(
      settings,
      context.root,
      context.nodeDirectory,
      fixtureDependencies(context)
    );
    expect(install.ok).toBe(true);
    const runtimeDirectory = path.join(context.nodeDirectory, "runtime");
    const configPath = path.join(runtimeDirectory, "config.json");
    const config = JSON.parse(await fs.readFile(configPath, "utf8")) as Record<string, string>;
    config.nr_plugin = path.join(context.root, "outside", "vsdlssnr.dll");
    config.nr_runtime = path.join(context.root, "outside", "nvngx_dlssnr.dll");
    await fs.writeFile(configPath, `${JSON.stringify(config)}\n`, "utf8");

    const status = await scanDlss5Runtime(context.root, context.nodeDirectory);
    expect(status.srReady).toBe(true);
    expect(status.nrReady).toBe(false);
    expect(status.configValid).toBe(true);
    expect(status.error).toContain("NR runtime");
  });

  it("keeps NR ready when the unavailable SR wrapper is not configured", async () => {
    const context = await fixtureContext();
    const runtimeDirectory = path.join(context.nodeDirectory, "runtime");
    const python = path.join(runtimeDirectory, "python.exe");
    const nrPlugin = path.join(runtimeDirectory, "vsdlssnr.dll");
    const nrRuntime = path.join(runtimeDirectory, "nvngx_dlssnr.dll");
    const tempDirectory = path.join(runtimeDirectory, "temp");
    await fs.mkdir(tempDirectory, { recursive: true });
    await Promise.all([
      fs.writeFile(python, "python"),
      fs.writeFile(nrPlugin, "nr-plugin"),
      fs.writeFile(nrRuntime, "nr-runtime"),
      fs.writeFile(path.join(runtimeDirectory, "config.json"), `${JSON.stringify({
        python,
        nr_plugin: nrPlugin,
        nr_runtime: nrRuntime,
        temp_dir: tempDirectory
      })}\n`, "utf8")
    ]);

    const status = await scanDlss5Runtime(context.root, context.nodeDirectory);
    expect(status).toMatchObject({
      state: "ready",
      configValid: true,
      srReady: false,
      nrReady: true
    });
    expect(status.missingFiles).toEqual(expect.arrayContaining([
      "vsdlsssr.dll",
      "nvngx_dlss.dll"
    ]));
  });

  it("refuses local-file mutations for remote ComfyUI", async () => {
    const context = await fixtureContext();
    const remoteSettings = { ...settings, comfyUrl: "https://comfy.example.test" };
    const install = await installDlss5Runtime(
      remoteSettings,
      context.root,
      context.nodeDirectory,
      fixtureDependencies(context)
    );
    expect(install.ok).toBe(false);
    expect(install.message).toContain("远程 ComfyUI");
    const uninstall = await uninstallDlss5Runtime(
      remoteSettings,
      context.root,
      context.nodeDirectory
    );
    expect(uninstall.ok).toBe(false);
    expect(uninstall.message).toContain("远程 ComfyUI");
  });
});
