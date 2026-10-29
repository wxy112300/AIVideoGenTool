import type { AppApi, ModelComponentStatus } from "../../../types";

/** Scanner paths are relative, except independently managed Strata assets. */
export function modelComponentWithLocations(
  component: ModelComponentStatus,
  roots: { modelDirectory: string; promptModelDirectory: string; comfyRoot: string }
): ModelComponentStatus {
  const join = (root: string, filename: string) => root.trim()
    ? `${root.replaceAll("\\", "/").replace(/\/+$/u, "")}/${filename.replaceAll("\\", "/")}` : "";
  const matches = component.matches.flatMap(filename => {
    if (/^(?:[a-z]:[\\/]|[\\/])/iu.test(filename)) return [filename];
    const relative = filename.replaceAll("\\", "/");
    const candidates = [join(roots.modelDirectory, relative)];
    if (relative.startsWith("prompt_models/") && roots.promptModelDirectory.trim()) {
      candidates.unshift(join(roots.promptModelDirectory, relative.slice("prompt_models/".length)));
    }
    if (relative === "frame_interpolation/rife47.pth") {
      candidates.push(join(roots.comfyRoot, "custom_nodes/ComfyUI-Frame-Interpolation/ckpts/rife/rife47.pth"));
    }
    return candidates.filter(Boolean);
  });
  return { ...component, matches: [...new Set(matches)] };
}

/** Reveal the scanned file, falling back to the download directory if it moved. */
export async function openModelComponentLocation(
  host: Pick<AppApi, "showItemInFolder" | "openDirectory">,
  component: ModelComponentStatus | undefined,
  directory: string
): Promise<boolean> {
  if (component?.found) {
    for (const filename of component.matches) {
      if (!filename.trim()) continue;
      try {
        if (await host.showItemInFolder(filename)) return true;
      } catch {
        // A stale scan must still allow the user to open the download directory.
      }
    }
  }
  if (!directory.trim()) return false;
  try {
    return await host.openDirectory(directory);
  } catch {
    return false;
  }
}
