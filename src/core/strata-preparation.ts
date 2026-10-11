import type { ModelScanProfile, Settings, StrataPreparationStatus, UiLocale } from "../types.js";
import { QWEN_FLASH_NEXT_MODEL_DIRECTORY, strataModelEntries } from "./catalog/models/strata.js";
import { STRATA_DEFAULT_PORT } from "./catalog/dependencies/strata.js";

export function validStrataPort(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1024 && value <= 65535 && value !== 8080;
}
/** Reuse the selected ComfyUI model root; software installation remains independent. */
export function strataModelRoot(
  settings: Pick<Settings, "strataModelDirectory" | "modelDirectory">,
  resolvedModelDirectory = settings.modelDirectory
): string {
  const root = resolvedModelDirectory?.trim().replace(/[\\/]+$/u, "");
  if (!root) return settings.strataModelDirectory?.trim() || "";
  const separator = root.includes("\\") || /^[a-z]:/iu.test(root) ? "\\" : "/";
  return `${root}${separator}LLM${separator}${QWEN_FLASH_NEXT_MODEL_DIRECTORY}`;
}

/** Read old shared downloads in place; new download guides always use strataModelRoot. */
export function strataModelScanRoots(
  settings: Pick<Settings, "strataModelDirectory" | "modelDirectory">,
  resolvedModelDirectory = settings.modelDirectory
): string[] {
  const canonical = strataModelRoot(settings, resolvedModelDirectory);
  if (!canonical) return [];
  const root = resolvedModelDirectory?.trim().replace(/[\\/]+$/u, "");
  if (!root) return [canonical];
  const separator = root.includes("\\") || /^[a-z]:/iu.test(root) ? "\\" : "/";
  return [canonical, `${root}${separator}LLM${separator}strata`];
}

export function strataPreparationMatchesSettings(
  settings: Pick<Settings, "strataInstallDirectory" | "strataModelDirectory" | "modelDirectory"> & Partial<Pick<Settings, "comfyInstallDirectory">>,
  status: StrataPreparationStatus | undefined
): boolean {
  return Boolean(status && (status.configuredInstallDirectory ?? status.installDirectory) === settings.strataInstallDirectory.trim()
    && (status.configuredModelDirectory ?? "") === settings.modelDirectory.trim()
    && (status.configuredComfyInstallDirectory ?? "") === (settings.comfyInstallDirectory?.trim() ?? ""));
}

/** Legacy/corrupt data is normalized without changing the active prompt runtime. */
export function normalizeStrataSettings(settings: Pick<Settings, "strataInstallDirectory" | "strataModelDirectory" | "strataPort">) {
  return {
    strataInstallDirectory: typeof settings.strataInstallDirectory === "string" ? settings.strataInstallDirectory.trim() : "",
    strataModelDirectory: typeof settings.strataModelDirectory === "string" ? settings.strataModelDirectory.trim() : "",
    strataPort: validStrataPort(settings.strataPort) ? settings.strataPort : STRATA_DEFAULT_PORT
  };
}

export function strataPreparationProfiles(locale: UiLocale = "zh-CN"): ModelScanProfile[] {
  return strataModelEntries.map((entry) => {
    const localized = entry.locales[locale] ?? entry.locales["zh-CN"]!;
    const scan = entry.definition.scan!;
    return {
      id: entry.definition.id,
      name: localized.name,
      category: "prompt",
      managedBy: "strata",
      badge: localized.badge ?? "",
      description: localized.description ?? "",
      vram: scan.vram,
      available: false,
      integrated: true,
      productGate: "open",
      runtimeReady: false,
      runtimeVerified: false,
      components: scan.components.map((component) => ({
        label: component.label, expected: component.expected, found: false, matches: [],
        installGuide: { ...component.installGuide! }
      }))
    };
  });
}
