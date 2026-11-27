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
  annotationRevisionMissing: "批註修訂需要至少一條批註，例如在目標句後加入（批註：把這裡改成……）。",
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
  wordCountGuidance: "目前 {count} 詞 · 參考範圍 {min}–{max} 詞",
  imageWordCount: "目前 {count} 詞",
  promptCheckTitle: "H3 提示詞檢查"
};

export const presetLocale: Record<H3PromptPreset, PromptPresetLocale> = {
  "official-storyboard": { label: "通用影視時間線", description: "按 H3 官方欄位組織完整的視聽時間線，適合一般影片請求。" },
  "detailed-cinematic": { label: "影視細節擴寫", description: "在保留原意和參考素材的基礎上，補全動作、鏡頭、畫面、材質、光線、音效與時間線細節。" },
  "reference-faithful": { label: "參考畫面保真", description: "減少無依據的畫面補寫，優先保護參考圖中的身份、構圖和連續性。" },
  "continuous-motion": { label: "單鏡頭連續動作", description: "把動作寫成一個無剪輯的連續鏡頭，強調因果、身體力學和收束狀態。" },
  "dialogue-sound": { label: "對白與原生聲音", description: "優先處理對白、演唱、環境聲、動作聲和原生音樂的同步關係。" },
  "beat-storyboard": { label: "節拍分鏡與鏡頭節奏", description: "按時長拆解鏡頭節拍、動作節點、轉場、鏡頭運動和聲音落點。" },
  "product-brand": { label: "產品與品牌演示", description: "保護產品、介面、品牌素材和文案的真實性，強調功能動作與清晰收尾。" },
  "music-video": { label: "音樂影片與歌詞", description: "把歌曲、歌詞、節拍、表演和空間化文字作為同一條時間線設計。" },
  "narrative-animation": { label: "風格化動畫敘事", description: "強調角色鎖定、因果故事、表演節奏、風格化運動和鏡頭連續性。" },
  "annotation-revision": { label: "批註修訂", description: "把目前 Prompt 當作已確認稿件，只按（批註：……）等標記修改對應句子，其餘內容保持不變。" },
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
  "visual-photorealistic-quality": { group: "畫質與實拍光學", label: "真實皮膚與織物質感（去塑膠感）" },
  "visual-macro-closeup": { group: "畫質與實拍光學", label: "極近微距材質細節（依焦點適配）" },
  "capture-35mm-natural": { group: "畫質與實拍光學", label: "35mm 電影自然光" },
  "capture-85mm-portrait": { group: "畫質與實拍光學", label: "85mm 人像質感與柔和散景" },
  "capture-smartphone-1x": { group: "畫質與實拍光學", label: "手機 1x 紀實抓拍" },
  "capture-documentary-handheld": { group: "畫質與實拍光學", label: "紀錄片手持自然光" },
  "camera-continuous-take": { group: "鏡頭與運鏡", label: "一鏡到底 · 禁止切鏡頭" },
  "camera-static": { group: "鏡頭與運鏡", label: "固定機位" },
  "camera-push-in": { group: "鏡頭與運鏡", label: "慢速推近" },
  "camera-pull-out-reveal": { group: "鏡頭與運鏡", label: "後退拉遠並展開環境" },
  "camera-tracking": { group: "鏡頭與運鏡", label: "平穩跟拍" },
  "camera-orbit": { group: "鏡頭與運鏡", label: "平滑 180° 環繞" },
  "camera-low-angle-macro": { group: "鏡頭與運鏡", label: "極低貼地微距廣角" },
  "shot-close-up": { group: "切鏡與景別", label: "切鏡至近景 [Shot 2]" },
  "sound-no-music": { group: "聲音與對白", label: "不要背景音樂 (N/A)" },
  "sound-ambience": { group: "聲音與對白", label: "自然環境聲與底噪" },
  "dialogue-mandarin": { group: "聲音與對白", label: "中文對白範本" },
  "dialogue-english": { group: "聲音與對白", label: "英文對白範本" },
  "motion-breeze": { group: "細節與文字", label: "微風吹動髮絲與衣料" },
  "screen-text": { group: "細節與文字", label: "鎖定畫面文字" }
};
