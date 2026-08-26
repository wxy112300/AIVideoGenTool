# H3 长视频 P0 调查证据

## 0. 调查状态

- 调查日期：2026-08-26。
- 状态：**runtime/core/schema 基线已完成；官方 Basic Masked Extension workflow 的本地图结构导入和真实生成仍未完成**。
- 本次只读检查，没有提交 `/prompt`、启动扩散采样或修改用户媒体。
- 本文记录的是当前机器和当前 ComfyUI 实例的事实，不把它当作所有用户环境的兼容承诺。

## 1. 当前 ComfyUI 实例

### 1.1 服务与硬件

`http://127.0.0.1:8188/system_stats` 和 `/object_info` 均返回 HTTP 200。

| 项目 | 当前证据 |
| --- | --- |
| ComfyUI | `0.33.0` |
| core 路径 | `D:\Comfy-Desktop\ComfyUI-Installs\ComfyUI\ComfyUI` |
| Git revision | `7dde56176efa71fd74ef7b3930ab5882d1926288` |
| revision 提交 | `Increase trellis2 memory factor a bit. (#15796)` |
| Python | `3.12.11` |
| PyTorch | `2.9.1+cu130` |
| GPU | NVIDIA GeForce RTX 4090 |
| VRAM | 25,756,696,576 bytes total；24,115,019,776 bytes free at check time |
| ComfyUI data root | `C:\Users\Wuyouwofang\Documents\ComfyUI` |
| launch mode | local standalone，`127.0.0.1:8188` |

当前 core 的 Git history 同时包含：

- `ff6c8a8af144fc9e9e7bc436b1b202f9316848d8` — PR #15375，H3 video/audio latent noise masks；
- `e01fb4c56b7a88149d469b99cbbfe3223d715054` — PR #15439，`MiniMaxH3AddGuide`；
- 当前 `HEAD` 对这两个 revision 都通过 ancestor 检查。

因此，当前实例不是“只升级到 0.33.0 但没有新能力”的状态；核心代码已经包含两个 PR。仍然需要应用层 workflow 和 runtime smoke，不能只根据版本号标记产品可用。

### 1.2 H3 资产离线存在性

当前用于第一条 FL2VA Native 基线的四个组件均存在：

- `models/diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors`；
- `models/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors`；
- `models/vae/minimax_h3_video_vae_fp16.safetensors`；
- `models/vae/minimax_h3_audio_vae_fp32.safetensors`。

相关现有 custom node 目录也存在：

- `ComfyUI-H3-Motion-Context`；
- `ComfyUI-GGUF-H3`；
- `ComfyUI-VideoHelperSuite`；
- `ComfyUI-KJNodes`。

这只是离线文件证据，尚未证明 Native workflow 能加载全部组件并成功生成。

## 2. 当前 `/object_info` schema

### 2.1 H3 原生 AV latent

当前实例注册了 `EmptyMiniMaxH3LatentAV`：

- `width`：32 像素步长；
- `height`：32 像素步长；
- `length`：5–3600，步长 17；
- 说明明确写着：24 FPS、`17k+5` 网格，`124 ≈ 5s`，训练范围约为 `124–362`，更长属于未测试范围；
- 输出是 H3 joint video/audio `LATENT`。

当前安装的 `nodes_minimax_h3.py` 进一步确认：

- video latent shape 为 `[B, 24, T, H/16, W/16]`；
- audio latent shape 为 `[B, 32, 2, T40]`；
- audio VAE 的目标采样率为 32 kHz；
- video/audio 使用同一个时间轴，但音频是 40 latent steps/s。

### 2.2 `MiniMaxH3AddGuide`

当前实例注册了 `MiniMaxH3AddGuide`，输入为：

- 必需：`positive: CONDITIONING`、`latent: LATENT`、`frame_idx: INT`；
- 可选：`vae: VAE`、`audio_vae: VAE`、`image: IMAGE`、`audio: AUDIO`；
- image 多帧 guide 会裁剪到 `5、22、39...` 的有效片段长度；
- audio guide 从相同 `frame_idx` 开始，并裁剪到目标视频的剩余音频长度；
- 需要传入 H3 nested AV latent，不能传普通 SD/LTX latent。

本节点只向 conditioning 添加 guide keyframe。它不创建长视频父任务，不保存 continuation artifact，不负责 mask，也不负责片段拼接。

### 2.3 mask 的实际入口

当前 `/object_info` 没有名为 `MiniMaxH3Mask` 或 `MiniMaxH3SetMaskedExtension` 的 H3 专用节点。PR #15375 的 mask 是 ComfyUI latent/sampler contract：

- latent 中的 `noise_mask` 进入 sampler；
- H3 core 将 joint mask 拆成 video 和 audio mask；
- video mask 对齐 2×2 DiT patch row；
- audio mask 对齐完整 audio latent frame；
- H3 model 根据 mask 生成不同的 per-row timestep。

当前 `SamplerCustomAdvanced` schema 没有显式 `denoise_mask` socket；当前普通 `SetLatentNoiseMask` 只写入一个普通 `noise_mask`。因此，Native joint AV workflow 必须明确验证如何构造同时包含 video/audio 的 nested mask，不能仅把普通图像 mask 接到现有 sampler 图上。

这是 P0 需要从官方 Basic Masked Extension workflow 中确认的关键节点契约。

### 2.4 现有 Motion Context schema

当前实例注册的 Motion Context 仍是独立 custom node：

- `MiniMaxH3MotionContext`：`context_length` 选项为 22/5/39/56，`audio_context_length` 默认 24；
- `MiniMaxH3MotionContextLoadLatent` / `SaveLatent`：保存的是 Motion Context 可用的 sampler output latent；
- `MiniMaxH3MotionContextTrim`：同步裁剪图片和音频；
- 这些节点不是 Native Masked AV artifact contract，不能直接复用为新格式。

## 3. 当前项目 Extend workflow 审计

### 3.1 `minimax_h3_r2v_extend_api.json`

当前文件共有 33 个 API 节点，核心链路为：

```text
VHS_LoadVideoFFmpeg(force_rate=24, frame_load_cap=22)
  → MiniMaxH3ReferenceToVideo
  → MiniMaxH3MotionContextLoadLatent
  → MiniMaxH3MotionContext(context_length=22, audio_context_length=24)
  → SamplerCustomAdvanced
  → MiniMaxH3MotionContextSaveLatent
  → VAEDecode + VAEDecodeAudio
  → MiniMaxH3MotionContextTrim
  → CreateVideo(fps=24)
  → SaveVideo
```

静态检查结果：

- 没有 `MiniMaxH3AddGuide`；
- 没有 class type 名称包含 H3 mask 的节点；
- sampler 没有显式 mask 输入；
- 该 workflow 依赖 `MiniMaxH3MotionContext*`，不是 Native Masked AV workflow；
- 当前应用的 `electron/services/comfy-ui.ts` 也会按 R2V modelId 准备 Motion Context MP4、上传参考 Slot 并渲染 `H3_CONTEXT_LATENT_PATH`。

因此，当前 workflow 不能通过“替换 ComfyUI 版本”自动变成 Native Extend；必须新增独立 API graph 和 adapter。

### 3.2 当前时间和媒体规则

当前项目代码已经有一部分正确的 H3 时间约束：

- `src/core/workflow.ts::frameCountForTask` 按 24 FPS 计算 H3 frame count，并 snap 到 `17k+5`；
- Motion Context 固定保留 22 video frames；
- `prepareH3MotionContext` 使用 24 FPS、22 frames，并对无音频输入补 32 kHz stereo silence；
- R2V 最终媒体使用 32 kHz 音频；
- FL2VA boundary 目前使用 48 kHz 的通用媒体收尾路径。

Native profile 不能直接复用 FL2VA 的收尾逻辑，必须把 24 FPS、32 kHz stereo 和整数 frame/audio sample/PTS 边界作为独立策略保存到任务快照。

## 4. 官方资料核对

### 4.1 PR #15375

官方 PR 已合并，并提供名为 `droz_MiniMaxH3_BasicMaskedExtension_v1.4.json` 的 extension 示例 workflow。PR 描述确认：video mask 对齐 2×2 latent patch grid，audio mask 对齐完整 latent frame，并通过阈值变成二值 mask。

官方 H3 教程将该能力描述为：连接 sampler 的 `denoise_mask`，`0` 保留内容，`1` 重新生成，并明确包含 clip extension 用法。

来源：

- [PR #15375](https://github.com/Comfy-Org/ComfyUI/pull/15375)
- [官方 MiniMax H3 教程](https://docs.comfy.org/tutorials/video/minimax/minimax-h3)

### 4.2 PR #15439

官方 PR 和嵌入文档确认 `MiniMaxH3AddGuide`：

- 可在任意 `frame_idx` 锚定 still、短视频片段、音频或带音轨片段；
- 官方示例是把现有视频的前 22 frames 和对应 audio 在 frame 0 加入 guide，再由模型生成 continuation；
- 它是 conditioning guide，不是 noise mask；
- 它需要目标 H3 AV latent；
- 多个 guide 可以串联。

来源：

- [PR #15439](https://github.com/Comfy-Org/ComfyUI/pull/15439)
- [MiniMaxH3AddGuide 官方中文文档](https://github.com/Comfy-Org/embedded-docs/blob/main/comfyui_embedded_docs/docs/MiniMaxH3AddGuide/zh.md)

## 5. P0 结论

| P0 项目 | 结论 | 状态 |
| --- | --- | --- |
| 当前 Extend 实现边界 | 已确认是 Motion Context 单段任务 | 已完成 |
| 当前 ComfyUI core | 0.33.0，HEAD 同时包含 #15375/#15439 | 已完成 |
| `/object_info` schema | H3 AV latent、AddGuide、Motion Context 均可见 | 已完成 |
| H3 组件离线存在性 | FL2VA INT8 四件套和现有 custom nodes 均存在 | 已完成 |
| 官方 Basic Masked Extension graph | PR 中有官方附件，但本次尚未落入项目并解析节点图 | 待完成 |
| Native mask 输入契约 | core 路径已确认，joint nested mask 的 workflow 构造方式待官方 graph 核验 | 待完成 |
| AddGuide 是否首版必需 | 结论：不作为首版 Basic Masked Extension 的必需节点；后续作为可选任意帧 guide | 已决定 |
| 首个 full-target smoke 长度 | 不使用 39 frames 作为完整目标；首选 124 frames 左右，39 仅作为 guide/overlap 候选 | 已修正 |
| 真实生成 | 本轮未执行 | 待后续 P2/P5 |

## 6. 对后续计划的直接影响

1. P1 artifact 仍然优先；当前 ComfyUI core 已足够保存/读取设计所需的 schema，但 stock `SaveLatent/LoadLatent` 不能未经验证地承担 joint AV artifact contract。
2. P2 workflow 必须新增 Native graph，不得改写或复用 `minimax_h3_r2v_extend_api.json` 的 Motion Context 语义。
3. P2 的第一版应先复刻官方 Basic Masked Extension 的 mask 方式，再决定是否叠加 `MiniMaxH3AddGuide`；AddGuide 不能代替 mask。
4. frame planner 需要把“guide/overlap clip length”和“完整 target latent length”分开；当前 `39 frames` 不能继续作为完整 Native target 的默认 smoke 长度。
5. Native capability gate 可以在当前机器上通过 core revision 和 `/object_info` 预检查，但仍必须保持 `runtime-unverified`，直到最小真实 workflow 运行成功。

## 7. P0 剩余动作

1. 从 PR #15375 官方附件取得 `droz_MiniMaxH3_BasicMaskedExtension_v1.4.json`，保存到只读研究临时目录，不直接作为产品 workflow。
2. 解析该 workflow 的完整 class types、节点输入、mask 构造、H3 latent 输入、输出和第三方 custom-node依赖。
3. 将官方 graph 与当前 `/object_info` 做静态 schema 对照，记录需要的最小 core/custom-node revision。
4. 用当前项目的 API-format validator 验证一个不提交 GPU 的静态转换草图；真实 smoke 延后到 P2。
5. 把本证据文件中的 core fingerprint、schema fingerprint 和时间规则转成后续 capability probe 的测试 fixture。

