export function mergeChromiumFeatureList(currentValue, requiredFeatures) {
    const features = new Set(currentValue
        .split(",")
        .map((feature) => feature.trim())
        .filter(Boolean));
    for (const feature of requiredFeatures) {
        const normalized = feature.trim();
        if (normalized)
            features.add(normalized);
    }
    return [...features].join(",");
}
