# Local Video Studio

一个面向 Windows 和本地 ComfyUI 的视频生成桌面工作台。

Local Video Studio 把参考图、提示词、视频模型、任务队列和生成历史整理到统一的 GUI 中，让用户不必频繁编辑 ComfyUI 节点图，也能完成图生视频、视频续写、插帧和超分辨率处理。

> [!IMPORTANT]
> 项目仍处于早期开发阶段，目前以 Windows、NVIDIA GPU 和本地 ComfyUI 为主要运行环境。模型权重、ComfyUI 和第三方节点不会包含在仓库中。

## 立即启动

### 最简单的方式：Windows

1. 安装 [Node.js 22 LTS 或更高版本](https://nodejs.org/)。
2. 安装并启动本地 [ComfyUI](https://github.com/Comfy-Org/ComfyUI)。
3. 克隆仓库后，双击根目录的 `start-ui.bat`。

```powershell
git clone https://github.com/wxy112300/AIVideoGenTool.git
cd AIVideoGenTool
```

`start-ui.bat` 会自动检查依赖、安装缺失的 Electron runtime、执行构建并启动桌面应用。首次打开后进入“设置”，选择 ComfyUI 实例，确认服务地址和模型目录，再回到“创建”页面。

如果 npm 下载需要代理，可以双击 `start-ui-proxy.bat`，或在命令行传入代理地址：

```bat
start-ui-proxy.bat http://127.0.0.1:7890
```

### 命令行启动

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd start
```

开发模式会同时启动 Vite、Electron TypeScript watch 和桌面窗口：

```powershell
npm.cmd ci
npm.cmd run dev
```

### 启动前检查

- Windows 10/11
- NVIDIA GPU，推荐 24GB 级显存和 64GB 系统内存运行 H3
- 本地 ComfyUI；应用默认连接 `http://127.0.0.1:8188`
- FFmpeg（视频续写、精确裁帧和部分媒体处理需要）
- 模型权重和第三方节点不会随仓库下载，需要在应用“设置”中按扫描结果补齐

## 主要功能

- **统一创作界面**：拖入首帧或首尾帧，设置提示词、模型、时长、分辨率、帧率和随机种子。
- **本地任务队列**：持久化等待任务，展示当前节点、进度、预览、耗时以及 CPU、内存和显存占用。
- **生成历史**：直接播放输出视频，查看任务参数和不同版本，并支持复制文件、打开目录和删除文件。
- **环境检查**：扫描常见目录和 Comfy Desktop 安装记录，识别多个 ComfyUI 实例、核心版本、模型和自定义节点。
- **动态 GPU 检测**：通过 `nvidia-smi` 读取实际 GPU 型号、驱动和总显存；运行预算按“总显存 - 安全余量”计算，不把 4090 写死在配置中。
- **服务管理**：连接已有 ComfyUI，也可以从应用内启动、重启和更新所选安装；默认接口为 `http://127.0.0.1:8188`。
- **低显存保护**：按工作流启用模型卸载、CPU offload、分块 VAE 解码和单任务执行，降低长视频处理时的显存峰值。
- **分阶段任务进度**：总进度条按加载、采样、解码、插帧、封装和保存阶段计算；当前阶段另显示局部步数，例如 `扩散采样 4/20`。
- **H3 提示词助手**：除了官方结构模板，还提供结构化构建器，可分别填写参考连续性、动作起因、身体/视线锁定、镜头类型与幅度/速度、景别变化、同步声音、对白和屏幕文字。
- **提示词扩写**：支持 ComfyUI 原生 TextGenerate、应用自管理 llama-server 和可选 LM Studio 兼容接口；模型文件按各自运行时扫描和管理。
- **提示词模型扫描**：设置页扫描与视频模型相同的 ComfyUI 模型根目录，按官方 `text_encoders` 文件统计可用性，并用同一个下载说明弹窗展示 Hugging Face 来源、文件名和目标目录；不再单独选择提示词模型目录。
- **扩写预设**：设置 → 提示词扩写中可编辑完整电影提示词、参考图忠实理解、单镜头连贯动作、多参考关系编排四套规则头，覆盖整个提示词生成策略，保存后下一次扩写生效，也可以一键恢复全部默认。
- **内置 H3 官方基线**：软件固定保留 H3 的 T2VA、I2VA、FL2VA、L2VA 任务关系，R2V 参考标签顺序，原生音频、动作连续性和结构化输出约束；用户编辑预设不会删除这些底层规则。

内置基线直接按公开的 [MiniMax H3 Video Prompt Writing Guide](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md) 实现，并结合 [Comfy-Org H3 I2V 工作流](https://github.com/Comfy-Org/workflow_templates/blob/main/templates/video_minimax_h3_i2v.json)、[H3 R2V 工作流](https://github.com/Comfy-Org/workflow_templates/blob/main/templates/video_minimax_h3_r2v.json)、[ComfyUI H3 节点实现](https://github.com/Comfy-Org/ComfyUI/blob/master/comfy_extras/nodes_minimax_h3.py) 和 [Comfy-Org/MiniMax-H3 模型说明](https://huggingface.co/Comfy-Org/MiniMax-H3) 整理，软件不会在运行时联网读取这些文档。
- **下载代理**：可为依赖、节点和工作流下载单独配置 HTTP 代理，默认关闭。

## 已接入的工作流

| 类型 | 模型或工具 | 当前能力 |
| --- | --- | --- |
| 图生视频 | MiniMax H3 FL2VA INT8 | 首帧或首尾帧、原生 24 FPS 音视频、结构化镜头与声音提示词 |
| 图生视频 | MiniMax H3 FL2VA INT4 ConvRot | 社区低显存档，首帧或首尾帧，建议 12GB 起步并准备充足系统内存 |
| 多参考图生视频 | MiniMax H3 R2V INT8 | 最多 9 张图片 Slot，按 `<Picture N>` 分配人物、场景、风格、动作和镜头作用 |
| 多参考图生视频 | MiniMax H3 R2V INT4 ConvRot | 社区低显存 R2V 图片参考档，适合显存较小的设备实验 |
| 图生视频 / 续写 | Sulphur 2 / LTX 2.3 | GGUF 低显存配置、原生 overlap 视频续写 |
| 图生视频 | Wan 2.2 | 5B、14B 及 Remix、SmoothMix 等内置配置 |
| 图生视频 | HunyuanVideo 1.5 | 标准 I2V 和双阶段 1080p SR |
| 帧插值 | RIFE | 2× / 4× 插帧，将模型生成帧率与成片目标帧率分开 |
| 视频超分 | SeedVR2、FlashVSR、Real-ESRGAN | 分批处理和批次间模型卸载 |

MiniMax H3 的“续写”目前采用**边界帧接续**：提取原视频最后一帧作为下一段的首帧，并保留 H3 原生音轨。它不是 latent overlap，因此片段边界的动作连续性可能弱于 Sulphur 2 / LTX 2.3 的原生续写。

不同工作流对 ComfyUI 版本、节点、权重目录和显存的要求不同。设置页会按当前选择的 ComfyUI 实例给出检测结果、下载地址和目标目录；更完整的依赖说明见 [依赖与环境配置](docs/DEPENDENCIES_AND_SETUP.md)。

### MiniMax H3 模型选择

MiniMax H3 的 FL2VA 和 R2V 使用不同的扩散模型，不能混用：

| 模式 | 扩散模型 | 适用场景 |
| --- | --- | --- |
| FL2VA | `minimax_h3_fl2va_pruned_int8_convrot.safetensors` | 首帧、首尾帧和 H3 边界帧续写 |
| FL2VA INT4 | `minimax_h3_fl2va_pruned_int4_convrot.safetensors` | 低显存首帧/首尾帧实验 |
| FL2VA Turbo | `minimax_h3_fl2va_pruned_int8_convrot.safetensors` + `minimax_h3_turbo_4step_ckpt500_pruned_comfyui.safetensors` | pruned 首尾帧加速；建议 8-10 步，不提供视频续写 |
| R2V | `minimax_h3_ref2va_pruned_int8_convrot.safetensors` | 多图片参考生成 |
| R2V INT4 | `minimax_h3_ref2va_pruned_int4_convrot.safetensors` | 低显存多图片参考实验 |

所有 H3 变体还需要对应的 Qwen 文本编码器和官方 VAE：

```text
ComfyUI/models/diffusion_models/
	minimax_h3_fl2va_pruned_int8_convrot.safetensors
	minimax_h3_fl2va_pruned_int4_convrot.safetensors
	minimax_h3_ref2va_pruned_int8_convrot.safetensors
	minimax_h3_ref2va_pruned_int4_convrot.safetensors

ComfyUI/models/text_encoders/
	qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors
	qwen3vl_32b_minimax_h3_int4_convrot.safetensors

ComfyUI/models/vae/
	minimax_h3_video_vae_fp16.safetensors
	minimax_h3_audio_vae_fp32.safetensors

ComfyUI/models/loras/
	minimax_h3_turbo_4step_ckpt500_pruned_comfyui.safetensors
```

Turbo 使用 ComfyUI 核心的 `MiniMaxH3SigmaShift`、`res_multistep` 和 `simple` 调度器，不需要额外安装 Larry 的 Turbo custom node。设置页会检查该核心节点和推荐 LoRA；创建页将 Turbo 作为独立模型显示，只提供首帧/尾帧图片输入。建议先使用 8 步、视频 shift `12`、音频 shift `6`、LoRA strength `1.0` 的配置。4 步属于实验档，可能出现音频失真或动作异常；普通 H3 20 步仍是稳定回退路径。

官方和社区权重的下载地址会在“设置 → 视频模型”的组件卡片中显示。RTX 4090 等 24GB 显卡可以优先尝试官方 INT8；12GB 级别设备优先尝试 pruned INT4，但实际速度和成功率仍取决于系统内存、NVMe 和 ComfyUI offload。INT4 是社区转换，不等同于官方质量保证。

### 本地提示词模型

提示词扩写有两条本地路径：ComfyUI 原生 Qwen3.5 2B/4B BF16 放在 `text_encoders`，或应用自管理的 Unconcerned Qwen3.5 GGUF + `mmproj` 放在 `prompt_models`。两条路径都支持文字和参考图/视频理解，但文件格式和运行时完全不同，不能交叉加载。

| 模型 | 下载文件 | 目标目录 |
| --- | --- | --- |
| Qwen3.5 4B | [qwen3.5_4b_bf16.safetensors](https://huggingface.co/Comfy-Org/Qwen3.5/resolve/main/text_encoders/qwen3.5_4b_bf16.safetensors?download=true) | `ComfyUI/models/text_encoders/` |
| Qwen3.5 2B | [qwen3.5_2b_bf16.safetensors](https://huggingface.co/Comfy-Org/Qwen3.5/resolve/main/text_encoders/qwen3.5_2b_bf16.safetensors?download=true) | `ComfyUI/models/text_encoders/` |

### 应用自管理 Unconcerned 提示词模型

如果不想依赖 LM Studio，可以在设置 → 提示词扩写中选择“应用自管理 llama-server（Unconcerned）”。当前档位使用 [HauhauCS/Qwen3.5-4B-Uncensored-HauhauCS-Aggressive](https://huggingface.co/HauhauCS/Qwen3.5-4B-Uncensored-HauhauCS-Aggressive) 的 Q6_K GGUF 和 BF16 `mmproj`，由应用自己启动和停止本地 `llama-server.exe`，支持参考图/视频输入。设置页会自动扫描 `PATH`、提示词模型目录和应用管理目录；扫描不到时可以点击“一键安装 llama-server”，应用会下载官方 llama.cpp Windows CUDA 运行包并自动保存可执行文件路径。

需要准备：

| 文件 | 目标目录 |
| --- | --- |
| [Qwen3.5-4B-Uncensored-HauhauCS-Aggressive-Q6_K.gguf](https://huggingface.co/HauhauCS/Qwen3.5-4B-Uncensored-HauhauCS-Aggressive/resolve/main/Qwen3.5-4B-Uncensored-HauhauCS-Aggressive-Q6_K.gguf?download=true) | `ComfyUI/models/prompt_models/` 或设置中的应用提示词模型目录 |
| [mmproj-Qwen3.5-4B-Uncensored-HauhauCS-Aggressive-BF16.gguf](https://huggingface.co/HauhauCS/Qwen3.5-4B-Uncensored-HauhauCS-Aggressive/resolve/main/mmproj-Qwen3.5-4B-Uncensored-HauhauCS-Aggressive-BF16.gguf?download=true) | 同上 |
| [llama.cpp Windows CUDA release](https://github.com/ggml-org/llama.cpp/releases) 中的 `llama-server.exe` | 在设置中填写完整路径，或放入模型目录/系统 `PATH` |

这个档位不使用 ComfyUI `TextGenerate`，也不需要 LM Studio。应用只管理自己启动的 `llama-server` 进程；扩写完成、开始视频队列或退出应用时会停止它并释放显存。模型采用 Apache-2.0，但 `llama.cpp` 和模型文件各自的上游许可证仍需分别遵守。

Qwen3.5 4B 是 ComfyUI 原生路径的质量和显存平衡主力，Qwen3.5 2B 文件约 4.55GB，适合 12GB 显存或快速迭代，但复杂动作分析和提示词细节能力会低于 4B。原生档由 ComfyUI `CLIPLoader`、`TextGenerate`、`LoadImage` 和 `ImageBatch` 加载；Unconcerned 档则由应用自管理 `llama-server` 加载 GGUF + `mmproj`。两条路径不能交叉加载。关闭 LM Studio 后，应用会按需启动所选本地提示词运行时，执行提示词扩写并把结果保存为新的提示词版本；开始视频任务或退出应用时会释放提示词模型。

R2V 当前在应用内支持混合媒体 Slot：最多 9 张参考图和 3 段参考视频，总数不超过 12 个。每个 Slot 可标注人物、场景、风格、动作、镜头等作用；提示词会按官方语义区分可复用内容的 `<Subject N>`、具体帧/构图锚点 `<Picture N>` 和参考视频 `<Video N>`。参考视频会同时送入画面帧和视频自身音轨；独立音频 Slot 尚未接入应用界面。

### MiniMax H3 提示词助手

创建页的 H3 提示词助手包含两种方式：

- **结构化模板**：快速生成 T2VA、I2VA、FL2VA、L2VA 或 R2V 的官方字段结构。
- **结构化构建器**：把镜头运动拆成类型、幅度和速度，并单独填写主体初始状态、连续性锁、身体/视线锁、动作时间线、景别变化、同步声音和最终状态；对白、环境声、背景音乐和屏幕文字位于可选高级字段中。

构建器生成的内容会作为新的提示词版本保存，不会覆盖手写版本。快捷插入还提供参考图连续性、动作起因、镜头路径限制、空间回声、对白和屏幕文字句式。H3 检查器会提示缺少首镜头声明、参考图对齐字段、对白说话人 ID 和后续镜头时间戳等结构问题。

## 数据与隐私

- 提示词、任务队列、历史记录和设置保存在 Electron 的本地用户数据目录中。
- 视频默认使用所选 ComfyUI 的输出目录，也可以在设置中指定其他目录。
- 删除历史作品时，可同时删除记录和关联的视频文件；执行前会要求确认。
- 推理和本地提示词扩写均在本机进行。只有在下载依赖、下载模型、启动可选 LM Studio 或用户主动配置外部服务时才会产生对应的网络请求。
- 模型文件和生成媒体已被 `.gitignore` 排除，不应提交到仓库。

## 自定义 ComfyUI 工作流

`workflows/` 中保存的是 ComfyUI **API 格式**工作流。应用会在提交任务前递归替换占位符，常用字段包括：

```text
{{PROMPT}} {{NEGATIVE_PROMPT}} {{SEED}}
{{INPUT_IMAGE}} {{END_IMAGE}}
{{H3_REF_IMAGE_0}} ... {{H3_REF_IMAGE_8}}
{{WIDTH}} {{HEIGHT}} {{DURATION}}
{{BASE_WIDTH}} {{BASE_HEIGHT}} {{HALF_WIDTH}} {{HALF_HEIGHT}}
{{SOURCE_FPS}} {{FPS}} {{FRAMES}} {{OUTPUT_FRAMES}}
{{HIGH_MODEL}} {{LOW_MODEL}} {{TEXT_ENCODER}} {{VAE_MODEL}}
{{OUTPUT_FILENAME}}
```

工作流必须由 ComfyUI 以 API 格式导出，并包含对应模型所需的节点和占位符。具体约束和验证顺序见 [依赖与环境配置](docs/DEPENDENCIES_AND_SETUP.md)。

## 开发

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run dev
```

主要目录：

```text
electron/    Electron 主进程、持久化和本地服务集成
src/         渲染界面、状态类型和工作流转换逻辑
workflows/   内置 ComfyUI API 工作流
tests/       单元测试
docs/        产品、环境和工作流设计文档
prototypes/  早期界面与交互原型
```

## 当前限制

- 当前优先支持 Windows；尚未提供正式安装包和自动更新渠道。
- 可运行的分辨率、时长和速度由模型、量化版本、显存、系统内存及 ComfyUI 环境共同决定。
- 环境修复覆盖已知依赖，但无法保证自动修复任意第三方节点或被手动修改过的 Python 环境。
- H3 边界帧接续属于实验性能力，不等同于模型原生的长视频上下文续写。
- 运行中取消会优先中止 ComfyUI 任务并释放模型；由应用启动的进程会随应用退出，独立启动的 ComfyUI 服务不会被强制关闭。

## 参与贡献

欢迎提交 Issue 和 Pull Request。报告问题时，请尽量附上：

- Local Video Studio 的提交版本
- ComfyUI 安装类型、核心版本和服务地址
- 使用的模型、工作流、分辨率、帧数和 GPU 型号
- 设置页检测结果及相关日志（请先移除用户名、访问令牌和私人媒体路径）

产品范围与交互要求见 [产品需求文档](docs/PRODUCT_REQUIREMENTS.md)，视频续写的设计边界见 [视频续写设计](docs/VIDEO_EXTENSION_DESIGN.md)。

## 许可证

本项目使用 [MIT License](LICENSE)。模型权重、ComfyUI、第三方节点和各自的模型许可证不包含在本项目许可证授权范围内，请分别遵守其上游许可条款。
