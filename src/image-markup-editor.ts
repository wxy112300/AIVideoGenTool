import {
  Canvas,
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
  version: 1;
  sourceWidth: number;
  sourceHeight: number;
  canvas: Record<string, unknown>;
}

export interface ImageMarkupEditorOptions {
  pictureNumber: number;
  filename: string;
  sourceDataUrl: string;
  existingDocument?: string | null;
}

export interface ImageMarkupEditorResult {
  document: string;
  renderedPng: ArrayBuffer;
  summary: string;
  objectCount: number;
}

const toolLabels: Record<ImageMarkupTool, string> = {
  select: "选择",
  brush: "画笔",
  highlight: "高亮",
  rectangle: "矩形",
  ellipse: "椭圆",
  arrow: "箭头",
  text: "文字",
  eraser: "删除"
};

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

function defaultNote(kind: ImageMarkupTool): string {
  return kind === "arrow"
    ? "按箭头指示调整位置或方向"
    : kind === "text"
      ? "按标注文字执行修改"
      : kind === "highlight"
        ? "重点修改高亮区域"
        : "只修改标记区域";
}

function dataUrlFilename(filename: string): string {
  return filename.split(/[\\/]/u).pop() ?? filename;
}

export async function openImageMarkupEditor(
  options: ImageMarkupEditorOptions
): Promise<ImageMarkupEditorResult | null> {
  const sourceElement = document.createElement("img");
  sourceElement.src = options.sourceDataUrl;
  await sourceElement.decode();
  if (!sourceElement.naturalWidth || !sourceElement.naturalHeight) {
    throw new Error("无法读取 Picture 尺寸");
  }

  const overlay = document.createElement("div");
  overlay.className = "image-markup-overlay";
  overlay.innerHTML = `
    <header class="image-markup-header">
      <div><strong>标记 Picture ${options.pictureNumber}</strong><span>${escapeMarkup(dataUrlFilename(options.filename))} · 原图不会被修改</span></div>
      <div class="button-row"><button class="secondary" data-markup-cancel>取消</button><button class="primary" data-markup-save>保存标记</button></div>
    </header>
    <div class="image-markup-body">
      <aside class="image-markup-tools" aria-label="标记工具">
        ${(["select", "brush", "highlight", "rectangle", "ellipse", "arrow", "text", "eraser"] as ImageMarkupTool[]).map((tool) => `<button class="${tool === "select" ? "active" : ""}" data-markup-tool="${tool}" title="${toolLabels[tool]}">${toolLabels[tool]}</button>`).join("")}
        <span class="markup-tool-divider"></span>
        <button data-markup-undo title="撤销">撤销</button><button data-markup-redo title="重做">重做</button>
      </aside>
      <main class="image-markup-stage"><div class="image-markup-canvas-shell"><canvas data-markup-canvas></canvas></div><div class="markup-zoom"><button data-markup-zoom-out>−</button><span data-markup-zoom-value>100%</span><button data-markup-zoom-in>＋</button><button data-markup-fit>适应窗口</button></div></main>
      <aside class="image-markup-inspector">
        <div><strong>标记说明</strong><p>区域自动编号，说明会同时进入 Prompt。滚轮缩放；选择工具下拖动画面平移，也可用中键或 Space + 拖动。</p></div>
        <div class="markup-note-list" data-markup-note-list></div>
        <div class="markup-style-controls"><label>颜色<input type="color" data-markup-color value="#ff4f55"></label><label>线宽<input type="range" data-markup-width min="2" max="28" value="8"></label></div>
        <p class="markup-removal-hint">最终提示会要求模型移除框线、箭头、编号和标注文字。</p>
      </aside>
    </div>`;
  document.body.append(overlay);
  document.body.classList.add("image-markup-open");

  const canvasElement = overlay.querySelector<HTMLCanvasElement>("[data-markup-canvas]")!;
  const stage = overlay.querySelector<HTMLElement>(".image-markup-stage")!;
  const canvasShell = overlay.querySelector<HTMLElement>(".image-markup-canvas-shell")!;
  const noteList = overlay.querySelector<HTMLElement>("[data-markup-note-list]")!;
  const colorInput = overlay.querySelector<HTMLInputElement>("[data-markup-color]")!;
  const widthInput = overlay.querySelector<HTMLInputElement>("[data-markup-width]")!;
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
  const sourceImage = new FabricImage(sourceElement, {
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

  let loading = true;
  if (options.existingDocument) {
    try {
      const stored = JSON.parse(options.existingDocument) as StoredMarkupDocument;
      if (stored.version === 1 && stored.canvas) await canvas.loadFromJSON(stored.canvas);
    } catch {
      // A damaged sidecar must never prevent opening the clean source image.
    }
  }
  canvas.insertAt(0, sourceImage);
  loading = false;

  let activeTool: ImageMarkupTool = "select";
  let draftObject: FabricObject | null = null;
  let draftArrow: { line: Line; head: Triangle } | null = null;
  let pointerStart = { x: 0, y: 0 };
  let displayScale = 1;
  let spacePressed = false;
  let panState: { clientX: number; clientY: number; scrollLeft: number; scrollTop: number } | null = null;
  let annotationSequence = annotationObjects(canvas).length;
  const undoStack: string[] = [];
  const redoStack: string[] = [];
  let restoringHistory = false;

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
    const availableWidth = Math.max(240, stage.clientWidth - 70);
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
    noteList.innerHTML = unique.size
      ? [...unique.values()].map((object) => `<label class="markup-note-card"><span>${escapeMarkup(object.annotationLabel ?? "?")}</span><textarea data-markup-note="${escapeMarkup(object.annotationId ?? "")}">${escapeMarkup(object.annotationNote ?? defaultNote(object.annotationKind ?? "rectangle"))}</textarea></label>`).join("")
      : `<div class="markup-note-empty">画出区域、箭头或文字后，可在这里补充具体要求。</div>`;
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
    object.annotationNote = defaultNote(kind);
    object.set({ transparentCorners: false, cornerColor: "#7cb8ff", borderColor: "#7cb8ff" });
    return object;
  };

  const labelFor = (object: MarkupFabricObject): FabricText => new FabricText(
    object.annotationLabel ?? "?",
    { left: 8, top: 6, originX: "left", originY: "top", fill: "#ffffff", fontSize: 26, fontWeight: 800, backgroundColor: colorInput.value, selectable: false, evented: false }
  );

  const finalizeRegion = (object: MarkupFabricObject, kind: "rectangle" | "ellipse"): void => {
    canvas.remove(object);
    const width = Math.max(1, object.width * Math.abs(object.scaleX));
    const height = Math.max(1, object.height * Math.abs(object.scaleY));
    const shape = kind === "rectangle"
      ? new Rect({ left: 0, top: 0, originX: "left", originY: "top", width, height, fill: "transparent", stroke: colorInput.value, strokeWidth: Number(widthInput.value), strokeUniform: true })
      : new Ellipse({ left: 0, top: 0, originX: "left", originY: "top", rx: width / 2, ry: height / 2, fill: "transparent", stroke: colorInput.value, strokeWidth: Number(widthInput.value), strokeUniform: true });
    const group = new Group([shape, labelFor(object)], { left: object.left, top: object.top, originX: "left", originY: "top" }) as MarkupFabricObject;
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
    overlay.querySelectorAll<HTMLElement>("[data-markup-tool]").forEach((button) => button.classList.toggle("active", button.dataset.markupTool === tool));
    canvas.discardActiveObject();
    canvas.requestRenderAll();
  };

  const restoreSnapshot = async (serialized: string): Promise<void> => {
    restoringHistory = true;
    await canvas.loadFromJSON(serialized);
    canvas.insertAt(0, sourceImage);
    restoringHistory = false;
    annotationSequence = Math.max(annotationSequence, annotationObjects(canvas).length);
    selectTool("select");
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
      const text = decorate(new IText("输入说明", {
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
      selectTool("select");
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
    const zoomFactor = Math.exp(-event.deltaY * .0015);
    applyDisplayScale(displayScale * zoomFactor, {
      clientX: event.clientX,
      clientY: event.clientY
    });
  };
  stage.addEventListener("wheel", onStageWheel, { passive: false });

  overlay.querySelectorAll<HTMLElement>("[data-markup-tool]").forEach((button) => button.addEventListener("click", () => selectTool(button.dataset.markupTool as ImageMarkupTool)));
  overlay.querySelector("[data-markup-zoom-in]")?.addEventListener("click", () => applyDisplayScale(displayScale * 1.2));
  overlay.querySelector("[data-markup-zoom-out]")?.addEventListener("click", () => applyDisplayScale(displayScale / 1.2));
  overlay.querySelector("[data-markup-fit]")?.addEventListener("click", fitCanvas);
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
  colorInput.addEventListener("input", () => selectTool(activeTool));
  widthInput.addEventListener("input", () => selectTool(activeTool));

  renderNotes();
  window.requestAnimationFrame(fitCanvas);

  return new Promise<ImageMarkupEditorResult | null>((resolve) => {
    let finished = false;
    const finish = (result: ImageMarkupEditorResult | null): void => {
      if (finished) return;
      finished = true;
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      stage.removeEventListener("wheel", onStageWheel);
      canvas.dispose();
      overlay.remove();
      document.body.classList.remove("image-markup-open");
      resolve(result);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      const editableTarget = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      if (event.code === "Space" && !editableTarget) {
        event.preventDefault();
        spacePressed = true;
        canvas.isDrawingMode = false;
        canvas.selection = false;
        canvas.defaultCursor = "grab";
        canvas.setCursor("grab");
      }
      if (event.key === "Escape") finish(null);
      if (event.ctrlKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        (overlay.querySelector("[data-markup-undo]") as HTMLButtonElement | null)?.click();
      }
      if (event.ctrlKey && event.key.toLowerCase() === "y") {
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
    overlay.querySelector("[data-markup-cancel]")?.addEventListener("click", () => finish(null));
    overlay.querySelector("[data-markup-save]")?.addEventListener("click", async () => {
      const objects = annotationObjects(canvas);
      if (!objects.length) {
        finish({ document: "", renderedPng: new ArrayBuffer(0), summary: "", objectCount: 0 });
        return;
      }
      const unique = new Map<string, MarkupFabricObject>();
      for (const object of objects) if (object.annotationId && !unique.has(object.annotationId)) unique.set(object.annotationId, object);
      const summary = [...unique.values()].map((object) => `${object.annotationLabel ?? "?"}：${(object.annotationNote ?? defaultNote(object.annotationKind ?? "rectangle")).trim()}`).join("\n");
      canvas.discardActiveObject();
      canvas.requestRenderAll();
      const blob = await canvas.toBlob({ format: "png", multiplier: 1, enableRetinaScaling: false });
      if (!blob) throw new Error("无法导出标注图片");
      const document: StoredMarkupDocument = {
        version: 1,
        sourceWidth: sourceElement.naturalWidth,
        sourceHeight: sourceElement.naturalHeight,
        canvas: serializableCanvas()
      };
      finish({
        document: JSON.stringify(document),
        renderedPng: await blob.arrayBuffer(),
        summary,
        objectCount: unique.size
      });
    });
  });
}
