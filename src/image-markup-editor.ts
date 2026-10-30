import {
  Canvas,
  Circle,
  Ellipse,
  FabricImage,
  FabricObject,
  FabricText,
  Group,
  IText,
  Line,
  PencilBrush,
  Rect,
  Triangle,
  type TPointerEventInfo
} from "fabric/es";
import Cropper from "cropperjs";
import { createTranslator, type Translate } from "./core/i18n";
import { uiKeys } from "./core/i18n-keys";
import { renderMarkupEditor } from "./renderer/pages/create/markup-view";
import { renderIcons } from "./renderer/shared/icons";
import { primeSharedUi, paintRangeFill } from "./renderer/shared/ui/runtime";
import "cropperjs/dist/cropper.css";
import type { ImageCropData, ImageCropSelection } from "./types.js";

export type ImageMarkupTool =
  | "select"
  | "brush"
  | "highlight"
  | "rectangle"
  | "ellipse"
  | "arrow"
  | "text"
  | "eraser";

interface MarkupFabricObject extends FabricObject {
  annotationId?: string;
  annotationLabel?: string;
  annotationKind?: ImageMarkupTool;
  annotationNote?: string;
  annotationSource?: boolean;
}

interface StoredMarkupDocument {
  version: 1 | 2;
  sourceWidth: number;
  sourceHeight: number;
  crop?: ImageCropSelection | null;
  canvas: Record<string, unknown>;
}

export interface ImageMarkupEditorOptions {
  t?: Translate;
  pictureNumber: number;
  filename: string;
  sourceDataUrl: string;
  existingDocument?: string | null;
  existingCrop?: ImageCropData | null;
  mode?: "annotation" | "mask";
}

export interface ImageMarkupEditorResult {
  document: string;
  renderedPng: ArrayBuffer;
  summary: string;
  objectCount: number;
  crop: ImageCropSelection | null;
  croppedPng?: ArrayBuffer;
}

const annotationProperties = [
  "annotationId",
  "annotationLabel",
  "annotationKind",
  "annotationNote",
  "annotationSource"
];

function escapeMarkup(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[character] ?? character);
}

function annotationObjects(canvas: Canvas): MarkupFabricObject[] {
  return canvas.getObjects()
    .filter((object) => !(object as MarkupFabricObject).annotationSource)
    .filter((object) => Boolean((object as MarkupFabricObject).annotationId)) as MarkupFabricObject[];
}

function annotationLabel(index: number): string {
  return index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
}

function defaultNote(kind: ImageMarkupTool, t: Translate): string {
  return kind === "arrow"
    ? t("create.finish.noteArrow")
    : kind === "text"
      ? t("create.finish.noteText")
      : kind === "highlight"
        ? t("create.finish.noteHighlight")
        : t("create.finish.noteRegion");
}

function normalizeCropSelection(
  crop: Pick<ImageCropSelection, "x" | "y" | "width" | "height" | "sourceWidth" | "sourceHeight">
): ImageCropSelection {
  const sourceWidth = Math.max(1, Math.trunc(crop.sourceWidth));
  const sourceHeight = Math.max(1, Math.trunc(crop.sourceHeight));
  const x = Math.max(0, Math.min(sourceWidth - 1, Math.trunc(crop.x)));
  const y = Math.max(0, Math.min(sourceHeight - 1, Math.trunc(crop.y)));
  return {
    sourceWidth,
    sourceHeight,
    x,
    y,
    width: Math.max(1, Math.min(sourceWidth - x, Math.trunc(crop.width))),
    height: Math.max(1, Math.min(sourceHeight - y, Math.trunc(crop.height)))
  };
}

function isFullCrop(crop: ImageCropSelection): boolean {
  return crop.x === 0 && crop.y === 0 &&
    crop.width === crop.sourceWidth && crop.height === crop.sourceHeight;
}

function cropDataUrl(source: HTMLImageElement, crop: ImageCropSelection, t: Translate): string {
  const canvas = document.createElement("canvas");
  canvas.width = crop.width;
  canvas.height = crop.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error(t(uiKeys.uiError.cropCanvas));
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
  return canvas.toDataURL("image/png");
}

async function imageFromDataUrl(dataUrl: string, t: Translate): Promise<HTMLImageElement> {
  const image = document.createElement("img");
  image.src = dataUrl;
  await image.decode();
  if (!image.naturalWidth || !image.naturalHeight) throw new Error(t(uiKeys.uiError.cropDimensions));
  return image;
}

async function dataUrlToArrayBuffer(dataUrl: string): Promise<ArrayBuffer> {
  const response = await fetch(dataUrl);
  return response.arrayBuffer();
}

export async function openImageMarkupEditor(
  options: ImageMarkupEditorOptions
): Promise<ImageMarkupEditorResult | null> {
  const maskMode = options.mode === "mask";
  const t = options.t ?? createTranslator().t;
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const originalSourceElement = document.createElement("img");
  originalSourceElement.src = options.sourceDataUrl;
  await originalSourceElement.decode();
  if (!originalSourceElement.naturalWidth || !originalSourceElement.naturalHeight) {
    throw new Error(t(uiKeys.uiError.pictureDimensions));
  }
  let storedDocumentCrop: ImageCropSelection | null = null;
  if (!options.existingCrop && options.existingDocument) {
    try {
      const stored = JSON.parse(options.existingDocument) as StoredMarkupDocument;
      storedDocumentCrop = stored.version === 2 && stored.crop ? stored.crop : null;
    } catch {
      storedDocumentCrop = null;
    }
  }
  const requestedCrop = options.existingCrop ?? storedDocumentCrop;
  const originalCrop = requestedCrop &&
      requestedCrop.sourceWidth === originalSourceElement.naturalWidth &&
      requestedCrop.sourceHeight === originalSourceElement.naturalHeight
    ? normalizeCropSelection(requestedCrop)
    : null;
  let currentCrop = originalCrop && !isFullCrop(originalCrop) ? originalCrop : null;
  let currentSourceDataUrl = currentCrop
    ? cropDataUrl(originalSourceElement, currentCrop, t)
    : options.sourceDataUrl;
  let sourceElement = currentCrop
    ? await imageFromDataUrl(currentSourceDataUrl, t)
    : originalSourceElement;

  const overlay = document.createElement("div");
  overlay.className = "image-markup-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "image-markup-title");
  overlay.innerHTML = renderMarkupEditor(options.pictureNumber, options.filename, maskMode, t);
  primeSharedUi(overlay);
  renderIcons(overlay);
  document.body.append(overlay);
  document.body.classList.add("image-markup-open");

  const canvasElement = overlay.querySelector<HTMLCanvasElement>("[data-markup-canvas]")!;
  const stage = overlay.querySelector<HTMLElement>(".image-markup-stage")!;
  const canvasShell = overlay.querySelector<HTMLElement>(".image-markup-canvas-shell")!;
  const noteList = overlay.querySelector<HTMLElement>("[data-markup-note-list]")!;
  const colorInput = overlay.querySelector<HTMLInputElement>("[data-markup-color]")!;
  const widthInput = overlay.querySelector<HTMLInputElement>("[data-markup-width]")!;
  const widthNumber = overlay.querySelector<HTMLInputElement>("[data-markup-width-number]")!;
  const zoomValue = overlay.querySelector<HTMLElement>("[data-markup-zoom-value]")!;
  const canvas = new Canvas(canvasElement, {
    width: sourceElement.naturalWidth,
    height: sourceElement.naturalHeight,
    enableRetinaScaling: false,
    preserveObjectStacking: true,
    selection: true
  });
  // Reuse the already decoded element. Loading the same data URL again through
  // Fabric can report a device-scaled bitmap size in Electron on high-DPI
  // displays, while HTMLImageElement.naturalWidth remains in CSS pixels. The
  // ratio then becomes 0.5 and leaves three quarters of the canvas empty.
  let sourceImage = new FabricImage(sourceElement, {
    width: sourceElement.naturalWidth,
    height: sourceElement.naturalHeight
  });
  sourceImage.set({
    left: 0,
    top: 0,
    originX: "left",
    originY: "top",
    scaleX: 1,
    scaleY: 1,
    selectable: false,
    evented: false,
    hasControls: false,
    hoverCursor: "default"
  });
  (sourceImage as MarkupFabricObject).annotationSource = true;

  const cropDialog = overlay.querySelector<HTMLElement>("[data-image-cropper-dialog]")!;
  const cropImage = overlay.querySelector<HTMLImageElement>("[data-image-cropper-image]")!;
  const cropAspect = overlay.querySelector<HTMLSelectElement>("[data-cropper-aspect]")!;
  const cropSize = overlay.querySelector<HTMLElement>("[data-cropper-size]")!;
  let cropper: Cropper | null = null;

  let loading = true;
  if (options.existingDocument) {
    try {
      const stored = JSON.parse(options.existingDocument) as StoredMarkupDocument;
      if ((stored.version === 1 || stored.version === 2) && stored.canvas) await canvas.loadFromJSON(stored.canvas);
    } catch {
      // A damaged sidecar must never prevent opening the clean source image.
    }
  }
  canvas.insertAt(0, sourceImage);
  loading = false;

  let activeTool: ImageMarkupTool = maskMode ? "highlight" : "select";
  let draftObject: FabricObject | null = null;
  let draftArrow: { line: Line; head: Triangle } | null = null;
  let pointerStart = { x: 0, y: 0 };
  let displayScale = 1;
  let fitToWindow = true;
  let spacePressed = false;
  let panState: { clientX: number; clientY: number; scrollLeft: number; scrollTop: number } | null = null;
  let annotationSequence = annotationObjects(canvas).length;
  const undoStack: string[] = [];
  const redoStack: string[] = [];
  let restoringHistory = false;

  const updateCropSize = (): void => {
    if (!cropper) return;
    const data = cropper.getData(true);
    cropSize.textContent = `${Math.max(1, Math.round(data.width))} × ${Math.max(1, Math.round(data.height))}`;
  };

  const closeCropper = (): void => {
    cropper?.destroy();
    cropper = null;
    cropDialog.hidden = true;
    cropImage.onload = null;
    cropImage.removeAttribute("src");
  };

  const applyCrop = async (selection: ImageCropSelection): Promise<void> => {
    const previous = currentCrop ?? {
      x: 0,
      y: 0,
      width: originalSourceElement.naturalWidth,
      height: originalSourceElement.naturalHeight,
      sourceWidth: originalSourceElement.naturalWidth,
      sourceHeight: originalSourceElement.naturalHeight
    };
    const next = isFullCrop(selection) ? null : selection;
    const nextDisplay = next ?? {
      x: 0,
      y: 0,
      width: originalSourceElement.naturalWidth,
      height: originalSourceElement.naturalHeight,
      sourceWidth: originalSourceElement.naturalWidth,
      sourceHeight: originalSourceElement.naturalHeight
    };
    const offsetX = previous.x - nextDisplay.x;
    const offsetY = previous.y - nextDisplay.y;
    annotationObjects(canvas).forEach((object) => {
      object.set({
        left: (object.left ?? 0) + offsetX,
        top: (object.top ?? 0) + offsetY
      });
      object.setCoords();
    });
    currentCrop = next;
    currentSourceDataUrl = currentCrop
      ? cropDataUrl(originalSourceElement, currentCrop, t)
      : options.sourceDataUrl;
    sourceElement = currentCrop
      ? await imageFromDataUrl(currentSourceDataUrl, t)
      : originalSourceElement;
    canvas.remove(sourceImage);
    sourceImage = new FabricImage(sourceElement, {
      width: sourceElement.naturalWidth,
      height: sourceElement.naturalHeight,
      left: 0,
      top: 0,
      originX: "left",
      originY: "top",
      scaleX: 1,
      scaleY: 1,
      selectable: false,
      evented: false,
      hasControls: false,
      hoverCursor: "default"
    });
    (sourceImage as MarkupFabricObject).annotationSource = true;
    canvas.setDimensions({ width: sourceElement.naturalWidth, height: sourceElement.naturalHeight });
    canvas.insertAt(0, sourceImage);
    canvas.calcOffset();
    applyDisplayScale(Math.min(displayScale, 1));
    renderNotes();
    canvas.requestRenderAll();
  };

  const openCropper = (): void => {
    if (cropper) return;
    cropDialog.hidden = false;
    cropImage.onload = () => {
      const initial = currentCrop ?? {
        x: 0,
        y: 0,
        width: originalSourceElement.naturalWidth,
        height: originalSourceElement.naturalHeight
      };
      cropper = new Cropper(cropImage, {
        viewMode: 1,
        dragMode: "crop",
        autoCropArea: 1,
        background: false,
        responsive: true,
        restore: false,
        checkOrientation: false,
        guides: true,
        center: true,
        cropBoxMovable: true,
        cropBoxResizable: true,
        data: initial,
        crop: updateCropSize
      });
      updateCropSize();
    };
    cropImage.src = options.sourceDataUrl;
  };

  const serializableCanvas = (): Record<string, unknown> => {
    const serialized = canvas.toObject(annotationProperties) as Record<string, unknown> & {
      objects?: Array<Record<string, unknown>>;
    };
    serialized.objects = (serialized.objects ?? []).filter((object) => !object.annotationSource);
    delete serialized.backgroundImage;
    return serialized;
  };
  const snapshot = (): string => JSON.stringify(serializableCanvas());
  const pushHistory = (): void => {
    if (loading || restoringHistory) return;
    const next = snapshot();
    if (undoStack.at(-1) === next) return;
    undoStack.push(next);
    if (undoStack.length > 60) undoStack.shift();
    redoStack.length = 0;
  };
  undoStack.push(snapshot());

  const applyDisplayScale = (nextScale: number, anchor?: { clientX: number; clientY: number }): void => {
    const previousScale = displayScale;
    const previousShellRect = canvasShell.getBoundingClientRect();
    const anchorInSource = anchor
      ? {
          x: (anchor.clientX - previousShellRect.left) / Math.max(.001, previousScale),
          y: (anchor.clientY - previousShellRect.top) / Math.max(.001, previousScale)
        }
      : null;
    displayScale = Math.max(.08, Math.min(2, nextScale));
    const displayWidth = Math.max(1, Math.round(sourceElement.naturalWidth * displayScale));
    const displayHeight = Math.max(1, Math.round(sourceElement.naturalHeight * displayScale));
    // Keep Fabric's CSS canvas at its logical source size and scale the complete
    // wrapper once. Combining cssOnly dimensions with a sized parent can make
    // Chromium apply the fit ratio to both the wrapper and its canvas layers.
    canvas.wrapperEl.style.width = `${sourceElement.naturalWidth}px`;
    canvas.wrapperEl.style.height = `${sourceElement.naturalHeight}px`;
    canvas.wrapperEl.style.transform = `scale(${displayScale})`;
    canvas.wrapperEl.style.transformOrigin = "left top";
    canvas.lowerCanvasEl.style.width = `${sourceElement.naturalWidth}px`;
    canvas.lowerCanvasEl.style.height = `${sourceElement.naturalHeight}px`;
    canvas.upperCanvasEl.style.width = `${sourceElement.naturalWidth}px`;
    canvas.upperCanvasEl.style.height = `${sourceElement.naturalHeight}px`;
    canvasShell.style.width = `${displayWidth}px`;
    canvasShell.style.height = `${displayHeight}px`;
    zoomValue.textContent = `${Math.round(displayScale * 100)}%`;
    canvas.calcOffset();
    if (anchor && anchorInSource) {
      const nextShellRect = canvasShell.getBoundingClientRect();
      stage.scrollLeft += nextShellRect.left + anchorInSource.x * displayScale - anchor.clientX;
      stage.scrollTop += nextShellRect.top + anchorInSource.y * displayScale - anchor.clientY;
      canvas.calcOffset();
    }
  };
  const fitCanvas = (): void => {
    fitToWindow = true;
    const availableWidth = Math.min(820, Math.max(120, stage.clientWidth - 64));
    const availableHeight = Math.max(180, stage.clientHeight - 90);
    applyDisplayScale(Math.min(
      1,
      availableWidth / sourceElement.naturalWidth,
      availableHeight / sourceElement.naturalHeight
    ));
  };

  const renderNotes = (): void => {
    const unique = new Map<string, MarkupFabricObject>();
    for (const object of annotationObjects(canvas)) {
      if (object.annotationId && !unique.has(object.annotationId)) unique.set(object.annotationId, object);
    }
    noteList.innerHTML = maskMode
      ? ""
      : unique.size
      ? [...unique.values()].map((object) => `<label class="markup-note-card"><span>${escapeMarkup(object.annotationLabel ?? "?")}</span><textarea class="ui-field" aria-label="${escapeMarkup(t("create.markup.noteLabel", { label: object.annotationLabel ?? "?" }))}" data-markup-note="${escapeMarkup(object.annotationId ?? "")}">${escapeMarkup(object.annotationNote ?? defaultNote(object.annotationKind ?? "rectangle", t))}</textarea></label>`).join("")
      : `<div class="markup-note-empty">${escapeMarkup(t("create.markup.empty"))}</div>`;
    noteList.querySelectorAll<HTMLTextAreaElement>("[data-markup-note]").forEach((input) => {
      input.addEventListener("input", () => {
        const annotationId = input.dataset.markupNote;
        for (const object of annotationObjects(canvas)) {
          if (object.annotationId === annotationId) object.annotationNote = input.value;
        }
      });
      input.addEventListener("change", pushHistory);
    });
  };

  const decorate = (object: MarkupFabricObject, kind: ImageMarkupTool): MarkupFabricObject => {
    object.annotationId = crypto.randomUUID();
    object.annotationLabel = annotationLabel(annotationSequence++);
    object.annotationKind = kind;
    object.annotationNote = defaultNote(kind, t);
    object.set({ transparentCorners: false, cornerColor: "#7cb8ff", borderColor: "#7cb8ff" });
    return object;
  };

  const labelFor = (object: MarkupFabricObject): Group => new Group([
    new Circle({ radius: 17, fill: colorInput.value, originX: "center", originY: "center", left: 0, top: 0 }),
    new FabricText(object.annotationLabel ?? "?", { originX: "center", originY: "center", left: 0, top: 0, fill: "#ffffff", fontSize: 18, fontWeight: 500 })
  ], { left: -17, top: -17, originX: "left", originY: "top", selectable: false, evented: false });

  const finalizeRegion = (object: MarkupFabricObject, kind: "rectangle" | "ellipse"): void => {
    canvas.remove(object);
    const width = Math.max(1, object.width * Math.abs(object.scaleX));
    const height = Math.max(1, object.height * Math.abs(object.scaleY));
    const shape = kind === "rectangle"
      ? new Rect({ left: 0, top: 0, originX: "left", originY: "top", width, height, fill: "transparent", stroke: colorInput.value, strokeWidth: Number(widthInput.value), strokeUniform: true })
      : new Ellipse({ left: 0, top: 0, originX: "left", originY: "top", rx: width / 2, ry: height / 2, fill: "transparent", stroke: colorInput.value, strokeWidth: Number(widthInput.value), strokeUniform: true });
    const group = new Group([shape, labelFor(object)], { left: object.left - 17, top: object.top - 17, originX: "left", originY: "top" }) as MarkupFabricObject;
    group.annotationLabel = object.annotationLabel;
    group.annotationId = object.annotationId;
    group.annotationKind = kind;
    group.annotationNote = object.annotationNote;
    group.set({ transparentCorners: false, cornerColor: "#7cb8ff", borderColor: "#7cb8ff" });
    canvas.add(group);
    canvas.setActiveObject(group);
    renderNotes();
    pushHistory();
  };

  const selectTool = (tool: ImageMarkupTool): void => {
    activeTool = tool;
    canvas.isDrawingMode = tool === "brush" || tool === "highlight";
    canvas.selection = tool === "select";
    canvas.defaultCursor = tool === "select" ? "grab" : "crosshair";
    canvas.forEachObject((object) => {
      if ((object as MarkupFabricObject).annotationSource) return;
      object.selectable = tool === "select" || tool === "eraser";
      object.evented = tool === "select" || tool === "eraser";
    });
    if (canvas.isDrawingMode) {
      const brush = new PencilBrush(canvas);
      brush.color = tool === "highlight" ? `${colorInput.value}66` : colorInput.value;
      brush.width = Number(widthInput.value) * (tool === "highlight" ? 3 : 1);
      canvas.freeDrawingBrush = brush;
    }
    overlay.querySelectorAll<HTMLElement>("[data-markup-tool]").forEach((button) => {
      button.classList.toggle("active", button.dataset.markupTool === tool);
      button.setAttribute("aria-pressed", String(button.dataset.markupTool === tool));
    });
    canvas.discardActiveObject();
    canvas.requestRenderAll();
  };

  const restoreSnapshot = async (serialized: string): Promise<void> => {
    restoringHistory = true;
    await canvas.loadFromJSON(serialized);
    canvas.insertAt(0, sourceImage);
    restoringHistory = false;
    annotationSequence = Math.max(annotationSequence, annotationObjects(canvas).length);
    selectTool(maskMode ? "highlight" : "select");
    renderNotes();
  };

  canvas.on("path:created", (event) => {
    const path = decorate(event.path as MarkupFabricObject, activeTool === "highlight" ? "highlight" : "brush");
    path.strokeUniform = true;
    renderNotes();
    pushHistory();
  });
  canvas.on("object:modified", () => pushHistory());
  canvas.on("mouse:down", (event: TPointerEventInfo) => {
    const pointerEvent = event.e as MouseEvent;
    const shouldPan = pointerEvent.button === 1 || spacePressed || (
      activeTool === "select" && pointerEvent.button === 0 && !event.target
    );
    if (shouldPan) {
      pointerEvent.preventDefault();
      panState = {
        clientX: pointerEvent.clientX,
        clientY: pointerEvent.clientY,
        scrollLeft: stage.scrollLeft,
        scrollTop: stage.scrollTop
      };
      canvas.selection = false;
      canvas.defaultCursor = "grabbing";
      canvas.setCursor("grabbing");
      return;
    }
    if (activeTool === "eraser") {
      const target = event.target as MarkupFabricObject | undefined;
      if (target?.annotationId) {
        canvas.getObjects().filter((object) => (object as MarkupFabricObject).annotationId === target.annotationId).forEach((object) => canvas.remove(object));
        renderNotes();
        pushHistory();
      }
      return;
    }
    if (activeTool === "text") {
      const point = canvas.getScenePoint(event.e);
      const text = decorate(new IText(t("create.finish.textPlaceholder"), {
        left: point.x,
        top: point.y,
        originX: "left",
        originY: "top",
        fill: colorInput.value,
        stroke: "rgba(0, 0, 0, .72)",
        strokeWidth: 1.5,
        strokeUniform: true,
        paintFirst: "stroke",
        fontSize: Math.max(28, Number(widthInput.value) * 4),
        fontWeight: 700,
        backgroundColor: "transparent"
      }) as MarkupFabricObject, "text") as IText & MarkupFabricObject;
      canvas.add(text);
      canvas.setActiveObject(text);
      text.enterEditing();
      text.selectAll();
      renderNotes();
  pushHistory();
  selectTool(maskMode ? "highlight" : "select");
      return;
    }
    if (activeTool !== "rectangle" && activeTool !== "ellipse" && activeTool !== "arrow") return;
    const point = canvas.getScenePoint(event.e);
    pointerStart = { x: point.x, y: point.y };
    if (activeTool === "arrow") {
      const strokeWidth = Number(widthInput.value);
      const line = new Line([point.x, point.y, point.x, point.y], {
        stroke: colorInput.value,
        strokeWidth,
        strokeUniform: true,
        selectable: false,
        evented: false
      });
      const head = new Triangle({
        left: point.x,
        top: point.y,
        width: strokeWidth * 3,
        height: strokeWidth * 3.8,
        fill: colorInput.value,
        angle: 90,
        originX: "center",
        originY: "center",
        selectable: false,
        evented: false
      });
      draftArrow = { line, head };
      canvas.add(line, head);
      return;
    }
    draftObject = activeTool === "ellipse"
      ? new Ellipse({ left: point.x, top: point.y, originX: "left", originY: "top", rx: 1, ry: 1, fill: "transparent", stroke: colorInput.value, strokeWidth: Number(widthInput.value), selectable: false, evented: false })
      : new Rect({ left: point.x, top: point.y, originX: "left", originY: "top", width: 1, height: 1, fill: "transparent", stroke: colorInput.value, strokeWidth: Number(widthInput.value), selectable: false, evented: false });
    canvas.add(draftObject);
  });
  canvas.on("mouse:move", (event: TPointerEventInfo) => {
    if (panState) {
      const pointerEvent = event.e as MouseEvent;
      stage.scrollLeft = panState.scrollLeft - (pointerEvent.clientX - panState.clientX);
      stage.scrollTop = panState.scrollTop - (pointerEvent.clientY - panState.clientY);
      canvas.calcOffset();
      return;
    }
    if (draftArrow) {
      const point = canvas.getScenePoint(event.e);
      const angle = Math.atan2(point.y - pointerStart.y, point.x - pointerStart.x) * 180 / Math.PI + 90;
      draftArrow.line.set({ x1: pointerStart.x, y1: pointerStart.y, x2: point.x, y2: point.y });
      draftArrow.head.set({ left: point.x, top: point.y, angle });
      draftArrow.line.setCoords();
      draftArrow.head.setCoords();
      canvas.requestRenderAll();
      return;
    }
    if (!draftObject) return;
    const point = canvas.getScenePoint(event.e);
    const left = Math.min(pointerStart.x, point.x);
    const top = Math.min(pointerStart.y, point.y);
    const width = Math.max(1, Math.abs(point.x - pointerStart.x));
    const height = Math.max(1, Math.abs(point.y - pointerStart.y));
    if (draftObject instanceof Ellipse) draftObject.set({ left, top, rx: width / 2, ry: height / 2 });
    else draftObject.set({ left, top, width, height });
    canvas.requestRenderAll();
  });
  canvas.on("mouse:up", (event: TPointerEventInfo) => {
    if (panState) {
      panState = null;
      canvas.selection = activeTool === "select";
      canvas.isDrawingMode = activeTool === "brush" || activeTool === "highlight";
      canvas.defaultCursor = activeTool === "select" ? "grab" : "crosshair";
      canvas.setCursor(canvas.defaultCursor);
      return;
    }
    if (draftArrow) {
      const { line, head } = draftArrow;
      draftArrow = null;
      canvas.remove(line, head);
      line.set({ selectable: true, evented: true });
      head.set({ selectable: true, evented: true });
      const group = decorate(new Group([line, head], {}) as MarkupFabricObject, "arrow");
      canvas.add(group);
      canvas.setActiveObject(group);
      renderNotes();
      pushHistory();
      selectTool("select");
      return;
    }
    if (!draftObject) return;
    const object = draftObject as MarkupFabricObject;
    draftObject = null;
    const regionTool = activeTool as "rectangle" | "ellipse";
    decorate(object, regionTool);
    finalizeRegion(object, regionTool);
    selectTool("select");
  });

  const onStageWheel = (event: WheelEvent): void => {
    event.preventDefault();
    fitToWindow = false;
    const zoomFactor = Math.exp(-event.deltaY * .0015);
    applyDisplayScale(displayScale * zoomFactor, {
      clientX: event.clientX,
      clientY: event.clientY
    });
  };
  stage.addEventListener("wheel", onStageWheel, { passive: false });
  const resizeObserver = new ResizeObserver(() => { if (fitToWindow) fitCanvas(); else canvas.calcOffset(); });
  resizeObserver.observe(stage);

  overlay.querySelector("[data-markup-crop]")?.addEventListener("click", openCropper);
  overlay.querySelectorAll<HTMLElement>("[data-markup-tool]").forEach((button) => button.addEventListener("click", () => selectTool(button.dataset.markupTool as ImageMarkupTool)));
  overlay.querySelector("[data-markup-zoom-in]")?.addEventListener("click", () => { fitToWindow = false; applyDisplayScale(displayScale * 1.2); });
  overlay.querySelector("[data-markup-zoom-out]")?.addEventListener("click", () => { fitToWindow = false; applyDisplayScale(displayScale / 1.2); });
  overlay.querySelector("[data-markup-fit]")?.addEventListener("click", fitCanvas);
  overlay.querySelector("[data-cropper-cancel]")?.addEventListener("click", closeCropper);
  overlay.querySelector("[data-cropper-reset]")?.addEventListener("click", () => {
    if (!cropper) return;
    cropper.setData({
      x: 0,
      y: 0,
      width: originalSourceElement.naturalWidth,
      height: originalSourceElement.naturalHeight,
      rotate: 0,
      scaleX: 1,
      scaleY: 1
    });
    updateCropSize();
  });
  cropAspect.addEventListener("change", () => {
    if (!cropper) return;
    const value = cropAspect.value;
    cropper.setAspectRatio(value === "free" ? NaN : value === "original"
      ? originalSourceElement.naturalWidth / originalSourceElement.naturalHeight
      : Number(value));
    updateCropSize();
  });
  overlay.querySelector("[data-cropper-apply]")?.addEventListener("click", async () => {
    if (!cropper) return;
    const data = cropper.getData(true);
    const selection = normalizeCropSelection({
      x: data.x,
      y: data.y,
      width: data.width,
      height: data.height,
      sourceWidth: originalSourceElement.naturalWidth,
      sourceHeight: originalSourceElement.naturalHeight
    });
    try {
      await applyCrop(selection);
      closeCropper();
      pushHistory();
    } catch (error) {
      window.console.error("Failed to apply image crop", error);
    }
  });
  overlay.querySelector("[data-markup-undo]")?.addEventListener("click", async () => {
    if (undoStack.length <= 1) return;
    const current = undoStack.pop();
    if (current) redoStack.push(current);
    await restoreSnapshot(undoStack.at(-1) ?? JSON.stringify({ objects: [] }));
  });
  overlay.querySelector("[data-markup-redo]")?.addEventListener("click", async () => {
    const next = redoStack.pop();
    if (!next) return;
    undoStack.push(next);
    await restoreSnapshot(next);
  });
  const syncColor = (): void => {
    overlay.querySelectorAll<HTMLElement>("[data-markup-swatch]").forEach(button =>
      button.setAttribute("aria-pressed", String(button.dataset.markupSwatch === colorInput.value)));
    selectTool(activeTool);
  };
  overlay.querySelectorAll<HTMLElement>("[data-markup-swatch]").forEach(button => button.addEventListener("click", () => {
    colorInput.value = button.dataset.markupSwatch!; syncColor();
  }));
  colorInput.addEventListener("input", syncColor);
  widthInput.addEventListener("input", () => { widthNumber.value = widthInput.value; selectTool(activeTool); });
  widthNumber.addEventListener("change", () => {
    if (!Number.isFinite(widthNumber.valueAsNumber)) { widthNumber.value = widthInput.value; return; }
    widthInput.value = widthNumber.value; widthNumber.value = widthInput.value;
    paintRangeFill(widthInput); selectTool(activeTool);
  });

  renderNotes();
  window.requestAnimationFrame(fitCanvas);
  selectTool(maskMode ? "highlight" : "select");

  return new Promise<ImageMarkupEditorResult | null>((resolve) => {
    let finished = false;
    const finish = (result: ImageMarkupEditorResult | null): void => {
      if (finished) return;
      finished = true;
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      stage.removeEventListener("wheel", onStageWheel);
      resizeObserver.disconnect();
      closeCropper();
      canvas.dispose();
      overlay.remove();
      document.body.classList.remove("image-markup-open");
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      resolve(result);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      const editableTarget = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      if (event.key === "Tab") {
        const scope = cropDialog.hidden ? overlay : cropDialog;
        const focusable = [...scope.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), textarea, select:not(:disabled), [tabindex='0']")]
          .filter(element => element.getClientRects().length && !element.closest("[hidden]"));
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && (document.activeElement === first || !scope.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !scope.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
      }
      if (event.key === "Escape") {
        if (overlay.querySelector('[aria-expanded="true"]')) return;
        event.preventDefault(); event.stopImmediatePropagation();
        if (!cropDialog.hidden) closeCropper(); else finish(null);
        return;
      }
      if (!cropDialog.hidden) return;
      if (event.code === "Space" && !editableTarget) {
        event.preventDefault();
        spacePressed = true;
        canvas.isDrawingMode = false;
        canvas.selection = false;
        canvas.defaultCursor = "grab";
        canvas.setCursor("grab");
      }
      if (event.ctrlKey && event.key.toLowerCase() === "z" && !editableTarget && !(canvas.getActiveObject() instanceof IText && (canvas.getActiveObject() as IText).isEditing)) {
        event.preventDefault();
        (overlay.querySelector(event.shiftKey ? "[data-markup-redo]" : "[data-markup-undo]") as HTMLButtonElement | null)?.click();
      }
      if (event.ctrlKey && event.key.toLowerCase() === "y" && !editableTarget) {
        event.preventDefault();
        (overlay.querySelector("[data-markup-redo]") as HTMLButtonElement | null)?.click();
      }
      if ((event.key === "Delete" || event.key === "Backspace") && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
        const selected = canvas.getActiveObjects();
        selected.forEach((object) => canvas.remove(object));
        canvas.discardActiveObject();
        renderNotes();
        pushHistory();
      }
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.code !== "Space") return;
      spacePressed = false;
      if (!panState) {
        canvas.isDrawingMode = activeTool === "brush" || activeTool === "highlight";
        canvas.selection = activeTool === "select";
        canvas.defaultCursor = activeTool === "select" ? "grab" : "crosshair";
        canvas.setCursor(canvas.defaultCursor);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    overlay.querySelector<HTMLButtonElement>("[data-markup-cancel]")?.focus({ preventScroll: true });
    overlay.querySelector("[data-markup-cancel]")?.addEventListener("click", () => finish(null));
    overlay.querySelector("[data-markup-save]")?.addEventListener("click", async () => {
      const objects = annotationObjects(canvas);
      if (!objects.length) {
        finish({
          document: "",
          renderedPng: new ArrayBuffer(0),
          summary: "",
          objectCount: 0,
          crop: currentCrop,
          ...(currentCrop ? { croppedPng: await dataUrlToArrayBuffer(currentSourceDataUrl) } : {})
        });
        return;
      }
      const unique = new Map<string, MarkupFabricObject>();
      for (const object of objects) if (object.annotationId && !unique.has(object.annotationId)) unique.set(object.annotationId, object);
      const summary = maskMode
        ? t("create.finish.maskRegions", { count: unique.size })
        : [...unique.values()].map((object) => `${object.annotationLabel ?? "?"}：${(object.annotationNote ?? defaultNote(object.annotationKind ?? "rectangle", t)).trim()}`).join("\n");
      canvas.discardActiveObject();
      canvas.requestRenderAll();
      const document: StoredMarkupDocument = {
        version: 2,
        sourceWidth: sourceElement.naturalWidth,
        sourceHeight: sourceElement.naturalHeight,
        crop: currentCrop,
        canvas: serializableCanvas()
      };
      if (maskMode) {
        sourceImage.visible = false;
        canvas.backgroundColor = "#000000";
        for (const object of objects) {
          object.set({ opacity: 1, stroke: "#ffffff", fill: "#ffffff" });
        }
        canvas.requestRenderAll();
      }
      const blob = await canvas.toBlob({ format: "png", multiplier: 1, enableRetinaScaling: false });
      if (!blob) throw new Error(t(uiKeys.uiError.annotationExport));
      finish({
        document: JSON.stringify(document),
        renderedPng: await blob.arrayBuffer(),
        summary,
        objectCount: unique.size,
        crop: currentCrop,
        ...(currentCrop ? { croppedPng: await dataUrlToArrayBuffer(currentSourceDataUrl) } : {})
      });
    });
  });
}
