import type { AppApi, ModelComponentStatus } from "../../../types";
import { strataModelRoot, strataProfileModelRoot } from "../../../core/strata-preparation";
import type { SettingsInstallGuideSelection } from "./fragments";

export interface ModelLocationRoots {
  modelDirectory: string;
  promptModelDirectory: string;
  comfyRoot: string;
}

/** Display the first scan hit, or the default library's canonical download filename. */
export function modelComponentDisplayPath(component: ModelComponentStatus, roots: ModelLocationRoots, profileId: string, strata = false): string {
  if (component.found) return modelComponentWithLocations(component, roots).matches.find(filename => filename.trim()) ?? "";
  if (!roots.modelDirectory.trim()) return "";
  const guide = component.installGuide;
  const root = strata ? strataProfileModelRoot(strataModelRoot({ modelDirectory: roots.modelDirectory, strataModelDirectory: "" }), profileId) : roots.modelDirectory;
  const relative = guide ? [guide.targetSubdirectory, guide.recommendedFilename].filter(Boolean).join("/") : component.expected;
  const separator = root.includes("\\") || /^[a-z]:/iu.test(root) ? "\\" : "/";
  return `${root.replace(/[\\/]+$/u, "")}${separator}${relative.replace(/[\\/]/gu, separator)}`;
}

/** Keep blank slots and their displayed library numbers; never retarget a blank default. */
export function installGuideDirectories(selection: SettingsInstallGuideSelection, fallback: string, libraries?: readonly string[]): string[] {
  const roots = libraries?.length ? libraries : [selection.targetRoot ?? fallback];
  return roots.map(root => {
    if (!root.trim()) return "";
    const destination = libraries?.length && selection.targetRoot !== undefined
      ? strataProfileModelRoot(strataModelRoot({ modelDirectory: root, strataModelDirectory: "" }), selection.profileId ?? "") : root;
    return [destination.replace(/[\\/]+$/u, ""), selection.component.installGuide?.targetSubdirectory.replaceAll("/", "\\")].filter(Boolean).join("\\");
  });
}

export function bindModelDirectoryActions(root: HTMLElement, host: Pick<AppApi, "showItemInFolder" | "openDirectory">,
  component: () => ModelComponentStatus | undefined, failed: () => void, signal?: AbortSignal): void {
  root.querySelectorAll<HTMLButtonElement>("[data-install-directory]").forEach(button => button.addEventListener("click", async () => {
    const menu = button.closest<HTMLDetailsElement>(".model-directory-menu");
    if (menu) { menu.open = false; menu.querySelector("summary")?.focus({ preventScroll: true }); }
    const opened = await openModelComponentLocation(host, component(), button.dataset.installDirectory?.trim() ?? "");
    if (!opened) failed();
  }, { signal }));
  root.querySelectorAll<HTMLDetailsElement>(".model-directory-menu").forEach(menu => {
    menu.addEventListener("keydown", event => {
      if (event.key !== "Escape" || !menu.open) return;
      event.preventDefault(); event.stopPropagation(); menu.open = false;
      menu.querySelector("summary")?.focus();
    }, { signal });
  });
}

/** Scanner paths are relative, except independently managed Strata assets. */
export function modelComponentWithLocations(
  component: ModelComponentStatus,
  roots: ModelLocationRoots
): ModelComponentStatus {
  if (component.locations?.length) return { ...component, matches: [...component.locations] };
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
