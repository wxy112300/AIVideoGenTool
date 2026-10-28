import type { CatalogLoraLocale } from "./locales.js";

export const zhTWLoraLocales: Record<string, CatalogLoraLocale> = {
  "minimax-h3-faceswap-ref2va-v1": {
    guide: {
      summary: "UntMods 的 H3 Ref2VA 影片換臉 LoRA；將參考臉身分轉移至原影片人物，執行時自動去重補入 Faceswap。",
      recommendedStrength: "作者建議 1.0；先用標準取樣做基準。Picture 1 放緊裁人臉，Video 1 放原片，Prompt 明確指定替換人物。",
      effects: "輸出為重新生成的影片；動作、表情、口型、衣服、音軌及背景需逐項檢查，不保證逐幀或像素一致。",
      stacking: "先單獨使用，不自動啟用作者範例的 8-step Turbo；現有 Ref2V Turbo/PDD 疊加需獨立對照，不能據此宣稱品質或速度。",
      compatibility: "僅普通 H3 Ref2VA INT8 R2V：至少一張有效人臉圖、恰好一段有效原影片。先用短單鏡頭、24fps、原片比例與接近原片的時長；FL2VA、INT4、續寫和 Continuum 不開放。此路徑不需 CRT-Nodes。",
      source: "UntMods / FaceSwap_MiniMaxH3_REF2VA · Apache-2.0（基座另遵守 MiniMax 授權）"
    },
    rules: {
      referenceInputs: "H3 FaceSwap 需要至少一張參考人臉圖片（Picture 1）和恰好一段原影片（Video 1）；請補齊並移除多餘影片。",
      faceswapTurbo: "FaceSwap 與低步數加速的組合尚未實測；作者範例的 8-step Turbo 不等於目前 Ref2V 4-step/PDD，請先保留標準取樣對照。"
    }
  },
  "qwen-image-2-1-bfs-head-v1-1": {
    guide: {
      summary: "BFS Head V1.1 是作者推薦的 Qwen Image 2.1 換臉/整頭 LoRA，包含頭髮替換，並非僅替換五官。",
      recommendedStrength: "預設 1.0；先沿用普通 Qwen 2.1 取樣參數做同 Seed 對照。新增時給空 Prompt 填入作者指令，已有文字保留；執行時補齊 head_swap: 觸發詞。",
      effects: "Picture 1 提供目標身體、姿態、表情與背景，Picture 2 提供參考身分及頭髮。作者稱 V1.1 減輕皮膚平滑；小臉、遮擋、大角度與背景保真需逐圖檢查。",
      stacking: "一次只使用一個圖片 LoRA；不要與 AnyAngle、Fix、Lighting Blend 或 Pruna 加速疊加。",
      compatibility: "恰好兩張 Picture，不能反序；Paint 批註會占額外輸入，請先清除。用於普通 Qwen Image 2.1 官方/Q8_0/Q6_K 路徑，獨立 Turbo 不開放；不使用舊 Qwen Edit 或 Klein 權重。GGUF 與實際品質仍需分別驗證。",
      source: "Alissonerdx / BFS-Best-Face-Swap · bfs_head_v1.1_qwen_2.1.safetensors · MIT"
    },
    rules: {}
  },

  "h3-pdd-fl2va-8step": {
    guide: {
      summary: "ComfyUI 0.35 原生 PDD Acc FL2VA 8 步 LoRA；透過輸出 head bank 在不同 sigma 區間使用對應 head，不依賴 H3-Optimizations。",
      recommendedStrength: "固定 1.0；應用程式會固定 8 步、Euler、Simple、video shift 12、audio shift 3 與 CFG 1.0。",
      effects: "把 FL2VA 取樣預算壓縮到 8 步，同時保留 PDD head bank 對不同 sigma 區間的適配；先與標準 20 步 Base 做同 Seed 對照。",
      stacking: "這是獨立的效能路徑，只與 pruned INT8 ConvRot FL2VA 基座配套；不要與任何 Turbo LoRA 疊加，也不要把非 pruned 檔案混入目前條目。",
      compatibility: "僅 MiniMax H3 FL2VA pruned INT8 ConvRot 圖生影片；需要 ComfyUI 0.35 原生 PDD 支援與普通 LoraLoaderModelOnly，Ref2VA、INT4、Q3 與影片續寫不開放。",
      source: "Kijai / MiniMax-H3-experimental · pinned ComfyUI PDD conversion"
    },
    rules: {
      incompatible: "{name} 不相容目前的基礎模型或輸入模式。",
      pddTurbo: "PDD Acc 不可與 Turbo LoRA 同時使用；請保留獨立的 8 步 PDD 對照。",
      orderSuggestion: "建議將 {current} 放在 {previous} 前面；PDD 是獨立效能路徑，先單獨驗證，再考慮與內容 LoRA 組合。"
    }
  },
  "h3-pdd-ref2va-8step": {
    guide: {
      summary: "ComfyUI 0.35 原生 PDD Acc Ref2VA 8 步 LoRA；透過輸出 head bank 支援多參考圖 R2V 的分段取樣。",
      recommendedStrength: "固定 1.0；應用程式會固定 8 步、Euler、Simple、video shift 12、audio shift 3 與 CFG 1.0。",
      effects: "把 Ref2VA 多參考圖取樣預算壓縮到 8 步；參考圖一致性、運動與音訊需要和標準 R2V 做同 Seed 對照。",
      stacking: "這是獨立的 R2V 效能路徑，只與 pruned INT8 ConvRot Ref2VA 基座配套；不要與任何 Turbo LoRA 疊加，也不要用於 FL2VA 或影片續寫。",
      compatibility: "僅 MiniMax H3 Ref2VA pruned INT8 ConvRot 多參考圖生成；需要 ComfyUI 0.35 原生 PDD 支援、普通 LoraLoaderModelOnly 與 MiniMaxH3ReferenceToVideo。",
      source: "Kijai / MiniMax-H3-experimental · pinned ComfyUI PDD conversion"
    },
    rules: {
      incompatible: "{name} 不相容目前的基礎模型或輸入模式。",
      pddTurbo: "PDD Acc 不可與 Turbo LoRA 同時使用；請保留獨立的 8 步 PDD R2V 對照。",
      orderSuggestion: "建議將 {current} 放在 {previous} 前面；PDD 是獨立 R2V 效能路徑，先單獨驗證，再考慮與 R2V 內容 LoRA 組合。"
    }
  },

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
      summary: "官方 FL2VA v1.3 四步 768p，Euler + Simple，video/audio shift 6/3。",
      recommendedStrength: "預設 1.0；官方 FL2VA v1.3 四步 768p，Euler + Simple，video/audio shift 6/3。",
      effects: "少步數生成；運動、參考保真與音訊需和基礎模型對照。",
      stacking: "不要疊加其他 Turbo；內容 LoRA 與稀疏 attention 有上游退化回報，組合需獨立驗證。",
      compatibility: "僅 MiniMax H3 FL2VA 圖生影片；不適用於 Ref2VA 或影片續寫。",
      source: "LightX2V / Minimax-h3-Turbo · FL2VA v1.3 4-step 768p"
    },
    rules: {
      incompatible: "{name} 不相容目前的基礎模型或輸入模式。",
      turboSpectrum: "Spectrum 需同 Seed 獨立對照；品質退化時先關閉。",
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
  "minimax-h3-360-orbit": {
    guide: {
      summary: "MiniMax H3 360° Orbit FL2VA 運鏡 LoRA，讓靜止場景中的相機連續繞主體旋轉 360° 並回到起始視角；首尾幀應使用同一張圖片。",
      recommendedStrength: "固定 1.0；模型卡基準為 768×768、73 幀、28 步，不使用 CFG 或負面提示詞。",
      effects: "只讓相機移動，保持人物和物體的世界位置、姿態與形狀穩定，利用視差完成環繞並回到起始幀。",
      stacking: "建議單獨使用並保留同 Prompt/Seed 的無 LoRA 對照；不要先與 Turbo、Camera Motion 或 360/VR180 空間布局 LoRA 疊加。",
      compatibility: "僅 MiniMax H3 FL2VA pruned INT8 ConvRot 圖生影片；模型卡訓練集是 768 方形、73 幀的人體 Gaussian splat 場景，其他主體、比例和時長尚未驗證。",
      source: "pablodawson / MiniMax-H3-360-Orbit-LoRA · 5ddbc2d"
    },
    rules: {
      incompatible: "{name} 不相容目前的基礎模型或輸入模式。",
      orbitTurbo: "模型卡建議 28 步；目前應用的 H3 FL2VA 策略使用支援的 20/16/12 步檔。與 Turbo 疊加尚未驗證，建議先分別做同 Seed 對照。",
      orbitCameraMotion: "360° Orbit 與 Camera Motion 都會改變鏡頭軌跡；組合尚未驗證，先單獨確認完整回環和主體穩定性。",
      orbitSpatialLayout: "360° Orbit 與 Equirectangular/VR180 空間布局 LoRA 的幾何先驗不同；請先分別生成，避免同時疊加。",
      orderSuggestion: "建議將 {current} 放在 {previous} 前面；先載入效能 LoRA，再載入運鏡或空間布局適配器。"
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
      effects: "相比 4-step 更重視細節、運動連續性與同步音訊；仍需與官方 v1.3 做同 Seed 對照。",
      stacking: "作為獨立 Turbo 變體，不要與官方 v1.3、8-step v1.1 或其他 Turbo 同時疊加；建議放在人物或內容 LoRA 前。",
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
      summary: "官方 FL2VA v1.1 八步 768p，Euler + Simple，video/audio shift 6/3。",
      recommendedStrength: "預設 1.0；官方 FL2VA v1.1 八步 768p，Euler + Simple，video/audio shift 6/3。",
      effects: "少步數生成；運動、參考保真與音訊需和基礎模型對照。",
      stacking: "不要疊加其他 Turbo；內容 LoRA 與稀疏 attention 有上游退化回報，組合需獨立驗證。",
      compatibility: "僅 MiniMax H3 FL2VA 圖生影片；不適用於 Ref2VA 或影片續寫。",
      source: "LightX2V / Minimax-h3-Turbo · FL2VA v1.1 8-step 768p"
    },
    rules: {
      incompatible: "{name} 不相容目前的基礎模型或輸入模式。",
      turboSpectrum: "Spectrum 需同 Seed 獨立對照；品質退化時先關閉。",
      orderSuggestion: "建議將 {current} 放在 {previous} 前面；效能 LoRA 通常先載入。"
    }
  },
  "minimax-h3-ref2v-turbo-4step-v01": {
    guide: {
      summary: "官方 Ref2VA v1.0 四步 768p，Euler + Simple，video/audio shift 12/3。",
      recommendedStrength: "預設 1.0；官方 Ref2VA v1.0 四步 768p，Euler + Simple，video/audio shift 12/3。",
      effects: "少步數生成；運動、參考保真與音訊需和基礎模型對照。",
      stacking: "不要疊加其他 Turbo；內容 LoRA 與稀疏 attention 有上游退化回報，組合需獨立驗證。",
      compatibility: "僅 MiniMax H3 Ref2VA；不適用於 FL2VA 或影片續寫。",
      source: "LightX2V / Minimax-h3-Turbo · Ref2VA v1.0 4-step 768p"
    },
    rules: {
      incompatible: "{name} 不相容目前的基礎模型或輸入模式。",
      turboSpectrum: "Spectrum 需同 Seed 獨立對照；品質退化時先關閉。",
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
