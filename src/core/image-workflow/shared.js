import { extractComfyOutputFiles } from "../comfy-output.js";
import { qwenImageEdit2511Capability } from "./capabilities.js";
export function cachedImageProfileAllowsEnqueue(profile) {
    return Boolean(profile?.category === "image" &&
        profile.integrated &&
        profile.available &&
        !(profile.missingCustomNodeIds?.length));
}
export const imageOutputCountMax = 6;
export const imageTargetResolutionValues = [2160, 1536, 1152, 1080, 1024, 768, 720, 640, 480];
export const imageAspectRatioValues = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"];
function alignedImageDimension(value) {
    return Math.max(8, Math.round(value / 8) * 8);
}
export function normalizeImageTargetResolution(value, sourceWidth = 0, sourceHeight = 0) {
    if (value === "source")
        return "source";
    const numeric = typeof value === "number" ? value : Number(value);
    const isSupported = imageTargetResolutionValues.some((candidate) => candidate === numeric);
    if (!isSupported)
        return "source";
    return numeric;
}
function ratioValue(value) {
    const [width, height] = value.split(":").map(Number);
    return width / height;
}
function ratioLabelForDimensions(width, height) {
    if (!(width > 0 && height > 0))
        return "原图比例";
    const sourceRatio = width / height;
    const match = imageAspectRatioValues.find((value) => Math.abs(sourceRatio - ratioValue(value)) < 0.01);
    return match ?? `${width}×${height}`;
}
export function normalizeImageAspectRatio(value) {
    if (value === "source" || imageAspectRatioValues.some((candidate) => candidate === value))
        return value;
    return "source";
}
export function imageOutputDimensions(sourceWidth, sourceHeight, targetResolution, fallbackWidth = 0, fallbackHeight = 0, aspectRatio = "source") {
    const hasSource = Number.isFinite(sourceWidth) && Number.isFinite(sourceHeight) &&
        sourceWidth > 0 && sourceHeight > 0;
    const hasFallback = Number.isFinite(fallbackWidth) && Number.isFinite(fallbackHeight) &&
        fallbackWidth > 0 && fallbackHeight > 0;
    const width = hasSource ? sourceWidth : hasFallback ? fallbackWidth : 0;
    const height = hasSource ? sourceHeight : hasFallback ? fallbackHeight : 0;
    if (!width || !height) {
        return [Math.max(0, Math.trunc(width)), Math.max(0, Math.trunc(height))];
    }
    const normalizedAspectRatio = normalizeImageAspectRatio(aspectRatio);
    if (targetResolution === "source" && normalizedAspectRatio === "source") {
        return [Math.max(0, Math.trunc(width)), Math.max(0, Math.trunc(height))];
    }
    const sourceRatio = normalizedAspectRatio === "source" ? width / height : ratioValue(normalizedAspectRatio);
    const shortEdge = Math.min(width, height);
    const normalizedTarget = normalizeImageTargetResolution(targetResolution);
    const outputShortEdge = normalizedTarget === "source" ? shortEdge : normalizedTarget;
    const outputWidth = sourceRatio >= 1 ? outputShortEdge * sourceRatio : outputShortEdge;
    const outputHeight = sourceRatio >= 1 ? outputShortEdge : outputShortEdge / sourceRatio;
    return [
        alignedImageDimension(outputWidth),
        alignedImageDimension(outputHeight)
    ];
}
export function imageAspectRatioOptionsFor(sourceWidth = 0, sourceHeight = 0, fallbackWidth = 0, fallbackHeight = 0) {
    const hasSource = sourceWidth > 0 && sourceHeight > 0;
    const hasFallback = fallbackWidth > 0 && fallbackHeight > 0;
    const sourceLabel = hasSource
        ? `原图比例 · ${ratioLabelForDimensions(sourceWidth, sourceHeight)}`
        : hasFallback
            ? `默认比例 · ${ratioLabelForDimensions(fallbackWidth, fallbackHeight)}`
            : "原图比例 · 上传后读取";
    return [
        { value: "source", label: sourceLabel },
        ...imageAspectRatioValues.map((value) => ({
            value,
            label: `${value}${value === "1:1" ? " · 方形" : value === "16:9" || value === "3:2" ? " · 横向" : value === "9:16" || value === "2:3" ? " · 竖向" : ""}`
        }))
    ];
}
export function imageResolutionOptionsFor(sourceWidth = 0, sourceHeight = 0, fallbackWidth = 0, fallbackHeight = 0, aspectRatio = "source") {
    const hasSource = sourceWidth > 0 && sourceHeight > 0;
    const hasFallback = fallbackWidth > 0 && fallbackHeight > 0;
    const sourceOptionDimensions = imageOutputDimensions(sourceWidth, sourceHeight, "source", fallbackWidth, fallbackHeight, aspectRatio);
    const sourceLabel = hasSource
        ? `原图 · ${sourceOptionDimensions[0]}×${sourceOptionDimensions[1]}`
        : hasFallback
            ? `默认 · ${sourceOptionDimensions[0]}×${sourceOptionDimensions[1]}`
            : "原图 · 上传后读取";
    const options = [{
        value: "source",
        label: sourceLabel,
        width: sourceOptionDimensions[0],
        height: sourceOptionDimensions[1]
    }];
    for (const target of imageTargetResolutionValues) {
        const [width, height] = hasSource || hasFallback
            ? imageOutputDimensions(sourceWidth, sourceHeight, target, fallbackWidth, fallbackHeight, aspectRatio)
            : [0, 0];
        options.push({
            value: target,
            label: hasSource || hasFallback ? `${target}p · ${width}×${height}` : `${target}p`,
            width,
            height
        });
    }
    return options;
}
export const pictureReferencePattern = /(?:<\s*)?(?:picture|image|图片)\s*([1-9]\d*)(?:\s*>)?/giu;
export function orderedPictures(pictures) {
    return [...pictures].sort((left, right) => left.pictureNumber - right.pictureNumber);
}
export function imageReferenceInputPath(picture) {
    return picture.crop?.croppedPath.trim() || picture.absolutePath.trim();
}
export function imageMarkupPromptContext(pictures) {
    const marked = pictures.filter((picture) => picture.markup?.objectCount);
    if (!marked.length)
        return "";
    return [
        "Visual annotation instructions:",
        "Canvas annotations are location-only editing instructions stored alongside the clean source Pictures. Use their notes to identify the intended target, but never add annotation graphics, labels, arrows, boxes, or note text to the output.",
        "The per-annotation notes below are the authoritative edit list. A general preservation instruction may protect unrelated content, but must never override, broaden, or replace a specific annotation note.",
        ...marked.map((picture) => `Picture ${picture.pictureNumber}: ${picture.markup?.summary || `${picture.markup?.objectCount ?? 0} marked target(s)`}`)
    ].join("\n");
}
function markupGuidePicture(picture, compiledPictureNumber) {
    return {
        ...picture,
        id: `${picture.id}-markup-guide-r${picture.markup?.revision ?? 0}`,
        pictureNumber: compiledPictureNumber,
        absolutePath: picture.markup?.renderedPath.trim() ?? "",
        role: "auto",
        crop: undefined,
        markup: undefined
    };
}
function compiledMarkupPromptContext(guides) {
    if (!guides.length)
        return "";
    return [
        "Visual annotation reference contract:",
        "The clean source Picture is the image to edit. Its paired annotation-guide Picture is location-only reference material, not output content.",
        "Never reproduce any colored mark, border, box, arrow, label, letter, number, note, or annotation-guide text. Reconstruct clean natural pixels where the requested edit is made, and preserve unmarked content.",
        ...guides.map((guide) => [
            `Picture ${guide.sourceInputNumber} is the clean source for original Picture ${guide.sourcePictureNumber}; Picture ${guide.guideInputNumber} is only its temporary annotation guide.`,
            `Requested edits for Picture ${guide.sourceInputNumber}: ${guide.summary}`
        ].join(" "))
    ].join("\n");
}
export function compileImagePromptWithLimit(prompt, pictures, maxPictures, modelLabel, includeMarkupGuides = false) {
    const ordered = orderedPictures(pictures);
    const usable = ordered.filter((picture) => picture.absolutePath.trim());
    const errors = [];
    ordered
        .filter((picture) => !picture.absolutePath.trim())
        .forEach((picture) => {
        errors.push(`Picture ${picture.pictureNumber} 尚未添加图片。`);
    });
    const originalToCompiled = new Map();
    const compiledPictures = [];
    const markupGuides = [];
    usable.forEach((picture) => {
        if (originalToCompiled.has(picture.pictureNumber)) {
            errors.push(`Picture ${picture.pictureNumber} 重复，无法确定引用对象。`);
            return;
        }
        const sourceInputNumber = compiledPictures.length + 1;
        originalToCompiled.set(picture.pictureNumber, sourceInputNumber);
        compiledPictures.push(picture);
        if (includeMarkupGuides && picture.markup?.objectCount && picture.markup.renderedPath.trim()) {
            const guideInputNumber = compiledPictures.length + 1;
            compiledPictures.push(markupGuidePicture(picture, guideInputNumber));
            markupGuides.push({
                sourcePictureNumber: picture.pictureNumber,
                sourceInputNumber,
                guideInputNumber,
                summary: picture.markup.summary.trim() || `${picture.markup.objectCount} marked target(s)`
            });
        }
    });
    if (ordered.length > maxPictures) {
        errors.push(`当前 ${modelLabel} 工作流最多支持 ${maxPictures} 张 Picture。`);
    }
    if (compiledPictures.length > maxPictures) {
        const guideCount = markupGuides.length;
        errors.push(`Canvas 标记会额外占用 ${guideCount} 个标注参考输入；当前 ${modelLabel} 最多接收 ${maxPictures} 张模型输入，请减少普通参考图或清除部分标记。`);
    }
    const referencedPictureNumbers = new Set();
    const compiledPrompt = prompt.replace(pictureReferencePattern, (match, numberText) => {
        const originalNumber = Number(numberText);
        referencedPictureNumbers.add(originalNumber);
        const compiledNumber = originalToCompiled.get(originalNumber);
        if (!compiledNumber) {
            errors.push(`${match} 引用了不存在的 Picture ${originalNumber}。`);
            return match;
        }
        return `Picture ${compiledNumber}`;
    });
    const limitedPictures = compiledPictures.slice(0, maxPictures);
    const markupContext = includeMarkupGuides
        ? compiledMarkupPromptContext(markupGuides)
        : imageMarkupPromptContext(usable);
    return {
        prompt: markupContext ? `${compiledPrompt.trim()}\n\n${markupContext}` : compiledPrompt,
        pictures: limitedPictures,
        referencedPictureNumbers: [...referencedPictureNumbers].sort((left, right) => left - right),
        errors: [...new Set(errors)]
    };
}
export function imageOutputFormatFromFilename(filename) {
    const extension = filename.toLowerCase().split(".").pop();
    if (extension === "png")
        return "png";
    if (extension === "jpg" || extension === "jpeg")
        return "jpeg";
    if (extension === "webp")
        return "webp";
    return undefined;
}
export function imageOutputCandidateFromValue(value) {
    if (!value || typeof value !== "object")
        return null;
    const source = value;
    if (typeof source.filename !== "string" || !source.filename.trim())
        return null;
    return {
        filename: source.filename,
        subfolder: typeof source.subfolder === "string" ? source.subfolder : "",
        type: typeof source.type === "string" ? source.type : "output",
        format: imageOutputFormatFromFilename(source.filename)
    };
}
export function imageQualityProfileRequiresLightning(qualityProfile) {
    return qualityProfile === "lightning-4step";
}
export function imageLightningComponentFound(components) {
    return components.some((component) => component.label.includes("Lightning LoRA") && component.found);
}
export function imageReferenceInputs(pictures, nodePrefix) {
    return Object.fromEntries(pictures.slice(0, qwenImageEdit2511Capability.maxPictures).map((picture, index) => [
        `image${index + 1}`,
        [`${nodePrefix}-${picture.id}`, 0]
    ]));
}
export function exactImageDimension(value, fallback) {
    const dimension = value ?? fallback;
    if (!Number.isInteger(dimension) || dimension <= 0) {
        throw new Error("图片输出尺寸无效，无法保持 Picture 1 的原始尺寸。");
    }
    return dimension;
}
export function unresolvedImagePlaceholders(workflow) {
    return Object.values(workflow).flatMap((node) => Object.values(node.inputs).filter((value) => typeof value === "string" && /^\{\{(?:IMAGE|MASK)_\d+\}\}$/u.test(value))).map(String);
}
export function renderImageWorkflow(workflow, uploadedPictures, uploadedMasks = []) {
    const visit = (value) => {
        if (Array.isArray(value))
            return value.map(visit);
        if (value && typeof value === "object") {
            return Object.fromEntries(Object.entries(value).map(([key, child]) => [
                key,
                visit(child)
            ]));
        }
        if (typeof value !== "string")
            return value;
        const exact = value.match(/^\{\{IMAGE_(\d+)\}\}$/u);
        if (exact?.[1])
            return uploadedPictures[Number(exact[1])] ?? value;
        const exactMask = value.match(/^\{\{MASK_(\d+)\}\}$/u);
        if (exactMask?.[1])
            return uploadedMasks[Number(exactMask[1])] ?? value;
        return value
            .replace(/\{\{IMAGE_(\d+)\}\}/gu, (match, indexText) => uploadedPictures[Number(indexText)] ?? match)
            .replace(/\{\{MASK_(\d+)\}\}/gu, (match, indexText) => uploadedMasks[Number(indexText)] ?? match);
    };
    return visit(workflow);
}
export function parseImageOutputs(history) {
    return extractComfyOutputFiles(history)
        .map((file) => imageOutputCandidateFromValue(file))
        .filter((file) => file !== null);
}
