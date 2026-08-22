function cloneSnapshot(snapshot) {
    return {
        promptVersions: snapshot.promptVersions.map((version) => ({ ...version })),
        activePromptVersion: snapshot.activePromptVersion
    };
}
function createHistoryState() {
    return {
        undo: [],
        redo: [],
        applicationUndoArmed: false,
        applicationRedoArmed: false
    };
}
export class PromptEditHistory {
    histories = {
        video: createHistoryState(),
        image: createHistoryState()
    };
    record(scope, before, after) {
        const history = this.histories[scope];
        history.undo.push({
            before: cloneSnapshot(before),
            after: cloneSnapshot(after)
        });
        history.redo = [];
        history.applicationUndoArmed = true;
        history.applicationRedoArmed = false;
    }
    invalidate(scope) {
        const history = this.histories[scope];
        history.undo = [];
        history.redo = [];
        history.applicationUndoArmed = false;
        history.applicationRedoArmed = false;
    }
    undo(scope) {
        const history = this.histories[scope];
        if (!history.applicationUndoArmed || !history.undo.length)
            return undefined;
        const entry = history.undo.pop();
        history.redo.push(entry);
        history.applicationUndoArmed = history.undo.length > 0;
        history.applicationRedoArmed = true;
        return cloneSnapshot(entry.before);
    }
    redo(scope) {
        const history = this.histories[scope];
        if (!history.applicationRedoArmed || !history.redo.length)
            return undefined;
        const entry = history.redo.pop();
        history.undo.push(entry);
        history.applicationUndoArmed = true;
        history.applicationRedoArmed = history.redo.length > 0;
        return cloneSnapshot(entry.after);
    }
}
