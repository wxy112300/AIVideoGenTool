import { promises as fs } from "node:fs";
import { createNativeTranslator } from "../ui-translator.js";
import type { Translate } from "../../src/core/i18n.js";
import { uiKeys } from "../../src/core/i18n-keys.js";
import path from "node:path";
import type { AppState } from "../../src/types.js";
import { LibraryRecordStore } from "./library-record-store.js";
import { acquireLibraryLease, durableCandidate, readOptionalFile, StateFileSafety, StateRecoveryError, validateStateFile, withStateFileLock } from "./state-file-safety.js";

/** Explicit recovery changes only a verified matching locator; never merges or initializes a library. */
export async function recoverLibraryLocation(stateFile: string, directory: string, t: Translate = createNativeTranslator(undefined).t): Promise<void> {
  if (!path.isAbsolute(directory)) throw new StateRecoveryError(t(uiKeys.storageMigration.libraryAbsolute));
  await withStateFileLock(stateFile, async () => {
    const raw = await fs.readFile(stateFile, "utf8"), state = JSON.parse(raw) as AppState;
    validateStateFile(raw, t);
    if (!state.libraryStorage) {
      const journal = await readOptionalFile(`${stateFile}.library-migration.json`);
      if (journal && JSON.parse(journal).phase === "switched") throw new StateRecoveryError(t(uiKeys.storageMigration.libraryMigrated));
      if ((await fs.readdir(directory)).length) throw new StateRecoveryError(t(uiKeys.serviceChecks.recoveryEmpty));
    }
    const pointer = state.libraryStorage ? { ...state.libraryStorage, directory } : undefined;
    const release = await acquireLibraryLease(directory, stateFile, false, t);
    try {
      if (pointer) { const records = await LibraryRecordStore.open(pointer, () => t); await records.load(pointer.commit); }
      const replacement = JSON.stringify({ ...state, libraryStorage: pointer, settings: { ...state.settings, libraryDirectory: directory } }, null, 2);
      await new StateFileSafety(stateFile, t).backup(raw);
      if (await fs.readFile(stateFile, "utf8") !== raw) throw new StateRecoveryError(t(uiKeys.serviceChecks.recoveryChanged));
      const candidate = await durableCandidate(stateFile, replacement, t);
      await fs.rename(candidate, stateFile);
    } finally { await release(); }
  });
}
