import { createTranslator, type Translate } from "./i18n.js";
import { uiKeys } from "./i18n-keys.js";
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

function validatePath(file: HistoryFile, label: string, t: Translate): void {
  if (!safeH3OutputRelativePath(file)) throw new Error(t(uiKeys.h3Adapter.path, { label }));
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
  adapter: H3AvConsumerAdapter,
  t: Translate = createTranslator().t
): H3AvAdapterView {
  if (!isH3AvLatentAsset(asset)) throw new Error(t(uiKeys.h3Adapter.invalid));
  const capability = requiredCapability(adapter);
  const canonicalMotionCompatibility = adapter === "motion-context" &&
    asset.storageKind === "app-canonical" &&
    asset.capabilities.includes("native-av");
  if (!asset.capabilities.includes(capability) && !canonicalMotionCompatibility) {
    throw new Error(t(uiKeys.h3Adapter.capability, { id: asset.assetId, adapter, capability }));
  }
  if (adapter === "managed-continuum" && asset.storageKind !== "continuum-run-chunk") {
    throw new Error(t(uiKeys.h3Adapter.managedOwner));
  }
  if (adapter === "legacy-continuum" && asset.storageKind === "continuum-run-chunk") {
    throw new Error(t(uiKeys.h3Adapter.noDowngrade));
  }
  if (adapter !== "managed-continuum" && asset.storageKind === "continuum-run-chunk" &&
      adapter !== "native-joint-av" && adapter !== "motion-context") {
    throw new Error(t(uiKeys.h3Adapter.explicitAdapter));
  }
  validatePath(asset.ownerPath, "H3 AV ownerPath", t);
  const alias = asset.aliasPaths?.find((candidate) => safeH3OutputRelativePath(candidate));
  const payloadPath = adapter === "managed-continuum" || adapter === "motion-context"
    ? asset.ownerPath
    : (alias ?? asset.ownerPath);
  validatePath(payloadPath, "H3 AV adapter payloadPath", t);
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

