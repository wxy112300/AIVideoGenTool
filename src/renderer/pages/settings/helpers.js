export function directoryComparisonKey(value) {
    return value.trim().replace(/[\\/]+$/u, "").toLowerCase();
}
