import type { UiLocale } from "../../types.js";
import type {
  CatalogModelCategory,
  CatalogModelEntry,
  CatalogModelLocale
} from "./types.js";

export interface ModelCatalog {
  readonly entries: readonly CatalogModelEntry[];
  get(modelId: string): CatalogModelEntry | undefined;
  list(category?: CatalogModelCategory): CatalogModelEntry[];
  isFamily(modelId: string, family: string): boolean;
  localized(modelId: string, locale?: UiLocale): CatalogModelLocale | undefined;
}

export function createModelCatalog(entries: readonly CatalogModelEntry[]): ModelCatalog {
  const byId = new Map(entries.map((entry) => [entry.definition.id, entry]));
  return {
    entries,
    get(modelId) {
      return byId.get(modelId);
    },
    list(category) {
      return entries
        .filter((entry) => !category || entry.definition.category === category)
        .filter((entry) => !entry.definition.retired)
        .slice()
        .sort((left, right) => right.definition.order - left.definition.order);
    },
    isFamily(modelId, family) {
      return byId.get(modelId)?.definition.family === family;
    },
    localized(modelId, locale = "zh-CN") {
      const entry = byId.get(modelId);
      if (!entry) return undefined;
      return entry.locales[locale] ?? entry.locales["zh-CN"];
    }
  };
}
