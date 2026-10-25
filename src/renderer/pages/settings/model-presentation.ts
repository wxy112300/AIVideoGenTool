import type { ModelScanProfile } from "../../../types";
import { videoLoraDefinition } from "../../../core/video-loras";
import { imageLoraDefinition } from "../../../core/image-loras";

export function settingsComponentPath(path: string): string {
  return path.replaceAll("\\", "/").toLowerCase();
}

/** Only a path actually found in more than one profile is called shared. */
export function sharedSettingsComponentPaths(profiles: ModelScanProfile[]): Set<string> {
  const owners = new Map<string, Set<string>>();
  for (const profile of profiles) {
    if (profile.managedBy === "strata") continue; // Independent model roots may use the same relative filenames.
    for (const component of profile.components) for (const path of component.matches) {
      const key = settingsComponentPath(path);
      if (!owners.has(key)) owners.set(key, new Set());
      owners.get(key)!.add(profile.id);
    }
  }
  return new Set([...owners].filter(([, ids]) => ids.size > 1).map(([path]) => path));
}

/** Group from the adapter's real compatibility, never from localized display names. */
export function groupSettingsLoras(profiles: ModelScanProfile[]): Array<{ key: string; title: string; profiles: ModelScanProfile[] }> {
  const groups = new Map<string, { key: string; title: string; profiles: ModelScanProfile[] }>();
  for (const profile of profiles) {
    const definition = videoLoraDefinition(profile.id) ?? imageLoraDefinition(profile.id);
    const r2vOnly = definition && definition.compatibleModelIds.length > 0 && definition.compatibleModelIds.every(id => id.includes("ref2va"));
    const key = definition ? `${definition.modelFamily}${r2vOnly ? ":r2v" : ""}` : "other";
    const title = definition?.modelFamily === "minimax-h3" ? `MiniMax H3${r2vOnly ? " R2V" : ""}`
      : definition?.modelFamily === "qwen-image" ? "Qwen Image" : definition?.modelFamily || "";
    if (!groups.has(key)) groups.set(key, { key, title, profiles: [] });
    groups.get(key)!.profiles.push(profile);
  }
  const order = (key: string) => key === "minimax-h3" ? 0 : key === "minimax-h3:r2v" ? 1 : key === "qwen-image" ? 2 : 3;
  return [...groups.values()].sort((left, right) => order(left.key) - order(right.key));
}
