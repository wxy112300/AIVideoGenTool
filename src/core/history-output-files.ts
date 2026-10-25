import type { AssetVersion, HistoryFile } from "../types.js";

/** All saved output references, retaining aliases so metadata can be filled on each owner. */
export function historyVersionOutputFiles(version: AssetVersion): HistoryFile[] {
  const artifact = version.h3ContinuationData?.artifact;
  const av = version.h3AvAsset;
  const receipt = version.h3ContinuumReceipt;
  return [
    ...version.files,
    ...(artifact ? [artifact.payload, artifact.manifest] : []),
    ...(av ? [av.ownerPath, ...(av.aliasPaths ?? [])] : []),
    ...(av?.continuumChunk ? [av.continuumChunk.runStorageRoot, av.continuumChunk.manifest] : []),
    ...(receipt ? [receipt.runStorageRoot, ...receipt.chunkRecords.map((record) => record.payloadPath)] : [])
  ];
}
