import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { createDefaultState } from "../src/core/defaults.js";
import { createClearedDraft } from "../src/core/draft-defaults.js";
import { upscaleTaskFromRequest } from "../src/core/queue-task-factory.js";
import { copyVersionFixture } from "../scripts/harness/copy-version-fixture.mjs";

const roots: string[] = [];
const temp = path.resolve("temp");
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (path.dirname(path.resolve(root)) !== temp || !path.basename(root).startsWith("version-fixture-test-")) throw new Error("Unsafe test cleanup");
    await fs.rm(root, { recursive: true, force: true });
  }
});

async function makeSource() {
  await fs.mkdir(temp, { recursive: true });
  const root = await fs.mkdtemp(path.join(temp, "version-fixture-test-"));
  roots.push(root);
  const from = path.join(root, "source"), to = path.join(root, "copy");
  await fs.mkdir(from);
  const media = path.join(from, "original.mp4"), payload = path.join(from, "latent.safetensors");
  await fs.writeFile(media, "unchanged original video");
  await fs.writeFile(payload, "original AV");
  const source = createDefaultState();
  source.draft.sourceVideoPath = media;
  source.videoExtensionDraft = structuredClone(source.draft);
  source.history = [{ id: "asset", taskId: "source-task", files: [], versions: [{
    id: "original-version", kind: "original", width: 864, height: 480, fps: 24, duration: 1.625,
    outputFilename: "original.mp4", files: [{ filename: "original.mp4", subfolder: "", type: "output", absolutePath: media }],
    h3AvAsset: { storageKind: "app-canonical", ownerPath: { absolutePath: payload } }
  }] }] as typeof source.history;
  return { from, to, media, source };
}

describe("multi-version deletion fixture", () => {
  it("copies a distinct target and freezes a stopped waiting task that references that exact version", async () => {
    const f = await makeSource(), state = createDefaultState();
    const meta = await copyVersionFixture(state, f.source, f.from, f.to, process.cwd(), false, { createClearedDraft, upscaleTaskFromRequest });
    expect(state.queueRunning).toBe(false);
    expect(state.queue).toHaveLength(1);
    expect(state.queue[0]).toMatchObject({ status: "waiting", taskType: "upscale", sourceAssetId: meta.assetId, sourceVersionId: meta.targetVersionId, sourceFilePath: meta.targetPath });
    expect(meta.targetPath).not.toBe(meta.originalPath);
    expect(state.history[0]!.defaultVersionId).toBe(meta.targetVersionId);
    expect(state.history[0]!.versions[1]!.h3AvAsset).toBeUndefined();
    expect(state.draft.sourceVideoPath).toBe("");
    expect(state.videoExtensionDraft!.sourceVideoPath).toBe("");
    expect(await fs.readFile(meta.targetPath, "utf8")).toBe("unchanged original video");
    expect(await fs.readFile(f.media, "utf8")).toBe("unchanged original video");
    expect(f.source.history[0]!.versions).toHaveLength(1);
  });

  it("uses one physical video for shared-version protection with no queued execution", async () => {
    const f = await makeSource(), state = createDefaultState();
    const meta = await copyVersionFixture(state, f.source, f.from, f.to, process.cwd(), true, { createClearedDraft, upscaleTaskFromRequest });
    expect(state.queue).toEqual([]);
    expect(state.history[0]!.versions).toHaveLength(2);
    expect(meta.targetPath).toBe(meta.originalPath);
    expect(meta.targetVersionId).not.toBe(meta.originalVersionId);
    expect(await fs.readFile(meta.originalPath, "utf8")).toBe("unchanged original video");
  });
});
