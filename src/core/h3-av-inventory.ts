import type {
  AppState,
  H3AvGcDecision,
  H3AvInventoryCandidate,
  H3AvInventoryEntry,
  H3AvLatentAsset,
  H3AvReferenceIndex,
  HistoryFile
} from "../types.js";
import { safeH3OutputRelativePath, validateH3AvLatentAsset } from "./h3-av-asset.js";

export interface H3AvReferenceSource {
  referenceId: string;
  assetId?: string;
  asset?: H3AvLatentAsset;
  paths?: HistoryFile[];
}

export interface H3AvGcPolicyContext {
  referencedBy?: string[];
  queuedOrRunning?: boolean;
  currentCanonical?: boolean;
  ownerInRunStorage?: boolean;
  unselectedTake?: boolean;
  allowAliasDeletion?: boolean;
  allowUnselectedTakeLatentDeletion?: boolean;
}

function pathKey(file: HistoryFile): string {
  return safeH3OutputRelativePath(file) ?? `${file.subfolder}/${file.filename}`;
}

function addReference(map: Record<string, string[]>, key: string, referenceId: string): void {
  const current = map[key] ?? [];
  if (!current.includes(referenceId)) current.push(referenceId);
  map[key] = current;
}

/** Build an auditable reverse index without reading or deleting any payload. */
export function buildH3AvReferenceIndex(
  sources: readonly H3AvReferenceSource[],
  generatedAt = new Date().toISOString()
): H3AvReferenceIndex {
  const byAssetId: Record<string, string[]> = {};
  const byPath: Record<string, string[]> = {};
  for (const source of sources) {
    const assetId = source.assetId ?? source.asset?.assetId;
    if (assetId) addReference(byAssetId, assetId, source.referenceId);
    const files = [
      ...(source.paths ?? []),
      ...(source.asset ? [source.asset.ownerPath, ...(source.asset.aliasPaths ?? [])] : [])
    ];
    for (const file of files) addReference(byPath, pathKey(file), source.referenceId);
  }
  return { schemaVersion: 1, generatedAt, byAssetId, byPath };
}

/** Extract all managed asset/sequence references from persisted app state. */
export function buildH3AvReferenceIndexFromState(
  state: Pick<AppState, "history" | "queue">,
  generatedAt = new Date().toISOString()
): H3AvReferenceIndex {
  const sources: H3AvReferenceSource[] = [];
  for (const asset of state.history) {
    for (const version of asset.versions) {
      if (version.h3AvAsset) {
        sources.push({
          referenceId: `history:${asset.id}:${version.id}`,
          asset: version.h3AvAsset
        });
      }
      for (const chunk of version.h3ContinuumSequence?.chunks ?? []) {
        if (chunk.assetId) {
          sources.push({
            referenceId: `history:${asset.id}:${version.id}:chunk:${chunk.logicalChunkIndex}`,
            assetId: chunk.assetId
          });
        }
      }
    }
  }
  for (const task of state.queue) {
    if (!("h3ContinuumSequence" in task)) continue;
    for (const chunk of task.h3ContinuumSequence?.chunks ?? []) {
      if (chunk.assetId) {
        sources.push({
          referenceId: `queue:${task.id}:chunk:${chunk.logicalChunkIndex}`,
          assetId: chunk.assetId
        });
      }
    }
  }
  return buildH3AvReferenceIndex(sources, generatedAt);
}

function duplicateKey(candidate: H3AvInventoryCandidate): string | null {
  if (candidate.payloadSha256) return `payload:${candidate.payloadSha256}`;
  if (candidate.videoTensorSha256 && candidate.audioTensorSha256) {
    return `tensors:${candidate.videoTensorSha256}:${candidate.audioTensorSha256}`;
  }
  return null;
}

/**
 * Classify a header/manifest inventory.  The caller is responsible for
 * streaming hashes; this function deliberately never decodes video/audio.
 */
export function classifyH3AvInventory(
  candidates: readonly H3AvInventoryCandidate[],
  references: H3AvReferenceIndex = { schemaVersion: 1, generatedAt: new Date().toISOString(), byAssetId: {}, byPath: {} }
): H3AvInventoryEntry[] {
  const validByDuplicateKey = new Map<string, Set<string>>();
  for (const candidate of candidates) {
    if (!candidate.present || candidate.validationError) continue;
    const key = duplicateKey(candidate);
    if (!key) continue;
    const owners = validByDuplicateKey.get(key) ?? new Set<string>();
    owners.add(candidate.asset?.assetId ?? candidate.referenceId);
    validByDuplicateKey.set(key, owners);
  }
  return candidates.map((candidate) => {
    const assetError = candidate.asset ? validateH3AvLatentAsset(candidate.asset) : null;
    const key = pathKey(candidate.path);
    const referencedBy = [
      ...(candidate.asset ? (references.byAssetId[candidate.asset.assetId] ?? []) : []),
      ...(references.byPath[key] ?? [])
    ].filter((value, index, values) => values.indexOf(value) === index);
    let status: H3AvInventoryEntry["status"];
    let reason: string | undefined;
    if (!candidate.present) {
      status = "missing";
      reason = "payload 文件不存在";
    } else if (candidate.validationError || assetError) {
      status = "corrupt";
      reason = candidate.validationError ?? assetError ?? "canonical manifest 校验失败";
    } else if (candidate.legacy || !candidate.asset) {
      status = "legacy-unverified";
      reason = "没有 canonical manifest/producer 证据，保留为 legacy bootstrap 输入";
    } else {
      const owners = duplicateKey(candidate) ? validByDuplicateKey.get(duplicateKey(candidate)!) : undefined;
      if (owners && owners.size > 1) {
        status = "duplicate-tensor";
        reason = "不同 canonical reference 暴露了相同 tensor/payload digest";
      } else {
        status = "valid";
      }
    }
    return {
      referenceId: candidate.referenceId,
      path: candidate.path,
      ...(candidate.asset?.assetId ? { assetId: candidate.asset.assetId } : {}),
      ...(candidate.storageKind ?? candidate.asset?.storageKind ? { storageKind: candidate.storageKind ?? candidate.asset?.storageKind } : {}),
      status,
      referencedBy,
      ...((candidate.payloadBytes ?? candidate.asset?.payloadBytes) === undefined ? {} : { payloadBytes: candidate.payloadBytes ?? candidate.asset?.payloadBytes }),
      ...(candidate.payloadSha256 ?? candidate.asset?.payloadSha256 ? { payloadSha256: candidate.payloadSha256 ?? candidate.asset?.payloadSha256 } : {}),
      ...(candidate.videoTensorSha256 ?? candidate.asset?.videoTensorSha256 ? { videoTensorSha256: candidate.videoTensorSha256 ?? candidate.asset?.videoTensorSha256 } : {}),
      ...(candidate.audioTensorSha256 ?? candidate.asset?.audioTensorSha256 ? { audioTensorSha256: candidate.audioTensorSha256 ?? candidate.asset?.audioTensorSha256 } : {}),
      ...(reason ? { reason } : {})
    };
  });
}

/**
 * Return a non-destructive deletion decision.  The caller must still require
 * an explicit user action before deleting anything; Continuum owners are
 * never eligible through this policy.
 */
export function planH3AvGc(
  asset: H3AvLatentAsset,
  target: "owner" | "alias",
  context: H3AvGcPolicyContext = {}
): H3AvGcDecision {
  const reasons: string[] = [];
  const referencedBy = context.referencedBy ?? [];
  if (referencedBy.length) reasons.push(`仍被引用：${referencedBy.join(", ")}`);
  if (context.queuedOrRunning) reasons.push("存在 queued/running task snapshot");
  if (context.currentCanonical) reasons.push("仍是当前 canonical branch head");
  if (target === "owner" && (context.ownerInRunStorage ?? asset.storageKind === "continuum-run-chunk")) {
    reasons.push("Run Storage owner 必须由 Continuum manifest/revision 整体管理");
  }
  if (target === "alias" && !asset.aliasPaths?.length) reasons.push("asset 没有可删除的 app alias");
  if (target === "alias" && !context.allowAliasDeletion) reasons.push("alias 删除需要显式 GC 操作");
  if (target === "owner" && !context.unselectedTake) reasons.push("owner 不是明确未选 Take 的 latent");
  if (target === "owner" && !context.allowUnselectedTakeLatentDeletion) reasons.push("未授权删除未选 Take latent");
  return {
    target,
    assetId: asset.assetId,
    eligible: reasons.length === 0,
    reasons
  };
}
