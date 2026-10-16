import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { STRATA_UNCENSORED_VECTOR } from "../../src/core/strata-uncensored.js";

export interface StrataControlVector {
  id: string; filename: string; sha256: string; firstLayer: number; lastLayer: number;
}

/** Always recheck this tiny asset; never rehash the main weights to toggle a runtime mode. */
export async function verifyStrataControlVector(installDirectory: string): Promise<StrataControlVector> {
  const vector = STRATA_UNCENSORED_VECTOR;
  const filename = path.join(installDirectory, vector.relativePath);
  const stat = await fs.stat(filename).catch(() => null);
  if (!stat?.isFile() || stat.size !== vector.bytes)
    throw new Error("Strata uncensored 控制向量缺失或大小不符，请在节点与依赖中更新／重新安装 Strata；主模型无需重新下载。");
  const bytes = await fs.readFile(filename);
  if (bytes.toString("ascii", 0, 4) !== "GGUF" || createHash("sha256").update(bytes).digest("hex") !== vector.sha256)
    throw new Error("Strata uncensored 控制向量 SHA-256 校验失败；未启用该模式，请重新安装 Strata 修复。");
  return { id: vector.id, filename, sha256: vector.sha256, firstLayer: vector.firstLayer, lastLayer: vector.lastLayer };
}

/** A launch flag alone is not proof that the engine accepted the projection. */
export async function assertStrataControlVectorLog(filename: string, offset: number, vector: StrataControlVector): Promise<void> {
  const file = await fs.open(filename, "r");
  try {
    const stat = await file.stat();
    const length = Math.min(Math.max(0, stat.size - offset), 256 * 1024);
    const bytes = Buffer.alloc(length);
    if (length) await file.read(bytes, 0, length, Math.max(offset, stat.size - length));
    const expected = `control vector mode = project, dir = per-layer, layers ${vector.firstLayer}..${vector.lastLayer} (${vector.lastLayer - vector.firstLayer + 1} steered)`;
    if (!bytes.toString("utf8").includes(expected))
      throw new Error("Strata 未确认 uncensored 向量加载与作用层，已停止自有模型；详情见 engine.log。");
  } finally { await file.close(); }
}
