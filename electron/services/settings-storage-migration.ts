import path from "node:path";
import { createNativeTranslator } from "../ui-translator.js";
import { uiKeys } from "../../src/core/i18n-keys.js";
import { promises as fs } from "node:fs";
import type { AppState, Settings } from "../../src/types.js";
import type { StateRepository } from "../ports/state-repository.js";
import { isPathWithinDirectory, remapVideoMigrationConsumers } from "../../src/infrastructure/video-history-migration.js";
import { finishRelocation, planRelocation, prepareRelocation, recoverRelocations, relocationFiles, relocationJournal, rollbackRelocation, type FileRelocation, type RelocationProgress } from "./file-relocation.js";

const same = (a: string, b: string) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
const extensions = { video: /\.(mp4|webm|mov|m4v|mkv)$/iu, image: /\.(png|jpg|jpeg|webp|avif|gif|bmp|tiff?)$/iu };
const managedPayload = (filename: string) => filename.split(/[\\/]/u).some(part => /^h3[-_](continuum|native-av|motion-context|context)(?:[-_]|$)/iu.test(part));
export async function validateMediaDirectories(previous: Settings, next: Settings, resolveRoot: (settings: Settings) => Promise<string>): Promise<Array<{ kind: "video" | "image"; source: string; target: string }>> {
  const t = createNativeTranslator(next.uiLocale).t;
  const changes: Array<{ kind: "video" | "image"; source: string; target: string }> = [];
  const root = await resolveRoot({ ...previous, outputDirectory: "", imageOutputDirectory: "" });
  for (const kind of ["video", "image"] as const) {
    const field = kind === "video" ? "outputDirectory" : "imageOutputDirectory";
    if (previous[field].trim() === next[field].trim()) continue;
    if (!root) throw new Error(t(uiKeys.storageMigration.rootMissing));
    const defaultDirectory = path.join(root, kind === "video" ? "Videos" : "Images");
    const source = previous[field].trim() || defaultDirectory, target = next[field].trim() || defaultDirectory;
    const resolvedRoot = await fs.realpath(root);
    // Reject links both in the selected root and in existing destination ancestors.
    for (const directory of [source, target]) {
      if (!path.isAbsolute(directory) || !isPathWithinDirectory(root, directory)) throw new Error(t(uiKeys.storageMigration.outputOutside));
      let ancestor = path.resolve(directory);
      for (;;) {
        try {
          const resolved = await fs.realpath(ancestor);
          if (!isPathWithinDirectory(resolvedRoot, resolved)) throw new Error(t(uiKeys.storageMigration.outputLinkOutside));
          break;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          const parent = path.dirname(ancestor); if (parent === ancestor) throw error; ancestor = parent;
        }
      }
    }
    if (!same(source, target)) changes.push({ kind, source: path.resolve(source), target: path.resolve(target) });
  }
  return changes;
}

export async function migrateStorageSettings(options: {
  store: StateRepository; stateFile: string; settings: Settings;
  changes: Awaited<ReturnType<typeof validateMediaDirectories>>;
  progress: RelocationProgress; commit(state: AppState): void; sendState(state: AppState): void;
}): Promise<AppState> {
  const { store } = options;
  const t = createNativeTranslator(options.settings.uiLocale).t;
  const progress: RelocationProgress = value => { try { options.progress(value); } catch { /* UI failure cannot change transaction ownership. */ } };
  if (store.get().queueRunning || store.get().queue.some(task => task.status === "running")) throw new Error(t(uiKeys.storageMigration.queueBusy));
  await recoverRelocations(options.stateFile, store.get(), t);
  const plans: FileRelocation[] = [], prepared: FileRelocation[] = [];
  let committed = false;
  try {
    // Preflight every selected category before moving the first file.
    for (const change of options.changes) {
      const state = store.get();
      const protectedRoots = [state.libraryStorage?.directory, state.settings.imageInputLibraryDirectory].filter((value): value is string => Boolean(value && path.isAbsolute(value)));
      const separatelyOwned = (filename: string) => protectedRoots.some(root => isPathWithinDirectory(root, filename));
      const files = (await relocationFiles(change.source, t)).filter(filename => extensions[change.kind].test(filename) && !managedPayload(filename) && !separatelyOwned(filename) && !isPathWithinDirectory(change.target, filename));
      const references = change.kind === "video"
        ? state.history.flatMap(asset => [...asset.files, ...asset.versions.flatMap(version => version.files)])
        : state.imageHistory.flatMap(project => project.versions.filter(version => version.kind !== "source").map(version => version.file));
      for (const file of references) {
        const filename = file.absolutePath || path.join(change.source, file.subfolder || "", file.filename);
        if (isPathWithinDirectory(change.source, filename) && extensions[change.kind].test(filename)) {
          if (managedPayload(filename)) throw new Error(t(uiKeys.storageMigration.managedPayload));
          if (separatelyOwned(filename)) throw new Error(t(uiKeys.storageMigration.separateOwner));
          files.push(filename);
        }
      }
      const plan = await planRelocation(change.kind, change.source, change.target, files, relocationJournal(options.stateFile, change.kind), progress, t);
      const field = change.kind === "video" ? "outputDirectory" : "imageOutputDirectory";
      plan.sourceSetting = state.settings[field]; plan.targetSetting = options.settings[field];
      plans.push(plan);
    }
    for (const plan of plans) { await prepareRelocation(plan, progress, t); prepared.push(plan); }
    progress({ phase: "committing", current: 0, total: plans.reduce((n, plan) => n + plan.entries.length, 0), message: t(uiKeys.storageMigration.savingPaths), migratedFiles: 0, warningCount: 0 });
    const next = await store.update(state => {
      options.commit(state);
      for (const plan of plans) {
        const entries = new Map(plan.entries.map(entry => [path.resolve(entry.source).toLowerCase(), entry.target]));
        const files = plan.kind === "video"
          ? state.history.flatMap(asset => [...asset.files, ...asset.versions.flatMap(version => version.files)])
          : state.imageHistory.flatMap(project => project.versions.map(version => version.file));
        for (const file of files) {
          const source = file.absolutePath || path.join(plan.sourceRoot, file.subfolder || "", file.filename);
          const target = entries.get(path.resolve(source).toLowerCase());
          if (target) file.absolutePath = target;
        }
        remapVideoMigrationConsumers(state, {
        oldDirectory: plan.sourceRoot, newDirectory: plan.targetRoot, missing: [], conflicts: [], totalBytes: 0,
        entries: plan.entries.map(entry => ({ sourcePath: entry.source, targetPath: entry.target, hash: entry.hash, size: entry.size, references: [], createdTarget: true, targetReady: true }))
        });
      }
    });
    committed = true; options.sendState(next);
    for (const plan of prepared) await finishRelocation(plan, progress, t);
    await recoverRelocations(options.stateFile, next, t);
    const count = plans.reduce((n, plan) => n + plan.entries.length, 0);
    progress({ phase: "completed", current: count, total: count, message: t(uiKeys.storageMigration.dataMoved), migratedFiles: count, warningCount: 0 });
    return next;
  } catch (error) {
    if (!committed) for (const plan of [...prepared].reverse()) await rollbackRelocation(plan, t);
    throw new Error(`${t(committed ? uiKeys.storageMigration.commitIncomplete : uiKeys.storageMigration.notCommitted)} ${error instanceof Error ? error.message : String(error)}`);
  }
}
