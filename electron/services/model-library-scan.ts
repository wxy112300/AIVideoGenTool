import { promises as fs } from "node:fs";
import path from "node:path";
import { modelPathKey, modelLibraryCategories } from "../../src/core/model-libraries.js";
import { modelCatalog } from "../../src/core/catalog/index.js";

const categoryRoots = new Set<string>([
  ...modelLibraryCategories.map(name => name.toLowerCase()), "clip", "unet", "t2i_adapter", "prompt_models",
  ...modelCatalog.entries.flatMap(entry => entry.definition.scan?.components.flatMap(component => {
    const directory = component.installGuide?.targetSubdirectory?.replaceAll("\\", "/").split("/")[0];
    return directory ? [directory.toLowerCase()] : [];
  }) ?? [])
]);

/** Read metadata only, retain exact relative paths, never follow directory symlinks. */
export async function scanModelLibraries(roots: readonly string[]) {
  const locations = new Map<string, string[]>();
  const files: string[] = [];
  const libraries = await Promise.all(roots.map(async root => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const paths: string[] = [];
    const read = async () => {
    const pending = [root]; let count = 0;
    while (!stopped && pending.length && count < 20_000) {
      const current = pending.pop()!;
      const entries = await fs.readdir(current, { withFileTypes: true }).catch(error => {
        if (current === root) throw error;
        return [];
      });
      if (stopped) break;
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        const filename = path.join(current, entry.name);
        if (entry.isDirectory()) {
          if (current !== root || categoryRoots.has(entry.name.toLowerCase())) pending.push(filename);
        }
        else if (entry.isFile()) {
          if (++count > 20_000) break;
          paths.push(filename);
        }
      }
    }
    return { directory: root, available: true, truncated: pending.length > 0 || count >= 20_000, paths };
    };
    try {
      return await Promise.race([read(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Model library scan timeout")), 10_000);
      })]);
    } catch {
      return { directory: root, available: false, truncated: false, paths: [] as string[] };
    } finally { stopped = true; if (timer) clearTimeout(timer); }
  }));
  // Merge in configured order regardless of completion order.
  for (const library of libraries) {
    for (const filename of library.paths) {
          const relative = path.relative(library.directory, filename).replaceAll("\\", "/");
          const key = modelPathKey(relative), previous = locations.get(key);
          if (previous) previous.push(filename);
          else { files.push(relative); locations.set(key, [filename]); }
    }
  }
  return { files, locations, libraries: libraries.map(({ paths: _, ...status }) => status) };
}
