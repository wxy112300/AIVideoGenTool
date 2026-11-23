import { FASTH3_OMNI_MODEL_ID } from "./catalog/models/minimax_h3_omni/definition.js";
import { TEN_EROS_MAX_MODEL_ID } from "./catalog/models/ten_eros_max/definition.js";

export function isH3VsaCheckpoint(modelId: string): boolean {
  return modelId === FASTH3_OMNI_MODEL_ID || modelId === TEN_EROS_MAX_MODEL_ID;
}
