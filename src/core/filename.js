const modelCodes = {
    minimax_h3_fl2va: "H3",
    minimax_h3_fl2va_int4: "H3-INT4",
    minimax_h3_fl2va_turbo: "H3-TURBO",
    minimax_h3_ref2va: "H3-R2V",
    minimax_h3_ref2va_int4: "H3-R2V-INT4",
    sulphur2: "SUL2",
    wan22_5b: "WAN22-5B",
    hunyuan15: "HUN15",
    wan22_14b: "WAN22-14B",
    wan22_14b_nsfw: "WAN22-14B-NSFW",
    remix3: "REMIX3",
    wan22_remix: "REMIX3",
    wan22_smoothmix: "SMOOTHMIX",
    wan22_dasiwa: "DASIWA9"
};
export function compactPrompt(text) {
    const cleaned = text
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
        .replace(/[，。！？、；：,.!?;()[\]{}"'“”‘’]/g, " ")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^[.\-\s]+|[.\-\s]+$/g, "");
    return Array.from(cleaned || "video").slice(0, 16).join("");
}
export function timestamp(date = new Date()) {
    const pad = (value) => String(value).padStart(2, "0");
    return ([date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join("") +
        "-" +
        [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join(""));
}
function modelCode(modelId) {
    return (modelCodes[modelId] ??
        (modelId.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "") ||
            "VIDEO"));
}
function resolutionTag(value) {
    return Number.isFinite(value) && value > 0 ? `${Math.round(value)}p` : "AUTO";
}
function durationTag(value) {
    if (!Number.isFinite(value) || value <= 0)
        return "0s";
    const rounded = Math.round(value * 10) / 10;
    return `${String(rounded).replace(/\.0$/, "")}s`;
}
function versionTag(version) {
    return `v${String(version).padStart(2, "0")}`;
}
export function createOutputFilename(modelId, resolution, duration, existingNames, date = new Date()) {
    const base = `${modelCode(modelId)}-${resolutionTag(resolution)}-${durationTag(duration)}-${timestamp(date)}`;
    const names = new Set([...existingNames].map((name) => name.toLowerCase()));
    let version = 1;
    while (names.has(`${base}-${versionTag(version)}.mp4`.toLowerCase())) {
        version += 1;
    }
    return `${base}-${versionTag(version)}.mp4`;
}
