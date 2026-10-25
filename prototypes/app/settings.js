// Settings prototype content. Values mirror the current app and a real local install (paths anonymised).
(() => {
  const { ic } = window.DS;
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const ROOT = "C:\\Users\\Studio\\Documents\\ComfyUI";
  const esc = (value) => String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

  /* ---------- Shared builders ---------- */
  // part: [label, file, state ok|bad|warn, source, size, shared]
  const compRow = (part, profile) => {
    const [label, file, state, source, size, shared] = part;
    const icon = state === "ok" ? "circle-check" : state === "warn" ? "circle-help" : "circle-dashed";
    const missing = state === "bad";
    const optional = state === "warn";
    const data = `data-profile="${esc(profile)}" data-label="${esc(label)}" data-file="${esc(file)}" data-size="${esc(size || "")}" data-source="${esc(source)}"`;
    return `<div class="comp-row ${state}">${ic(icon)}<div class="comp-main">
        <div class="comp-line"><span class="name">${label}</span>${shared ? '<span class="shared">共用</span>' : ""}${missing ? '<span class="shared">未安装</span>' : optional ? '<span class="shared">可选</span>' : ""}<span class="source caption" data-tip="${esc(source)}">${source}${size ? ` · ${size}` : ""}</span></div>
        <code class="path" data-tip="${esc(`${ROOT}\\models\\${file}`)}">${file}</code></div>
      ${missing || optional
        ? `<button class="btn btn-tinted btn-sm js-guide" type="button" ${data}>${ic("download")}下载</button>`
        : `<button class="btn btn-icon btn-sm js-guide" type="button" data-installed ${data} data-tip="来源与位置" aria-label="来源与位置">${ic("info")}</button>`}</div>`;
  };
  const statusBadge = (missing, label) => missing
    ? `<span class="badge">未安装 · 缺 ${missing} 项</span>`
    : `<span class="status success">${ic("circle-check")}${label}</span>`;
  const toggleLabel = (parts, open) => {
    const missing = parts.filter((part) => part[2] === "bad").length;
    return open ? "收起" : `模型文件 ${parts.length - missing}/${parts.length}${missing ? ` · 缺 ${missing}` : ""}`;
  };
  const modelCard = ({ name, badge, desc, ready = "文件已就绪", facts = [], hw, parts = [] }) => {
    const missing = parts.filter((part) => part[2] === "bad");
    return `<article class="card set-card lit">
      <div class="set-head">
        <div><div class="set-title"><h3>${name}</h3><span class="badge plain">${badge}</span></div><p class="set-desc" data-tip="${esc(desc)}">${desc}</p>
          <div class="set-facts">${facts.map((fact) => `<span>${fact}</span>`).join("")}${hw ? `<span>推荐 <b>${hw}</b></span>` : ""}</div></div>
        <div class="set-actions">${statusBadge(missing.length, ready)}</div>
      </div>
      ${parts.length ? `<button class="set-toggle" type="button" aria-expanded="false" data-profile="${esc(name)}">${ic("chevron-right", 'class="chev"')}<span>${toggleLabel(parts, false)}</span></button>
      <div class="comp-list" data-parts='${JSON.stringify(parts).replace(/'/g, "&#39;")}'></div>` : ""}
    </article>`;
  };
  const split = (main, { kind = "btn-gray", installed = true, id = "" } = {}) =>
    `<div class="split"><button class="btn ${kind} btn-sm"${id ? ` id="${id}"` : ""} type="button">${main}</button><span class="menu-anchor"><button class="btn ${kind} btn-sm btn-more" type="button" data-menu-trigger aria-expanded="false" aria-label="更多操作">${ic("chevron-down")}</button><div class="menu right" role="menu"><button class="menu-item" type="button" ${installed ? "" : "disabled"}>${ic("folder-open")}打开位置</button><button class="menu-item" type="button">${ic("external-link")}打开源码</button>${installed ? `<div class="menu-sep"></div><button class="menu-item destructive" type="button">${ic("trash-2")}卸载</button>` : ""}</div></span></div>`;

  /* ---------- Video models ---------- */
  const H3 = "Comfy-Org / MiniMax-H3 · rev 014cd40f7e17";
  const vae = [
    ["MiniMax H3 视频 VAE", "vae/minimax_h3_video_vae_fp16.safetensors", "ok", H3, "4.85 GB", true],
    ["MiniMax H3 视频 VAE · INT8 ConvRot", "vae/minimax_h3_video_vae_int8_convrot.safetensors", "ok", "Comfy-Org / MiniMax-H3 · rev 7a2065e37f5f", "2.62 GB", true],
    ["MiniMax H3 音频 VAE", "vae/minimax_h3_audio_vae_fp32.safetensors", "ok", H3, "577.22 MB", true],
    ["MiniMax H3 TAE 实时预览（可选）", "vae_approx/taeh3.safetensors", "ok", "Kijai / MiniMax-H3-TAE", "", true]
  ];
  const fl2vaInt8 = ["MiniMax H3 FL2VA INT8 模型", "diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors", "ok", H3, "19.53 GB"];
  const qwenEnc = ["Qwen3-VL 32B H3 文本编码器", "text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors", "ok", H3, "14.61 GB", true];
  const int4Enc = ["Qwen3-VL 32B H3 INT4 文本编码器", "text_encoders/qwen3vl_32b_minimax_h3_int4_convrot.safetensors", "bad", "Mersenk / MiniMax-H3-INT4-ConvRot", "8.9 GB"];
  const video = [
    { name: "MiniMax H3 FL2VA · 首帧 / 首尾帧", badge: "FL2VA · 原生音视频", desc: "MiniMax H3 的首帧或首尾帧图生视频模型。", facts: ["pruned INT8 · DynamicVRAM · 阶段卸载"], hw: "RTX 3090/4090 24GB · RAM 64GB", parts: [fl2vaInt8, qwenEnc, ...vae] },
    { name: "MiniMax H3 FL2VA · INT4 低显存", badge: "INT4 · 压缩", desc: "MiniMax H3 FL2VA 的 INT4 低显存变体。", facts: ["pruned INT4 · RAM offload"], hw: "RTX 4070/4080 16GB · 12GB 仅实验", parts: [["MiniMax H3 FL2VA INT4 ConvRot 模型", "diffusion_models/minimax_h3_fl2va_pruned_int4_convrot.safetensors", "bad", "Mersenk / MiniMax-H3-INT4-ConvRot", "10.2 GB"], int4Enc, ...vae] },
    { name: "MiniMax H3 Continuum · JointAV 接续", badge: "Continuum · AV 接续", ready: "文件与节点已就绪", desc: "使用 H3 原生 JointAV latent 续写上一段视频；History 会自动带入，也可选择兼容的 safetensors artifact。", facts: ["pruned INT8 · Continuum V3.8 Native State · 阶段卸载"], hw: "RTX 3080 12GB · RAM 32GB", parts: [fl2vaInt8, qwenEnc, ...vae] },
    { name: "MiniMax H3 LightX2V Turbo · 首尾帧", badge: "Turbo · 8 步", desc: "FL2VA 基座 + LightX2V Turbo LoRA，8 步出片。", facts: ["pruned INT8 · 8 步 Euler"], hw: "RTX 3090/4090 24GB", parts: [fl2vaInt8, ["FL2VA Turbo 8 步 LoRA", "loras/minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors", "ok", "LightX2V / Minimax-h3-Turbo", "1.61 GB"], qwenEnc, ...vae] },
    { name: "MiniMax H3 FL2VA · Q3 GGUF · 低显存实验", badge: "Q3 GGUF · 实验", desc: "MiniMax H3 FL2VA 的 3080 低显存实验变体；当前开放 360p/480p，限制在约 5 秒和 8 步以内。", facts: ["Q3 GGUF · CPU 文本编码器 · RAM offload"], hw: "RTX 3080 10GB 实验 · 480p/5秒/32GB RAM", parts: [["MiniMax H3 FL2VA Q3 GGUF 扩散模型", "unet/minimax_h3_fl2va_pruned-Q3_K.gguf", "bad", "Unsloth / MiniMax-H3-GGUF", "8.4 GB"], ["Qwen3-VL 32B H3 Q2 GGUF 文本编码器", "text_encoders/qwen3vl_32b_minimax_h3-Q2_K_M.gguf", "bad", "Unsloth / MiniMax-H3-GGUF", "12.3 GB"], ...vae] },
    { name: "MiniMax H3 R2V · 多参考 INT8", badge: "R2V · 多参考", desc: "MiniMax H3 的多参考图像/视频输入变体。", facts: ["pruned INT8 · DynamicVRAM · 多参考"], hw: "RTX 3090/4090 24GB · 多参考需更多 RAM", parts: [["MiniMax H3 Ref2VA INT8 模型", "diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors", "ok", H3, "19.53 GB"], qwenEnc, ...vae] },
    { name: "MiniMax H3 R2V · 多参考 INT4", badge: "R2V · INT4 · 压缩", desc: "MiniMax H3 R2V 的 INT4 低显存变体。", facts: ["pruned INT4 · RAM offload · 多参考"], hw: "RTX 4070/4080 16GB · 12GB 仅实验", parts: [["MiniMax H3 Ref2VA INT4 ConvRot 模型", "diffusion_models/minimax_h3_ref2va_pruned_int4_convrot.safetensors", "bad", "Mersenk / MiniMax-H3-INT4-ConvRot", "10.2 GB"], int4Enc, ...vae] },
    { name: "Sulphur 2 Q3 K M", badge: "GGUF · 分阶段", desc: "Sulphur 2 视频工作流；具体量化档由设置中的运行配置决定。", facts: ["Q3_K_M · CPU 文本编码器 · 分阶段卸载"], hw: "RTX 3060 12GB · RAM 32GB", parts: [["Sulphur 2 Q3_K_M 扩散模型", "unet/sulphur2-Q3_K_M.gguf", "bad", "Sulphur / Sulphur-2-GGUF", "9.8 GB"], ...vae.slice(0, 1)] }
  ];

  /* ---------- LoRA ---------- */
  // [name, badge, desc, hw, file, state, source, size]
  const loras = [
    ["Qwen Image 2.1 · BFS Head V1.1", "Qwen 2.1 · 换脸/换头", "社区 BFS 整头替换 LoRA；Picture 1 放目标底图，Picture 2 放参考人脸。", "RTX 2060 6GB", "loras/bfs_head_v1.1_qwen_2.1.safetensors", "bad", "Alissonerdx / BFS-Best-Face-Swap", "248.05 MB"],
    ["Qwen Image 2.1 · Fix", "Qwen 2.1 · 质量修复", "Qwen Image 2.1 的社区 Fix 适配器；优先改善颜色、细节纹理和手部稳定性。", "RTX 2060 6GB", "loras/qwen-image-2.1-fix-1.0-comfy.safetensors", "ok", "e-n-v-y / Qwen-Image-2.1-Fix", "106.44 MB"],
    ["Qwen Image 2.1 · AnyAngle", "Qwen 2.1 · 任意视角", "官方 AnyAngle 视角控制 LoRA，配合官方两图相机角度 Prompt。", "RTX 2060 6GB", "loras/QI2.1_AnyAngle.safetensors", "bad", "lilylilith / QI_2.1_AnyAngle", ""],
    ["Qwen Image 2.1 · 光影溶图", "Qwen 2.1 · 光影融合", "改善产品或物体与背景之间的光照、反射高光和接触阴影。", "RTX 2060 6GB", "loras/Qwenimag21_c2-st2000.safetensors", "ok", "RunningHubAI / rh-qwen-image-2.1-lora", ""],
    ["MiniMax H3 PDD FL2VA · 8 步", "H3 专属 · PDD 加速", "ComfyUI 0.35 原生 PDD 路线；8 步 Euler + Simple，配套 pruned INT8 FL2VA 基座。", "RTX 2060 6GB", "loras/MiniMax-H3-FL2VA-Acc-8Step_pruned_comfy.safetensors", "ok", "Kijai / MiniMax-H3-experimental", "1.61 GB"],
    ["MiniMax H3 PDD Ref2VA · 8 步", "H3 R2V 专属 · PDD 加速", "Ref2VA 的 PDD 8 步加速，配套 pruned INT8 Ref2VA 基座。", "RTX 2060 6GB", "loras/MiniMax-H3-Ref2VA-Acc-8Step_pruned_comfy.safetensors", "bad", "Kijai / MiniMax-H3-experimental", "1.61 GB"],
    ["MiniMax H3 Turbo v4 · step600 EMA", "H3 专属 · 综合首选", "社区 v4 step600 EMA pruned Turbo，建议 8 步；当前综合首选。", "RTX 2060 6GB", "loras/minimax_h3_turbo_v4_step600_ema_pruned_comfyui.safetensors", "ok", "drbaph / MiniMax-H3-Turbo-Lora-ComfyUI", ""],
    ["MiniMax H3 Turbo-SLA · 4 步", "H3 专属 · 极速", "官方 768p 四步稀疏注意力 Turbo LoRA，需要 H3 SLA Attention 节点。", "RTX 2060 6GB", "loras/minimax_h3_fl2v_turbo_4step_v0.1_768p_sla_comfyui_bf16.safetensors", "ok", "LightX2V / Minimax-h3-Turbo-SLA", ""],
    ["LightX2V Turbo 4-Step v1.2 · 768p", "H3 专属 · 4 步快速", "官方 v1.2 FL2VA Turbo LoRA，配合 4 步、video shift 6 和 audio shift 3。", "RTX 2060 6GB", "loras/minimax_h3_fl2v_turbo_4step_v1.2_768p_comfyui_bf16.safetensors", "bad", "LightX2V / Minimax-h3-Turbo", ""],
    ["LightX2V Turbo 8-Step v1.0", "H3 专属 · 8 步质量备选", "官方 v1.0 FL2VA 8 步路线；保留作质量与音频稳定性备选。", "RTX 2060 6GB", "loras/minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors", "ok", "LightX2V / Minimax-h3-Turbo", ""],
    ["LightX2V Ref2V Turbo 4-Step v0.1", "H3 R2V 专属 · 性能", "官方 Ref2VA 多参考图 Turbo LoRA，仅用于 R2V 四步路线。", "RTX 2060 6GB", "loras/minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors", "bad", "LightX2V / Minimax-h3-Turbo", ""],
    ["MiniMax H3 360° Orbit", "H3 专属 · 360° 运镜", "相机绕静止主体连续旋转 360° 并回到起始角；建议 768×768、73 帧、28 步。", "RTX 2060 6GB", "loras/minimax_h3_fl2v_lora_v1.safetensors", "bad", "pablodawson / MiniMax-H3-360-Orbit-LoRA", ""],
    ["MiniMax H3 Cinematic Realism", "H3 专属 · 电影质感", "降低 H3 默认对比度，提供更柔和、便于调色的电影基调；触发词 DY。", "RTX 2060 6GB", "loras/Minimax H3真实电影质感V0.1.safetensors", "bad", "orangesouth / MinimaxH3CinematicRealism", ""],
    ["MiniMax H3 FaceSwap · Ref2VA v1", "H3 R2V · 视频换脸", "提供一段原视频和至少一张紧裁参考人脸，默认强度 1.0。", "RTX 2060 6GB", "loras/SS_FaceSwap_MiniMax_H3_REF2VA.safetensors", "bad", "UntMods / FaceSwap_MiniMaxH3_REF2VA", "62.58 MB"],
    ["MiniMax H3 Better Human Motion", "H3 专属 · 人体动作", "增强更自然、更连贯的人体动作和身体运动；不需要额外触发词。", "RTX 2060 6GB", "loras/better_motion_h3_lora_v1_500.safetensors", "bad", "vpakarinen / better-human-motion-h3-lora", ""],
    ["MiniMax H3 Camera Motion v1", "H3 专属 · 运镜", "增强推近、拉远、环绕、跟拍和航拍等镜头运动。", "RTX 2060 6GB", "loras/camera_motion_h3_lora_v1_3000_pruned.safetensors", "bad", "Jojocodex / minimax-h3-Camera-Motion-lora", ""],
    ["MiniMax H3 Equirectangular 360°", "H3 专属 · 360° 全景", "生成 360° 等距柱状全景视频；推荐 21:9、768p，输出需再封装为 2:1。", "RTX 2060 6GB", "loras/h3-equi360-reviewed-v2-step2500.safetensors", "bad", "shamanic / minimax-h3-equi360-lora", ""],
    ["MiniMax H3 VR180 SBS 立体", "H3 专属 · VR180 立体", "生成左右眼并排的 VR180 立体视频；推荐 21:9、768p、强度 1.0。", "RTX 2060 6GB", "loras/h3-vr180-sbs-lora-v2.safetensors", "bad", "rehan-fal / minimax-h3-vr180-sbs-lora", ""],
    ["AfterMidnight NSFW · Ref2VA v1.2", "H3 R2V 专属 · NSFW", "当前确认的 AfterMidnight v1.2 内容 LoRA，仅适用于 MiniMax H3 Ref2VA。", "RTX 2060 6GB", "loras/AfterMidnight_ref2va_h3_sexytime_rank64-v1.2.safetensors", "bad", "SexGod1979 / AfterMidnight-MiniMax-H3-NSFW", ""],
    ["MiniMax H3 Facial Realism CloseUp", "H3 专属 · 人脸特写", "增强人脸特写的皮肤纹理、眼神与微表情；触发词 Facial Realism。", "RTX 2060 6GB", "loras/minimax-h3-facial-realism-closeup-cp2000.safetensors", "ok", "prithivMLmods / MiniMax-H3-Facial-Realism-CloseUp", ""],
    ["MiniMax H3 Realism People", "H3 专属 · 皮肤/人物写实", "提升人物皮肤、发丝与布料质感的写实度。", "RTX 2060 6GB", "loras/minimax-h3-realism-people-v1.safetensors", "ok", "community / MiniMax-H3-Realism-People", ""]
  ];
  const loraCard = ([name, badge, desc, hw, file, state, source, size]) => `
    <article class="card set-card lit">
      <div class="set-head"><div><div class="set-title"><h3>${name}</h3><span class="badge plain">${badge}</span></div><p class="set-desc" data-tip="${esc(desc)}">${desc}</p><div class="set-facts"><span>推荐 <b>${hw}</b> 以上</span></div></div>
        <div class="set-actions">${state === "bad" ? '<span class="badge">未安装</span>' : `<span class="status success">${ic("circle-check")}已就绪</span>`}</div></div>
      ${compRow(["LoRA 文件", file, state, source, size], name)}
      <button class="set-toggle" type="button" aria-expanded="false">${ic("chevron-right", 'class="chev"')}<span>查看使用说明</span></button>
      <div class="disclosure"><div><dl class="guide"><dt>效果</dt><dd>${desc}</dd><dt>适用</dt><dd>${badge}</dd><dt>强度</dt><dd>默认 1.0，叠加多个时逐个降低。</dd></dl></div></div>
    </article>`;

  /* ---------- Image models ---------- */
  const image = [
    { name: "OmniGen2 · 文生图/参考编辑", badge: "原生 · 20/50 步 · 最多 2 图", desc: "无参考图走文生图，有参考图走 instruction edit/多图组合，支持标注引导、Mask 区域回填和裁剪输入。", facts: ["FP16 · RTX 4090"], parts: [["OmniGen2 扩散模型", "diffusion_models/omnigen2_fp16.safetensors", "ok", "Comfy-Org / Omnigen2_ComfyUI_repackaged", "7.9 GB"], ["Qwen 2.5 VL 3B 文本编码器", "text_encoders/qwen_2.5_vl_fp16.safetensors", "ok", "Comfy-Org / Omnigen2_ComfyUI_repackaged", "7.5 GB"], ["AE VAE", "vae/ae.safetensors", "ok", "Comfy-Org / Lumina_Image_2.0_Repackaged", "335 MB", true]] },
    { name: "HiDream-O1-Image · 原生生成/参考编辑", badge: "FP8 · Full 50 步 · 2048", desc: "原生像素空间工作流；无参考图走文生图，有参考图走官方单图 instruction edit。", facts: ["FP8 scaled"], parts: [["HiDream-O1 扩散模型 FP8", "diffusion_models/hidream_o1_image_fp8_scaled.safetensors", "ok", "Comfy-Org / HiDream-O1-Image", "17.2 GB"]] },
    { name: "Z-Image · 文生图/图生图", badge: "30–40 步 · T2I + img2img", desc: "Z-Image 基础版，质量优先。", facts: ["BF16 · RTX 4090"], parts: [["Z-Image 扩散模型", "diffusion_models/z_image_bf16.safetensors", "ok", "Comfy-Org / z_image", "12.3 GB"], ["Qwen3 4B 文本编码器", "text_encoders/qwen_3_4b.safetensors", "ok", "Comfy-Org / z_image", "8.0 GB", true], ["AE VAE", "vae/ae.safetensors", "ok", "Comfy-Org / Lumina_Image_2.0_Repackaged", "335 MB", true]] },
    { name: "Z-Image Turbo · 快速出图", badge: "8 步 · T2I + 单图控制", desc: "8 步快速出图，可选 ControlNet Union 单图控制。", facts: ["BF16 · RTX 4090"], parts: [["Z-Image Turbo 扩散模型", "diffusion_models/z_image_turbo_bf16.safetensors", "ok", "Comfy-Org / z_image_turbo", "12.3 GB"], ["Qwen3 4B 文本编码器", "text_encoders/qwen_3_4b.safetensors", "ok", "Comfy-Org / z_image", "8.0 GB", true], ["ControlNet Union（可选）", "model_patches/Z-Image-Turbo-Fun-Controlnet-Union.safetensors", "warn", "alibaba-pai / Z-Image-Turbo-Fun-Controlnet-Union", "3.1 GB"]] },
    { name: "BiRefNet · 自动抠图", badge: "原生 · 透明 PNG", desc: "单张图片自动分离人物或主体并输出透明 PNG，不读取 Prompt。", facts: ["单图 · 轻量"], parts: [["BiRefNet 模型", "background_removal/BiRefNet-general.safetensors", "ok", "ZhengPeng7 / BiRefNet", "444 MB"]] },
    { name: "LaMa · 局部修复", badge: "单图 + Mask · 原图尺寸", desc: "按 Mask 去除物体并补全背景，保持原图尺寸。", facts: ["单图 · 轻量"], parts: [["Big LaMa", "inpaint/big-lama.pt", "ok", "Sanster / lama", "196 MB"]] },
    { name: "Depth Anything V2 Small · 深度导引", badge: "深度图 · 控制", desc: "为参考图生成深度图，用作结构导引。", facts: ["单图 · 轻量"], parts: [["Depth Anything V2 Small", "depthanything/depth_anything_v2_vits_fp16.safetensors", "ok", "Kijai / DepthAnythingV2-safetensors", "49.6 MB"]] },
    { name: "Qwen Image 2.1 · Q8_0", badge: "GGUF · 质量优先", desc: "Qwen Image 2.1 编辑与生成；最多 4 张参考图。", facts: ["Q8_0 · RTX 4090"], parts: [["Qwen Image 2.1 Q8_0", "unet/qwen-image-2.1-Q8_0.gguf", "bad", "QuantStack / Qwen-Image-2.1-GGUF", "21.8 GB"]] },
    { name: "Qwen Image 2.1 · Q6_K", badge: "GGUF · 平衡", desc: "Qwen Image 2.1 编辑与生成；最多 4 张参考图。", facts: ["Q6_K · RTX 4080 16GB"], parts: [["Qwen Image 2.1 Q6_K", "unet/qwen-image-2.1-Q6_K.gguf", "bad", "QuantStack / Qwen-Image-2.1-GGUF", "16.8 GB"]] },
    { name: "Qwen Image 2.1 · Q5_K_M", badge: "GGUF · 省显存", desc: "Qwen Image 2.1 编辑与生成；最多 4 张参考图。", facts: ["Q5_K_M · RTX 4070 12GB"], parts: [["Qwen Image 2.1 Q5_K_M", "unet/qwen-image-2.1-Q5_K_M.gguf", "bad", "QuantStack / Qwen-Image-2.1-GGUF", "14.6 GB"]] },
    { name: "Qwen Image 2.1 · Q4_K_M", badge: "GGUF · 低显存", desc: "Qwen Image 2.1 编辑与生成；最多 4 张参考图。", facts: ["Q4_K_M · RTX 3060 12GB"], parts: [["Qwen Image 2.1 Q4_K_M", "unet/qwen-image-2.1-Q4_K_M.gguf", "bad", "QuantStack / Qwen-Image-2.1-GGUF", "12.9 GB"]] },
    { name: "Qwen Image 2.1 · Q3_K_M", badge: "GGUF · 实验", desc: "Qwen Image 2.1 编辑与生成；最多 4 张参考图。", facts: ["Q3_K_M · 8GB 实验"], parts: [["Qwen Image 2.1 Q3_K_M", "unet/qwen-image-2.1-Q3_K_M.gguf", "bad", "QuantStack / Qwen-Image-2.1-GGUF", "9.7 GB"]] }
  ];

  /* ---------- Prompt models ---------- */
  const strata = (quant, parts) => ({ name: `Qwen3.8-Flash-Next · Strata · ${quant}`, badge: quant === "UD-Q4_K_XL" ? "Strata · Unsloth Q4" : "Strata · GSQ-RCO", desc: "多模态 MoE 模型，512 个专家，约 6B 激活参数；采用 Gated DeltaNet 与 QSA 混合注意力。", facts: ["RTX 4090 24GB · CUDA 13 / driver 580+"], parts });
  const mmproj = ["mmproj-Qwen3.8-Flash-Next-BF16.gguf", "mmproj-Qwen3.8-Flash-Next-BF16.gguf", "bad", "ISTA-DASLab / Qwen3.8-Flash-Next-GSQ-RCO-GGUF", "865.50 MB"];
  const mtp = ["MTP · Q2_0", "mtp/mtp-q2_0.gguf", "warn", "SC117 · Stock Qwen MTP · Strata Q2_0", "847.83 MB"];
  const prompt = [
    strata("IQ3_XXS", [["分片 1/2", "IQ3_XXS/Qwen3.8-Flash-Next-GSQ-RCO-IQ3_XXS-00001-of-00002.gguf", "bad", "ISTA-DASLab", "43.81 GB"], ["分片 2/2", "IQ3_XXS/Qwen3.8-Flash-Next-GSQ-RCO-IQ3_XXS-00002-of-00002.gguf", "bad", "ISTA-DASLab", "26.82 GB"], mmproj, mtp]),
    strata("IQ2_XS", [["分片 1/2", "IQ2_XS/Qwen3.8-Flash-Next-GSQ-RCO-IQ2_XS-00001-of-00002.gguf", "bad", "ISTA-DASLab", "36.53 GB"], ["分片 2/2", "IQ2_XS/Qwen3.8-Flash-Next-GSQ-RCO-IQ2_XS-00002-of-00002.gguf", "bad", "ISTA-DASLab", "26.82 GB"], mmproj, mtp]),
    { name: "Qwen3.6 27B Q4 · Uncensored · ComfyUI", badge: "Uncensored · Q4 · 4090", ready: "文件与节点已就绪", desc: "通过 ComfyUI MultiModal Prompt Nodes 运行，支持参考图片理解。", facts: ["Q4_K_M 约 18.5 GB + mmproj 0.93 GB"], parts: [["GGUF", "LLM/qwen3.6-27b-uncensored-q4/Qwen3.6-27B-Uncensored-Q4_K_M.gguf", "ok", "DavidAU", "18.5 GB"], ["mmproj", "LLM/qwen3.6-27b-uncensored-q4/mmproj-f16.gguf", "ok", "DavidAU", "0.93 GB"]] },
    { name: "Qwen3.8 27B Q4 · Uncensored · JonathanColetti", badge: "Uncensored · Q4 · 4090", desc: "通过 ComfyUI MultiModal Prompt Nodes 运行。", facts: ["Q4_K_M 约 15.4 GB + vision 0.93 GB"], parts: [["GGUF", "LLM/qwen3.8-27b-uncensored-q4/Qwen3.8-27B-Uncensored-noMTP-Q4_K_M.gguf", "bad", "JonathanColetti", "15.4 GB"], ["mmproj", "LLM/qwen3.8-27b-uncensored-q4/Qwen3.8-27B-Uncensored-vision-f16.gguf", "bad", "JonathanColetti", "0.93 GB"]] },
    { name: "Gemma 4 26B-A4B Q4 · Uncensored", badge: "Uncensored · MoE Q4", ready: "文件与节点已就绪", desc: "MoE 每次只激活约 4B 参数，加载前的需释放其它模型。", facts: ["Q4_K_M"], parts: [["GGUF", "LLM/gemma-4-26b-a4b-uncensored-Q4_K_M.gguf", "ok", "community", "15.9 GB"], ["mmproj", "LLM/gemma-4-26b-a4b-mmproj-f16.gguf", "ok", "community", "0.85 GB"]] },
    { name: "Gemma 4 12B Q4 · Uncensored", badge: "Uncensored · Q4", ready: "文件与节点已就绪", desc: "均衡体积与质量的本地提示词模型。", facts: ["Q4_K_M"], parts: [["GGUF", "LLM/gemma-4-12b-uncensored-Q4_K_M.gguf", "ok", "community", "7.3 GB"]] },
    { name: "Gemma 4 E4B Q5 · Uncensored", badge: "Uncensored · 轻量", ready: "文件与节点已就绪", desc: "轻量模型，适合显存紧张时扩写。", facts: ["Q5_K_M"], parts: [["GGUF", "LLM/gemma-4-e4b-uncensored-Q5_K_M.gguf", "ok", "community", "3.4 GB"]] },
    { name: "MiniMax H3 Prompt Rewriter LoRA · Qwen3-VL 8B", badge: "H3 官方改写", ready: "文件与节点已就绪", desc: "H3 官方结构化提示词改写 LoRA。", facts: ["Qwen3-VL 8B + LoRA"], parts: [["Qwen3-VL 8B", "LLM/Qwen3-VL-8B-Instruct", "ok", "Qwen", "16.3 GB"], ["Rewriter LoRA", "loras/minimax_h3_prompt_rewriter.safetensors", "ok", "MiniMax", "320 MB"]] }
  ];

  /* ---------- Upscale ---------- */
  const upscale = [
    { name: "Konohamaru DLSS5 Visual Enhancer · Temporal Neural", badge: "DLSS5 · 可混合", ready: "文件与节点已就绪", desc: "video2dlssnr 先做 DLSS SR 超分，再在输出分辨率执行时序 Neural enhancement；可选在同一任务中再用 DLSSG 补帧。", facts: ["NVIDIA RTX · DLSS5 runtime"], hw: "RTX 2060 6GB" },
    { name: "SeedVR2 3B INT8 ConvRot · 原生", badge: "4090 原生", desc: "ComfyUI 原生 SeedVR2 单步超分路径；长视频按时间分段以控制显存。", facts: ["INT8 · 1 step · 512 tile"], hw: "RTX 2060 6GB", parts: [["SeedVR2 3B INT8 ConvRot", "diffusion_models/seedvr2_3b_int8_convrot.safetensors", "ok", "Comfy-Org / SeedVR2", ""], ["SeedVR2 EMA VAE FP16", "vae/seedvr2_ema_vae_fp16.safetensors", "ok", "Comfy-Org / SeedVR2", ""]] },
    { name: "MiniMax H3 Learned 3D Latent Upscaler", badge: "H3 Native · 3D", ready: "文件与节点已就绪", desc: "H3 原生二次采样：720p/768p 用 bilinear latent，1080p 用 learned 3D whole-frame，1440p 用 12-tile learned 3D。", facts: ["RTX 4090 · 1440p tiled 峰值约 22.7 GiB"], hw: "RTX 2060 6GB", parts: [["Learned 3D latent upscaler", "latent_upscale_models/minimax_h3_latent_upscaler_3d_bf16.safetensors", "ok", "LBH-123-AI / Minimax_h3_latent_Upscaler", "658.60 MB"]] },
    { name: "SeedVR2", badge: "推荐", desc: "视频时间一致性优先，适合人物和真实画面。", facts: ["预计峰值 18–23 GB"], hw: "RTX 3090/4090 24GB", parts: [["SeedVR2 主模型", "SEEDVR2/seedvr2_ema_3b_fp16.safetensors", "ok", "numz / SeedVR2_comfyUI", ""], ["SeedVR2 VAE", "SEEDVR2/ema_vae_fp16.safetensors", "ok", "numz / SeedVR2_comfyUI", ""]] },
    { name: "FlashVSR", badge: "平衡", desc: "质量、速度和时间一致性的平衡选择。", facts: ["预计峰值 14–19 GB"], hw: "RTX 4080/4090 16GB", parts: [["FlashVSR 模型", "FlashVSR/FlashVSR1_1.safetensors", "ok", "1038lab / FlashVSR", ""], ["Wan 2.1 VAE", "FlashVSR/Wan2.1_VAE.safetensors", "ok", "1038lab / FlashVSR", ""], ["LQ Projection", "FlashVSR/LQ_proj_in.safetensors", "ok", "1038lab / FlashVSR", ""], ["TCDecoder", "FlashVSR/TCDecoder.safetensors", "ok", "1038lab / FlashVSR", ""], ["Prompt Embedding", "FlashVSR/Prompt.safetensors", "ok", "1038lab / FlashVSR", ""]] },
    { name: "Real-ESRGAN x4plus", badge: "快速", desc: "占用较低，适合快速检查和非人像内容。", facts: ["预计峰值 6–9 GB"], hw: "RTX 2060/3060 6GB", parts: [["Real-ESRGAN x4 模型", "upscale_models/RealESRGAN_x4plus.safetensors", "ok", "Real-ESRGAN 官方 Releases", ""]] }
  ];

  /* ---------- Shared item card: title row (status right) → one-line purpose → optional body → footer (meta left, actions right) ---------- */
  const tip = (title, text) => `<span class="info" data-tip-title="${esc(title)}" data-tip="${esc(text)}">${ic("info")}</span>`;
  const depMenu = (items) => `<span class="menu-anchor"><button class="btn btn-gray btn-sm btn-more" type="button" data-menu-trigger aria-expanded="false" aria-label="更多操作">${ic("chevron-down")}</button><div class="menu right" role="menu">${items}</div></span>`;
  const menuItem = (icon, label, danger = false) => `${danger ? '<div class="menu-sep"></div>' : ""}<button class="menu-item${danger ? " destructive" : ""}" type="button">${ic(icon)}${label}</button>`;
  const statusChip = (tone, icon, label, detail = "") => `<span class="status ${tone}"${detail ? ` data-tip="${esc(detail)}"` : ""}>${ic(icon)}${label}</span>`;
  // Requirement: every item shows current / recommended / latest so updates are visible at a glance.
  const versionMeta = (local, recommended = local, latest = recommended, behind = local !== recommended) =>
    `<span>当前 <b class="${behind ? "behind" : ""}">${local}</b></span><span>推荐 <b>${recommended}</b></span><span>最新 <b class="${latest !== local ? "newer" : ""}">${latest}</b></span>`;
  const itemCard = ({ name, nameTip = "", badge = "", note = "", status, desc = "", body = "", meta = "", actions, extra = "", cls = "", kind = "node", update = false }) => `
    <article class="card set-card lit item-card ${cls}" data-kind="${kind}" data-name="${esc(name)}"${update ? " data-update" : ""}>
      <div class="item-top"><div class="set-title"><h3${nameTip ? ` data-tip="${esc(nameTip)}"` : ""}>${name}</h3>${badge ? `<span class="badge plain">${badge}</span>` : ""}${note}</div><span class="item-status">${status}</span></div>
      ${desc ? `<p class="set-desc">${desc}</p>` : ""}${body}
      <div class="item-foot"><div class="version-line">${meta}</div><div class="item-actions">${actions}</div></div>${extra}
    </article>`;

  /* ---------- Nodes: the 21 active entries of src/core/catalog/dependencies/nodes.ts, grouped by area ---------- */
  // [name, required, short purpose, catalog purpose, dir, version, install note, runtime line]; version "a>b" = update available
  const RUN_NOTE = "安装或更新后需重启 ComfyUI，并通过 /object_info 校验。";
  const nodeGroups = [
    ["H3 视频与续写", [
      ["Spectrum MiniMax H3", false, "预测部分 H3 采样步骤，加速生成", "预测部分 H3 采样步骤；支持标准 FL2VA / R2V、LightX2V Turbo，并可选互操作 H3 Continuum、Diff-Aid 与 Untwisting RoPE", "ComfyUI-Spectrum-MiniMax-H3", "0.2.27|0.2.29|0.2.31", "运行时固定使用系统内存，不额外下载模型。"],
      ["ComfyUI H3 Continuum", false, "分块长视频与 Continuum 接续", "使用 H3 Continuum 3.9.1 的 V3.8 兼容 state 引擎和 Finalize 进行分块长视频与接续；History JointAV 通过应用 bridge 恢复为连续状态", "ComfyUI-H3-Continuum", "3.9.1", "要求 ComfyUI >=0.34.0；固定 package 3.9.1，保留 V3.8 兼容节点。旧 v5 Take 可读，但不能复用为新 v6 接续前缀。"],
      ["Local Video Studio H3 AV Serializer", false, "保存 / 加载 H3 AV latent，衔接 Continuum 与 Run Storage", "保存/加载 H3 AV artifact，桥接 legacy Continuum state，并为官方 Run Storage 路径输出可审计的 managed receipt", "LocalVideoStudio-H3", "0.3.6", "应用原创节点；委托已加载的 ComfyUI-H3-Continuum，不复制采样逻辑。"],
      ["H3 Motion Context", false, "R2V 续写继承运动方向、速度与音频", "让 H3 R2V 续写继承上一段的运动方向、速度和 32 kHz 音频，并保存 latent 供下一次无损接续", "ComfyUI-H3-Motion-Context", "0.6.2", "需要 ComfyUI 0.34.0+；0.32/0.33 保留 v0.3.1 回退线。"],
      ["ComfyUI-PlagueKind H3 SLA Attention", false, "H3 SLA 旧工作流兼容", "提供 H3 SLA 旧工作流兼容节点；应用当前 Turbo-SLA 使用 ComfyUI 核心 BlockSparseAttention。", "ComfyUI-PlagueKind-Nodes", "1.5.6", "需要支持 comfy_api.latest 的 ComfyUI。"],
      ["ComfyUI-KJNodes", false, "模型补丁、显存调试与 H3 实时预览", "模型补丁、显存调试与 MiniMax H3 TAE 实时预览", "comfyui-kjnodes", "1.5.2|1.5.2|1.6.0"],
      ["ComfyUI-GGUF H3", false, "H3 Q3 低显存实验档的 GGUF 加载", "为 MiniMax H3 Q3 3080 实验档加载 H3 GGUF 扩散模型和文本编码器", "ComfyUI-GGUF-H3", "26.09.04", "与通用 ComfyUI-GGUF 并存；Q3_K 扩散模型仍需 CPU/RAM offload。"],
      ["ComfyUI-LTXVideo", false, "Sulphur 2 视频续写与分阶段卸载", "Sulphur 2 原生视频续写、低显存加载与分阶段卸载", "ComfyUI-LTXVideo", "rolling:2026-08-11|2026-10-02"],
      ["VideoHelperSuite", true, "视频读写、编码与音频封装", "视频读取、合成、编码和音频封装", "ComfyUI-VideoHelperSuite", "1.7.9"]
    ]],
    ["H3 二次采样与分辨率提升", [
      ["ComfyUI H3 Latent Upscaler", false, "H3 二次采样的 latent 拆分与拼接", "拆分/拼接 H3 joint AV latent，并分别处理二次采样的 video/audio noise 与 sigma", "h3-latent-upscaler", "0.1.0", "固定到登记 commit。"],
      ["MiniMax H3 Learned Latent Upscaler", false, "H3 learned 3D latent 放大", "加载 H3 learned 3D latent upscaler 权重并放大分离后的 24 通道 video latent", "Comfyui_Minimax_h3_latent_Upscaler", "pinned:4c1e9b2", "权重由用户按来源链接下载。"],
      ["MMH3 Ultimate Upscale", false, "1440p 分块二次采样，降低峰值显存", "通过时间分块和空间 tile 逐块二次采样 H3 joint AV latent，降低 1440p 峰值显存", "Comfyui-MMH3-UltimateUpscale", "pinned:d91be5a", "固定 d91be5a，附应用管理的首块 source-anchor 与进度补丁。"],
      ["SeedVR2 Video Upscaler", true, "SeedVR2 视频超分", "SeedVR2 视频超分工作流", "ComfyUI-SeedVR2_VideoUpscaler", "2.5.24"],
      ["ComfyUI-FlashVSR", true, "FlashVSR 视频超分", "FlashVSR 视频超分工作流", "ComfyUI-FlashVSR", "1.1.1"],
      ["ComfyUI NVIDIA DLSS 5 Visual Enhancer · Temporal Neural", false, "DLSS5 超分、时序增强与补帧", "Konohamaru04 的 DLSS5 视频超分、时序 Neural enhancement 与 DLSSG 补帧节点", "ComfyUI-NVIDIA-DLSS-Frame-Interpolation", "pinned:v0.3.0", "需要 FFmpeg/FFprobe、NVIDIA RTX 与兼容驱动；runtime 文件由应用固定下载并校验 SHA-256。", "DLSS5 runtime 已就绪"],
      ["ComfyUI Frame Interpolation", false, "RIFE / FILM 插帧到 24 或 30 FPS", "使用 RIFE/FILM 将快速模式生成帧插值到 24 或 30 FPS", "ComfyUI-Frame-Interpolation", "1.0.11"]
    ]],
    ["提示词扩写", [
      ["MiniMax H3 Prompt Writer", false, "用 Gemma 4 生成 H3 官方格式提示词", "在 ComfyUI 内运行 Gemma 4，多模态理解素材并生成 H3 官方格式提示词", "ComfyUI-MiniMaxH3-Prompt-Writer", "0.4.7", "依赖 llama-cpp-python CUDA 后端（见上方运行时依赖）；旧版 0.3.x 可用修复流程回补。不要重复安装第二个版本。"],
      ["ComfyUI MultiModal Prompt Nodes", false, "用 Qwen3.6 / 3.8 GGUF 看图写提示词", "在 ComfyUI 内运行 Qwen3.6/Qwen3.8 GGUF 与 vision 投影文件，按参考图片和文字生成提示词", "ComfyUI-MultiModal-Prompt-Nodes", "1.0.16", "与 Prompt Writer 共用 llama-cpp-python GPU 后端；安装后必须通过 CUDA 自检。"],
      ["ComfyUI Qwen-VL LoRA", false, "Qwen3-VL + Prompt LoRA 输出 H3 提示词", "在 ComfyUI 内加载 Qwen3-VL 基座与 PEFT Prompt LoRA，输出 H3 提示词文本", "comfyui_qwenvl_lora", "rolling:2026-09-30", "需要 transformers、peft、accelerate、bitsandbytes 等；4090 建议 4-bit + SDPA。"]
    ]],
    ["图片与通用", [
      ["ComfyUI-GGUF", true, "GGUF 扩散模型加载（Qwen Image 2.1 等）", "加载原生 ComfyUI GGUF 扩散模型，包括 Qwen Image 2.1 和历史视频模型", "ComfyUI-GGUF", "2.0.0", "维护版 fork；需要 gguf>=0.13.0、sentencepiece、protobuf。"],
      ["ComfyUI Inpaint Nodes", false, "LaMa 局部修补与 Mask", "加载 LaMa 局部修补模型、扩张 Mask 并移除目标", "comfyui-inpaint-nodes", "1.4.4"]
    ]]
  ];
  const nodes = nodeGroups.flatMap(([, list]) => list);
  const nodeCard = ([name, required, short, purpose, dir, version, note, runtime]) => {
    // version: "current|recommended|latest" (omitted parts repeat the previous) ; "rolling:current|latest" ; "pinned:commit|latest"
    const [mode, spec] = /^(rolling|pinned):/.test(version) ? version.split(/:(.*)/s) : ["release", version];
    const parts = spec.split("|");
    const local = parts[0];
    const recommended = mode === "rolling" ? "跟随上游" : mode === "pinned" ? local : parts[1] ?? local;
    const latest = mode === "release" ? parts[2] ?? parts[1] ?? local : parts[1] ?? local;
    const pendingUpdate = mode === "release" && local !== recommended;
    const meta = versionMeta(local, recommended, latest, pendingUpdate);
    return itemCard({
      name, badge: required ? "必需" : "", nameTip: `${purpose}\n${ROOT}\\custom_nodes\\${dir}`, update: pendingUpdate,
      note: note ? tip("运行 / 安装说明", `${note} ${RUN_NOTE}`) : "",
      status: pendingUpdate ? statusChip("warning", "circle-alert", "可更新") : statusChip("success", "circle-check", "已就绪", "文件与版本检查通过"),
      desc: short,
      meta: `${meta}${mode === "rolling" ? '<span class="soft">滚动版</span>' : mode === "pinned" ? '<span class="soft">固定版</span>' : ""}${runtime ? `<span class="ok-text">${ic("circle-check")}${runtime}</span>` : ""}`,
      actions: split(pendingUpdate ? `${ic("arrow-up-circle")}更新` : `${ic("refresh-cw")}重新安装`, { kind: pendingUpdate ? "btn-tinted" : "btn-gray" })
    });
  };
  const nodeSections = nodeGroups.map(([title, list]) => `<div class="group-title"><h3>${title}</h3><span class="caption num">${list.length}</span></div><div class="card-grid">${list.map(nodeCard).join("")}</div>`).join("");

  /* ---------- Runtime dependencies ---------- */
  const PY = `${ROOT}\\.venv\\Scripts\\python.exe`;
  // Tile: label, main value, one short detail; the long values (paths, wheel names) live in the hover tip.
  const tile = (label, value, detail, hover) => `<div data-tip-title="${esc(label)}" data-tip="${esc(hover)}"><span class="caption">${label}</span><strong class="num">${value}</strong><span class="tile-detail">${detail}</span></div>`;
  const depCards = [
    itemCard({
      name: "Strata", badge: "独立运行环境", cls: "dep-card", kind: "strata",
      note: tip("安装校验", "固定源码、引擎 SHA-256 与独立 Python 包；首次加载模型时生成 pack/tokenizer 缓存。需要 CUDA 13 与 NVIDIA 驱动 580+。"),
      status: statusChip("success", "circle-check", "已安装"),
      desc: "提示词模型的独立运行环境，不改动 ComfyUI 的 Python 包",
      meta: `${versionMeta("0.1.45")}<button class="link-toggle" type="button" aria-expanded="false" data-disclosure="strata-advanced">${ic("chevron-right", 'class="chev"')}高级设置</button>`,
      actions: `<div class="split"><button class="btn btn-gray btn-sm" type="button">${ic("refresh-cw")}重新安装</button>${depMenu(menuItem("folder-open", "打开位置") + menuItem("trash-2", "卸载", true))}</div>`,
      extra: `<div class="disclosure" id="strata-advanced"><div><div class="adv-grid">
          <label class="field"><span class="label">运行目录</span><div class="input-group"><input placeholder="由应用管理" aria-label="运行目录"><button class="btn btn-icon btn-sm" type="button" data-tip="选择目录" aria-label="选择目录">${ic("folder-open")}</button></div></label>
          <label class="field"><span class="label">预留端口${tip("预留端口", "默认 43127，禁止 8080；启动接入时检查占用。")}</span><input class="input num" type="number" value="43127" min="1024" max="65535" aria-label="预留端口"></label>
        </div></div></div>`
    }),
    itemCard({
      name: "H3 加速运行时", badge: "ComfyUI Python", cls: "dep-card", kind: "h3",
      status: statusChip("success", "circle-check", "已就绪", "已实时验证 · 21:03"),
      desc: "H3 所需的 PyTorch、SageAttention 与 Triton；只影响 H3 工作流",
      body: `<div class="runtime-grid">
        ${tile("Python", "3.12.11", ".venv", PY)}
        ${tile("PyTorch", "2.10.0+cu130", "CUDA 13.0 · SM 8.9", "comfy-kitchen 0.2.39 · cuda、triton、hip、ascend、eager")}
        ${tile("SageAttention", "2.2.0", "cu130 · torch 2.10", "sageattention-2.2.0+cu130torch2.10-cp312-cp312-win_amd64.whl\n缺失时可回退到 Triton 或 PyTorch")}
        ${tile("Triton", "3.6.0", "KJNodes 补丁可用", "triton 3.6.0.post26；KJNodes 还提供 H3 实时预览节点")}
      </div>`,
      meta: `<span class="desktop-note" data-tip-title="ComfyUI Desktop" data-tip="最低支持 PyTorch 2.10/cu130，2.10.0 是稳定回退。更高版本不会被静默降级；SageAttention 需要官方发布的精确匹配 wheel，没有时请改用 PyTorch Attention。">${ic("monitor-cog")}ComfyUI Desktop · PyTorch ≥ 2.10</span>`,
      actions: `<div class="split"><button class="btn btn-gray btn-sm" type="button" data-tip-title="升级会临时停止 ComfyUI" data-tip="低于最低要求的组件修复到 PyTorch 2.10/cu130；更高版本保留。升级前保存包快照，自检后恢复服务。">${ic("wand-sparkles")}升级 / 修复</button>${depMenu(menuItem("scan-search", "重新验证运行环境") + menuItem("folder-open", "打开位置"))}</div>`
    }),
    itemCard({
      name: "llama-cpp-python", badge: "ComfyUI Python", cls: "dep-card", kind: "llama",
      status: statusChip("success", "circle-check", "已验证", "运行时已验证 · 21:03\nPython 3.12.11 · PyTorch 2.10.0+cu130 · CUDA 13.0"),
      desc: "本地 GGUF 提示词模型的后端；Prompt Writer 与 MultiModal 节点依赖它",
      meta: `${versionMeta("0.3.16")}<span>CUDA 后端</span>`,
      actions: `<div class="split"><button class="btn btn-gray btn-sm" type="button">${ic("refresh-cw")}重新安装</button>${depMenu(menuItem("folder-open", "打开位置") + menuItem("trash-2", "卸载", true))}</div>`
    })
  ].join("");
  /* ---------- Render ---------- */
  const fill = (id, html) => { const element = document.getElementById(id); if (element) element.innerHTML = html; };
  fill("video-cards", video.map(modelCard).join(""));
  // LoRA only works with its own base model, so cards are grouped by base model (R2V-only ones get their own group).
  const loraGroups = [
    ["MiniMax H3", "FL2VA · Turbo · 通用", (lora) => lora[0].startsWith("MiniMax H3") || lora[0].startsWith("LightX2V Turbo") ? !/R2V/.test(lora[1]) : false],
    ["MiniMax H3 R2V", "只用于多参考 R2V", (lora) => /R2V/.test(lora[1])],
    ["Qwen Image 2.1", "图片模型", (lora) => lora[0].startsWith("Qwen Image 2.1")]
  ];
  const loraSections = loraGroups.map(([title, caption, match]) => {
    const list = loras.filter(match);
    return `<div class="group-title"><h3>${title}</h3><span class="caption num">${caption} · 已安装 ${list.filter((lora) => lora[5] === "ok").length} / ${list.length}</span></div><div class="card-grid">${list.map(loraCard).join("")}</div>`;
  }).join("");
  fill("lora-cards", loraSections);
  fill("image-cards", image.map(modelCard).join(""));
  fill("prompt-cards", prompt.map(modelCard).join(""));
  fill("upscale-cards", upscale.map(modelCard).join(""));
  fill("node-cards", nodeSections);
  fill("dep-cards", depCards);
  fill("node-count", `${nodes.length}`);

  const readyCount = (list) => list.filter((item) => !(item.parts ?? []).some((part) => part[2] === "bad")).length;
  const counts = {
    video: `${readyCount(video)}/${video.length}`,
    lora: `${loras.filter((item) => item[5] === "ok").length}/${loras.length}`,
    image: `${readyCount(image)}/${image.length}`,
    prompt: `${readyCount(prompt)}/${prompt.length}`,
    upscale: `${readyCount(upscale)}/${upscale.length}`,
    nodes: `${nodes.length + 2}/${nodes.length + 2}`
  };
  for (const [tab, value] of Object.entries(counts)) {
    const meta = document.querySelector(`[data-tab="${tab}"] .meta-count`);
    if (meta) meta.textContent = value;
    document.querySelectorAll(`[data-count="${tab}"]`).forEach((element) => { element.textContent = `${value} 可用`; });
  }

  /* ---------- Interactions ---------- */
  const DS = window.DS;
  document.addEventListener("click", (event) => {
    const linked = event.target.closest("[data-disclosure]");
    if (linked) {
      const open = linked.getAttribute("aria-expanded") !== "true";
      linked.setAttribute("aria-expanded", String(open));
      document.getElementById(linked.dataset.disclosure)?.toggleAttribute("data-open", open);
    }
    const toggle = event.target.closest(".set-toggle");
    if (toggle) {
      const open = toggle.getAttribute("aria-expanded") !== "true";
      toggle.setAttribute("aria-expanded", String(open));
      const list = toggle.nextElementSibling;
      if (list?.dataset.parts) {
        const parts = JSON.parse(list.dataset.parts);
        toggle.querySelector("span").textContent = toggleLabel(parts, open);
        list.innerHTML = open ? parts.map((part) => compRow(part, toggle.dataset.profile)).join("") : "";
        DS.icons();
        if (open) [...list.children].forEach((row, index) => setTimeout(() => DS.animateIn(row), index * 20));
      }
    }
    const guide = event.target.closest(".js-guide");
    if (guide) {
      const dialog = $("#guide-dialog");
      const installed = guide.hasAttribute("data-installed");
      dialog.querySelectorAll("[data-for]").forEach((element) => { element.hidden = element.dataset.for !== (installed ? "installed" : "missing"); });
      $("#guide-profile").textContent = guide.dataset.profile;
      $("#guide-title").textContent = guide.dataset.label;
      $("#guide-file").textContent = guide.dataset.file.split("/").pop();
      $("#guide-dir").textContent = `${ROOT}\\models\\${guide.dataset.file.split("/").slice(0, -1).join("\\")}`;
      $("#guide-size").textContent = guide.dataset.size || "—";
      $("#guide-source").textContent = guide.dataset.source;
      DS.openDialog(dialog);
    }
  });

  /* ---------- Install / update / reinstall: one job at a time, others wait; progress button + live console ---------- */
  const steps = {
    node: (name, update, batch) => [
      ["拉取源码", 30, ["$ git fetch --tags origin", update ? "$ git checkout v0.2.31" : "$ git checkout --force HEAD", `HEAD is now at ${update ? "a3f9c21 release 0.2.31" : "e81b07d"}`]],
      ["安装依赖", batch ? 100 : 70, ["$ python -m pip install -r requirements.txt", "Requirement already satisfied: torch>=2.4 (2.10.0+cu130)", "Successfully installed 2 packages"]],
      ...(batch ? [] : [["重启 ComfyUI", 88, ["Stopping ComfyUI (pid 18244)…", "Starting ComfyUI on 127.0.0.1:8188…", "Server ready in 6.2 s"]], ["复检", 100, [`GET /object_info · ${name} 已注册`, "✓ 文件与版本检查通过"]]])
    ],
    strata: () => [
      ["下载引擎", 45, ["GET strata-engine-0.1.45-win-cuda13.zip", "665.0 MB · 41.2 MB/s"]],
      ["校验引擎", 55, ["SHA-256 7f3c9a1e…0f1d ✓"]],
      ["解压引擎", 65, ["Extracting 312 files…"]],
      ["创建 Python 环境", 78, ["$ python -m venv strata\\.venv"]],
      ["安装依赖", 92, ["$ pip install -r requirements.lock", "Successfully installed 38 packages"]],
      ["检查运行组件", 100, ["engine --version → 0.1.45", "✓ 运行组件已安装"]]
    ],
    h3: () => [
      ["停止 ComfyUI", 12, ["Stopping ComfyUI (pid 18244)…"]],
      ["保存包快照", 22, ["Snapshot saved: pip-freeze-20261021-210311.txt"]],
      ["安装组件", 72, ["PyTorch 2.10.0+cu130 满足要求，保留", "$ pip install sageattention-2.2.0+cu130torch2.10-cp312-cp312-win_amd64.whl", "$ pip install triton-windows==3.6.0.post26"]],
      ["自检", 92, ["SageAttention CUDA kernel ✓", "Triton JIT ✓ · KJNodes patch ✓"]],
      ["恢复服务", 100, ["Starting ComfyUI on 127.0.0.1:8188…", "✓ 已就绪"]]
    ],
    llama: () => [
      ["下载 wheel", 50, ["GET llama_cpp_python-0.3.16-cp312-cp312-win_amd64.whl (cu130)"]],
      ["安装", 80, ["$ pip install --force-reinstall --no-deps llama_cpp_python-0.3.16-…whl"]],
      ["CUDA 自检", 100, ["llama_supports_gpu_offload() → True", "✓ 运行时已验证"]]
    ]
  };
  const queue = [];
  let current = null;
  const controls = new WeakMap();
  const mainButton = (card) => card.querySelector(".item-actions .split > .btn:first-child");
  const controlOf = (button) => {
    if (!controls.has(button)) controls.set(button, DS.progressButton(button, { labels: ["准备中", "100%", "等待 9", "移出队列", "已完成"] }));
    return controls.get(button);
  };
  // A waiting job's button shows its place in line; hovering offers removal, clicking removes it.
  const markQueued = (card, position) => {
    const button = mainButton(card);
    controlOf(button);
    const label = button.querySelector(".btn-label .live");
    if (!button.hasAttribute("data-queued")) button.firstElementChild.outerHTML = ic("clock-3");
    button.setAttribute("data-queued", "");
    button.dataset.position = `等待 ${position}`;
    label.textContent = button.matches(":hover") ? "移出队列" : button.dataset.position;
    button.dataset.tip = "点击移出安装队列";
    DS.icons();
  };
  const unmarkQueued = (card) => {
    const button = mainButton(card);
    if (!button.hasAttribute("data-queued")) return;
    button.removeAttribute("data-queued");
    controlOf(button).reset();
  };
  document.addEventListener("pointerover", (event) => {
    const button = event.target.closest?.(".btn[data-queued]");
    if (button) button.querySelector(".btn-label .live").textContent = "移出队列";
  });
  document.addEventListener("pointerout", (event) => {
    const button = event.target.closest?.(".btn[data-queued]");
    if (button && !button.contains(event.relatedTarget)) button.querySelector(".btn-label .live").textContent = button.dataset.position;
  });
  const clock = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const setStatus = (card, html) => { const slot = card.querySelector(".item-status"); slot.dataset.idle ??= slot.innerHTML; slot.innerHTML = html; DS.icons(); };
  const restoreStatus = (card) => { const slot = card.querySelector(".item-status"); if (slot.dataset.idle) slot.innerHTML = slot.dataset.idle; delete slot.dataset.idle; DS.icons(); };
  const renderQueueBar = () => {
    const bar = $("#install-queue");
    bar.hidden = !current && !queue.length;
    if (bar.hidden) return;
    $("#install-queue-text").textContent = current ? `正在处理 ${current.card.dataset.name}${queue.length ? ` · 等待 ${queue.length} 个` : ""}` : `等待 ${queue.length} 个`;
    $("#install-queue-cancel").hidden = !queue.length;
    queue.forEach((job, index) => { setStatus(job.card, `<span class="status">${ic("clock-3")}等待第 ${index + 1} 位</span>`); markQueued(job.card, index + 1); });
  };
  const openConsole = (card) => {
    card.querySelector(".install-console")?.remove();
    const box = Object.assign(document.createElement("div"), { className: "install-console" });
    box.innerHTML = `<div class="console-head"><span>安装日志</span><span class="caption num" data-elapsed>00:00</span></div><pre></pre>`;
    card.append(box);
    DS.animateIn(box);
    return box;
  };
  const finishConsole = (box, label) => {
    const lines = box.querySelector("pre").textContent;
    const elapsed = box.querySelector("[data-elapsed]").textContent;
    box.outerHTML = `<details class="node-log install-done"><summary>安装日志 · ${label} · ${elapsed}</summary><pre>${esc(lines)}</pre></details>`;
  };
  const runNext = () => {
    if (current || !queue.length) { renderQueueBar(); return; }
    const job = queue.shift();
    current = job;
    const { card } = job;
    unmarkQueued(card);
    const button = mainButton(card);
    const control = controlOf(button);
    const more = card.querySelector(".item-actions .btn-more");
    if (more) more.disabled = true;
    const plan = steps[card.dataset.kind](card.dataset.name, card.hasAttribute("data-update"), job.batch);
    const box = openConsole(card);
    const pre = box.querySelector("pre");
    const started = performance.now();
    let stage = 0, line = 0, value = 0;
    control.set(null, "准备中");
    setStatus(card, `<span class="status running">${ic("loader-circle")}准备中</span>`);
    renderQueueBar();
    const tick = () => {
      if (current !== job) return;
      box.querySelector("[data-elapsed]").textContent = clock(Math.round((performance.now() - started) / 1000));
      const [label, end, lines] = plan[stage];
      if (line < lines.length) {
        pre.textContent += `${pre.textContent ? "\n" : ""}${lines[line++]}`;
        pre.scrollTop = pre.scrollHeight;
      }
      value = Math.min(end, value + 3 + Math.random() * 5);
      control.set(value, `${Math.round(value)}%`);
      setStatus(card, `<span class="status running">${ic("loader-circle")}${label}</span>`);
      if (value >= end && line >= lines.length) { stage += 1; line = 0; }
      if (stage < plan.length) { job.timer = setTimeout(tick, 220); return; }
      control.done("已完成");
      finishConsole(box, "已完成");
      current = null;
      if (more) more.disabled = false;
      const name = card.dataset.name;
      setTimeout(() => {
        control.reset();
        if (card.hasAttribute("data-update")) {
          const entry = nodes.find((node) => node[0] === name);
          if (entry) {
            const [, recommended, latest = recommended] = entry[5].split("|");
            entry[5] = `${recommended}|${recommended}|${latest}`;
            const log = card.querySelector(".install-done")?.outerHTML ?? "";
            card.outerHTML = nodeCard(entry).replace(/<\/article>\s*$/, `${log}</article>`);
            DS.icons();
            updateBulk();
            return;
          }
        }
        restoreStatus(card);
      }, 1400);
      if (!job.batch) DS.toast(`${name} 已${card.hasAttribute("data-update") ? "更新" : "重新安装"}`);
      if (job.batch && !queue.some((next) => next.batch)) finishBatch(job.batchSize);
      runNext();
    };
    job.timer = setTimeout(tick, 600);
  };
  const enqueue = (card, batch = false, batchSize = 1) => {
    if (current?.card === card || queue.some((job) => job.card === card)) return;
    queue.push({ card, batch, batchSize });
    if (current) controlOf(mainButton(card));
    runNext();
  };
  const cancel = (card) => {
    if (current?.card === card) {
      clearTimeout(current.timer);
      const box = card.querySelector(".install-console");
      if (box) { box.querySelector("pre").textContent += "\n已取消，已回滚到安装前状态"; finishConsole(box, "已取消"); }
      controlOf(mainButton(card)).reset();
      card.querySelector(".item-actions .btn-more")?.removeAttribute("disabled");
      restoreStatus(card);
      current = null;
      DS.toast(`已取消 ${card.dataset.name}`, { kind: "info" });
      runNext();
      return;
    }
    const index = queue.findIndex((job) => job.card === card);
    if (index >= 0) { queue.splice(index, 1); unmarkQueued(card); restoreStatus(card); renderQueueBar(); }
  };
  const finishBatch = (count) => {
    $("#install-queue").hidden = false;
    $("#install-queue-text").textContent = `重启 ComfyUI 并复检 ${count} 个节点`;
    $("#install-queue-cancel").hidden = true;
    setTimeout(() => { renderQueueBar(); DS.toast(`${count} 个节点已更新 · ComfyUI 已重启`); updateBulk(); }, 1800);
  };
  const updateBulk = () => {
    const pending = $$(".item-card[data-update]").length;
    $("[data-bulk-label]").textContent = pending ? "更新节点" : "已是推荐版本";
    $("[data-bulk-count]").textContent = pending ? String(pending) : "";
    $("#nodes-bulk").disabled = !pending;
  };
  document.addEventListener("click", (event) => {
    const button = event.target.closest(".item-card .item-actions .split > .btn:first-child");
    if (!button) return;
    const card = button.closest(".item-card");
    if (current?.card === card || queue.some((job) => job.card === card)) cancel(card);
    else enqueue(card);
  });
  $("#nodes-bulk").addEventListener("click", () => {
    const cards = $$(".item-card[data-update]");
    cards.forEach((card) => enqueue(card, true, cards.length));
  });
  $("#install-queue-cancel").addEventListener("click", () => { [...queue].forEach((job) => cancel(job.card)); });
  updateBulk();

  /* ---------- Unsaved changes: floating bar, discard / leave confirmation ---------- */
  const changes = new Map();
  const layout = $(".settings-layout");
  const bar = $("#save-bar");
  const fieldName = (target) => target.getAttribute?.("aria-label") || target.closest(".set-row")?.querySelector(".copy > span")?.textContent.trim() || "设置项";
  const valueText = (target) => target.tagName === "SELECT" ? target.selectedOptions[0]?.textContent
    : target.type === "checkbox" ? (target.checked ? "开" : "关")
    : target.classList?.contains("seg") ? target.querySelector('[aria-pressed="true"]')?.textContent
    : target.value;
  const renderBar = () => {
    const wasHidden = bar.hidden;
    bar.hidden = changes.size === 0;
    $("#save-count").textContent = `${changes.size} 项未保存更改`;
    $("#save-names").textContent = [...changes.keys()].join("、");
    if (wasHidden && !bar.hidden) DS.icons();
  };
  const track = (event) => {
    const target = event.target.closest?.("select, input, textarea, .seg") ?? event.target;
    if (!target || target.closest('[data-panel="appearance"], .proto-panel, .dialog')) return;
    const row = target.closest(".set-row");
    if (!row && !target.closest(".form-card")) return;
    changes.set(fieldName(target.classList?.contains("seg") ? row ?? target : target), valueText(target));
    renderBar();
  };
  // Segmented controls emit a non-bubbling "change"; capture sees it on the way down.
  layout.addEventListener("change", track, true);
  layout.addEventListener("input", (event) => { if (event.target.matches("textarea, input[type=text], input:not([type])")) track(event); }, true);

  const clearChanges = (message) => { changes.clear(); renderBar(); if (message) DS.toast(message); };
  const save = (button) => {
    button.setAttribute("aria-busy", "true");
    setTimeout(() => { button.removeAttribute("aria-busy"); clearChanges("设置已保存"); }, 700);
  };
  let pendingHref = "";
  const openDiscard = (href = "") => {
    pendingHref = href;
    $("#discard-sub").textContent = href ? "离开设置前要保存吗？" : "放弃后恢复为上次保存的值";
    $("#discard-list").innerHTML = [...changes].map(([name, value]) => `<li><span>${esc(name)}</span><span>${esc(value ?? "")}</span></li>`).join("");
    DS.openDialog($("#discard-dialog"));
  };
  const closeDiscard = () => $("#discard-dialog [data-close]").click();
  const leave = () => { if (pendingHref) location.href = pendingHref; };
  $("#save-commit").addEventListener("click", (event) => save(event.currentTarget));
  $("#save-discard").addEventListener("click", () => openDiscard());
  $("#discard-confirm").addEventListener("click", () => { closeDiscard(); clearChanges(pendingHref ? "" : "已放弃更改"); leave(); });
  $("#discard-save").addEventListener("click", () => { closeDiscard(); clearChanges("设置已保存"); leave(); });
  document.addEventListener("click", (event) => {
    const link = event.target.closest(".topbar a[href]");
    if (!link || changes.size === 0) return;
    event.preventDefault();
    openDiscard(link.getAttribute("href"));
  }, true);
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s" && changes.size) { event.preventDefault(); save($("#save-commit")); }
  });

  /* ---------- Rescan all ---------- */
  const rescan = DS.progressButton($("#rescan-all"), { labels: ["扫描中 100%", "扫描完成"] });
  $("#rescan-all").addEventListener("click", () => {
    if (rescan.active) { rescan.reset(); return; }
    let value = 0;
    rescan.set(null, "扫描中");
    const step = () => {
      if (!rescan.active) return;
      value = Math.min(100, value + 9 + Math.random() * 12);
      rescan.set(value, `扫描中 ${Math.round(value)}%`);
      if (value < 100) setTimeout(step, 180);
      else setTimeout(() => { rescan.done("扫描完成"); setTimeout(() => rescan.reset(), 1600); }, 200);
    };
    setTimeout(step, 400);
  });

  /* ---------- Asset library dialog ---------- */
  const assets = $("#assets-dialog");
  const assetPhases = ["扫描引用", "复制归档", "校验文件", "保存历史"];
  const runAssets = (phases, done) => {
    const line = $("#assets-phase"), progress = $("#assets-progress");
    $("#assets-result").hidden = true;
    line.hidden = progress.hidden = false;
    assets.querySelectorAll(".dialog-actions .btn").forEach((button) => { button.disabled = true; });
    let index = 0, value = 0;
    const tick = () => {
      value = Math.min(100, value + 6 + Math.random() * 8);
      index = Math.min(phases.length - 1, Math.floor(value / (100 / phases.length)));
      $("#assets-phase-label").textContent = phases[index];
      $("#assets-phase-count").textContent = `${Math.round(value * 0.37)} / 37`;
      progress.firstElementChild.style.setProperty("--value", `${value}%`);
      if (value < 100) setTimeout(tick, 160);
      else setTimeout(() => {
        line.hidden = progress.hidden = true;
        assets.querySelectorAll(".dialog-actions .btn").forEach((button) => { button.disabled = false; });
        done();
      }, 250);
    };
    tick();
  };
  const showAssetResult = (title, detail, warning) => {
    const result = $("#assets-result");
    result.classList.toggle("warning", warning);
    $("#assets-result-title").textContent = title;
    $("#assets-result-detail").textContent = detail;
    result.hidden = false;
    DS.animateIn(result);
  };
  const resetAssetConfirm = () => { $("#assets-confirm").hidden = true; $("#assets-cleanup").innerHTML = `${ic("trash-2")}清理所选`; DS.icons(); };
  $("#open-assets").addEventListener("click", () => { resetAssetConfirm(); $("#assets-result").hidden = true; DS.openDialog(assets); });
  $("#assets-rescan").addEventListener("click", () => runAssets(["扫描引用"], () => showAssetResult("扫描完成", "37 个外部文件待整理，6 个未引用素材可清理。", false)));
  $("#assets-organize").addEventListener("click", () => runAssets(assetPhases, () => {
    $("#assets-pending").textContent = "0";
    showAssetResult("整理完成，仍有缺失引用", "已归档 37 个外部文件，并将 12 个旧分片文件复制到扁平目录；校验并写入 52 处引用，历史状态已保存。原文件和旧分片副本没有删除，可以稍后再清理。另有 3 个原文件已不存在，未改写这些记录。", true);
  }));
  $("#assets-cleanup").addEventListener("click", () => {
    const confirm = $("#assets-confirm");
    if (confirm.hidden) {
      confirm.hidden = false;
      $("#assets-orphan-list").open = true;
      $("#assets-cleanup").innerHTML = `${ic("trash-2")}确认清理`;
      DS.icons();
      DS.animateIn(confirm);
      return;
    }
    resetAssetConfirm();
    const selected = assets.querySelectorAll("#assets-orphan-list input:checked").length;
    runAssets(["扫描引用", "清理素材"], () => {
      $("#assets-orphans").textContent = String(6 - selected);
      showAssetResult("素材清理完成", `已删除 ${selected} 个未被引用的素材和 2 个空分片目录，释放 58.2 MB。执行前已重新核对引用。`, false);
    });
  });

  /* ---------- Cache dialog ---------- */
  const cache = $("#cache-dialog");
  const cacheStart = $("#cache-start");
  const cacheChecks = [...cache.querySelectorAll("#cache-choose input")];
  const cacheSize = () => (cacheChecks[0].checked ? 0.6 : 0) + (cacheChecks[1].checked ? 1.81 : 0);
  const paintCacheStart = () => { const size = cacheSize(); cacheStart.disabled = size === 0; cacheStart.innerHTML = `${ic("trash-2")}清理 ${size.toFixed(2)} GB`; DS.icons(); };
  cacheChecks.forEach((input) => input.addEventListener("change", paintCacheStart));
  $("#open-cache").addEventListener("click", () => {
    $("#cache-choose").hidden = false;
    $("#cache-run").hidden = $("#cache-result").hidden = true;
    cacheStart.hidden = false;
    $("#cache-close").textContent = "取消";
    cacheChecks[1].disabled = App.state.job === "busy";
    if (cacheChecks[1].disabled) cacheChecks[1].checked = false;
    paintCacheStart();
    DS.openDialog(cache);
  });
  cacheStart.addEventListener("click", () => {
    $("#cache-choose").hidden = true;
    $("#cache-run").hidden = false;
    cacheStart.hidden = true;
    $("#cache-close").textContent = "后台继续";
    const started = performance.now();
    const stages = [["正在扫描缓存目录…", 900], ["正在清理当前会话缓存…", 800], ["正在处理临时文件与旧软件…", 2600], ["正在重新统计清理结果…", 700]];
    const fmt = (ms) => { const s = Math.floor(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
    let stage = 0, stageStart = performance.now();
    const bar = $("#cache-bar");
    const tick = () => {
      const now = performance.now();
      const [label, length] = stages[stage];
      $("#cache-stage").textContent = label;
      $("#cache-elapsed").textContent = `已用 ${fmt(now - started)}`;
      const determinate = stage === 2;
      bar.classList.toggle("indeterminate", !determinate);
      const ratio = Math.min(1, (now - stageStart) / length);
      bar.firstElementChild.style.setProperty("--value", determinate ? `${ratio * 100}%` : "30%");
      $("#cache-count").textContent = determinate ? `${Math.round(ratio * 14)} / 14 个目录` : "";
      $("#cache-bytes").textContent = determinate ? `${(ratio * 1.81).toFixed(2)} GB / 1.81 GB` : "";
      $("#cache-remaining").textContent = determinate && ratio < 1 ? `剩余约 ${fmt(length * (1 - ratio))}` : "";
      if (ratio >= 1) { stage += 1; stageStart = now; }
      if (stage < stages.length) requestAnimationFrame(tick);
      else {
        $("#cache-run").hidden = true;
        $("#cache-result").hidden = false;
        DS.animateIn($("#cache-result"));
        $("#cache-close").textContent = "完成";
        ["#cache-total", "#cache-session", "#cache-temp"].forEach((id, index) => { $(id).textContent = ["120 MB", "0 MB", "120 MB"][index]; });
      }
    };
    tick();
  });
  $("#refresh-cache").addEventListener("click", (event) => {
    const button = event.currentTarget;
    button.setAttribute("aria-busy", "true");
    setTimeout(() => button.removeAttribute("aria-busy"), 700);
  });
})();
