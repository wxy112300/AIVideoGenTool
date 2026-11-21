import type { AppState, HistoryAsset, ImageHistoryProject, Settings, HistoryMetadataRecord, HistoryMetadataChange } from "../../src/types.js";

export type StateMutator = (state: AppState) => void;
export type WorkspaceState = Omit<AppState, "history" | "imageHistory">;
export type WorkspaceMutator = (state: WorkspaceState) => void;

/**
 * The application-facing persistence boundary. Implementations own their
 * storage and serialization details; callers only see state snapshots and
 * serialized updates.
 */
export interface StateRepository {
  load(): Promise<AppState>;
  get(): AppState;
  getSettings(): Settings;
  /** Narrow immutable media read; avoids cloning drafts, queue and the entire library per thumbnail. */
  getHistoryAsset?(id: string): HistoryAsset | undefined;
  update(mutator: StateMutator): Promise<AppState>;
  /** Persist workspace fields without traversing immutable history records. */
  updateWorkspace?(mutator: WorkspaceMutator): Promise<AppState>;
  updateWorkspaceWithoutSnapshot?(mutator: WorkspaceMutator): Promise<void>;
  /** Durable edits confined to selected history records; other records remain unchanged. */
  updateHistoryItems?(ids: readonly string[], mutator: (items: Array<HistoryAsset | ImageHistoryProject>) => void): Promise<AppState>;
  updateHistoryMetadata?(ids: readonly string[], mutator: (items: HistoryMetadataRecord[]) => void): Promise<HistoryMetadataChange[]>;
  /** Persist a mutation without cloning the potentially large state for a caller that needs no snapshot. */
  updateWithoutSnapshot?(mutator: StateMutator): Promise<void>;
  /** Apply process-local live state; the owner must arrange a later durable flush. */
  mutateTransient?(mutator: StateMutator): void;
  /** Persist the current in-memory state without producing a snapshot. */
  flush?(): Promise<void>;
  /** Checkpoint workspace fields without replacing live in-memory progress. */
  flushWorkspace?(): Promise<void>;
  /** Release storage writer leases after durable work has settled. */
  close?(): Promise<void>;
}
