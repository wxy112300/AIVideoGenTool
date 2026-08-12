import type {
  H3ReferenceMediaType,
  H3ReferenceRole,
  H3ReferenceSlot
} from "../../../types";
import type {
  H3CameraMotion,
  H3PromptBuilderInput
} from "../../../core/h3-prompt";

type EscapeHtml = (value: unknown) => string;
type IconRenderer = (name: string, className?: string) => string;

export interface CreateModelOptionViewModel {
  id: string;
  name: string;
  selected: boolean;
  unavailable: boolean;
  modeLabel: string;
  suffix: string;
}

interface CreateFragmentRenderOptions {
  icon: IconRenderer;
  escapeHtml: EscapeHtml;
}

interface H3ReferenceSlotsRenderOptions extends CreateFragmentRenderOptions {
  h3ReferenceRoleLabels: Record<H3ReferenceRole, string>;
}

const h3CameraMotionLabels: Array<[H3CameraMotion, string]> = [
  ["static", "固定镜头"],
  ["push-in", "Push in · 推近"],
  ["pull-out", "Pull out · 后退"],
  ["zoom-in", "Zoom in · 变焦推近"],
  ["zoom-out", "Zoom out · 变焦拉远"],
  ["pan-left", "Pan left · 向左摇摄"],
  ["pan-right", "Pan right · 向右摇摄"],
  ["truck-left", "Truck left · 向左平移"],
  ["truck-right", "Truck right · 向右平移"],
  ["tilt-up", "Tilt up · 向上俯仰"],
  ["tilt-down", "Tilt down · 向下俯仰"],
  ["pedestal-up", "Pedestal up · 升降向上"],
  ["pedestal-down", "Pedestal down · 升降向下"],
  ["tracking", "Tracking · 跟拍"],
  ["arc", "Arc shot · 弧线环绕"],
  ["pov", "POV · 主观视角"],
  ["roll-clockwise", "Roll clockwise · 顺时针旋转"],
  ["roll-counterclockwise", "Roll counterclockwise · 逆时针旋转"],
  ["shake-slight", "Slight handheld · 轻微手持"]
];

const imageEditPromptInstructions: Array<[string, string]> = [
  ["", "选择保持、编辑或禁止项"],
  ["保持 Picture 1 的主体身份、构图、光源方向和背景结构不变。", "保持基础画面"],
  ["以带标记 Picture 中每一条标记说明作为具体修改清单，只执行这些说明。本条指令不新增、不替代任何标记要求；如果与某条标记说明冲突，以标记说明为准。除完成标记要求所必需的局部调整外，保持所有未标记区域和未提及内容不变。", "按标记局部修改"],
  ["只修改明确指定的区域，不要改变画面中的其他内容。", "只修改指定内容"],
  ["移除指定元素，并使用周围纹理、光影和透视自然补全区域。", "自然移除元素"],
  ["添加指定元素，并匹配原图的透视、尺度、光照、阴影、景深和颗粒。", "自然添加元素"],
  ["修复抠图边缘、色温、光源方向、接触阴影、透视、景深和清晰度不一致造成的合成痕迹。", "修复合成痕迹"],
  ["不要添加文字、Logo、水印或用户未要求的新元素。", "禁止新增文字或元素"]
];

function h3BuilderValue(
  builder: H3PromptBuilderInput,
  field: keyof H3PromptBuilderInput,
  escapeHtml: EscapeHtml
): string {
  return escapeHtml(builder[field]);
}

function h3BuilderTextField(
  builder: H3PromptBuilderInput,
  field: keyof H3PromptBuilderInput,
  label: string,
  placeholder: string,
  escapeHtml: EscapeHtml,
  rows = 2
): string {
  const value = h3BuilderValue(builder, field, escapeHtml);
  return rows > 0
    ? `<label>${label}<textarea rows="${rows}" data-h3-builder="${field}" placeholder="${escapeHtml(placeholder)}">${value}</textarea></label>`
    : `<label>${label}<input data-h3-builder="${field}" value="${value}" placeholder="${escapeHtml(placeholder)}"></label>`;
}

function h3BuilderSelect(
  builder: H3PromptBuilderInput,
  field: keyof H3PromptBuilderInput,
  label: string,
  options: ReadonlyArray<readonly [string, string]>,
  escapeHtml: EscapeHtml
): string {
  const selected = String(builder[field]);
  return `<label>${label}<select data-h3-builder="${field}">${options
    .map(([value, optionLabel]) => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(optionLabel)}</option>`)
    .join("")}</select></label>`;
}

function h3ReferenceSlotRoleOptions(
  role: H3ReferenceRole,
  roleLabels: Record<H3ReferenceRole, string>
): string {
  return (Object.entries(roleLabels) as Array<[H3ReferenceRole, string]>)
    .map(([value, label]) => `<option value="${value}" ${value === role ? "selected" : ""}>${label}</option>`)
    .join("");
}

export function renderImageEditPromptInstructionOptions(escapeHtml: EscapeHtml): string {
  return imageEditPromptInstructions
    .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
    .join("");
}

export function renderH3PromptBuilderMarkup(
  builder: H3PromptBuilderInput,
  options: CreateFragmentRenderOptions
): string {
  const { icon, escapeHtml } = options;
  return `
    <div class="h3-prompt-builder">
      <div class="h3-builder-heading"><div><strong>结构化构建器</strong><span>把提示词拆成镜头、动作、连续性和声音决策；生成结果会新建一个版本。</span></div><span class="model-badge">H3 Guide</span></div>
      <div class="h3-builder-grid">
        ${h3BuilderTextField(builder, "style", "视觉风格", "Live-action, cinematic, 2D animated…", escapeHtml, 0)}
        ${h3BuilderTextField(builder, "subject", "主体与初始构图", "谁在什么环境里，以什么姿态和构图开始？", escapeHtml)}
        ${h3BuilderTextField(builder, "action", "动作时间线", "先写一个小的自然起因，再写主要动作和可见反应。", escapeHtml)}
        ${h3BuilderTextField(builder, "continuity", "参考图与连续性锁", "身份、服装、位置、灯光、背景中哪些必须保持？", escapeHtml)}
        ${h3BuilderTextField(builder, "physicalLock", "身体 / 视线锁定", "例如：脚、髋、肩、头和视线保持朝向不变。", escapeHtml)}
        ${h3BuilderSelect(builder, "cameraMotion", "镜头运动", h3CameraMotionLabels, escapeHtml)}
        ${h3BuilderSelect(builder, "cameraAmplitude", "运动幅度", [["small", "Small amplitude · 小幅度"], ["large", "Large amplitude · 大幅度"]], escapeHtml)}
        ${h3BuilderSelect(builder, "cameraSpeed", "运动速度", [["slow", "Slow speed · 慢速"], ["fast", "Fast speed · 快速"]], escapeHtml)}
        ${h3BuilderTextField(builder, "framing", "景别变化", "例如：近景 → 半身 → 全身 → 环境广角；写清由什么运动造成变化。", escapeHtml)}
        ${h3BuilderTextField(builder, "diegeticSound", "画面同步声音", "动作发生时，哪些可见反应和现场声音同步出现？", escapeHtml)}
        ${h3BuilderTextField(builder, "finalState", "最终状态", "动作结束时主体、镜头、环境和画面停在哪里？", escapeHtml)}
      </div>
      <details class="h3-builder-optional">
        <summary><strong>声音、对白与屏幕文字</strong><span>可选高级字段</span>${icon("chevron-down")}</summary>
        <div class="h3-builder-grid optional">
          ${h3BuilderTextField(builder, "soundscape", "整体环境声", "风、脚步、房间底噪、回声；不要重复对白。", escapeHtml)}
          ${h3BuilderTextField(builder, "music", "非叙事音乐", "只写观众听到的背景音乐；没有就保留 N/A。", escapeHtml)}
          ${h3BuilderTextField(builder, "dialogueSpeaker", "说话人 ID", "S1", escapeHtml, 0)}
          ${h3BuilderTextField(builder, "dialogueLanguage", "对白语言", "Chinese / English", escapeHtml, 0)}
          ${h3BuilderTextField(builder, "dialogueDelivery", "声音与表达", "a clear, restrained Mandarin voice", escapeHtml, 0)}
          ${h3BuilderTextField(builder, "dialogueText", "准确对白", "只填写角色实际说出的原文；留空表示无对白。", escapeHtml)}
          ${h3BuilderTextField(builder, "onScreenText", "屏幕文字", "可见招牌、字幕或标签；会原样放入英文双引号。", escapeHtml, 0)}
        </div>
      </details>
      <div class="h3-builder-actions"><button class="ghost button-with-icon" id="h3-builder-reset" type="button">${icon("refresh-cw")}重置构建器</button><button class="primary button-with-icon" id="h3-builder-generate" type="button">${icon("wand-sparkles")}生成结构化版本</button></div>
    </div>`;
}

export function renderH3ReferenceSlotsMarkup(
  slots: ReadonlyArray<H3ReferenceSlot>,
  options: H3ReferenceSlotsRenderOptions
): string {
  const { icon, escapeHtml, h3ReferenceRoleLabels } = options;
  const referenceOrdinals = new Map<string, number>();
  const typeCounts: Record<H3ReferenceMediaType, number> = { image: 0, video: 0 };
  slots.forEach((slot) => {
    typeCounts[slot.mediaType] += 1;
    referenceOrdinals.set(slot.id, typeCounts[slot.mediaType]);
  });
  return `
    ${slots.length ? `<div class="h3-reference-grid">${slots.map((slot, index) => `
      <article class="h3-reference-slot" data-h3-slot="${escapeHtml(slot.id)}">
        <div class="h3-reference-slot-head">
          <div><strong>Slot ${index + 1}</strong><span>&lt;${slot.mediaType === "video" ? "Video" : "Picture"} ${referenceOrdinals.get(slot.id)}&gt; · ${slot.mediaType === "video" ? "参考视频" : "参考图片"}</span></div>
          <div class="h3-reference-slot-actions"><select class="h3-slot-type" data-h3-slot-type="${escapeHtml(slot.id)}" aria-label="Slot ${index + 1} 媒体类型"><option value="image" ${slot.mediaType === "image" ? "selected" : ""}>图片</option><option value="video" ${slot.mediaType === "video" ? "selected" : ""}>视频</option></select><button class="secondary" data-insert-h3-slot="${escapeHtml(slot.id)}" type="button">插入标签</button><button class="icon-button" data-remove-h3-slot="${escapeHtml(slot.id)}" aria-label="移除 Slot ${index + 1}" title="移除 Slot">${icon("x")}</button></div>
        </div>
        ${slot.mediaType === "video" && slot.mediaPath
          ? `<div class="drop-zone h3-reference-drop has-image h3-video-reference" data-drop-h3-slot="${escapeHtml(slot.id)}" data-drop-label="松开以替换参考视频">
              <video controls playsinline preload="metadata" src="studio-media://draft/reference-video?source=${encodeURIComponent(slot.mediaPath)}" aria-label="参考视频 ${referenceOrdinals.get(slot.id)}"></video>
              <button class="image-remove button-with-icon" data-clear-h3-slot="${escapeHtml(slot.id)}" aria-label="删除参考视频 ${referenceOrdinals.get(slot.id)}" title="删除参考视频">${icon("x")}<span>删除</span></button>
            </div>`
          : slot.mediaPath
            ? `<div class="h3-reference-media-shell">
                <button class="drop-zone h3-reference-drop has-image" id="pick-h3-slot-${escapeHtml(slot.id)}" data-pick-h3-slot="${escapeHtml(slot.id)}" data-h3-slot-media-type="${slot.mediaType}" data-drop-h3-slot="${escapeHtml(slot.id)}" data-drop-label="松开以替换参考图">
                  <img id="h3-slot-preview-${escapeHtml(slot.id)}" alt="参考图 ${index + 1}预览"><span class="image-label">点击或拖入替换图片</span>
                </button>
                <button class="image-remove button-with-icon" data-clear-h3-slot="${escapeHtml(slot.id)}" aria-label="删除参考图片 ${referenceOrdinals.get(slot.id)}" title="删除参考图片">${icon("x")}<span>删除</span></button>
              </div>`
            : `<button class="drop-zone h3-reference-drop" id="pick-h3-slot-${escapeHtml(slot.id)}" data-pick-h3-slot="${escapeHtml(slot.id)}" data-h3-slot-media-type="${slot.mediaType}" data-drop-h3-slot="${escapeHtml(slot.id)}" data-drop-label="松开以添加${slot.mediaType === "video" ? "参考视频" : "参考图"}">
                <span class="drop-icon">${icon(slot.mediaType === "video" ? "video" : "image")}</span><strong>添加${slot.mediaType === "video" ? "参考视频" : "参考图片"}</strong><span>${slot.mediaType === "video" ? "MP4、MOV、WEBM、MKV" : "PNG、JPG、WEBP、BMP"}</span>
              </button>`}
        <label>参考作用<select data-h3-slot-role="${escapeHtml(slot.id)}">${h3ReferenceSlotRoleOptions(slot.role, h3ReferenceRoleLabels)}</select></label>
        <label>给提示词的备注<input data-h3-slot-note="${escapeHtml(slot.id)}" value="${escapeHtml(slot.note)}" placeholder="例如：人物外貌、场景布局或动作参考"></label>
      </article>`).join("")}</div>` : `
      <div class="h3-slot-empty"><span class="drop-icon">${icon("images")}</span><strong>先添加一张参考媒体</strong><span>最多 9 张图片和 3 段视频；视频会同时使用画面与自身音轨。</span><button class="secondary button-with-icon" id="add-h3-reference-slot-empty" type="button">${icon("plus")}添加第一个 Slot</button></div>`}`;
}

export function renderCreateModelOptions(
  modelOptions: ReadonlyArray<CreateModelOptionViewModel>,
  escapeHtml: EscapeHtml
): string {
  return modelOptions
    .map((option) => `<option value="${escapeHtml(option.id)}" ${option.selected ? "selected" : ""} ${option.unavailable ? "disabled" : ""}>${escapeHtml(option.name)}${option.modeLabel}${option.suffix}</option>`)
    .join("");
}