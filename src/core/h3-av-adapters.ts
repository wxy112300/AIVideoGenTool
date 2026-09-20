import type {
  H3AvCapability,
  H3AvConsumerAdapter,
  H3AvLatentAsset,
  H3AvStorageKind,
  HistoryFile
} from "../types.js";
import {
  isH3AvLatentAsset,
  safeH3OutputRelativePath
} from "./h3-av-asset.js";

export type H3AvAdapterTransport =
  | "nested-video-audio-tensors"
  | "plain-video-audio-wrapper"
  | "legacy-bootstrap-boundary"
  | "run-storage-chunk";

export interface H3AvAdapterView {
  adapter: H3AvConsumerAdapter;
  assetId: string;
  storageKind: H3AvStorageKind;
  capability: H3AvCapability;
  /** The path presented to the consumer-specific loader. */
  payloadPath: HistoryFile;
  /** The physical owner remains the Continuum file for managed assets. */
  ownerPath: HistoryFile;
  transport: H3AvAdapterTransport;
  officialRunStorage: boolean;
  /** 1 for a shared owner/hardlink alias; 2 when copy fallback was recorded. */
  physicalPayloadCount: 1 | 2;
}

function requiredCapability(adapter: H3AvConsumerAdapter): H3AvCapability {
  switch (adapter) {
    case "native-joint-av": return "native-av";
    case "motion-context": return "motion-context";
    case "legacy-continuum": return "continuum-bootstrap";
    case "managed-continuum": return "continuum-managed-chunk";
  }
}

function transportFor(adapter: H3AvConsumerAdapter): H3AvAdapterTransport {
  switch (adapter) {
    case "native-joint-av": return "nested-video-audio-tensors";
    case "motion-context": return "plain-video-audio-wrapper";
    case "legacy-continuum": return "legacy-bootstrap-boundary";
    case "managed-continuum": return "run-storage-chunk";
  }
}

function validatePath(file: HistoryFile, label: string): void {
  if (!safeH3OutputRelativePath(file)) throw new Error(`${label} 不是安全的 output-root 相对路径`);
}

/**
 * Build the protocol-specific view over one canonical AV asset.
 *
 * This function intentionally does not convert tensors, write files, or
 * invent a Run Storage manifest.  It only chooses the safe owner/alias path
 * and records which consumer contract is being requested.
 */
export function adaptH3AvAsset(
  asset: H3AvLatentAsset,
  adapter: H3AvConsumerAdapter
): H3AvAdapterView {
  if (!isH3AvLatentAsset(asset)) throw new Error("H3 AV asset 未通过 canonical 校验");
  const capability = requiredCapability(adapter);
  const canonicalMotionCompatibility = adapter === "motion-context" &&
    asset.storageKind === "app-canonical" &&
    asset.capabilities.includes("native-av");
  if (!asset.capabilities.includes(capability) && !canonicalMotionCompatibility) {
    throw new Error(`H3 AV asset ${asset.assetId} 不具备 ${adapter} adapter 所需的 ${capability} capability`);
  }
  if (adapter === "managed-continuum" && asset.storageKind !== "continuum-run-chunk") {
    throw new Error("只有 Continuum Run Storage owner 才能进入 managed-continuum adapter");
  }
  if (adapter === "legacy-continuum" && asset.storageKind === "continuum-run-chunk") {
    throw new Error("官方 Run Storage chunk 不得降级伪装为 legacy Continuum bootstrap");
  }
  if (adapter !== "managed-continuum" && asset.storageKind === "continuum-run-chunk" &&
      adapter !== "native-joint-av" && adapter !== "motion-context") {
    throw new Error("Continuum Run Storage chunk 只能由明确的 managed/native/motion adapter 消费");
  }
  validatePath(asset.ownerPath, "H3 AV ownerPath");
  const alias = asset.aliasPaths?.find((candidate) => safeH3OutputRelativePath(candidate));
  const payloadPath = adapter === "managed-continuum" || adapter === "motion-context"
    ? asset.ownerPath
    : (alias ?? asset.ownerPath);
  validatePath(payloadPath, "H3 AV adapter payloadPath");
  const physicalPayloadCount = asset.aliasMode === "copy-fallback" ? 2 : 1;
  return {
    adapter,
    assetId: asset.assetId,
    storageKind: asset.storageKind,
    capability,
    payloadPath,
    ownerPath: asset.ownerPath,
    transport: transportFor(adapter),
    officialRunStorage: asset.storageKind === "continuum-run-chunk",
    physicalPayloadCount
  };
}

