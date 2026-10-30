import { createHash } from "node:crypto";
import type { HistoryMetadataPatch, UiLocale } from "../../src/types.js";
import { createNativeTranslator } from "../ui-translator.js";
import { uiKeys } from "../../src/core/i18n-keys.js";

export function historyMetadataRevision(value: HistoryMetadataPatch): string {
  return createHash("sha256").update(JSON.stringify([
    value.favorite ?? false, value.rating ?? null, value.tags ?? []
  ])).digest("hex");
}

export class HistoryMetadataConflict extends Error {
  constructor(locale?: UiLocale) { super(createNativeTranslator(locale).t(uiKeys.serviceError.metadataConflict)); }
}
