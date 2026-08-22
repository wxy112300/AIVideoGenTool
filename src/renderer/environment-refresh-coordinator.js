export function environmentScanScopeForReason(reason) {
    if (reason === "service-change")
        return "runtime";
    if (reason === "dependency-change")
        return "dependencies";
    return "full";
}
export class EnvironmentRefreshCoordinator {
    dependencies;
    latestRequestId = 0;
    constructor(dependencies) {
        this.dependencies = dependencies;
    }
    async refresh(settings, reason = "manual") {
        const requestId = ++this.latestRequestId;
        this.dependencies.reportScan(reason);
        this.dependencies.setScanning(true);
        this.dependencies.setError("");
        this.dependencies.notify(this.dependencies.scanningMessage(), { durationMs: 300_000 });
        this.dependencies.requestRender();
        try {
            const scan = await this.dependencies.scan(settings, environmentScanScopeForReason(reason));
            if (requestId === this.latestRequestId) {
                this.dependencies.commit(scan);
                this.dependencies.afterCommit(scan);
                this.dependencies.notify(this.dependencies.completedMessage());
            }
            return scan;
        }
        catch (error) {
            if (requestId === this.latestRequestId) {
                const message = this.dependencies.failedMessage(error, reason);
                this.dependencies.setError(message);
                this.dependencies.notify(message, { kind: "error" });
            }
            return null;
        }
        finally {
            if (requestId === this.latestRequestId) {
                this.dependencies.setScanning(false);
                this.dependencies.requestRender();
            }
        }
    }
}
