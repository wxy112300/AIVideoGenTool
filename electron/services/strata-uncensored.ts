import { createNativeTranslator } from "../ui-translator.js";
import type { Translate } from "../../src/core/i18n.js";
import { uiKeys } from "../../src/core/i18n-keys.js";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { strataVectorForMode, type StrataUncensoredMode } from "../../src/core/strata-uncensored.js";

export interface StrataControlVector {
  id: string; filename: string; sha256: string; firstLayer: number; lastLayer: number;
}

/** Always recheck this tiny asset; never rehash the main weights to toggle a runtime mode. */
export async function verifyStrataControlVector(installDirectory: string, mode: Exclude<StrataUncensoredMode, "off"> = "builtin", t: Translate = createNativeTranslator(undefined).t): Promise<StrataControlVector> {
  const vector = strataVectorForMode(mode);
  const filename = path.join(installDirectory, vector.relativePath);
  const stat = await fs.stat(filename).catch(() => null);
  if (!stat?.isFile() || stat.size !== vector.bytes)
    throw new Error(t(uiKeys.strataService.vectorMissing));
  const bytes = await fs.readFile(filename);
  if (bytes.toString("ascii", 0, 4) !== "GGUF" || createHash("sha256").update(bytes).digest("hex") !== vector.sha256)
    throw new Error(t(uiKeys.strataService.vectorHash));
  return { id: vector.id, filename, sha256: vector.sha256, firstLayer: vector.firstLayer, lastLayer: vector.lastLayer };
}

/** A launch flag alone is not proof that the engine accepted the projection. */
export async function assertStrataControlVectorLog(filename: string, offset: number, vector: StrataControlVector, t: Translate = createNativeTranslator(undefined).t): Promise<void> {
  const file = await fs.open(filename, "r");
  try {
    const stat = await file.stat();
    const length = Math.min(Math.max(0, stat.size - offset), 256 * 1024);
    const bytes = Buffer.alloc(length);
    if (length) await file.read(bytes, 0, length, Math.max(offset, stat.size - length));
    const expected = `control vector mode = project, dir = per-layer, layers ${vector.firstLayer}..${vector.lastLayer} (${vector.lastLayer - vector.firstLayer + 1} steered)`;
    if (!bytes.toString("utf8").includes(expected))
      throw new Error(t(uiKeys.strataService.vectorLogUnconfirmed));
  } finally { await file.close(); }
}
