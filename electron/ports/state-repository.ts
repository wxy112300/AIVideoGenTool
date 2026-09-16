import type { AppState, Settings } from "../../src/types.js";

export type StateMutator = (state: AppState) => void;

/**
 * The application-facing persistence boundary. Implementations own their
 * storage and serialization details; callers only see state snapshots and
 * serialized updates.
 */
export interface StateRepository {
  load(): Promise<AppState>;
  get(): AppState;
  getSettings(): Settings;
  update(mutator: StateMutator): Promise<AppState>;
  /** Persist a mutation without cloning the potentially large state for a caller that needs no snapshot. */
  updateWithoutSnapshot?(mutator: StateMutator): Promise<void>;
  /** Apply process-local live state; the owner must arrange a later durable flush. */
  mutateTransient?(mutator: StateMutator): void;
  /** Persist the current in-memory state without producing a snapshot. */
  flush?(): Promise<void>;
}
