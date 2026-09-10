import type { CatalogLoraLocale } from "./locales.js";

export const zhTWLoraLocales: Record<string, CatalogLoraLocale> = {

  "minimax-h3-turbo-sla-4step": {
    guide: {
      summary: "官方 MiniMax H3 Turbo-SLA 4 步 768p 稀疏注意力 LoRA；需要搭配 H3 SLA Attention 節點。",
      recommendedStrength: "固定 1.0；建立頁會自動切換 4 步、Euler + Beta、video shift 6 與 audio shift 3。",
      effects: "透過約 85% 區塊稀疏注意力減少注意力計算，目標是降低 4 步 Turbo 的取樣時間；未啟用 SLA 節點時不會獲得稀疏加速。",
      stacking: "效能 LoRA 放在人物、質量或內容 LoRA 前面；Turbo-SLA 與其他 Turbo 變體互斥，不能單獨疊加 SLA 節點或 LoRA。",
      compatibility: "僅目前已接入的 MiniMax H3 FL2VA 圖生影片 768p 路徑；需要在設定 → 節點與依賴安裝 H3 SLA Attention 節點。",
      source: "LightX2V / Minimax-h3-Turbo-SLA · ComfyUI BF16 conversion"
    },
    rules: {
      incompatible: "{name} 不相容目前的基礎模型或輸入模式。",
      turboVariant: "Turbo-SLA 不可與其他 Turbo 變體同時使用；請保留單獨對照。",
      slaNodeMissing: "Turbo-SLA 需要 H3 SLA Attention 節點；請先在設定 → 節點與依賴安裝。",
      slaNodeRestart: "H3 SLA Attention 已安裝但尚未被目前 ComfyUI 載入；請重啟 ComfyUI 後重新掃描。",
      turboSpectrum: "Turbo-SLA 技術上可與 Spectrum 共存，但請先保留關閉 Spectrum 的同 Seed 基準。",
      orderSuggestion: "建議將 {current} 放在 {previous} 前面；效能 LoRA 通常先載入。"
    }
  },

  "minimax-h3-lightx2v-turbo-4step-768p-v1.2": {
    guide: {
      summary: "官方目前 LightX2V v1.2 FL2VA Turbo LoRA，針對 768p 四步路徑更新。",
      recommendedStrength: "預設 1.0；依官方路徑使用。先固定 4 步、video shift 6、audio shift 3 與 Euler 做基準。",
      effects: "在 768p 下減少取樣步數；四步對 Prompt、Seed、運動連續性與音訊穩定性更敏感。",
      stacking: "效能 LoRA 放在人物或內容 LoRA 前面；不要與 8-step 或其他 Turbo 同時疊加。",
      compatibility: "僅 MiniMax H3 FL2VA 圖生影片的 768p 路徑；不適用於 Ref2VA 或影片續寫。",
      source: "LightX2V / Minimax-h3-Turbo 官方 v1.2 ComfyUI 權重"
    },
    rules: {
      incompatible: "{name} 不相容目前的基礎模型或輸入模式。",
      turboSpectrum: "v1.2 768p Turbo 與 Spectrum 的組合需要同 Seed 對照；出現畫面退化時先關閉 Spectrum。",
      orderSuggestion: "建議將 {current} 放在 {previous} 前面；效能 LoRA 通常先載入。"
    }
  },

  "minimax-h3-camera-motion-v1": {
    guide: {
      summary: "社群 MiniMax H3 Camera Motion 運鏡 LoRA，增強推近、拉遠、環繞、跟拍與航拍等鏡頭運動。",
      recommendedStrength: "預設 0.8；作者建議 0.8–1.0，超過 1.2 可能不穩定。與 Realism People 組合時先保持 0.8。",
      effects: "透過 camera motion 觸發詞增強鏡頭運動控制；需要電影感鏡頭時，可保留光學景深、鏡頭衰減與克制的手持微抖等攝影語言。",
      stacking: "可與 Realism People 組成可選雙 LoRA：Camera Motion 0.80 + Realism People 0.85；先做同 Prompt/Seed 對照，再加入其他 LoRA。",
      compatibility: "僅目前已驗證的 MiniMax H3 FL2VA INT8 pruned ConvRot 圖生影片；暫不開放 INT4、Q3、R2V 或影片續寫。",
      source: "Jojocodex / minimax-h3-Camera-Motion-lora v1 3000"
    },
    rules: {
      incompatible: "{name} 不相容目前的基礎模型或輸入模式。",
      orderSuggestion: "建議將 {current} 放在 {previous} 前面；運鏡 LoRA 建議先單獨驗證，再與效能或人物 LoRA 組合。"
    }
  },
  "minimax-h3-cinematic-realism": {
    guide: {
      summary: "社群 MiniMax H3 Cinematic Realism 電影質感 LoRA，降低 H3 預設對比度，提供更柔和、更容易後期調色的電影基調；應用會自動把觸發詞 DY 放到執行 Prompt 開頭。",
      recommendedStrength: "應用程式預設 0.5；來源建議 0.7，高動態片段降到 0.5；強度越高風格越重，也更容易出現 warping。",
      effects: "壓低 H3 的硬對比度，強化柔和電影調色和影像質感；它只改變風格，不負責人物或鏡頭運動。",
      stacking: "建議先單獨使用並保留無 LoRA 同 Seed 基準；可與 Better Human Motion、Camera Motion 或 Realism People 試驗疊加，但尚未完成真實 smoke，出現變形、過度調色或運動不穩時先降低強度。",
      compatibility: "目前僅開放給已驗證的 MiniMax H3 FL2VA INT8 pruned ConvRot 圖生影片；Ref2VA、INT4、Q3、影片續寫及來源附帶的第三方節點畫布尚未驗證。",
      source: "orangesouth / MinimaxH3CinematicRealism · 05c48f1"
    },
    rules: {
      incompatible: "{name} 不相容目前的基礎模型或輸入模式。",
      cinematicRealismTurbo: "Cinematic Realism 可與 Turbo 疊加，但低步數路徑尚未驗證；建議 Turbo 在前，並用標準步數做同 Seed 對照。",
      cinematicRealismCameraMotion: "Cinematic Realism + Camera Motion 可作為風格/運鏡組合，但尚未完成真實 smoke；先用 0.50 + 0.80 對照，出現過度調色或運鏡不穩時降低強度。",
      cinematicRealismBetterMotion: "Cinematic Realism + Better Human Motion 可作為風格/人體動作組合，但尚未完成真實 smoke；先用 0.50 + 0.40 同 Seed 對照，出現 warping 時優先降低 Cinema。",
      cinematicRealismPeople: "Cinematic Realism + Realism People 都會改變畫面質感；組合尚未充分驗證，先保留無 LoRA 基準並分別降低強度檢查膚色、對比度和細節。",
      orderSuggestion: "建議將 {current} 放在 {previous} 前面；效能 LoRA 通常先載入，動作 LoRA 其次，風格和人物品質 LoRA 後載入。"
    }
  },
  "minimax-h3-better-human-motion": {
    guide: {
      summary: "Better Human Motion H3 人體動作 LoRA，增強更自然、更連貫的身體運動和動作節奏；不注入額外觸發詞。",
      recommendedStrength: "應用程式預設 0.4；模型卡建議 0.4–0.8，先從 0.4–0.5 起步，並用 15–30 步做同 Seed 對照。",
      effects: "改善人體動作的自然度、連續性和重量轉移；強度過高可能放大身體變形、手部瑕疵或動作過衝。",
      stacking: "建議先單獨使用並保留無 LoRA 同 Seed 基準；可與 Camera Motion、Cinematic Realism 或 Realism People 試驗疊加，優先保持 Better Human Motion 在前。",
      compatibility: "模型卡標註 H3 T2V/I2V；目前應用僅開放給已驗證的 MiniMax H3 FL2VA INT8 pruned ConvRot 圖生影片，R2V、Ref2VA、INT4、Q3 和影片續寫尚未驗證。",
      source: "vpakarinen / better-human-motion-h3-lora · 11229b6 · Apache-2.0"
    },
    rules: {
      incompatible: "{name} 不相容目前的基礎模型或輸入模式。",
      betterHumanMotionTurbo: "Better Human Motion 可與 Turbo 疊加，但低步數和人體動作適配尚未驗證；建議 Turbo 在前，並與標準步數做同 Seed 對照。",
      betterHumanMotionCameraMotion: "Better Human Motion + Camera Motion 都會改變運動軌跡；組合尚未充分驗證，先分別檢查人體動作與鏡頭運動，再從較低強度開始。",
      betterHumanMotionCinematicRealism: "Better Human Motion + Cinematic Realism 可作為動作/風格組合；建議 Better Human Motion 在前（0.40 + 0.50），先保留無 LoRA 基準。",
      betterHumanMotionPeople: "Better Human Motion + Realism People 都會改變人物細節；組合尚未充分驗證，先分別檢查動作、手部和皮膚細節。",
      orderSuggestion: "建議將 {current} 放在 {previous} 前面；人體動作 LoRA 通常先載入，風格和人物品質 LoRA 後載入。"
    }
  },

  "minimax-h3-equi360": {
    guide: {
      summary: "MiniMax H3 360° 等距柱狀全景 LoRA，專門把畫面組織成可封裝為球面影片的全景投影。",
      recommendedStrength: "固定 1.0；先使用 H3 原生 T2VA、21:9、768p 做基準。",
      effects: "增強完整球面投影、中央水平線與環繞環境感；應用會自動把觸發詞 equirect360 放到執行 Prompt 開頭。",
      stacking: "建議先單獨使用；不要一開始與 Camera Motion、人物寫實或 Turbo 疊加，先做同 Seed 對照。",
      compatibility: "目前接入為 MiniMax H3 FL2VA 非續寫生成模式；模型卡只驗證原生 T2VA 21:9/768p，I2V、Ref2VA、8-step Turbo 與影片續寫未驗證。",
      source: "shamanic / minimax-h3-equi360-lora · reviewed v2 · step2500"
    },
    rules: {
      incompatible: "{name} 不相容目前的基礎模型或輸入模式。",
      ratio21By9: "{name} 建議使用 21:9；目前比例為 {ratio}，其他比例可能破壞空間佈局。",
      orderSuggestion: "建議將 {current} 放在 {previous} 前面；360° 幾何 LoRA 建議先單獨驗證，再與運鏡、人物或效能 LoRA 組合。"
    }
  },
  "minimax-h3-vr180-sbs": {
    guide: {
      summary: "MiniMax H3 VR180 SBS 立體 LoRA，將同一個 180° 場景的左眼/右眼畫面並排輸出；應用會自動加入觸發詞 vr180sbs。",
      recommendedStrength: "固定 1.0；使用 21:9、768p；保留左半為左眼、右半為右眼的固定佈局說明。",
      effects: "把畫面組織為左右眼並排的 180° 立體佈局，並保留輕微水平視差；不會提升基礎 H3 的人物、文字或音訊品質。",
      stacking: "建議單獨使用；不要與 Equirectangular 360° 或其他空間佈局/幾何 LoRA 疊加，先檢查左右眼一致性、邊緣暗角和快速橫搖。",
      compatibility: "模型卡按 H3 原生 T2VA 的 21:9/768p 評估；目前應用沿用 H3 FL2VA 非續寫建立路徑，I2V、其他比例、8-step Turbo 與影片續寫未驗證。生成後仍需外部拉伸為 2:1 並寫入立體球面中繼資料。",
      source: "rehan-fal / minimax-h3-vr180-sbs-lora · v2 · 2500 steps"
    },
    rules: {
      incompatible: "{name} 不相容目前的基礎模型或輸入模式。",
      ratio21By9: "{name} 建議使用 21:9；目前比例為 {ratio}，其他比例可能破壞空間佈局。",
      orderSuggestion: "建議將 {current} 放在 {previous} 前面；VR180 空間佈局 LoRA 應單獨驗證，不要與 360° 幾何或其他佈局適配器疊加。"
    }
  },

  "minimax-h3-turbo-v4-step600-ema-pruned": {
    guide: {
      summary: "社群 MiniMax H3 Turbo v4 step600 EMA pruned 轉換，面向 6–8 步品質優先路徑。",
      recommendedStrength: "預設 1.0；建議 6–8 步，優先 8 步；Euler + Beta、video shift 12、audio shift 6（作者給出 4–6）。",
      effects: "相比 4-step 更重視細節、運動連續性與同步音訊；仍需與官方 v1.2 做同 Seed 對照。",
      stacking: "作為獨立 Turbo 變體，不要與官方 v1.2、8-step v1.0 或其他 Turbo 同時疊加；建議放在人物或內容 LoRA 前。",
      compatibility: "僅目前已驗證的 MiniMax H3 FL2VA INT8 pruned ConvRot 圖生影片；暫不開放 R2V、INT4、Q3 或影片續寫。",
      source: "drbaph / MiniMax-H3-Turbo-Lora-ComfyUI v4 step600 EMA pruned"
    },
    rules: {
      incompatible: "{name} 不相容目前的基礎模型或輸入模式。",
      turboVariant: "v4 step600 不可與其他 Turbo 變體同時使用；請保留單獨對照。",
      orderSuggestion: "建議將 {current} 放在 {previous} 前面；效能 LoRA 通常先載入，人物和內容 LoRA 後載入。"
    }
  },

  "minimax-h3-lightx2v-turbo-8step-v1": {
    guide: {
      summary: "官方 LightX2V v1.0 FL2VA 8 步 Turbo 路線；目前沒有對應的 8-step v1.1，保留作品質與音訊穩定性備選；4 步路線請使用目前 v1.2。",
      recommendedStrength: "預設 0.75；建議 8 步、0.65–0.85。綜合首選優先嘗試 v4。",
      effects: "相比 4 步路線更保守地保留運動、細節與音訊穩定性，但版本較舊、速度較慢。",
      stacking: "效能 LoRA 放在內容或人物 LoRA 前面；不要與其他 Turbo LoRA 同時疊加。",
      compatibility: "僅 MiniMax H3 FL2VA 圖生影片；需要 ER-SDE、Beta 與 Sigma Shift Turbo 工作流。",
      source: "LightX2V / Minimax-h3-Turbo 官方 ComfyUI 權重"
    },
    rules: {
      incompatible: "{name} 不相容目前的基礎模型或輸入模式。",
      turboSpectrum: "Turbo v1.0 可與 Spectrum v0.2.6+ 疊加；遇到品質退化時先關閉 Spectrum 對照。",
      orderSuggestion: "建議將 {current} 放在 {previous} 前面；效能 LoRA 通常先載入。"
    }
  },
  "minimax-h3-ref2v-turbo-4step-v01": {
    guide: {
      summary: "官方 Ref2VA 多參考圖 Turbo LoRA，把 H3 R2V 路徑壓縮到 4 步。",
      recommendedStrength: "預設 0.75；建議 0.65–0.85。首次使用應和標準 20 步 R2V 做同 Seed 對照。",
      effects: "減少 R2V 取樣時間，但多參考圖一致性、動作與音訊對四步更敏感。",
      stacking: "放在 R2V 內容或人物 LoRA 前面；不要與 FL2VA Turbo 變體疊加。",
      compatibility: "僅 MiniMax H3 Ref2VA 多參考圖圖生影片；不適用於 FL2VA 首幀或影片續寫。",
      source: "LightX2V / Minimax-h3-Turbo 官方 ComfyUI 權重"
    },
    rules: {
      incompatible: "{name} 不相容目前的基礎模型或輸入模式。",
      turboSpectrum: "Ref2V Turbo 與 Spectrum 的組合需要逐任務驗證；若出現時序退化，先關閉 Spectrum。",
      orderSuggestion: "建議將 {current} 放在 {previous} 前面；效能 LoRA 通常先載入。"
    }
  },
  "minimax-h3-after-midnight-ref2va-nsfw": {
    guide: {
      summary: "目前確認的 AfterMidnight v1.2 Ref2VA NSFW 內容 LoRA，僅用於 H3 多參考圖路徑。",
      recommendedStrength: "預設 1.0；README 提供 sexytime 1.0 與 softer 0.8–1.0 兩檔，先固定 1.0 做基準。",
      effects: "改變成人內容、身體細節與姿態響應；這是內容 LoRA，不會取代 Prompt，也不應移植到 FL2VA。",
      stacking: "放在 Ref2V Turbo 後、Realism People 等人物 LoRA 後面；與 Turbo 組合時固定 Euler + Beta 並保留單 LoRA 對照。",
      compatibility: "僅 MiniMax H3 Ref2VA 多參考圖圖生影片；不適用於 FL2VA 首幀、影片續寫或 INT4/GGUF。",
      source: "SexGod1979 / AfterMidnight-MiniMax-H3-NSFW v1.2"
    },
    rules: {
      incompatible: "{name} 不相容目前的基礎模型或輸入模式。",
      afterMidnightTurbo: "AfterMidnight 僅用於 Ref2VA；與 Ref2V Turbo 組合時必須使用 Euler + Beta，並檢查音訊與時序穩定性。",
      orderSuggestion: "建議將 {current} 放在 {previous} 前面；效能 LoRA 通常先載入。"
    }
  },

  "minimax-h3-realism-people": {
    guide: {
      summary: "人物/皮膚寫實質量 LoRA，增強自然皮膚紋理、毛孔、透光感、近景面部、微表情和手部活動，減少油光與塑料感。應用會自動把觸發詞 r34l1sm 放到執行 Prompt 開頭。",
      recommendedStrength: "應用程式預設 0.85；作者 intended strength 為 1.0，0.6–0.8 更輕。與 Camera Motion 組合時先保持 0.85。",
      effects: "改善皮膚質感、面部表演和人物細節；強度過高時仍可能改變膚色、調色、鏡頭運動或放大手部瑕疵。",
      stacking: "可與 Camera Motion 組成可選雙 LoRA（Camera Motion 0.80 + Realism People 0.85）；建議 Camera Motion 在前、Realism People 在後，並保留無 LoRA 對照。",
      compatibility: "作者權重支援 H3 T2V/I2V/R2V；目前應用開放給已接入的 INT8 FL2VA 圖生影片與 INT8 R2V，多參考續寫和 INT4/GGUF 尚未驗證。",
      source: "fal / MiniMax-H3-Realism-People-LoRA"
    },
    rules: {
      incompatible: "{name} 不相容目前基礎模型或輸入模式。",
      realismTurbo: "Realism People 可與 Turbo 疊加，但低步數可能削弱人物細節；建議 Turbo 在前，並與標準 20 步做同 Seed 對照。",
      realismAfterMidnight: "Realism People 與 AfterMidnight 都會改變人物和身體細節；組合屬於未充分驗證路徑，建議分別降低強度並檢查膚色、手部和動作。",
      realismCameraMotion: "Realism People + Camera Motion 可作為可選雙 LoRA（0.85 + 0.80）；目前組合尚未完成真實 smoke，先用同 Prompt/Seed 對照，出現塑料感、過銳或運鏡不穩時降低強度。",
      orderSuggestion: "建議將 {current} 放在 {previous} 前面；推薦順序為效能 LoRA、人物/質量 LoRA、內容 LoRA。"
    }
  },
  "minimax-h3-facial-realism-closeup": {
    guide: {
      summary: "實驗性 H3 人臉寫實特寫 LoRA；觸發詞為 Facial Realism。",
      recommendedStrength: "作者未提供固定強度；應用程式預設 0.8，建議先用 0.6–0.8 做同 Seed 對照。",
      effects: "增強近景皮膚紋理、眼神、自然眨眼和微表情；不會自行加速取樣。",
      stacking: "建議放在 Turbo 後；先不要與 Realism People 等人物寫實 LoRA 疊加，分別做對照。",
      compatibility: "目前僅開放給已驗證的 MiniMax H3 FL2VA INT8 pruned ConvRot 圖生影片；Ref2VA、INT4、Q3 和影片續寫尚未驗證。",
      source: "prithivMLmods / MiniMax-H3-Facial-Realism-CloseUp · cp2000"
    },
    rules: {
      incompatible: "{name} 不相容目前基礎模型或輸入模式。",
      facialRealismTurbo: "Facial Realism CloseUp 技術上可與 Turbo 疊加，但低步數與實驗性人臉適配器需要同 Seed 對照；建議 Turbo 在前。",
      facialRealismPeople: "Facial Realism CloseUp 與 Realism People 都會改變人物寫實細節；未經充分驗證，請先分別使用並檢查瑕疵、膚色和身份一致性。",
      orderSuggestion: "建議將 {current} 放在 {previous} 前面；效能 LoRA 通常先載入，人物和質量 LoRA 後載入。"
    }
  },
};
