import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  findComfyRoot,
  installationFromDirectory,
  readComfySourceVersion
} from "../electron/services/comfy-discovery";
import { createDefaultState } from "../src/core/defaults";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true })
    )
  );
});

async function temporaryRoot(prefix: string): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

describe("ComfyUI installation discovery", () => {
  it("prefers the explicitly selected ComfyUI root while offline", async () => {
    const root = await temporaryRoot("aivideo-comfy-root-");
    await fs.writeFile(path.join(root, "main.py"), "", "utf8");
    await fs.writeFile(
      path.join(root, "comfyui_version.py"),
      '__version__ = "0.31.2"',
      "utf8"
    );
    const settings = {
      ...createDefaultState().settings,
      comfyInstallDirectory: root,
      modelDirectory: "",
      outputDirectory: ""
    };

    expect(await findComfyRoot(settings)).toBe(path.resolve(root));
    expect(await readComfySourceVersion(root)).toBe("0.31.2");
    await expect(installationFromDirectory(root)).resolves.toMatchObject({
      type: "manual",
      directory: path.resolve(root),
      sourceDirectory: path.resolve(root)
    });
  });

  it("recognizes a Windows portable layout separately from manual source", async () => {
    const portableRoot = await temporaryRoot("aivideo-comfy-portable-");
    const sourceDirectory = path.join(portableRoot, "ComfyUI");
    const python = path.join(portableRoot, "python_embeded", "python.exe");
    await fs.mkdir(sourceDirectory, { recursive: true });
    await fs.mkdir(path.dirname(python), { recursive: true });
    await Promise.all([
      fs.writeFile(path.join(sourceDirectory, "main.py"), "", "utf8"),
      fs.writeFile(python, "", "utf8")
    ]);

    await expect(installationFromDirectory(portableRoot)).resolves.toEqual({
      type: "portable",
      directory: sourceDirectory,
      sourceDirectory,
      executable: python
    });
  });
});
