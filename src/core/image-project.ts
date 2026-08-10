import type {
  ImageAssetVersion,
  ImageEditDraft,
  ImageHistoryProject,
  ImageOutputFormat,
  ImageReference,
  ImageReferenceRole
} from "../types.js";
import { createDefaultImageEditDraft } from "./defaults.js";

const imageOutputFormats: ImageOutputFormat[] = ["png", "jpeg", "webp"];
const imageReferenceRoles: ImageReferenceRole[] = [
  "base",
  "person",
  "object",
  "pose",
  "style",
  "background",
  "auto"
];

function cleanImagePromptText(value: unknown): string {
  if (typeof value !== "string") return "";
  return /(?:prompt-tool-row|image-edit-instruction|image-edit-prompt-input|image-edit-output-group)/u.test(value)
    ? ""
    : value;
}

function isCorruptedImagePrompt(value: unknown): boolean {
  return typeof value === "string" &&
    /(?:prompt-tool-row|image-edit-instruction|image-edit-prompt-input|image-edit-output-group)/u.test(value);
}

function normalizedInteger(value: unknown, fallback: number, minimum: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(minimum, Math.trunc(value))
    : fallback;
}

function normalizedTimestamp(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.trim() || !Number.isFinite(Date.parse(value))) {
    return fallback;
  }
  return value;
}

function imageBasename(filename: string): string {
  const separator = Math.max(filename.lastIndexOf("/"), filename.lastIndexOf("\\"));
  return filename.slice(separator + 1);
}

function imageExtension(filename: string): string {
  const basename = imageBasename(filename);
  const dot = basename.lastIndexOf(".");
  return dot > 0 ? basename.slice(dot).toLowerCase() : "";
}

function imageFormatFromFilename(filename: string): ImageOutputFormat {
  const extension = imageExtension(filename);
  if (extension === ".jpg" || extension === ".jpeg") return "jpeg";
  if (extension === ".webp") return "webp";
  return "png";
}

function normalizeImageFile(value: unknown): ImageAssetVersion["file"] | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<ImageAssetVersion["file"]>;
  if (typeof source.filename !== "string" || !source.filename.trim()) return null;
  return {
    filename: source.filename,
    subfolder: typeof source.subfolder === "string" ? source.subfolder : "",
    type: typeof source.type === "string" && source.type.trim() ? source.type : "output",
    ...(typeof source.format === "string" && source.format.trim()
      ? { format: source.format }
      : {}),
    ...(typeof source.absolutePath === "string" && source.absolutePath.trim()
      ? { absolutePath: source.absolutePath }
      : {})
  };
}

function normalizeImageAssetVersion(
  value: unknown,
  fallbackCreatedAt: string
): ImageAssetVersion | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<ImageAssetVersion>;
  const file = normalizeImageFile(source.file);
  if (!file) return null;
  const kind = source.kind === "source" || source.kind === "edit" || source.kind === "upscale"
    ? source.kind
    : "edit";
  const generatedVersion = Boolean(source.taskId || source.runId || source.comfyPromptId || source.workflowPath);
  return {
    id: typeof source.id === "string" && source.id.trim() ? source.id : crypto.randomUUID(),
    versionNumber: normalizedInteger(source.versionNumber, 0, 0),
    kind: kind === "source" && generatedVersion ? "edit" : kind,
    ...(typeof source.parentVersionId === "string" && source.parentVersionId.trim()
      ? { parentVersionId: source.parentVersionId }
      : {}),
    ...(typeof source.taskId === "string" && source.taskId.trim()
      ? { taskId: source.taskId }
      : {}),
    ...(typeof source.runId === "string" && source.runId.trim()
      ? { runId: source.runId }
      : {}),
    createdAt: normalizedTimestamp(source.createdAt, fallbackCreatedAt),
    ...(typeof source.startedAt === "string" && Number.isFinite(Date.parse(source.startedAt))
      ? { startedAt: source.startedAt }
      : {}),
    modelId: typeof source.modelId === "string" ? source.modelId : "",
    workflowPath: typeof source.workflowPath === "string" ? source.workflowPath : "",
    prompt: typeof source.prompt === "string" ? source.prompt : "",
    promptVersion: normalizedInteger(source.promptVersion, 0, 0),
    references: normalizeImageReferences(source.references),
    ...(typeof source.seed === "number" && Number.isFinite(source.seed)
      ? { seed: Math.trunc(source.seed) }
      : {}),
    width: normalizedInteger(source.width, 0, 0),
    height: normalizedInteger(source.height, 0, 0),
    format: imageOutputFormats.includes(source.format as ImageOutputFormat)
      ? source.format as ImageOutputFormat
      : imageFormatFromFilename(file.filename),
    file,
    ...(typeof source.comfyPromptId === "string" && source.comfyPromptId.trim()
      ? { comfyPromptId: source.comfyPromptId }
      : {}),
    ...(source.comfyOutputs !== undefined ? { comfyOutputs: source.comfyOutputs } : {}),
    ...(source.performanceStats !== undefined ? { performanceStats: source.performanceStats } : {})
  };
}

function normalizeImageHistoryProject(value: unknown): ImageHistoryProject | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<ImageHistoryProject>;
  const id = typeof source.id === "string" && source.id.trim()
    ? source.id
    : crypto.randomUUID();
  const fallbackCreatedAt = normalizedTimestamp(source.createdAt, new Date(0).toISOString());
  const versions = (Array.isArray(source.versions) ? source.versions : [])
    .map((version) => normalizeImageAssetVersion(version, fallbackCreatedAt))
    .filter((version): version is ImageAssetVersion => version !== null);
  if (!versions.length) return null;

  const versionNumbers = versions.map((version) => version.versionNumber);
  const validVersionNumbers = versionNumbers.every((number) => number > 0) &&
    new Set(versionNumbers).size === versionNumbers.length;
  const orderedVersions = validVersionNumbers
    ? [...versions].sort((left, right) => right.versionNumber - left.versionNumber)
    : [...versions]
        .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
        .map((version, index) => ({ ...version, versionNumber: index + 1 }))
        .reverse();
  const largestVersionNumber = orderedVersions.reduce(
    (largest, version) => Math.max(largest, version.versionNumber),
    0
  );
  const coverMode = source.coverMode === "pinned" ? "pinned" : "auto";
  const updatedAt = normalizedTimestamp(source.updatedAt, orderedVersions[0]!.createdAt);
  return {
    mediaKind: "image",
    id,
    title: typeof source.title === "string" && source.title.trim()
      ? source.title
      : "未命名图片",
    createdAt: fallbackCreatedAt,
    updatedAt,
    coverMode,
    ...(typeof source.coverVersionId === "string" && source.coverVersionId.trim()
      ? { coverVersionId: source.coverVersionId }
      : {}),
    nextVersionNumber: Math.max(
      largestVersionNumber + 1,
      normalizedInteger(source.nextVersionNumber, largestVersionNumber + 1, 1)
    ),
    versions: orderedVersions
  };
}

function normalizeImageReference(value: unknown, index: number): ImageReference | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<ImageReference>;
  if (typeof source.absolutePath !== "string") return null;
  const absolutePath = source.absolutePath.trim();
  const role = imageReferenceRoles.includes(source.role as ImageReferenceRole)
    ? source.role
    : undefined;
  return {
    id: typeof source.id === "string" && source.id.trim() ? source.id : crypto.randomUUID(),
    pictureNumber: normalizedInteger(source.pictureNumber, index + 1, 1),
    absolutePath,
    width: normalizedInteger(source.width, 0, 0),
    height: normalizedInteger(source.height, 0, 0),
    ...(role ? { role } : {})
  };
}

export function normalizeImageReferences(values: unknown): ImageReference[] {
  if (!Array.isArray(values)) return [];
  const normalized = values
    .map((value, index) => normalizeImageReference(value, index))
    .filter((value): value is ImageReference => value !== null);
  const canPreserveNumbers = normalized[0]?.pictureNumber === 1 &&
    new Set(normalized.map((picture) => picture.pictureNumber)).size === normalized.length;
  const usedNumbers = new Set<number>();
  let nextNumber = 1;
  return normalized.map((picture, index) => {
    const requestedNumber = canPreserveNumbers ? picture.pictureNumber : index + 1;
    let pictureNumber = requestedNumber;
    if (usedNumbers.has(pictureNumber)) {
      while (usedNumbers.has(nextNumber)) nextNumber += 1;
      pictureNumber = nextNumber;
    }
    usedNumbers.add(pictureNumber);
    nextNumber = Math.max(nextNumber, pictureNumber + 1);
    return {
      ...picture,
      pictureNumber,
      role: index === 0
        ? "base" as const
        : picture.role === "base"
          ? "auto" as const
          : picture.role ?? "auto"
    };
  });
}

export function normalizeImageHistory(value: unknown): ImageHistoryProject[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((project) => normalizeImageHistoryProject(project))
    .filter((project): project is ImageHistoryProject => project !== null);
}

export function normalizeImageEditDraft(value: unknown): ImageEditDraft {
  const defaults = createDefaultImageEditDraft();
  if (!value || typeof value !== "object") return defaults;
  const source = value as Partial<ImageEditDraft>;
  const pictures = normalizeImageReferences(source.pictures);
  const storedPromptVersions = Array.isArray(source.promptVersions) && source.promptVersions.length
    ? source.promptVersions
        .filter((version) =>
          version && typeof version.id === "string" && typeof version.text === "string"
        )
        .filter((version) => !isCorruptedImagePrompt(version.text))
        .map((version) => ({
          ...version,
          text: cleanImagePromptText(version.text)
        }))
    : [];
  const promptVersions = storedPromptVersions.length ? storedPromptVersions : defaults.promptVersions;
  const outputFormat: ImageOutputFormat = "png";
  const outputCount = Math.min(
    10,
    Math.max(
      1,
      Math.trunc(
        typeof source.outputCount === "number" && Number.isFinite(source.outputCount)
          ? source.outputCount
          : defaults.outputCount
      )
    )
  );
  const activePromptVersion = Math.min(
    promptVersions.length - 1,
    Math.max(0, Math.trunc(source.activePromptVersion ?? defaults.activePromptVersion))
  );
  const seed = typeof source.seed === "number" && Number.isFinite(source.seed)
    ? Math.trunc(source.seed)
    : null;
  const largestPictureNumber = pictures.reduce(
    (largest, picture) => Math.max(largest, picture.pictureNumber),
    0
  );
  const nextPictureNumber = Math.max(
    largestPictureNumber + 1,
    normalizedInteger(source.nextPictureNumber, largestPictureNumber + 1, 1)
  );
  return {
    ...defaults,
    ...source,
    mode: "image-edit",
    projectId: typeof source.projectId === "string" && source.projectId.trim()
      ? source.projectId
      : undefined,
    parentVersionId: typeof source.parentVersionId === "string" && source.parentVersionId.trim()
      ? source.parentVersionId
      : undefined,
    pictures,
    nextPictureNumber,
    promptVersions,
    activePromptVersion,
    modelId: typeof source.modelId === "string" && source.modelId.trim()
      ? source.modelId
      : defaults.modelId,
    qualityProfile: typeof source.qualityProfile === "string" && source.qualityProfile.trim()
      ? source.qualityProfile
      : defaults.qualityProfile,
    outputCount,
    outputFormat,
    seed
  };
}

export function nextImagePictureNumber(
  draft: Pick<ImageEditDraft, "nextPictureNumber" | "pictures">
): number {
  const largestExisting = draft.pictures.reduce(
    (largest, picture) => Math.max(largest, picture.pictureNumber),
    0
  );
  return Math.max(1, draft.nextPictureNumber, largestExisting + 1);
}

export function createImageSourceVersion(
  reference: ImageReference,
  createdAt: string
): ImageAssetVersion {
  const filename = imageBasename(reference.absolutePath);
  return {
    id: crypto.randomUUID(),
    versionNumber: 1,
    kind: "source",
    createdAt,
    modelId: "source",
    workflowPath: "",
    prompt: "",
    promptVersion: 0,
    references: [{ ...reference }],
    width: reference.width,
    height: reference.height,
    format: imageFormatFromFilename(filename),
    file: {
      filename,
      subfolder: "",
      type: "input",
      absolutePath: reference.absolutePath
    }
  };
}

export function expandImageSeeds(
  seed: number | null,
  outputCount: number,
  randomSeed: () => number = () => {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] ?? 0;
  }
): number[] {
  const count = Math.min(10, Math.max(1, Math.trunc(outputCount)));
  if (seed != null && Number.isFinite(seed)) {
    return Array.from({ length: count }, () => Math.trunc(seed));
  }
  return Array.from({ length: count }, () => Math.trunc(randomSeed()) >>> 0);
}

export function nextImageVersionNumber(
  project: Pick<ImageHistoryProject, "nextVersionNumber" | "versions">
): number {
  const largestExisting = project.versions.reduce(
    (largest, version) => Math.max(largest, version.versionNumber),
    0
  );
  return Math.max(1, project.nextVersionNumber, largestExisting + 1);
}

export function imageProjectCoverVersion(
  project: Pick<ImageHistoryProject, "coverMode" | "coverVersionId" | "versions">
): ImageAssetVersion | undefined {
  if (project.coverMode === "pinned" && project.coverVersionId) {
    const pinned = project.versions.find((version) => version.id === project.coverVersionId);
    if (pinned) return pinned;
  }
  return [...project.versions]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
}
