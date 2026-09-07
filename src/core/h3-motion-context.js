/**
 * Managed output naming for the upstream Motion Context cache.
 *
 * This is deliberately a sibling of `h3-native-av`, not a Native AV
 * artifact itself. The two safetensors formats have different contracts.
 */
export const H3_MOTION_CONTEXT_SUBFOLDER = "h3-motion-context";
export const H3_MOTION_CONTEXT_FILENAME = "clip_00001.safetensors";
export function h3MotionContextSavePrefixForTask(taskId) {
    return `${H3_MOTION_CONTEXT_SUBFOLDER}/${taskId}/clip`;
}
