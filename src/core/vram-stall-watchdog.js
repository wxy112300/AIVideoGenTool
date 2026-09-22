/**
 * Pure detector for a task that is still technically busy but has stopped
 * making productive progress while the host is under memory pressure.
 *
 * This module deliberately has no timers, process calls, queue mutations, or
 * renderer dependencies. The Electron sampler owns I/O and feeds timestamped
 * events into this state machine.
 */
export const VRAM_STALL_WATCHDOG_MINUTES = [0, 1, 5, 10, 15];
/** Named constants are intentionally not user settings. */
export const VRAM_STALL_WATCHDOG_TUNING = {
    baselineWarmupMs: 30_000,
    pressureHysteresisMs: 60_000,
    maxClockJumpMs: 120_000,
    pressureSampleQuorum: 0.75,
    minimumPressureSamples: 3,
    dedicatedVramWarningMiB: 1_024,
    dedicatedVramMonitoringMiB: 800,
    sharedRelativeIncrease: 0.35,
    sharedMadMultiplier: 4,
    sharedHostRatio: 0.01,
    hostAvailableRatio: 0.1,
    hostCommitRatio: 0.9,
    pageMadMultiplier: 4,
    pageRelativeIncrease: 2,
    latencyRelativeIncrease: 2,
    latencyMadMultiplier: 4,
    latencyAbsoluteIncreaseMs: 100,
    gpuActivityPercent: 10,
    maxBaselineSamples: 120
};
const MEMORY_FAMILIES = [
    "wddm-memory",
    "dedicated-vram",
    "shared-gpu-memory",
    "host-memory"
];
const emptyMetric = () => ({ values: [] });
function emptyBaseline() {
    return {
        ready: false,
        sampleCount: 0,
        sharedGpuMemoryBytes: emptyMetric(),
        hostAvailableBytes: emptyMetric(),
        hostCommittedRatio: emptyMetric(),
        pageActivityPerSec: emptyMetric(),
        samplerTickLatenessMs: emptyMetric(),
        nvidiaSmiDurationMs: emptyMetric(),
        counterReadDurationMs: emptyMetric(),
        comfyRoundTripMs: emptyMetric()
    };
}
export function createVramStallWatchdogState(policy, atMs = 0, attempt = 0) {
    const enabled = policy.enabledMinutes !== 0;
    return {
        status: enabled ? "observing" : "disabled",
        attempt: Math.max(0, Number.isInteger(attempt) ? attempt : 0),
        ...(enabled ? {
            observationStartedAtMs: atMs,
            lastProductiveProgressAtMs: atMs
        } : {}),
        maxSampleGapMs: 0,
        telemetryGapCount: 0,
        lastTelemetryMissing: [],
        baseline: emptyBaseline(),
        pressureSamples: [],
        triggerIssued: false
    };
}
function finiteNonNegative(value) {
    return value !== undefined && Number.isFinite(value) && value >= 0 ? value : undefined;
}
function median(values) {
    if (values.length === 0)
        return undefined;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle];
}
function metricWithStats(metric) {
    const metricMedian = median(metric.values);
    if (metricMedian === undefined)
        return { ...metric };
    const mad = median(metric.values.map((value) => Math.abs(value - metricMedian))) ?? 0;
    return { ...metric, median: metricMedian, mad };
}
function pushMetric(metric, value) {
    if (value === undefined)
        return metric;
    const values = [...metric.values, value].slice(-VRAM_STALL_WATCHDOG_TUNING.maxBaselineSamples);
    return metricWithStats({ values });
}
function committedRatio(sample) {
    const committed = finiteNonNegative(sample.hostMemory?.committedBytes);
    const limit = finiteNonNegative(sample.hostMemory?.commitLimitBytes);
    return committed !== undefined && limit !== undefined && limit > 0
        ? committed / limit
        : undefined;
}
function pageActivity(sample) {
    const values = [
        sample.hostMemory?.pagesInputPerSec,
        sample.hostMemory?.pagesOutputPerSec,
        sample.hostMemory?.hardFaultsPerSec
    ].map(finiteNonNegative).filter((value) => value !== undefined);
    return values.length ? Math.max(...values) : undefined;
}
function dedicatedVramRemainingMiB(sample) {
    const explicitRemaining = finiteNonNegative(sample.vram?.remainingMiB);
    if (explicitRemaining !== undefined)
        return explicitRemaining;
    const used = finiteNonNegative(sample.vram?.usedMiB);
    const total = finiteNonNegative(sample.vram?.totalMiB);
    return used !== undefined && total !== undefined && total >= used
        ? total - used
        : undefined;
}
function baselineHasSamples(baseline) {
    return baseline.sampleCount >= 3 && baseline.ready;
}
function relativeOrRobustIncrease(value, metric, relativeIncrease, madMultiplier, absoluteFloor) {
    if (metric.median === undefined)
        return false;
    const robustDelta = Math.max(metric.median * relativeIncrease, (metric.mad ?? 0) * madMultiplier, absoluteFloor);
    return value >= metric.median + robustDelta;
}
function latencyIncreased(value, metric) {
    return relativeOrRobustIncrease(value, metric, VRAM_STALL_WATCHDOG_TUNING.latencyRelativeIncrease, VRAM_STALL_WATCHDOG_TUNING.latencyMadMultiplier, VRAM_STALL_WATCHDOG_TUNING.latencyAbsoluteIncreaseMs);
}
function deriveEvidence(sample, baseline) {
    const families = [];
    const memoryFamilies = [];
    const missing = [];
    const dedicatedRemainingMiB = dedicatedVramRemainingMiB(sample);
    if (dedicatedRemainingMiB !== undefined &&
        dedicatedRemainingMiB < VRAM_STALL_WATCHDOG_TUNING.dedicatedVramMonitoringMiB) {
        families.push("dedicated-vram");
        memoryFamilies.push("dedicated-vram");
    }
    else if (dedicatedRemainingMiB === undefined) {
        missing.push("dedicated-vram");
    }
    const wddmCurrent = finiteNonNegative(sample.wddm?.currentUsageMiB);
    const wddmBudget = finiteNonNegative(sample.wddm?.budgetMiB);
    if (wddmCurrent !== undefined && wddmBudget !== undefined && wddmBudget > 0) {
        if (wddmCurrent >= wddmBudget) {
            families.push("wddm-memory");
            memoryFamilies.push("wddm-memory");
        }
    }
    else {
        missing.push("wddm-budget");
    }
    const shared = finiteNonNegative(sample.sharedGpuMemoryBytes);
    if (shared !== undefined && baseline.sharedGpuMemoryBytes.median !== undefined) {
        const hostTotal = finiteNonNegative(sample.hostMemory?.totalBytes);
        const absoluteFloor = hostTotal === undefined
            ? 0
            : hostTotal * VRAM_STALL_WATCHDOG_TUNING.sharedHostRatio;
        if (relativeOrRobustIncrease(shared, baseline.sharedGpuMemoryBytes, VRAM_STALL_WATCHDOG_TUNING.sharedRelativeIncrease, VRAM_STALL_WATCHDOG_TUNING.sharedMadMultiplier, absoluteFloor)) {
            families.push("shared-gpu-memory");
            memoryFamilies.push("shared-gpu-memory");
        }
    }
    else {
        missing.push("shared-gpu-memory");
    }
    const host = sample.hostMemory;
    const total = finiteNonNegative(host?.totalBytes);
    const available = finiteNonNegative(host?.availableBytes);
    const commit = committedRatio(sample);
    const pages = pageActivity(sample);
    let hostPressureCount = 0;
    if (total !== undefined && available !== undefined && total > 0 &&
        available / total <= VRAM_STALL_WATCHDOG_TUNING.hostAvailableRatio) {
        hostPressureCount += 1;
    }
    else if (total === undefined || available === undefined) {
        missing.push("host-available");
    }
    if (commit !== undefined && commit >= VRAM_STALL_WATCHDOG_TUNING.hostCommitRatio) {
        hostPressureCount += 1;
    }
    else if (commit === undefined) {
        missing.push("host-commit");
    }
    if (pages !== undefined && baseline.pageActivityPerSec.median !== undefined &&
        relativeOrRobustIncrease(pages, baseline.pageActivityPerSec, VRAM_STALL_WATCHDOG_TUNING.pageRelativeIncrease, VRAM_STALL_WATCHDOG_TUNING.pageMadMultiplier, 0)) {
        hostPressureCount += 1;
    }
    else if (pages === undefined) {
        missing.push("page-activity");
    }
    if (hostPressureCount >= 2) {
        families.push("host-memory");
        memoryFamilies.push("host-memory");
    }
    const latencyValues = [
        ["samplerTickLatenessMs", finiteNonNegative(sample.latency?.samplerTickLatenessMs), baseline.samplerTickLatenessMs],
        ["nvidiaSmiDurationMs", finiteNonNegative(sample.latency?.nvidiaSmiDurationMs), baseline.nvidiaSmiDurationMs],
        ["counterReadDurationMs", finiteNonNegative(sample.latency?.counterReadDurationMs), baseline.counterReadDurationMs],
        ["comfyRoundTripMs", finiteNonNegative(sample.latency?.comfyRoundTripMs), baseline.comfyRoundTripMs]
    ];
    const latencyPressureCount = latencyValues.filter(([, value, metric]) => value !== undefined && latencyIncreased(value, metric)).length;
    if (latencyPressureCount >= 2) {
        families.push("latency");
    }
    if (latencyValues.every(([, value]) => value === undefined))
        missing.push("latency");
    const gpuUtilization = finiteNonNegative(sample.gpuUtilization);
    if (gpuUtilization !== undefined &&
        gpuUtilization >= VRAM_STALL_WATCHDOG_TUNING.gpuActivityPercent) {
        families.push("gpu-activity");
    }
    else if (gpuUtilization === undefined) {
        missing.push("gpu-utilization");
    }
    const uniqueFamilies = [...new Set(families)];
    const uniqueMemoryFamilies = [...new Set(memoryFamilies)];
    return {
        families: uniqueFamilies,
        memoryFamilies: uniqueMemoryFamilies,
        missing,
        valid: uniqueFamilies.length > 0 || missing.length < 6,
        // Direct dedicated-VRAM headroom is a sufficient memory-pressure
        // signal; shared/host families retain the composite quorum rule.
        qualifies: uniqueMemoryFamilies.length > 0 &&
            (uniqueMemoryFamilies.includes("dedicated-vram") || uniqueFamilies.length >= 2)
    };
}
function addBaselineSample(baseline, sample, atMs, warmupMs, observationStartedAtMs) {
    const next = { ...baseline };
    const hostAvailable = finiteNonNegative(sample.hostMemory?.availableBytes);
    const hostCommit = committedRatio(sample);
    const pages = pageActivity(sample);
    next.startedAtMs ??= observationStartedAtMs;
    next.sampleCount += 1;
    next.sharedGpuMemoryBytes = pushMetric(next.sharedGpuMemoryBytes, finiteNonNegative(sample.sharedGpuMemoryBytes));
    next.hostAvailableBytes = pushMetric(next.hostAvailableBytes, hostAvailable);
    next.hostCommittedRatio = pushMetric(next.hostCommittedRatio, hostCommit);
    next.pageActivityPerSec = pushMetric(next.pageActivityPerSec, pages);
    next.samplerTickLatenessMs = pushMetric(next.samplerTickLatenessMs, finiteNonNegative(sample.latency?.samplerTickLatenessMs));
    next.nvidiaSmiDurationMs = pushMetric(next.nvidiaSmiDurationMs, finiteNonNegative(sample.latency?.nvidiaSmiDurationMs));
    next.counterReadDurationMs = pushMetric(next.counterReadDurationMs, finiteNonNegative(sample.latency?.counterReadDurationMs));
    next.comfyRoundTripMs = pushMetric(next.comfyRoundTripMs, finiteNonNegative(sample.latency?.comfyRoundTripMs));
    if (atMs - observationStartedAtMs >= warmupMs && next.sampleCount >= 3) {
        next.ready = true;
    }
    return next;
}
function clearCandidate(state, status = "observing") {
    return {
        ...state,
        status,
        suspectSinceMs: undefined,
        healthySinceMs: undefined,
        triggeredAtMs: status === "observing" ? undefined : state.triggeredAtMs,
        pressureSamples: [],
        triggerIssued: status === "observing" ? false : state.triggerIssued
    };
}
function telemetryGap(state, missing, sampleAtMs) {
    const next = clearCandidate(state);
    next.telemetryGapCount += 1;
    next.lastTelemetryMissing = [...new Set(missing)];
    if (sampleAtMs !== undefined && next.lastSampleAtMs !== undefined) {
        next.maxSampleGapMs = Math.max(next.maxSampleGapMs, sampleAtMs - next.lastSampleAtMs);
    }
    if (sampleAtMs !== undefined)
        next.lastSampleAtMs = sampleAtMs;
    return {
        state: next,
        action: "telemetry-gap",
        reason: `显存压力 watchdog 遥测断档：${next.lastTelemetryMissing.join("、") || "未知"}`
    };
}
function progressIsProductive(state, event) {
    const previous = state.progress;
    if (event.type === "active-node") {
        const nodeChanged = event.activeNodeChanged === true ||
            event.nodeId === undefined ||
            event.nodeId !== previous?.nodeId;
        if (!nodeChanged)
            return { productive: false, progress: previous };
        return {
            productive: true,
            progress: {
                ...previous,
                ...(event.nodeId !== undefined ? { nodeId: event.nodeId } : {})
            }
        };
    }
    if (event.type === "executed" || event.activeNodeChanged || event.executed) {
        return {
            productive: true,
            progress: {
                ...previous,
                ...(event.nodeId !== undefined ? { nodeId: event.nodeId } : {})
            }
        };
    }
    if (event.type === "checkpoint" || event.checkpoint !== undefined) {
        const checkpoint = event.checkpoint;
        if (checkpoint !== undefined && checkpoint !== previous?.checkpoint) {
            return { productive: true, progress: { ...previous, checkpoint } };
        }
    }
    if (event.previewSequence !== undefined &&
        Number.isFinite(event.previewSequence) &&
        event.previewSequence > (previous?.previewSequence ?? -1)) {
        return {
            productive: true,
            progress: { ...previous, previewSequence: event.previewSequence }
        };
    }
    if (event.value !== undefined && Number.isFinite(event.value)) {
        const ratio = event.max !== undefined && Number.isFinite(event.max) && event.max > 0
            ? Math.max(0, Math.min(1, event.value / event.max))
            : undefined;
        const sameNode = event.nodeId === undefined || event.nodeId === previous?.nodeId;
        const sameUnit = event.unit === undefined || event.unit === previous?.unit;
        const previousValue = sameNode && sameUnit ? previous?.value : undefined;
        const movedForward = previousValue === undefined || event.value > previousValue;
        if (movedForward) {
            return {
                productive: true,
                progress: {
                    ...previous,
                    ...(event.nodeId !== undefined ? { nodeId: event.nodeId } : {}),
                    ...(ratio !== undefined ? { ratio } : {}),
                    ...(event.unit !== undefined ? { unit: event.unit } : {}),
                    value: event.value
                }
            };
        }
    }
    return { productive: false, progress: previous };
}
function policyWindowMs(policy) {
    return policy.windowMs ?? policy.enabledMinutes * 60_000;
}
function normalizeState(state, policy, atMs) {
    if (state) {
        return {
            ...state,
            lastTelemetryMissing: [...state.lastTelemetryMissing],
            baseline: {
                ...state.baseline,
                sharedGpuMemoryBytes: { ...state.baseline.sharedGpuMemoryBytes, values: [...state.baseline.sharedGpuMemoryBytes.values] },
                hostAvailableBytes: { ...state.baseline.hostAvailableBytes, values: [...state.baseline.hostAvailableBytes.values] },
                hostCommittedRatio: { ...state.baseline.hostCommittedRatio, values: [...state.baseline.hostCommittedRatio.values] },
                pageActivityPerSec: { ...state.baseline.pageActivityPerSec, values: [...state.baseline.pageActivityPerSec.values] },
                samplerTickLatenessMs: { ...state.baseline.samplerTickLatenessMs, values: [...state.baseline.samplerTickLatenessMs.values] },
                nvidiaSmiDurationMs: { ...state.baseline.nvidiaSmiDurationMs, values: [...state.baseline.nvidiaSmiDurationMs.values] },
                counterReadDurationMs: { ...state.baseline.counterReadDurationMs, values: [...state.baseline.counterReadDurationMs.values] },
                comfyRoundTripMs: { ...state.baseline.comfyRoundTripMs, values: [...state.baseline.comfyRoundTripMs.values] }
            },
            pressureSamples: state.pressureSamples.map((sample) => ({
                ...sample,
                families: [...sample.families],
                memoryFamilies: [...sample.memoryFamilies]
            })),
            progress: state.progress ? { ...state.progress } : undefined
        };
    }
    return createVramStallWatchdogState(policy, atMs);
}
export function evaluateVramStallWatchdog(inputState, event, policy) {
    const eventAtMs = event.type === "sample" ? event.sample.sampledAtMs : event.atMs;
    let state = normalizeState(inputState, policy, eventAtMs);
    if (policy.enabledMinutes === 0) {
        return {
            state: clearCandidate({ ...state, status: "disabled" }, "disabled"),
            action: "none"
        };
    }
    if (event.type === "start") {
        return {
            state: {
                ...createVramStallWatchdogState(policy, event.atMs, event.attempt ?? state.attempt),
                adapterId: policy.adapterId ?? event.adapterId
            },
            action: "none"
        };
    }
    if (state.status === "disabled") {
        state = {
            ...createVramStallWatchdogState(policy, eventAtMs, state.attempt),
            adapterId: policy.adapterId ?? state.adapterId
        };
    }
    if (event.type === "stop") {
        return { state: clearCandidate({ ...state, status: "disabled" }, "disabled"), action: "none" };
    }
    if (event.type === "recovering") {
        return {
            state: { ...clearCandidate(state, "recovering"), triggeredAtMs: state.triggeredAtMs },
            action: "recovering"
        };
    }
    if (event.type === "recovered") {
        if (event.retryAvailable === false) {
            return {
                state: { ...clearCandidate(state), status: "exhausted", triggerIssued: true },
                action: "exhausted",
                reason: "显存压力 watchdog 恢复后已无可用重试额度"
            };
        }
        const recovered = createVramStallWatchdogState(policy, event.atMs, event.nextAttempt ?? state.attempt + 1);
        return {
            state: { ...recovered, adapterId: policy.adapterId ?? state.adapterId },
            action: "recovered"
        };
    }
    if (event.type === "exhausted") {
        return {
            state: { ...clearCandidate(state), status: "exhausted", triggerIssued: true },
            action: "exhausted",
            reason: "显存压力 watchdog 重试已耗尽"
        };
    }
    if (event.type === "progress" || event.type === "productive-progress" ||
        event.type === "active-node" || event.type === "executed" || event.type === "checkpoint") {
        const progress = progressIsProductive(state, event);
        if (!progress.productive || state.status === "triggered" || state.status === "recovering" || state.status === "exhausted") {
            return { state, action: "none" };
        }
        return {
            state: {
                ...clearCandidate(state),
                lastProductiveProgressAtMs: event.atMs,
                lastTelemetryMissing: [],
                progress: progress.progress
            },
            action: state.status === "suspect" ? "suspect-cleared" : "none",
            reason: "收到新的生产性进展"
        };
    }
    if (event.type !== "sample")
        return { state, action: "none" };
    const sample = event.sample;
    if (!Number.isFinite(sample.sampledAtMs)) {
        return telemetryGap(state, ["sample-time"], undefined);
    }
    if (state.status === "triggered" || state.status === "recovering" || state.status === "exhausted") {
        return { state, action: "none" };
    }
    const expectedAdapter = policy.adapterId ?? state.adapterId;
    if (expectedAdapter !== undefined && sample.adapterId !== expectedAdapter) {
        return telemetryGap(state, ["non-target-adapter"], sample.sampledAtMs);
    }
    if (state.lastSampleAtMs !== undefined) {
        const delta = sample.sampledAtMs - state.lastSampleAtMs;
        if (delta <= 0)
            return telemetryGap(state, ["out-of-order-sample"], sample.sampledAtMs);
        const maxClockJumpMs = policy.maxClockJumpMs ?? VRAM_STALL_WATCHDOG_TUNING.maxClockJumpMs;
        if (delta > maxClockJumpMs)
            return telemetryGap(state, ["clock-jump-or-sleep"], sample.sampledAtMs);
        state.maxSampleGapMs = Math.max(state.maxSampleGapMs, delta);
    }
    state.lastSampleAtMs = sample.sampledAtMs;
    const observationStartedAtMs = state.observationStartedAtMs ?? sample.sampledAtMs;
    const warmupMs = policy.baselineWarmupMs ?? VRAM_STALL_WATCHDOG_TUNING.baselineWarmupMs;
    const evidenceBeforeBaseline = deriveEvidence(sample, state.baseline);
    const inWarmup = sample.sampledAtMs - observationStartedAtMs < warmupMs;
    if (!state.baseline.ready || inWarmup) {
        // Do not contaminate the healthy baseline with an explicit WDDM over-budget
        // sample. Relative families still require a ready baseline before they can
        // participate in a trigger.
        if (!evidenceBeforeBaseline.families.includes("wddm-memory") &&
            !evidenceBeforeBaseline.families.includes("host-memory")) {
            state.baseline = addBaselineSample(state.baseline, sample, sample.sampledAtMs, warmupMs, observationStartedAtMs);
        }
    }
    const evidence = deriveEvidence(sample, state.baseline);
    const missing = evidence.missing;
    if (!evidence.valid)
        return telemetryGap(state, missing, sample.sampledAtMs);
    const noProgress = state.lastProductiveProgressAtMs !== undefined &&
        sample.sampledAtMs >= state.lastProductiveProgressAtMs;
    const directDedicatedPressure = evidence.memoryFamilies.includes("dedicated-vram");
    if ((!baselineHasSamples(state.baseline) && !directDedicatedPressure) || !noProgress) {
        return { state: { ...state, lastTelemetryMissing: missing }, action: "none", evidence };
    }
    const pressureRecord = {
        sampledAtMs: sample.sampledAtMs,
        qualifies: evidence.qualifies,
        families: evidence.families,
        memoryFamilies: evidence.memoryFamilies
    };
    if (state.status === "observing") {
        if (!evidence.qualifies) {
            return { state: { ...state, lastTelemetryMissing: missing }, action: "none", evidence };
        }
        const suspect = {
            ...state,
            status: "suspect",
            suspectSinceMs: sample.sampledAtMs,
            healthySinceMs: undefined,
            pressureSamples: [pressureRecord],
            lastTelemetryMissing: missing
        };
        return {
            state: suspect,
            action: "suspect-started",
            evidence,
            reason: `无生产性进展且检测到压力证据：${evidence.families.join("、")}`
        };
    }
    if (state.status !== "suspect" || state.suspectSinceMs === undefined) {
        return { state: { ...state, lastTelemetryMissing: missing }, action: "none", evidence };
    }
    const pressureSamples = [...state.pressureSamples, pressureRecord].filter((record) => record.sampledAtMs >= state.suspectSinceMs);
    if (!evidence.qualifies) {
        const healthySince = state.healthySinceMs ?? sample.sampledAtMs;
        const hysteresisMs = policy.pressureHysteresisMs ?? VRAM_STALL_WATCHDOG_TUNING.pressureHysteresisMs;
        if (sample.sampledAtMs - healthySince >= hysteresisMs) {
            return {
                state: { ...clearCandidate({ ...state, healthySinceMs: healthySince }), lastTelemetryMissing: missing },
                action: "suspect-cleared",
                evidence,
                reason: "压力证据恢复健康并完成 hysteresis"
            };
        }
        return {
            state: { ...state, healthySinceMs: healthySince, pressureSamples, lastTelemetryMissing: missing },
            action: "none",
            evidence
        };
    }
    const windowMs = policyWindowMs(policy);
    const validSamples = pressureSamples.filter((record) => record.sampledAtMs >= sample.sampledAtMs - windowMs);
    const pressureCount = validSamples.filter((record) => record.qualifies).length;
    const quorum = policy.pressureSampleQuorum ?? VRAM_STALL_WATCHDOG_TUNING.pressureSampleQuorum;
    const minimumSamples = policy.minimumPressureSamples ?? VRAM_STALL_WATCHDOG_TUNING.minimumPressureSamples;
    const sustained = sample.sampledAtMs - state.suspectSinceMs >= windowMs &&
        validSamples.length >= minimumSamples &&
        pressureCount / validSamples.length >= quorum;
    if (sustained && !state.triggerIssued) {
        return {
            state: {
                ...state,
                status: "triggered",
                triggeredAtMs: sample.sampledAtMs,
                healthySinceMs: undefined,
                pressureSamples: validSamples,
                triggerIssued: true,
                lastTelemetryMissing: missing
            },
            action: "triggered",
            evidence,
            reason: `显存压力卡死保护触发：${Math.round((sample.sampledAtMs - (state.lastProductiveProgressAtMs ?? sample.sampledAtMs)) / 1000)} 秒无进展，${pressureCount}/${validSamples.length} 个有效样本满足复合压力条件`
        };
    }
    return {
        state: {
            ...state,
            pressureSamples: validSamples,
            healthySinceMs: undefined,
            lastTelemetryMissing: missing
        },
        action: "none",
        evidence
    };
}
export function replayVramStallWatchdogTrace(events, policy, initialState) {
    const firstEvent = events[0];
    const firstEventAtMs = firstEvent === undefined
        ? 0
        : firstEvent.type === "sample" ? firstEvent.sample.sampledAtMs : firstEvent.atMs;
    let state = initialState ??
        createVramStallWatchdogState(policy, firstEventAtMs);
    const evaluations = [];
    for (const event of events) {
        const evaluation = evaluateVramStallWatchdog(state, event, policy);
        state = evaluation.state;
        evaluations.push(evaluation);
    }
    return {
        state,
        evaluations,
        triggerCount: evaluations.filter((evaluation) => evaluation.action === "triggered").length
    };
}
