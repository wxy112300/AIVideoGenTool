import path from "node:path";
import { promises as fs } from "node:fs";
import type { AppState, Settings } from "../../src/types.js";
import type { StateRepository } from "../ports/state-repository.js";
import { isPathWithinDirectory, remapVideoMigrationConsumers } from "../../src/infrastructure/video-history-migration.js";
import { finishRelocation, planRelocation, prepareRelocation, recoverRelocations, relocationFiles, relocationJournal, rollbackRelocation, type FileRelocation, type RelocationProgress } from "./file-relocation.js";

const same = (a: string, b: string) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
const extensions = { video: /\.(mp4|webm|mov|m4v|mkv)$/iu, image: /\.(png|jpg|jpeg|webp|avif|gif|bmp|tiff?)$/iu };
const managedPayload = (filename: string) => filename.split(/[\\/]/u).some(part => /^h3[-_](continuum|native-av|motion-context|context)(?:[-_]|$)/iu.test(part));
export async function validateMediaDirectories(previous: Settings, next: Settings, resolveRoot: (settings: Settings) => Promise<string>): Promise<Array<{ kind: "video" | "image"; source: string; target: string }>> {
  const changes: Array<{ kind: "video" | "image"; source: string; target: string }> = [];
  const root = await resolveRoot({ ...previous, outputDirectory: "", imageOutputDirectory: "" });
  for (const kind of ["video", "image"] as const) {
    const field = kind === "video" ? "outputDirectory" : "imageOutputDirectory";
    if (previous[field].trim() === next[field].trim()) continue;
    if (!root) throw new Error("无法确定当前 ComfyUI output 根目录，请先选择 ComfyUI 实例。");
    const defaultDirectory = path.join(root, kind === "video" ? "Videos" : "Images");
    const source = previous[field].trim() || defaultDirectory, target = next[field].trim() || defaultDirectory;
    const resolvedRoot = await fs.realpath(root);
    // Reject links both in the selected root and in existing destination ancestors.
    for (const directory of [source, target]) {
      if (!path.isAbsolute(directory) || !isPathWithinDirectory(root, directory)) throw new Error("视频和图片输出目录必须位于当前 ComfyUI output 目录内。");
      let ancestor = path.resolve(directory);
      for (;;) {
        try {
          const resolved = await fs.realpath(ancestor);
          if (!isPathWithinDirectory(resolvedRoot, resolved)) throw new Error("输出目录不能通过链接跳出当前 ComfyUI output 目录。");
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
  const progress: RelocationProgress = value => { try { options.progress(value); } catch { /* UI failure cannot change transaction ownership. */ } };
  if (store.get().queueRunning || store.get().queue.some(task => task.status === "running")) throw new Error("请先停止队列并等待运行中的任务结束，再迁移数据。");
  await recoverRelocations(options.stateFile, store.get());
  const plans: FileRelocation[] = [], prepared: FileRelocation[] = [];
  let committed = false;
  try {
    // Preflight every selected category before moving the first file.
    for (const change of options.changes) {
      const state = store.get();
      const protectedRoots = [state.libraryStorage?.directory, state.settings.imageInputLibraryDirectory].filter((value): value is string => Boolean(value && path.isAbsolute(value)));
      const separatelyOwned = (filename: string) => protectedRoots.some(root => isPathWithinDirectory(root, filename));
      const files = (await relocationFiles(change.source)).filter(filename => extensions[change.kind].test(filename) && !managedPayload(filename) && !separatelyOwned(filename) && !isPathWithinDirectory(change.target, filename));
      const references = change.kind === "video"
        ? state.history.flatMap(asset => [...asset.files, ...asset.versions.flatMap(version => version.files)])
        : state.imageHistory.flatMap(project => project.versions.filter(version => version.kind !== "source").map(version => version.file));
      for (const file of references) {
        const filename = file.absolutePath || path.join(change.source, file.subfolder || "", file.filename);
        if (isPathWithinDirectory(change.source, filename) && extensions[change.kind].test(filename)) {
          if (managedPayload(filename)) throw new Error("历史媒体由续写 Run 管理，不能单独拆出移动；原文件与引用已保留。");
          if (separatelyOwned(filename)) throw new Error("历史文件位于独立资料库或输入素材库中，不能通过输出目录拆出迁移。");
          files.push(filename);
        }
      }
      const plan = await planRelocation(change.kind, change.source, change.target, files, relocationJournal(options.stateFile, change.kind), progress);
      const field = change.kind === "video" ? "outputDirectory" : "imageOutputDirectory";
      plan.sourceSetting = state.settings[field]; plan.targetSetting = options.settings[field];
      plans.push(plan);
    }
    for (const plan of plans) { await prepareRelocation(plan, progress); prepared.push(plan); }
    progress({ phase: "committing", current: 0, total: plans.reduce((n, plan) => n + plan.entries.length, 0), message: "文件已校验，正在保存资料库与历史路径", migratedFiles: 0, warningCount: 0 });
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
    for (const plan of prepared) await finishRelocation(plan, progress);
    await recoverRelocations(options.stateFile, next);
    const count = plans.reduce((n, plan) => n + plan.entries.length, 0);
    progress({ phase: "completed", current: count, total: count, message: "数据迁移完成，源文件已移走", migratedFiles: count, warningCount: 0 });
    return next;
  } catch (error) {
    if (!committed) for (const plan of [...prepared].reverse()) await rollbackRelocation(plan);
    throw new Error(`${committed ? "新位置已保存，但源文件迁移尚未完成。请重试以继续恢复，不能清理迁移日志。" : "迁移未提交，正在保留或恢复原位置。"} ${error instanceof Error ? error.message : String(error)}`);
  }
}
