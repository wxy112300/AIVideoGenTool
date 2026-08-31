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
}
