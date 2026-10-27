import { promises as fs } from "node:fs";
import path from "node:path";
import type { AppState } from "../../src/types.js";
import { LibraryRecordStore } from "./library-record-store.js";
import { acquireLibraryLease, durableCandidate, readOptionalFile, StateFileSafety, StateRecoveryError, validateStateFile, withStateFileLock } from "./state-file-safety.js";

/** Explicit recovery changes only a verified matching locator; never merges or initializes a library. */
export async function recoverLibraryLocation(stateFile: string, directory: string): Promise<void> {
  if (!path.isAbsolute(directory)) throw new StateRecoveryError("Choose an absolute existing library directory");
  await withStateFileLock(stateFile, async () => {
    const raw = await fs.readFile(stateFile, "utf8"), state = JSON.parse(raw) as AppState;
    validateStateFile(raw);
    if (!state.libraryStorage) {
      const journal = await readOptionalFile(`${stateFile}.library-migration.json`);
      if (journal && JSON.parse(journal).phase === "switched") throw new StateRecoveryError("This profile has already migrated; restore its matching locator instead of falling back to old history");
      if ((await fs.readdir(directory)).length) throw new StateRecoveryError("Choose an empty destination for the first migration");
    }
    const pointer = state.libraryStorage ? { ...state.libraryStorage, directory } : undefined;
    const release = await acquireLibraryLease(directory, stateFile);
    try {
      if (pointer) { const records = await LibraryRecordStore.open(pointer); await records.load(pointer.commit); }
      const replacement = JSON.stringify({ ...state, libraryStorage: pointer, settings: { ...state.settings, libraryDirectory: directory } }, null, 2);
      await new StateFileSafety(stateFile).backup(raw);
      if (await fs.readFile(stateFile, "utf8") !== raw) throw new StateRecoveryError("State changed during recovery; no locator was switched");
      const candidate = await durableCandidate(stateFile, replacement);
      await fs.rename(candidate, stateFile);
    } finally { await release(); }
  });
}
