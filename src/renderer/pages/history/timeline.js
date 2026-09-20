import { historySortTimestamp, isHistoryTimeSort } from "../../../core/history-filter";
const UNKNOWN_DATE_KEY = "unknown";
function localeForDateFormat(locale) {
    return locale?.trim() || "zh-CN";
}
function dateParts(date) {
    return {
        year: String(date.getFullYear()).padStart(4, "0"),
        month: String(date.getMonth() + 1).padStart(2, "0"),
        day: String(date.getDate()).padStart(2, "0")
    };
}
export function formatHistoryTimelineDate(value, locale) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime()))
        return "—";
    const parts = dateParts(date);
    if (localeForDateFormat(locale).toLowerCase().startsWith("zh")) {
        return `${parts.year}.${parts.month}.${parts.day}`;
    }
    return new Intl.DateTimeFormat(localeForDateFormat(locale), {
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(date);
}
function timelineDateKey(value) {
    const date = new Date(value);
    const timestampMs = date.getTime();
    if (!Number.isFinite(timestampMs)) {
        return { key: UNKNOWN_DATE_KEY, validDate: false, timestampMs: 0 };
    }
    const parts = dateParts(date);
    return {
        key: `${parts.year}-${parts.month}-${parts.day}`,
        validDate: true,
        timestampMs
    };
}
export function historyTimelineEntries(records, sort, locale) {
    if (!isHistoryTimeSort(sort))
        return [];
    return records.map((record) => {
        const timestamp = historySortTimestamp(record);
        const date = timelineDateKey(timestamp);
        return {
            id: record.id,
            timestamp,
            timestampMs: date.timestampMs,
            dateKey: date.key,
            label: date.validDate ? formatHistoryTimelineDate(timestamp, locale) : "—",
            validDate: date.validDate
        };
    });
}
export function groupHistoryTimelineEntries(entries) {
    const groups = new Map();
    entries.forEach((entry) => {
        const current = groups.get(entry.dateKey);
        if (current) {
            current.ids.push(entry.id);
            return;
        }
        groups.set(entry.dateKey, {
            dateKey: entry.dateKey,
            label: entry.label,
            ids: [entry.id],
            targetId: entry.id,
            validDate: entry.validDate
        });
    });
    return [...groups.values()];
}
export function clampHistoryTimelineProgress(value) {
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}
export function historyTimelineProgress(scrollY, maxScrollY) {
    if (!Number.isFinite(maxScrollY) || maxScrollY <= 0)
        return 0;
    return clampHistoryTimelineProgress(scrollY / maxScrollY);
}
export function historyTimelineScrollY(progress, maxScrollY) {
    const safeMax = Number.isFinite(maxScrollY) ? Math.max(0, maxScrollY) : 0;
    return Math.round(clampHistoryTimelineProgress(progress) * safeMax);
}
export function closestHistoryTimelineMarker(markers, progress) {
    if (!markers.length)
        return -1;
    const target = clampHistoryTimelineProgress(progress);
    return markers.reduce((closest, marker) => {
        const currentDistance = Math.abs(markers[closest].top - target);
        const nextDistance = Math.abs(marker.top - target);
        return nextDistance < currentDistance ? marker.index : closest;
    }, markers[0].index);
}
export function historyTimelineMarkerLabel(labels) {
    return labels[0] ?? "—";
}
export { isHistoryTimeSort };
