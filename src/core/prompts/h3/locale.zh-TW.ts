import type { H3PromptPreset, H3ReferenceRole } from "../../../types.js";
import type { PromptPresetLocale, PromptSnippetLocale, PromptUiLocale } from "../types.js";

export const uiLocale: PromptUiLocale = {
  newVersion: "新建",
  previousVersion: "上一版提示詞",
  nextVersion: "下一版提示詞",
  enhanceMode: "擴寫方式",
  sulphurNativeEnhance: "Sulphur 原生增強（推薦）",
  faithfulEnhance: "忠實擴寫（需 Instruct 模型）",
  optimizing: "最佳化中…",
  optimizePrompt: "最佳化提示詞",
  autoPrompt: "增強提示詞",
  autoPromptHint: "目前提示詞為空，將根據參考媒體隨機設計一版動作與鏡頭。",
  autoPromptMissingMedia: "空白 Prompt 自動起稿需要至少一份參考圖片或影片。",
  snippetPicker: "快速插入",
  snippetPlaceholder: "選擇畫質、鏡頭、動作、聲音或對白預設",
  insertSnippet: "插入",
  extensionR2vTitle: "H3 R2V Motion Context（推薦）",
  extensionBoundaryTitle: "H3 結尾影格接續（相容）",
  extensionR2vLatentDescription: "攜帶上一段最後 22 影格的運動與 32 kHz 音訊；頭部上下文會自動同步裁掉。已找到上一段 latent，將跳過有損重編碼。 Spectrum 會被強制關閉。",
  extensionR2vFallbackDescription: "攜帶上一段最後 22 影格的運動與 32 kHz 音訊；頭部上下文會自動同步裁掉。目前使用畫素/音訊回退，完成後會儲存 latent 供下一次接續。 Spectrum 會被強制關閉。",
  extensionBoundaryDescription: "從保留片段的最後一影格生成新段並保留 H3 原生音軌；不依賴額外節點，但邊界動作可能發生變化。",
  manualEditVersion: "手動編輯",
  expandedVersion: "擴寫 {count}",
  wordCount: "目前 {count} 詞",
  wordCountGuidance: "目前 {count} 詞 · 參考範圍 {min}–{max} 詞，複雜場景可繼續擴寫",
  imageWordCount: "目前 {count} 詞",
  promptCheckTitle: "H3 提示詞檢查"
};

export const presetLocale: Record<H3PromptPreset, PromptPresetLocale> = {
  "official-storyboard": { label: "通用影視時間線", description: "按 H3 官方欄位組織完整的視聽時間線，適合一般影片請求。" },
  "reference-faithful": { label: "參考畫面保真", description: "減少無依據的畫面補寫，優先保護參考圖中的身份、構圖和連續性。" },
  "continuous-motion": { label: "單鏡頭連續動作", description: "把動作寫成一個無剪輯的連續鏡頭，強調因果、身體力學和收束狀態。" },
  "dialogue-sound": { label: "對白與原生聲音", description: "優先處理對白、演唱、環境聲、動作聲和原生音樂的同步關係。" },
  "beat-storyboard": { label: "節拍分鏡與鏡頭節奏", description: "按時長拆解鏡頭節拍、動作節點、轉場、鏡頭運動和聲音落點。" },
  "product-brand": { label: "產品與品牌演示", description: "保護產品、介面、品牌素材和文案的真實性，強調功能動作與清晰收尾。" },
  "music-video": { label: "音樂影片與歌詞", description: "把歌曲、歌詞、節拍、表演和空間化文字作為同一條時間線設計。" },
  "narrative-animation": { label: "風格化動畫敘事", description: "強調角色鎖定、因果故事、表演節奏、風格化運動和鏡頭連續性。" },
  "multi-reference": { label: "多參考關係編排", description: "為 R2V 圖片、影片和音訊分配明確關係，並保持標籤和複用關係穩定。" }
};

export const referenceRoleLocale: Record<H3ReferenceRole, string> = {
  subject: "人物 / 主體",
  scene: "場景 / 環境",
  style: "風格 / 服裝",
  motion: "動作 / 姿態",
  camera: "鏡頭 / 構圖",
  voice: "聲音關聯",
  keyframe: "關鍵畫面",
  other: "其它參考"
};

export const snippetLocale: Record<string, PromptSnippetLocale> = {
  "continuity-reference-lock": { group: "參考與連續性", label: "鎖定參考圖身份與構圖" },
  "continuity-body-gaze-lock": { group: "參考與連續性", label: "鎖定身體與視線朝向" },
  "visual-live-action-human": { group: "真實感與材質", label: "真人實拍質感" },
  "visual-anti-cg-plastic": { group: "真實感與材質", label: "避免 CG、玩偶與塑膠感" },
  "visual-natural-materials": { group: "真實感與材質", label: "自然肌膚與材質細節" },
  "visual-natural-light": { group: "真實感與材質", label: "自然光與真實曝光" },
  "capture-smartphone-1x": { group: "拍攝與設備", label: "舊手機 1x 真實感" },
  "capture-documentary-handheld": { group: "拍攝與設備", label: "紀錄片手持質感" },
  "motion-causal-onset": { group: "動作與反應", label: "自然動作起因" },
  "motion-vocal-anatomy": { group: "動作與反應", label: "對白身體反應" },
  "camera-push-in": { group: "鏡頭運動", label: "慢速推近" },
  "camera-pull-out-reveal": { group: "鏡頭運動", label: "後退拉開並展開環境" },
  "camera-pedestal-up": { group: "鏡頭運動", label: "升降配合鏡頭" },
  "camera-restrictions": { group: "鏡頭運動", label: "禁止意外繞行" },
  "camera-pan-right": { group: "鏡頭運動", label: "向右搖攝" },
  "camera-tracking": { group: "鏡頭運動", label: "跟拍" },
  "camera-static": { group: "鏡頭運動", label: "固定鏡頭" },
  "shot-close-up": { group: "景別構圖", label: "切到近景" },
  "shot-wide": { group: "景別構圖", label: "展開廣角" },
  "shot-framing-progression": { group: "景別構圖", label: "連續景別變化" },
  "motion-turn": { group: "主體動作", label: "轉向鏡頭" },
  "motion-breeze": { group: "主體動作", label: "微風細節" },
  "sound-ambience": { group: "聲音", label: "環境聲" },
  "sound-synchronized-action": { group: "聲音", label: "聲音與畫面同步" },
  "sound-spatial-echo": { group: "聲音", label: "空間回聲衰減" },
  "sound-no-music": { group: "聲音", label: "不要背景音樂" },
  "dialogue-mandarin": { group: "對白", label: "中文對白" },
  "dialogue-english": { group: "對白", label: "英文對白與 ID" },
  "screen-text": { group: "螢幕文字", label: "鎖定畫面文字" }
};
