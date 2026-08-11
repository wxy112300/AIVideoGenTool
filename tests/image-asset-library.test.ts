import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDefaultState } from "../src/core/defaults.js";
import {
  cleanupImageAssetLibrary,
  isPathInsideImageLibrary,
  organizeImageAssetLibrary,
  scanImageAssetLibrary
} from "../electron/services/image-asset-library.js";

const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "image-assets-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("image asset library", () => {
  it("archives references by content hash and rewrites duplicate references", async () => {
    const root = await temporaryRoot();
    const source = path.join(root, "external", "source.png");
    const library = path.join(root, "input", "LocalVideoStudio");
    await fs.mkdir(path.dirname(source), { recursive: true });
    await fs.writeFile(source, Buffer.from("same-image"));
    const state = createDefaultState();
    state.imageDraft.pictures = [1, 2].map((pictureNumber) => ({
      id: `picture-${pictureNumber}`,
      pictureNumber,
      absolutePath: source,
      width: 100,
      height: 100
    }));

    const prepared = await organizeImageAssetLibrary(state, library);
    const [first, second] = prepared.state.imageDraft.pictures;
    expect(prepared.result.archivedFiles).toBe(1);
    expect(prepared.result.updatedReferences).toBe(2);
    expect(first?.absolutePath).toBe(second?.absolutePath);
    expect(first?.originalPath).toBe(source);
    expect(first?.contentHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(first?.managedRelativePath).toMatch(/^sources\/[a-f0-9]{64}\.png$/u);
    await expect(fs.readFile(first!.absolutePath, "utf8")).resolves.toBe("same-image");
    await expect(fs.readFile(source, "utf8")).resolves.toBe("same-image");
  });

  it("flattens legacy hash-prefix folders and removes them after confirmed cleanup", async () => {
    const root = await temporaryRoot();
    const library = path.join(root, "input", "LocalVideoStudio");
    const contents = Buffer.from("legacy-image");
    const hash = createHash("sha256").update(contents).digest("hex");
    const legacy = path.join(library, "sources", hash.slice(0, 2), `${hash}.png`);
    await fs.mkdir(path.dirname(legacy), { recursive: true });
    await fs.writeFile(legacy, contents);
    const state = createDefaultState();
    state.imageDraft.pictures = [{
      id: "legacy-picture",
      pictureNumber: 1,
      absolutePath: legacy,
      width: 100,
      height: 100
    }];

    const before = await scanImageAssetLibrary(state, library);
    expect(before.archiveCandidates).toBe(1);
    const prepared = await organizeImageAssetLibrary(state, library);
    const flattened = path.join(library, "sources", `${hash}.png`);
    expect(prepared.result.reorganizedFiles).toBe(1);
    expect(prepared.state.imageDraft.pictures[0]?.absolutePath).toBe(flattened);
    await expect(fs.readFile(flattened)).resolves.toEqual(contents);
    await expect(fs.readFile(legacy)).resolves.toEqual(contents);

    const cleanup = await cleanupImageAssetLibrary(prepared.state, library, [legacy]);
    expect(cleanup.cleanedFiles).toBe(1);
    expect(cleanup.cleanedDirectories).toBe(1);
    await expect(fs.stat(path.dirname(legacy))).rejects.toThrow();
  });

  it("only deletes revalidated orphan files inside the managed library", async () => {
    const root = await temporaryRoot();
    const library = path.join(root, "input", "LocalVideoStudio");
    const orphan = path.join(library, "sources", "aa", "orphan.png");
    const outside = path.join(root, "outside.png");
    await fs.mkdir(path.dirname(orphan), { recursive: true });
    await fs.writeFile(orphan, "orphan");
    await fs.writeFile(outside, "outside");
    const state = createDefaultState();

    const scan = await scanImageAssetLibrary(state, library);
    expect(scan.orphanFiles.map((file) => file.absolutePath)).toContain(orphan);
    const result = await cleanupImageAssetLibrary(state, library, [orphan, outside]);
    expect(result.cleanedFiles).toBe(1);
    await expect(fs.stat(orphan)).rejects.toThrow();
    await expect(fs.readFile(outside, "utf8")).resolves.toBe("outside");
    expect(isPathInsideImageLibrary(library, outside)).toBe(false);
  });
});
