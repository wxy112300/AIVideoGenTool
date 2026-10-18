import { createHash } from "node:crypto";
import type { HistoryMetadataPatch } from "../../src/types.js";

export function historyMetadataRevision(value: HistoryMetadataPatch): string {
  return createHash("sha256").update(JSON.stringify([
    value.favorite ?? false, value.rating ?? null, value.tags ?? []
  ])).digest("hex");
}

export class HistoryMetadataConflict extends Error {
  constructor() { super("视频信息已在另一处修改，请刷新后重试。"); }
}
