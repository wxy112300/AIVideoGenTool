import type { PromptVersion } from "../types.js";

export type PromptHistoryScope = "video" | "image";

export interface PromptHistorySnapshot {
  promptVersions: PromptVersion[];
  activePromptVersion: number;
}

interface PromptHistoryEntry {
  before: PromptHistorySnapshot;
  after: PromptHistorySnapshot;
}

interface PromptHistoryState {
  undo: PromptHistoryEntry[];
  redo: PromptHistoryEntry[];
  applicationUndoArmed: boolean;
  applicationRedoArmed: boolean;
}

function cloneSnapshot(snapshot: PromptHistorySnapshot): PromptHistorySnapshot {
  return {
    promptVersions: snapshot.promptVersions.map((version) => ({ ...version })),
    activePromptVersion: snapshot.activePromptVersion
  };
}

function createHistoryState(): PromptHistoryState {
  return {
    undo: [],
    redo: [],
    applicationUndoArmed: false,
    applicationRedoArmed: false
  };
}

export class PromptEditHistory {
  private readonly histories: Record<PromptHistoryScope, PromptHistoryState> = {
    video: createHistoryState(),
    image: createHistoryState()
  };

  record(
    scope: PromptHistoryScope,
    before: PromptHistorySnapshot,
    after: PromptHistorySnapshot
  ): void {
    const history = this.histories[scope];
    history.undo.push({
      before: cloneSnapshot(before),
      after: cloneSnapshot(after)
    });
    history.redo = [];
    history.applicationUndoArmed = true;
    history.applicationRedoArmed = false;
  }

  invalidate(scope: PromptHistoryScope): void {
    const history = this.histories[scope];
    history.undo = [];
    history.redo = [];
    history.applicationUndoArmed = false;
    history.applicationRedoArmed = false;
  }

  undo(scope: PromptHistoryScope): PromptHistorySnapshot | undefined {
    const history = this.histories[scope];
    if (!history.applicationUndoArmed || !history.undo.length) return undefined;
    const entry = history.undo.pop()!;
    history.redo.push(entry);
    history.applicationUndoArmed = history.undo.length > 0;
    history.applicationRedoArmed = true;
    return cloneSnapshot(entry.before);
  }

  redo(scope: PromptHistoryScope): PromptHistorySnapshot | undefined {
    const history = this.histories[scope];
    if (!history.applicationRedoArmed || !history.redo.length) return undefined;
    const entry = history.redo.pop()!;
    history.undo.push(entry);
    history.applicationUndoArmed = true;
    history.applicationRedoArmed = history.redo.length > 0;
    return cloneSnapshot(entry.after);
  }
}
