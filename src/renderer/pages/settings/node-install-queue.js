export function customNodeIdsForBulkAction(nodes) {
    const eligible = nodes.filter((node) => node.bulkInstall !== false);
    const actionable = eligible.filter((node) => !node.installed || node.updateAvailable || node.runtimeRepairable);
    return actionable.map((node) => node.id);
}
export function customNodeBulkActionMode(nodes) {
    const actionable = nodes.filter((node) => node.bulkInstall !== false && (!node.installed || node.updateAvailable || node.runtimeRepairable));
    const hasMissing = actionable.some((node) => !node.installed);
    const hasUpdates = actionable.some((node) => node.installed && (node.updateAvailable || node.runtimeRepairable));
    if (hasMissing && hasUpdates)
        return "mixed";
    if (hasMissing)
        return "install";
    if (hasUpdates)
        return "update";
    return "none";
}
function cloneSettings(settings) {
    return structuredClone(settings);
}
export class CustomNodeInstallQueue {
    dependencies;
    queuedNodeIds = [];
    activeNodeId = "";
    phase = "idle";
    batchNodeIds = [];
    batchSettings = null;
    worker = null;
    constructor(dependencies) {
        this.dependencies = dependencies;
    }
    snapshot() {
        return {
            phase: this.phase,
            activeNodeId: this.activeNodeId,
            queuedNodeIds: [...this.queuedNodeIds],
            batchNodeIds: [...this.batchNodeIds]
        };
    }
    enqueue(nodeId, settings) {
        if (!nodeId || this.batchNodeIds.includes(nodeId)) {
            return { accepted: false, position: 0 };
        }
        if (this.phase === "restarting" || this.phase === "scanning") {
            return { accepted: false, position: 0 };
        }
        if (!this.batchSettings)
            this.batchSettings = cloneSettings(settings);
        this.queuedNodeIds.push(nodeId);
        this.batchNodeIds.push(nodeId);
        const position = (this.activeNodeId ? 1 : 0) + this.queuedNodeIds.length;
        this.appendLog(nodeId, this.dependencies.messages.queued(this.dependencies.nodeName(nodeId), position));
        this.emit();
        if (!this.worker) {
            this.worker = this.run().finally(() => {
                this.worker = null;
            });
        }
        return { accepted: true, position };
    }
    async waitForIdle() {
        await this.worker;
    }
    appendLog(nodeId, message) {
        this.dependencies.setLog(nodeId, [this.dependencies.getLog(nodeId), message].filter(Boolean).join("\n\n"));
    }
    emit() {
        this.dependencies.onSnapshot(this.snapshot());
    }
    async run() {
        const successfulNodeIds = [];
        const failedNodeIds = new Set();
        const settings = this.batchSettings;
        this.phase = "installing";
        this.emit();
        while (this.queuedNodeIds.length) {
            const nodeId = this.queuedNodeIds.shift();
            const name = this.dependencies.nodeName(nodeId);
            this.activeNodeId = nodeId;
            this.appendLog(nodeId, this.dependencies.messages.processing);
            this.emit();
            try {
                const result = await this.dependencies.install(nodeId, settings);
                this.appendLog(nodeId, result.log || result.message);
                if (!result.ok)
                    throw new Error(result.message);
                successfulNodeIds.push(nodeId);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                failedNodeIds.add(nodeId);
                this.appendLog(nodeId, message);
                this.dependencies.notify(this.dependencies.messages.installFailed(name, message), "error");
            }
        }
        this.activeNodeId = "";
        if (successfulNodeIds.length) {
            this.phase = "restarting";
            this.emit();
            const restarted = await this.dependencies.restart(settings).catch((error) => ({
                ok: false,
                message: error instanceof Error ? error.message : String(error)
            }));
            for (const nodeId of successfulNodeIds) {
                this.appendLog(nodeId, this.dependencies.messages.restartLog(restarted.message));
            }
            if (!restarted.ok) {
                if (restarted.manualRestartRequired) {
                    this.dependencies.notify(this.dependencies.messages.manualRestartRequired(restarted.message), "warning");
                }
                else {
                    successfulNodeIds.forEach((nodeId) => failedNodeIds.add(nodeId));
                    this.dependencies.notify(this.dependencies.messages.restartFailed(restarted.message), "error");
                }
            }
            else {
                this.phase = "scanning";
                this.emit();
                try {
                    const scan = await this.dependencies.scan(settings);
                    if (!scan) {
                        successfulNodeIds.forEach((nodeId) => failedNodeIds.add(nodeId));
                    }
                    else {
                        for (const nodeId of successfulNodeIds) {
                            const nodeStatus = scan.customNodes.find((node) => node.id === nodeId);
                            if (nodeStatus?.loaded)
                                continue;
                            const detail = nodeStatus?.loadError || nodeStatus?.compatibilityNotice || "";
                            const message = this.dependencies.messages.readyCheckFailed(this.dependencies.nodeName(nodeId), detail);
                            this.appendLog(nodeId, message);
                            this.dependencies.notify(message, "warning");
                        }
                    }
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    successfulNodeIds.forEach((nodeId) => failedNodeIds.add(nodeId));
                    this.dependencies.notify(message, "error");
                }
            }
        }
        const successCount = successfulNodeIds.filter((nodeId) => !failedNodeIds.has(nodeId)).length;
        const failureCount = failedNodeIds.size;
        this.dependencies.notify(this.dependencies.messages.completed(successCount, failureCount), failureCount ? "warning" : "info");
        this.phase = "idle";
        this.batchSettings = null;
        this.batchNodeIds.length = 0;
        this.emit();
    }
}
