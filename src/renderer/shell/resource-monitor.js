function percent(value) {
    return value == null || !Number.isFinite(value) ? "--" : `${Math.round(value)}%`;
}
function usage(used, total) {
    if (used == null || total == null || total <= 0)
        return "--/--";
    return `${(used / 1024 ** 3).toFixed(1)}/${(total / 1024 ** 3).toFixed(1)}G`;
}
function pressure(value) {
    if (value != null && value >= 90)
        return "critical";
    if (value != null && value >= 80)
        return "warning";
    return "normal";
}
export function resourceMonitorValues(metrics) {
    const memoryPercent = metrics && metrics.memoryTotalBytes > 0
        ? metrics.memoryUsedBytes / metrics.memoryTotalBytes * 100
        : null;
    const vramPercent = metrics?.vramUsedBytes != null && metrics.vramTotalBytes
        ? metrics.vramUsedBytes / metrics.vramTotalBytes * 100
        : null;
    return {
        cpu: percent(metrics?.cpuPercent),
        memory: percent(memoryPercent),
        memoryUsage: usage(metrics?.memoryUsedBytes, metrics?.memoryTotalBytes),
        gpu: percent(metrics?.gpuPercent),
        gpuTemperature: metrics?.gpuTemperature == null ? "" : `${Math.round(metrics.gpuTemperature)}°C`,
        vram: percent(vramPercent),
        vramUsage: usage(metrics?.vramUsedBytes, metrics?.vramTotalBytes),
        memoryPressure: pressure(memoryPercent),
        vramPressure: pressure(vramPercent)
    };
}
export function renderResourceMonitor(metrics, ariaLabel) {
    const value = resourceMonitorValues(metrics);
    return `<div class="topbar-resource-monitor" aria-label="${ariaLabel}" role="status">
    <span class="topbar-resource-item"><b>CPU</b><span data-resource-metric="cpu">${value.cpu}</span></span>
    <i class="resource-separator-after-cpu" aria-hidden="true"></i>
    <span class="topbar-resource-item topbar-resource-memory" data-resource-pressure="${value.memoryPressure}"><b>RAM</b><span data-resource-metric="memory">${value.memory}</span><small data-resource-metric="memoryUsage">${value.memoryUsage}</small></span>
    <i class="resource-separator-after-memory" aria-hidden="true"></i>
    <span class="topbar-resource-item topbar-resource-gpu"><b>GPU</b><span data-resource-metric="gpu">${value.gpu}</span><small data-resource-metric="gpuTemperature">${value.gpuTemperature}</small></span>
    <i class="resource-separator-after-gpu" aria-hidden="true"></i>
    <span class="topbar-resource-item topbar-resource-vram" data-resource-pressure="${value.vramPressure}"><b>VRAM</b><span data-resource-metric="vram">${value.vram}</span><small data-resource-metric="vramUsage">${value.vramUsage}</small></span>
  </div>`;
}
export function patchResourceMonitor(metrics) {
    const root = document.querySelector(".topbar-resource-monitor");
    if (!root)
        return;
    const value = resourceMonitorValues(metrics);
    for (const key of ["cpu", "memory", "memoryUsage", "gpu", "gpuTemperature", "vram", "vramUsage"]) {
        const target = root.querySelector(`[data-resource-metric="${key}"]`);
        if (target)
            target.textContent = value[key];
    }
    root.querySelector(".topbar-resource-memory")
        ?.setAttribute("data-resource-pressure", value.memoryPressure);
    root.querySelector(".topbar-resource-vram")
        ?.setAttribute("data-resource-pressure", value.vramPressure);
}
