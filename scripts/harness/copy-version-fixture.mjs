import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { copyAssetFixture } from "./copy-asset-fixture.mjs";

// Synthetic History topology over real copied media, not an actual Upscale result.
export async function copyVersionFixture(state, source, from, directory, repository, shared, dependencies) {
  await copyAssetFixture(state, source, from, directory, repository);
  const asset = state.history[0], original = asset.versions[0];
  const media = original.files.find(file => /\.mp4$/iu.test(file.filename));
  if (!media?.absolutePath) throw new Error("Version fixture requires a copied MP4");
  const filename = shared ? media.filename : "version-fixture-derived.mp4";
  const targetPath = shared ? media.absolutePath : path.join(directory, "video", filename);
  if (!shared) {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.copyFile(media.absolutePath, targetPath);
  }
  const file = { ...media, filename, subfolder: shared ? media.subfolder : "video", absolutePath: targetPath };
  const derived = {
    id: randomUUID(), kind: "upscale", createdAt: new Date().toISOString(),
    outputFilename: filename, modelId: "seedvr2", width: original.width, height: original.height,
    duration: original.duration, fps: original.fps, workflowPath: original.workflowPath,
    comfyPromptId: "fixture-no-generation", comfyOutputs: {}, files: [file]
  };
  asset.versions.push(derived);
  asset.defaultVersionId = derived.id;
  asset.files = [file];
  asset.outputFilename = filename;
  asset.comfyOutputs = {};
  for (const key of ["draft", "imageToVideoDraft", "videoExtensionDraft"]) {
    if (state[key]) state[key] = dependencies.createClearedDraft(state[key]);
  }
  state.queueRunning = false;
  state.queue = shared ? [] : [dependencies.upscaleTaskFromRequest({
    modelId: "seedvr2", sourceAssetId: asset.id, sourceVersionId: derived.id,
    sourceFilePath: targetPath, sourceFilename: filename,
    sourceWidth: derived.width, sourceHeight: derived.height, duration: derived.duration, fps: derived.fps,
    targetHeight: 1080, tileMode: "auto", faceRestore: false
  }, state)];
  const scenario = { assetId: asset.id, taskId: asset.taskId, originalVersionId: original.id,
    targetVersionId: derived.id, originalPath: media.absolutePath, targetPath,
    queueTaskId: state.queue[0]?.id, shared, syntheticVersions: true };
  await fs.writeFile(path.join(directory, "version-fixture.json"), JSON.stringify(scenario, null, 2));
  return scenario;
}
