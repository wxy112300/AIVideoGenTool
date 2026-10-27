import type { UiLocale } from "../types.js";
import type { UiAppearance } from "./appearance.js";

export interface LibraryStorageProgress {
  operation: "migration" | "opening";
  stage: "backup" | "write" | "verify" | "finalize" | "commit" | "loading" | "complete";
  locale: UiLocale;
  appearance: UiAppearance;
  completed?: number;
  total?: number;
}

const copy = {
  "zh-CN": { migration: "正在迁移资料库", opening: "正在打开资料库", backup: "备份原资料", write: "写入作品", verify: "校验作品", finalize: "保存兼容资料", commit: "切换资料库", loading: "读取作品", complete: "正在进入应用", preserved: "原资料和媒体文件会保留。", items: "项" },
  "zh-TW": { migration: "正在遷移資料庫", opening: "正在開啟資料庫", backup: "備份原資料", write: "寫入作品", verify: "驗證作品", finalize: "儲存相容資料", commit: "切換資料庫", loading: "讀取作品", complete: "正在進入應用程式", preserved: "原資料與媒體檔案會保留。", items: "項" },
  "en-US": { migration: "Migrating library", opening: "Opening library", backup: "Backing up original data", write: "Writing works", verify: "Verifying works", finalize: "Saving compatible records", commit: "Switching library", loading: "Reading works", complete: "Opening the studio", preserved: "Original data and media files will be retained.", items: "items" }
};

export function libraryStorageProgressView(progress: LibraryStorageProgress) {
  const text = copy[progress.locale];
  const determinate = Number.isSafeInteger(progress.total) && progress.total! > 0 && Number.isSafeInteger(progress.completed) && progress.completed! >= 0;
  const completed = determinate ? Math.min(progress.completed!, progress.total!) : undefined;
  const percent = completed === undefined ? undefined : Math.floor(completed / progress.total! * 100);
  return {
    title: text[progress.operation], stage: text[progress.stage], percent,
    count: completed === undefined ? "" : `${completed.toLocaleString(progress.locale)} / ${progress.total!.toLocaleString(progress.locale)} ${text.items}`,
    hint: progress.operation === "migration" ? text.preserved : ""
  };
}
