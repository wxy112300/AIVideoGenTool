import type { ModelScanProfile, Settings, StrataPreparationStatus, UiLocale } from "../types.js";
import { QWEN_FLASH_NEXT_MODEL_DIRECTORY, QWEN_FLASH_NEXT_UNSLOTH_DIRECTORY, STRATA_Q4_MODEL_ID, strataModelEntries } from "./catalog/models/strata.js";
import { STRATA_DEFAULT_PORT } from "./catalog/dependencies/strata.js";
import { isStrataDeepSeek, STRATA_DEEPSEEK_DIRECTORY } from "./catalog/models/strata-deepseek.js";
import { strataUncensoredMode } from "./strata-uncensored.js";
import { normalizeStrataReasoningEffort } from "./strata-reasoning.js";
import { modelLibraryRoots, type ModelLibrarySettings } from "./model-libraries.js";

export function validStrataPort(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1024 && value <= 65535;
}
/** Reuse the selected ComfyUI model root; software installation remains independent. */
export function strataModelRoot(
  settings: Pick<Settings, "strataModelDirectory"> & ModelLibrarySettings,
  resolvedModelDirectory = settings.modelDirectory
): string {
  const root = modelLibraryRoots({ ...settings, modelDirectory: resolvedModelDirectory }, resolvedModelDirectory)[0]?.replace(/[\\/]+$/u, "");
  if (!root && settings.modelDirectories?.length) return "";
  if (!root) return settings.strataModelDirectory?.trim() || "";
  const separator = root.includes("\\") || /^[a-z]:/iu.test(root) ? "\\" : "/";
  return `${root}${separator}LLM${separator}${QWEN_FLASH_NEXT_MODEL_DIRECTORY}`;
}

/** Read old shared downloads in place; new download guides always use strataModelRoot. */
export function strataProfileModelRoot(root: string, modelId: string): string {
  if (!root) return root;
  if (isStrataDeepSeek(modelId)) return root.replace(/(?:Qwen3\.8-Flash-Next-(?:GSQ-RCO-)?GGUF|DeepSeek-V4\.1-Flash-1017-Uncensored-GSQ-RCO-GGUF)([\\/]*)$/iu, `${STRATA_DEEPSEEK_DIRECTORY}$1`);
  root = root.replace(/DeepSeek-V4\.1-Flash-1017-Uncensored-GSQ-RCO-GGUF([\\/]*)$/iu, `${QWEN_FLASH_NEXT_MODEL_DIRECTORY}$1`);
  return modelId === STRATA_Q4_MODEL_ID
    ? root.replace(/Qwen3\.8-Flash-Next-GSQ-RCO-GGUF([\\/]*)$/iu, `${QWEN_FLASH_NEXT_UNSLOTH_DIRECTORY}$1`)
    : root.replace(/Qwen3\.8-Flash-Next-GGUF([\\/]*)$/iu, `${QWEN_FLASH_NEXT_MODEL_DIRECTORY}$1`);
}

export function strataModelScanRoots(
  settings: Pick<Settings, "strataModelDirectory"> & ModelLibrarySettings,
  resolvedModelDirectory = settings.modelDirectory,
  modelId = ""
): string[] {
  const roots = modelLibraryRoots({ ...settings, modelDirectory: resolvedModelDirectory }, resolvedModelDirectory);
  if (!roots.length && settings.modelDirectories?.length) return [];
  return [...new Set((roots.length ? roots : [""]).flatMap(root => singleStrataModelScanRoots(
    { strataModelDirectory: settings.strataModelDirectory, modelDirectory: root }, root, modelId)))];
}

function singleStrataModelScanRoots(
  settings: Pick<Settings, "strataModelDirectory" | "modelDirectory">,
  resolvedModelDirectory: string,
  modelId: string
): string[] {
  const existing = strataModelRoot(settings, resolvedModelDirectory);
  const canonical = strataProfileModelRoot(existing, modelId);
  if (isStrataDeepSeek(modelId)) return canonical ? [canonical] : [];
  // Standalone discovery can remember the Q4 family folder directly, without
  // a Comfy model root. Its original projector/MTP may still live beside it.
  const sharedOriginal = strataProfileModelRoot(existing, "");
  if (!canonical) return [];
  const root = resolvedModelDirectory?.trim().replace(/[\\/]+$/u, "");
  if (!root) return [...new Set([canonical, existing, sharedOriginal])];
  const separator = root.includes("\\") || /^[a-z]:/iu.test(root) ? "\\" : "/";
  return [...new Set([canonical, existing, sharedOriginal, `${root}${separator}LLM${separator}strata`])];
}

/** Software identity is independent of the selected ComfyUI and shared model directory. */
export function strataModelSoftwareReady(modelId: string, status: StrataPreparationStatus | undefined): boolean {
  return Boolean(status?.managedInstalled && (!isStrataDeepSeek(modelId) || (status.sourcePresent && status.deepSeekEnginePresent)));
}

export function strataRuntimeMatchesSettings(
  settings: Pick<Settings, "strataInstallDirectory">,
  status: StrataPreparationStatus | undefined
): boolean {
  return Boolean(status && (status.configuredInstallDirectory ?? status.installDirectory) === settings.strataInstallDirectory.trim());
}

export function strataPreparationMatchesSettings(
  settings: Pick<Settings, "strataInstallDirectory" | "strataModelDirectory" | "modelDirectory"> & Partial<Pick<Settings, "comfyInstallDirectory" | "modelDirectories">>,
  status: StrataPreparationStatus | undefined
): boolean {
  return Boolean(strataRuntimeMatchesSettings(settings, status) && status
    && (status.configuredModelDirectory ?? "") === settings.modelDirectory.trim()
    && JSON.stringify(status.configuredModelDirectories ?? modelLibraryRoots({ modelDirectory: status.configuredModelDirectory ?? "" })) === JSON.stringify(settings.modelDirectories ?? modelLibraryRoots(settings))
    && (status.configuredComfyInstallDirectory ?? "") === (settings.comfyInstallDirectory?.trim() ?? ""));
}

/** Legacy/corrupt data is normalized without changing the active prompt runtime. */
export function normalizeStrataSettings(settings: Pick<Settings, "strataInstallDirectory" | "strataModelDirectory" | "strataPort"> & Partial<Pick<Settings, "strataUncensored" | "strataUncensoredMode" | "strataReasoningEffort">>) {
  return {
    strataInstallDirectory: typeof settings.strataInstallDirectory === "string" ? settings.strataInstallDirectory.trim() : "",
    strataModelDirectory: typeof settings.strataModelDirectory === "string" ? settings.strataModelDirectory.trim() : "",
    strataPort: validStrataPort(settings.strataPort) ? settings.strataPort : STRATA_DEFAULT_PORT,
    strataUncensored: strataUncensoredMode(settings) !== "off",
    strataUncensoredMode: strataUncensoredMode(settings),
    strataReasoningEffort: normalizeStrataReasoningEffort(settings.strataReasoningEffort)
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
        label: component.label, expected: component.expected, optional: component.optional, found: false, matches: [],
        installGuide: { ...component.installGuide! }
      }))
    };
  });
}
