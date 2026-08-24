export const zhTWLoraLocales = {
    "minimax-h3-lightx2v-turbo-4step-768p-v1.1": {
        guide: {
            summary: "官方 LightX2V v1.1 FL2VA Turbo LoRA，針對 768p 四步路徑更新。",
            recommendedStrength: "預設 1.0；依官方路徑使用。先固定 4 步、video shift 6、audio shift 3 與 Euler 做基準。",
            effects: "在 768p 下減少取樣步數；四步對 Prompt、Seed、運動連續性與音訊穩定性更敏感，品質變化應與舊版本做同 Seed 對照。",
            stacking: "效能 LoRA 放在人物或內容 LoRA 前面；不要與 8-step、舊版 v1.0 768p 或其他 Turbo 同時疊加。",
            compatibility: "僅 MiniMax H3 FL2VA 圖生影片的 768p 路徑；不適用於 Ref2VA 或影片續寫。",
            source: "LightX2V / Minimax-h3-Turbo 官方 v1.1 ComfyUI 權重"
        },
        rules: {
            incompatible: "{name} 不相容目前的基礎模型或輸入模式。",
            turboSpectrum: "v1.1 768p Turbo 與 Spectrum 的組合需要同 Seed 對照；出現畫面退化時先關閉 Spectrum。",
            orderSuggestion: "建議將 {current} 放在 {previous} 前面；效能 LoRA 通常先載入。"
        }
    },
    "minimax-h3-camera-motion-v1": {
        guide: {
            summary: "社群 MiniMax H3 Camera Motion 運鏡 LoRA，增強推近、拉遠、環繞、跟拍與航拍等鏡頭運動。",
            recommendedStrength: "預設 0.8；作者建議 0.8–1.0，超過 1.2 可能不穩定。",
            effects: "透過 camera motion 觸發詞增強鏡頭運動控制，不改變基礎模型或音訊策略。",
            stacking: "建議單獨作為運鏡 LoRA 使用；先與無 LoRA 基準對照，再考慮與 Turbo 或人物 LoRA 組合。",
            compatibility: "僅目前已驗證的 MiniMax H3 FL2VA INT8 pruned ConvRot 圖生影片；暫不開放 INT4、Q3、R2V 或影片續寫。",
            source: "Jojocodex / minimax-h3-Camera-Motion-lora v1 3000"
        },
        rules: {
            incompatible: "{name} 不相容目前的基礎模型或輸入模式。",
            orderSuggestion: "建議將 {current} 放在 {previous} 前面；運鏡 LoRA 建議先單獨驗證，再與效能或人物 LoRA 組合。"
        }
    },
    "minimax-h3-lightx2v-turbo-8step-v1": {
        guide: {
            summary: "官方 LightX2V v1.0 FL2VA Turbo LoRA，把標準 H3 路徑壓縮到 8 步。",
            recommendedStrength: "預設 0.75；建議 0.65–0.85。優先用於穩定的 480p/576p 測試。",
            effects: "明顯縮短取樣時間，但極低步數或過高強度可能減少運動、細節與音訊穩定性。",
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
    "minimax-h3-lightx2v-turbo-4step-768p-v1": {
        guide: {
            summary: "官方 LightX2V v1.0 768p FL2VA Turbo LoRA，針對 768p 四步取樣最佳化。",
            recommendedStrength: "預設 0.75；建議 0.65–0.85。先在 768p 使用，不要與 8-step v1.0 同時疊加。",
            effects: "在 768p 下速度最快，但四步對 Prompt、Seed 與運動穩定性更敏感。",
            stacking: "效能 LoRA 放在人物、內容或風格 LoRA 前面；一次只選一個 Turbo 變體。",
            compatibility: "僅 MiniMax H3 FL2VA 圖生影片的 768p 路徑；不適用於 R2V 或影片續寫。",
            source: "LightX2V / Minimax-h3-Turbo 官方 ComfyUI 權重"
        },
        rules: {
            incompatible: "{name} 不相容目前的基礎模型或輸入模式。",
            turboSpectrum: "768p Turbo 可與 Spectrum v0.2.6+ 疊加；先保留關閉 Spectrum 的基準結果。",
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
    "minimax-h3-lightx2v-turbo-4step": {
        guide: {
            summary: "把 H3 FL2VA 從標準約 20 步切換到 LightX2V Turbo 6–8 步取樣，用更少步驟縮短生成時間。",
            recommendedStrength: "預設 0.75；建議 0.65–0.85。4 步僅適合實驗，穩定測試優先使用 8 步。",
            effects: "速度明顯提高，但過強或步數過低可能損失細節、運動穩定性和音訊質量。",
            stacking: "與內容或風格 LoRA 同用時建議放在前面；若組合後質量下降，先降低其他 LoRA 強度，再回退標準 20 步。",
            compatibility: "僅 MiniMax H3 FL2VA 圖生影片；會同時切換 ER-SDE、Beta 與 Turbo 步數策略。Spectrum v0.2.6+ 可與此原生 ER-SDE 路徑疊加。",
            source: "LightX2V / Kijai ComfyUI conversion"
        },
        rules: {
            incompatible: "{name} 不相容目前基礎模型或輸入模式。",
            retired: "{name} 已停止用於新任務；請改用目前受支援的替代 LoRA。",
            turboSpectrum: "Spectrum v0.2.6+ 可與 LightX2V Turbo 的原生 ER-SDE 路徑疊加；更早版本請先更新。",
            orderSuggestion: "建議將 {current} 放在 {previous} 前面；效能 LoRA 通常先載入，內容、人物和風格 LoRA 後載入。"
        }
    },
    "minimax-h3-realism-people": {
        guide: {
            summary: "人物寫實質量 LoRA，增強近景面部、自然皮膚紋理、微表情、手部活動、電影燈光和輕微紀錄片式鏡頭感。應用會自動把觸發詞 r34l1sm 放到執行 Prompt 開頭。",
            recommendedStrength: "預設 0.8；作者 intended strength 為 1.0，0.6–0.8 更輕。多 LoRA 疊加時建議先從 0.6–0.8 測試。",
            effects: "可能改變膚色、調色、鏡頭運動、人物朝向和肢體物理；強度過高時可能降低紋理清晰度或放大手部瑕疵。",
            stacking: "建議放在 Turbo 之後、NSFW 內容 LoRA 之前。首次使用應保留相同 Prompt/Seed 的無 LoRA 對照；與其他人物 LoRA 疊加時分別降低強度。",
            compatibility: "作者權重支援 H3 T2V/I2V/R2V；目前應用開放給已接入的 INT8 FL2VA 圖生影片與 INT8 R2V，多參考續寫和 INT4/GGUF 尚未驗證。",
            source: "fal / MiniMax-H3-Realism-People-LoRA"
        },
        rules: {
            incompatible: "{name} 不相容目前基礎模型或輸入模式。",
            realismTurbo: "Realism People 可與 Turbo 疊加，但低步數可能削弱人物細節；建議 Turbo 在前，並與標準 20 步做同 Seed 對照。",
            realismAfterMidnight: "Realism People 與 AfterMidnight 都會改變人物和身體細節；組合屬於未充分驗證路徑，建議分別降低強度並檢查膚色、手部和動作。",
            orderSuggestion: "建議將 {current} 放在 {previous} 前面；推薦順序為效能 LoRA、人物/質量 LoRA、內容 LoRA。"
        }
    },
    "minimax-h3-pink-fluffy-bunny-nsfw": {
        guide: {
            summary: "社羣 NSFW 內容 LoRA，用於增強 H3 對成人內容、身體細節和相關姿態的響應。它不會替代 Prompt。",
            recommendedStrength: "預設 0.5；建議先在 0.35–0.65 間測試。高於 0.7 更容易出現過度特徵和畫面瑕疵。",
            effects: "會改變內容傾向、身體結構和區域性細節；作者標註為 alpha，人物一致性與音訊仍需抽樣驗證。",
            stacking: "與 Turbo 同用時建議放在 Turbo 後面。若出現鬼影、僵硬或細節退化，先降低本項強度，再單獨關閉 Turbo 對照。",
            compatibility: "目前僅用於 MiniMax H3 FL2VA pruned INT8 圖生影片；不提供給 R2V 或影片續寫。",
            source: "SexGod1979 / PinkFluffyBunny-MiniMax-H3"
        },
        rules: {
            incompatible: "{name} 不相容目前基礎模型或輸入模式。",
            retired: "{name} 已停止用於新任務；請改用目前受支援的 Ref2VA NSFW LoRA。",
            pinkTurbo: "PinkFluffyBunny 與 Turbo 可以組合，但屬於未經充分驗證的 alpha 疊加；建議 Turbo 在前，並分別保留單 LoRA 對照結果。",
            orderSuggestion: "建議將 {current} 放在 {previous} 前面；效能 LoRA 通常先載入，內容、人物和風格 LoRA 後載入。"
        }
    }
};
