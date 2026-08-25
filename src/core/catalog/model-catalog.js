export function sortProfilesByCatalogOrder(profiles, catalog, category) {
    const orderById = new Map(catalog.list(category).map((entry, index) => [entry.definition.id, index]));
    return [...profiles].sort((left, right) => {
        const leftOrder = orderById.get(left.id);
        const rightOrder = orderById.get(right.id);
        if (leftOrder === undefined && rightOrder === undefined) {
            return left.id.localeCompare(right.id);
        }
        if (leftOrder === undefined)
            return 1;
        if (rightOrder === undefined)
            return -1;
        return leftOrder - rightOrder;
    });
}
export function createModelCatalog(entries) {
    const byId = new Map(entries.map((entry) => [entry.definition.id, entry]));
    return {
        entries,
        get(modelId) {
            return byId.get(modelId);
        },
        list(category) {
            return entries
                .filter((entry) => !category || entry.definition.category === category)
                .filter((entry) => !entry.definition.retired)
                .slice()
                .sort((left, right) => right.definition.order - left.definition.order);
        },
        isFamily(modelId, family) {
            return byId.get(modelId)?.definition.family === family;
        },
        localized(modelId, locale = "zh-CN") {
            const entry = byId.get(modelId);
            if (!entry)
                return undefined;
            return entry.locales[locale] ?? entry.locales["zh-CN"];
        }
    };
}
