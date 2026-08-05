# Local Video Studio

一个面向 Windows 和本地 ComfyUI 的视频生成桌面工作台。

Local Video Studio 把参考图、提示词、视频模型、任务队列和生成历史整理到统一的 GUI 中，让用户不必频繁编辑 ComfyUI 节点图，也能完成图生视频、视频续写、插帧和超分辨率处理。

> [!IMPORTANT]
> 项目仍处于早期开发阶段，目前以 Windows、NVIDIA GPU 和本地 ComfyUI 为主要运行环境。模型权重、ComfyUI 和第三方节点不会包含在仓库中。

## 主要功能

- **统一创作界面**：拖入首帧或首尾帧，设置提示词、模型、时长、分辨率、帧率和随机种子。
- **本地任务队列**：持久化等待任务，展示当前节点、进度、预览、耗时以及 CPU、内存和显存占用。
- **生成历史**：直接播放输出视频，查看任务参数和不同版本，并支持复制文件、打开目录和删除文件。
- **环境检查**：扫描常见目录和 Comfy Desktop 安装记录，识别多个 ComfyUI 实例、核心版本、模型和自定义节点。
- **动态 GPU 检测**：通过 `nvidia-smi` 读取实际 GPU 型号、驱动和总显存；运行预算按“总显存 - 安全余量”计算，不把 4090 写死在配置中。
- **服务管理**：连接已有 ComfyUI，也可以从应用内启动、重启和更新所选安装；默认接口为 `http://127.0.0.1:8188`。
- **低显存保护**：按工作流启用模型卸载、CPU offload、分块 VAE 解码和单任务执行，降低长视频处理时的显存峰值。
- **分阶段任务进度**：总进度条按加载、采样、解码、插帧、封装和保存阶段计算；当前阶段另显示局部步数，例如 `扩散采样 4/20`。
- **提示词扩写**：可选连接本地 LM Studio 的 OpenAI 兼容接口，不依赖云端模型。
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
```

官方和社区权重的下载地址会在“设置 → 视频模型”的组件卡片中显示。RTX 4090 等 24GB 显卡可以优先尝试官方 INT8；12GB 级别设备优先尝试 pruned INT4，但实际速度和成功率仍取决于系统内存、NVMe 和 ComfyUI offload。INT4 是社区转换，不等同于官方质量保证。

R2V 当前在应用内支持图片 Slot：最多 9 张参考图，每张可标注人物、场景、风格、动作、镜头等作用，并在提示词中引用 `<Picture 1>`、`<Picture 2>`。参考视频和独立音频的 Slot 尚未接入应用界面。

## 快速开始

### 运行要求

- Windows 10 或 Windows 11
- [Node.js](https://nodejs.org/) 22 LTS 或更高版本
- 一个可用的本地 [ComfyUI](https://github.com/Comfy-Org/ComfyUI) 安装
- FFmpeg（视频续写、精确裁帧和部分媒体处理需要）
- 推荐使用 NVIDIA GPU；大型视频模型通常需要较大的显存和系统内存

### 1. 获取代码

```powershell
git clone https://github.com/wxy112300/AIVideoGenTool.git
cd AIVideoGenTool
```

### 2. 启动应用

双击 `start-ui.bat`。首次启动会检查 npm 直接依赖；如果 `lucide` 或其他依赖缺失，会自动执行 `npm ci` 修复，然后构建并打开桌面应用。

也可以在终端中运行：

```powershell
npm.cmd ci
npm.cmd run dev
```

如果首次安装依赖时需要代理，可以双击 `start-ui-proxy.bat`，或传入代理地址：

```bat
start-ui-proxy.bat http://127.0.0.1:7890
```

该代理只作用于本次启动及其子进程，不会修改 Windows 的全局代理设置，本地服务地址仍然直连。

### 3. 配置 ComfyUI

首次打开后进入“设置”：

1. 扫描并选择要使用的 ComfyUI 安装；也可以手动选择目录。
2. 确认服务地址，默认是 `http://127.0.0.1:8188`。
3. 启动或连接 ComfyUI，然后重新扫描核心节点、自定义节点和模型。
4. 根据缺失项旁的说明下载权重，或使用可用的一键安装/修复操作。
5. 确认输出目录后，回到“创建”页面提交第一个任务。

应用支持普通源码安装和 Comfy Desktop。发现多个实例时不会静默切换，实际扫描、启动和更新均以设置中选中的目录为准。

## 数据与隐私

- 提示词、任务队列、历史记录和设置保存在 Electron 的本地用户数据目录中。
- 视频默认使用所选 ComfyUI 的输出目录，也可以在设置中指定其他目录。
- 删除历史作品时，可同时删除记录和关联的视频文件；执行前会要求确认。
- 推理和 LM Studio 提示词扩写均在本机进行。只有在下载依赖或用户主动配置外部服务时才会产生对应的网络请求。
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

仓库目前尚未添加开源许可证。在 `LICENSE` 文件明确之前，代码公开可见不代表已授权复制、修改或再分发。正式公开发布前，请由项目维护者选择并添加合适的许可证。
