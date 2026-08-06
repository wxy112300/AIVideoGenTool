import type {
  H3ReferenceMediaType,
  H3ReferenceRole,
  H3ReferenceSlot
} from "../types.js";

const referenceRoles = new Set<H3ReferenceRole>([
  "subject",
  "scene",
  "style",
  "motion",
  "camera",
  "voice",
  "keyframe",
  "other"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeH3ReferenceSlots(value: unknown): H3ReferenceSlot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const mediaType: H3ReferenceMediaType = entry.mediaType === "video"
      ? "video"
      : "image";
    const legacyImagePath = typeof entry.imagePath === "string"
      ? entry.imagePath
      : "";
    const mediaPath = typeof entry.mediaPath === "string"
      ? entry.mediaPath
      : legacyImagePath;
    const role = referenceRoles.has(entry.role as H3ReferenceRole)
      ? entry.role as H3ReferenceRole
      : "subject";
    return [{
      id: typeof entry.id === "string" && entry.id ? entry.id : crypto.randomUUID(),
      mediaType,
      mediaPath,
      role,
      note: typeof entry.note === "string" ? entry.note : ""
    }];
  });
}

export function h3ReferenceSlotCounts(slots: H3ReferenceSlot[]): {
  imageCount: number;
  videoCount: number;
  total: number;
} {
  const imageCount = slots.filter((slot) => slot.mediaType === "image").length;
  const videoCount = slots.filter((slot) => slot.mediaType === "video").length;
  return { imageCount, videoCount, total: imageCount + videoCount };
}