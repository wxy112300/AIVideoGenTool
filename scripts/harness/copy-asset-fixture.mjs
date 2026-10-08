import fs from "node:fs/promises";
import path from "node:path";

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

// Copy only references belonging to a prior smoke, never a user's asset library.
export async function copyAssetFixture(state, source, sourceDirectory, directory, repository) {
  if (source.queueRunning || source.queue?.length || source.history?.length !== 1 ||
      source.history[0].versions?.length !== 1 || source.history[0].versions[0].h3AvAsset?.storageKind !== "app-canonical") {
    throw new Error("Asset fixture requires a stopped, empty queue and one canonical-AV smoke video/version");
  }
  const copies = new Map();
  function rewrite(value, key = "") {
    if (typeof value === "string" && path.isAbsolute(value)) {
      if (!inside(sourceDirectory, value)) {
        if (key === "workflowPath" && inside(repository, value)) return value;
        throw new Error(`Asset fixture refuses an external ${key} reference`);
      }
      const destination = path.join(directory, path.relative(sourceDirectory, value));
      if (!inside(directory, destination)) throw new Error("Asset destination escaped fixture");
      copies.set(value, destination);
      return destination;
    }
    if (Array.isArray(value)) return value.map(item => rewrite(item, key));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, rewrite(item, name)]));
    return value;
  }
  const fields = ["history", "draft", "imageToVideoDraft", "videoExtensionDraft", "imageDraft"];
  const rewritten = Object.fromEntries(fields.filter(key => source[key] !== undefined).map(key => [key, rewrite(source[key])]));
  const realSource = await fs.realpath(sourceDirectory);
  // Validate every source before copying any file. Followed links must stay owned.
  for (const filename of copies.keys()) {
    if (!inside(realSource, await fs.realpath(filename)) || !(await fs.stat(filename)).isFile()) {
      throw new Error("Asset source is not an owned physical file");
    }
  }
  for (const [filename, destination] of copies) {
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(filename, destination);
  }
  Object.assign(state, rewritten);
  return [...copies.values()].map(filename => path.relative(directory, filename));
}
