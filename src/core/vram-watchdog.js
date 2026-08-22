const defaults = {
    hardReserveMiB: 768,
    predictionSeconds: 2,
    maxTrendReserveMiB: 2048,
    minimumGrowthMiBPerSecond: 64,
    smoothing: 0.5
};
export function evaluateVramPressure(state, sample, options = {}) {
    const hardReserveMiB = options.hardReserveMiB ?? defaults.hardReserveMiB;
    const predictionSeconds = options.predictionSeconds ?? defaults.predictionSeconds;
    const maxTrendReserveMiB = options.maxTrendReserveMiB ?? defaults.maxTrendReserveMiB;
    const minimumGrowthMiBPerSecond = options.minimumGrowthMiBPerSecond ?? defaults.minimumGrowthMiBPerSecond;
    const smoothing = options.smoothing ?? defaults.smoothing;
    const remainingMiB = sample.totalMiB - sample.usedMiB;
    let growthMiBPerSecond = state.growthMiBPerSecond ?? 0;
    let hasGrowthEstimate = state.growthMiBPerSecond !== undefined;
    if (state.previousSample) {
        const elapsedSeconds = (sample.sampledAtMs - state.previousSample.sampledAtMs) / 1000;
        if (elapsedSeconds > 0) {
            const instantaneousGrowth = Math.max(0, (sample.usedMiB - state.previousSample.usedMiB) / elapsedSeconds);
            growthMiBPerSecond =
                !hasGrowthEstimate
                    ? instantaneousGrowth
                    : smoothing * instantaneousGrowth +
                        (1 - smoothing) * growthMiBPerSecond;
            hasGrowthEstimate = true;
        }
    }
    const trendReserveMiB = growthMiBPerSecond >= minimumGrowthMiBPerSecond
        ? Math.min(maxTrendReserveMiB, growthMiBPerSecond * predictionSeconds)
        : 0;
    const requiredReserveMiB = hardReserveMiB + trendReserveMiB;
    const pressureExceeded = Number.isFinite(remainingMiB) && remainingMiB < requiredReserveMiB;
    return {
        state: {
            previousSample: sample,
            growthMiBPerSecond: hasGrowthEstimate ? growthMiBPerSecond : undefined
        },
        remainingMiB,
        requiredReserveMiB,
        growthMiBPerSecond,
        // VRAM sampling is telemetry only. Real CUDA OOM errors and sustained
        // ComfyUI inactivity are handled by the task runner.
        shouldAbort: false,
        reason: pressureExceeded
            ? trendReserveMiB > 0
                ? `显存仍以 ${Math.round(growthMiBPerSecond)} MiB/s 增长，剩余 ${Math.round(remainingMiB)} MiB 低于动态安全线 ${Math.round(requiredReserveMiB)} MiB`
                : `剩余显存 ${Math.round(remainingMiB)} MiB 低于硬安全线 ${Math.round(hardReserveMiB)} MiB`
            : undefined
    };
}
