export const H3_VIDEO_VAE_FP16_FILENAME = "minimax_h3_video_vae_fp16.safetensors";
export const H3_VIDEO_VAE_INT8_CONVROT_FILENAME = "minimax_h3_video_vae_int8_convrot.safetensors";
export function normalizeH3VideoVaeMode(value) {
    return value === "auto" || value === "int8-convrot" ? value : "fp16";
}
export function normalizeH3VideoVaeBackend(value) {
    return value === "int8-convrot" ? value : "fp16";
}
export function h3VideoVaeFilename(mode) {
    return mode === "int8-convrot"
        ? H3_VIDEO_VAE_INT8_CONVROT_FILENAME
        : H3_VIDEO_VAE_FP16_FILENAME;
}
function normalizedPath(value) {
    return value.replaceAll("\\", "/").toLowerCase();
}
function componentMatchesFilename(component, filename) {
    const target = `vae/${filename}`;
    return normalizedPath(component.expected).endsWith(target) ||
        component.matches.some((match) => normalizedPath(match).endsWith(target));
}
export function h3VideoVaeAvailabilityFromModelProfiles(profiles) {
    let fp16 = false;
    let int8Convrot = false;
    for (const profile of profiles) {
        for (const component of profile.components) {
            fp16 ||= componentMatchesFilename(component, H3_VIDEO_VAE_FP16_FILENAME) && component.found;
            int8Convrot ||= componentMatchesFilename(component, H3_VIDEO_VAE_INT8_CONVROT_FILENAME) && component.found;
        }
    }
    return { fp16, int8Convrot };
}
export function resolveH3VideoVaeMode(requested, availability) {
    const normalized = normalizeH3VideoVaeMode(requested);
    if (normalized === "auto") {
        if (availability.int8Convrot)
            return "int8-convrot";
        if (availability.fp16)
            return "fp16";
        return null;
    }
    if (normalized === "int8-convrot" && availability.int8Convrot)
        return normalized;
    if (normalized === "fp16" && availability.fp16)
        return normalized;
    if (availability.fp16)
        return "fp16";
    if (availability.int8Convrot)
        return "int8-convrot";
    return null;
}
