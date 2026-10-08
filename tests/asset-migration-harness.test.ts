import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { copyAssetFixture } from "../scripts/harness/copy-asset-fixture.mjs";

const temp = path.resolve("temp");
const created: string[] = [];
afterEach(async () => {
  for (const directory of created.splice(0)) {
    if (path.dirname(path.resolve(directory)) !== temp || !path.basename(directory).startsWith("asset-fixture-test-")) throw new Error("Unsafe fixture cleanup");
    await fs.rm(directory, { recursive: true, force: true });
  }
});

async function fixture() {
  await fs.mkdir(temp, { recursive: true });
  const root = await fs.mkdtemp(path.join(temp, "asset-fixture-test-"));
  created.push(root);
  const from = path.join(root, "from"), to = path.join(root, "to");
  await fs.mkdir(from);
  const media = path.join(from, "movie.mp4"), av = path.join(from, "data.safetensors");
  await fs.writeFile(media, "test movie");
  await fs.writeFile(av, "test AV");
  const asset = { storageKind: "app-canonical", ownerPath: { absolutePath: av }, aliasPaths: [{ absolutePath: av }] };
  const source = {
    queueRunning: false, queue: [],
    history: [{ id: "asset", versions: [{ id: "version", files: [{ absolutePath: media }], h3AvAsset: asset, h3ContinuationData: { asset } }] }],
    draft: { sourceVideoPath: media, sourceAssetId: "asset", sourceVersionId: "version" }
  };
  return { from, to, media, av, source };
}

describe("physical isolation for asset migration smoke", () => {
  it("copies shared AV once, rewrites both owners and the draft, and keeps source files and IDs", async () => {
    const f = await fixture();
    const original = structuredClone(f.source);
    const target: any = {};
    const files = await copyAssetFixture(target, f.source, f.from, f.to, process.cwd());
    expect(files).toHaveLength(2);
    expect(target.history[0].id).toBe("asset");
    expect(target.history[0].versions[0].id).toBe("version");
    expect(target.history[0].versions[0].h3AvAsset.ownerPath.absolutePath).toBe(path.join(f.to, "data.safetensors"));
    expect(target.history[0].versions[0].h3ContinuationData.asset.aliasPaths).toEqual([{ absolutePath: path.join(f.to, "data.safetensors") }]);
    expect(target.draft.sourceVideoPath).toBe(path.join(f.to, "movie.mp4"));
    expect(await fs.readFile(target.draft.sourceVideoPath, "utf8")).toBe("test movie");
    expect(await fs.readFile(f.media, "utf8")).toBe("test movie");
    expect(f.source).toEqual(original);
  });

  it("refuses external draft references before copying or changing the target", async () => {
    const f = await fixture();
    f.source.draft.sourceVideoPath = path.join(f.from, "..", "user-video.mp4");
    const target = {};
    await expect(copyAssetFixture(target, f.source, f.from, f.to, process.cwd())).rejects.toThrow("external sourceVideoPath");
    expect(target).toEqual({});
    await expect(fs.stat(f.to)).rejects.toThrow();
  });

  it("refuses running queues and managed run owners", async () => {
    const f = await fixture();
    f.source.queueRunning = true;
    await expect(copyAssetFixture({}, f.source, f.from, f.to, process.cwd())).rejects.toThrow("stopped");
    f.source.queueRunning = false;
    f.source.history[0].versions[0].h3AvAsset.storageKind = "continuum-run-chunk";
    await expect(copyAssetFixture({}, f.source, f.from, f.to, process.cwd())).rejects.toThrow("canonical-AV");
  });
});
