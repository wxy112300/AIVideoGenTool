import type { Settings } from "../types.js";

export type ModelLibrarySettings = Pick<Settings, "modelDirectory"> & Partial<Pick<Settings, "modelDirectories" | "modelDownloadDirectory">>;
export const modelPathKey = (value: string) => value.trim().replaceAll("\\", "/").replace(/\/+$/u, "").toLowerCase();

/** UI rows retain empty slots; the first row is always the default. */
export function modelLibraryEntries(settings: ModelLibrarySettings, fallback = settings.modelDirectory): string[] {
  const values = Array.isArray(settings.modelDirectories) && settings.modelDirectories.length
    ? settings.modelDirectories.filter((item): item is string => typeof item === "string").map(item => item.trim())
    : [settings.modelDirectory?.trim() || fallback || ""];
  return values.length ? values : [""];
}

/** Preserve priority, ignore malformed/duplicate roots, and retain legacy automatic discovery. */
export function modelLibraryRoots(settings: ModelLibrarySettings, fallback = settings.modelDirectory): string[] {
  const configured = Array.isArray(settings.modelDirectories)
    ? settings.modelDirectories.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
  const candidates = settings.modelDirectories?.length ? configured : [settings.modelDirectory?.trim() || fallback];
  const seen = new Set<string>();
  return candidates.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map(item => item.trim())
    .filter(item => { const key = modelPathKey(item); if (seen.has(key)) return false; seen.add(key); return true; });
}

export function modelDownloadRoot(settings: ModelLibrarySettings, fallback = settings.modelDirectory): string {
  return modelLibraryEntries(settings, fallback)[0] ?? "";
}

/** Category roots use ComfyUI's conventional models layout; subpaths stay relative. */
export const modelLibraryCategories = ["checkpoints", "configs", "loras", "vae", "text_encoders", "diffusion_models",
  "clip_vision", "style_models", "embeddings", "diffusers", "vae_approx", "controlnet", "gligen", "upscale_models",
  "latent_upscale_models", "hypernetworks", "photomaker", "classifiers", "model_patches", "audio_encoders",
  "background_removal", "frame_interpolation", "geometry_estimation", "optical_flow", "detection", "LLM"] as const;

/** Later is_default blocks prepend roots, so emit libraries in reverse order. JSON is valid YAML. */
export function comfyModelLibrariesConfig(roots: readonly string[]): string {
  return JSON.stringify(Object.fromEntries([...roots].reverse().map((root, index) => [`lvs_models_${index}`, {
    base_path: root, is_default: true,
    ...Object.fromEntries(modelLibraryCategories.map(category => [category, category === "text_encoders" ? "text_encoders\nclip"
      : category === "diffusion_models" ? "diffusion_models\nunet" : category === "controlnet" ? "controlnet\nt2i_adapter" : category]))
  }])), null, 2);
}
