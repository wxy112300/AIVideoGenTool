/**
 * Pick the resolution option that best preserves a source video's requested
 * short-edge resolution for the currently selected extension model.
 *
 * A history record may contain a resolution that the current model cannot
 * produce (for example, an older 1080p output). In that case the nearest
 * supported option is used; values above the supported range therefore land
 * on the highest available option and values below it land on the lowest.
 */
export function nearestSupportedVideoResolution(requested, supported, fallback) {
    const options = [...new Set(supported)]
        .filter((value) => Number.isFinite(value) && value > 0)
        .sort((left, right) => left - right);
    if (!options.length)
        return fallback;
    if (!Number.isFinite(requested) || requested <= 0) {
        return options.includes(fallback) ? fallback : options[0];
    }
    return options.reduce((best, candidate) => {
        const candidateDistance = Math.abs(candidate - requested);
        const bestDistance = Math.abs(best - requested);
        // Prefer the higher option on an exact tie so a source between two
        // buckets does not lose detail unnecessarily.
        return candidateDistance < bestDistance ||
            (candidateDistance === bestDistance && candidate > best)
            ? candidate
            : best;
    }, options[0]);
}
