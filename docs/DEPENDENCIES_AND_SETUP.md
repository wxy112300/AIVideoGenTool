# 依赖、环境与初始化

本文说明 Local Video Studio 如何识别和使用 ComfyUI。模型名称、组件文件和下载目标的代码事实位于 `src/core/catalog/`；节点仓库和离线/运行时探针位于 `electron/services/environment.ts`。本文不复制完整文件清单。

## 1. 运行边界

Local Video Studio 是 Electron + TypeScript + Vite 桌面应用。它负责素材、参数、队列、历史、文件管理和 ComfyUI 通信；模型加载、CUDA、采样、VAE、音频和媒体输出由 ComfyUI 执行。

提示词辅助同样通过所选 ComfyUI 运行：

- Qwen3.5 使用 ComfyUI 核心 `TextGenerate` 路径。
- Gemma 4 使用 ComfyUI MiniMax H3 Prompt Writer 节点及其 ComfyUI Python 依赖。
- 旧状态中可能仍有 LM Studio/llama-server 字段用于兼容迁移，但当前 UI 不要求、也不推荐安装独立服务。

## 2. 五种不同的“已安装”

排错时必须区分以下状态：

1. **ComfyUI 安装存在**：能找到 Desktop、Portable 或源码安装。
2. **数据目录正确**：`models`、`custom_nodes`、`input`、`output` 属于实际使用的实例。
3. **组件文件存在**：catalog 能离线识别扩散模型、编码器、VAE、LoRA 等文件。
4. **节点文件存在**：自定义节点目录和必要入口文件存在，Python requirements 已安装。
5. **运行时可用**：当前连接服务的 `/object_info` 包含工作流要求的节点，最小任务真实成功。

设置页把离线识别和运行时验证分开。ComfyUI 未启动时仍可管理路径、模型和节点；“文件检查通过”不能写成“运行时已验证”。

## 3. 必需软件

### 应用开发/运行

- Windows 10/11。
- Node.js 22 LTS 或更高版本与 npm。
- Git；自定义节点安装和更新需要。
- FFmpeg；视频裁帧、续写、封装和部分后处理需要。

### 生成环境

- NVIDIA 驱动和可工作的 `nvidia-smi`。
- ComfyUI Desktop、Portable 或源码安装之一。
- 与所选 ComfyUI 绑定的 Python/PyTorch/CUDA runtime。

一般不需要系统级完整 CUDA Toolkit。Portable 使用 `python_embeded`，Desktop/源码安装通常使用自己的 `.venv`。节点依赖必须安装进这套 Python，而不是随便一个系统 Python。

## 4. ComfyUI 核心目录与数据目录

ComfyUI Desktop 可能把启动器、核心源码和数据目录放在不同位置。Desktop 2 的真实实例应从安装记录解析，常见数据路径包括：

```text
D:\Comfy-Desktop\ComfyUI-Installs\ComfyUI
%USERPROFILE%\Documents\ComfyUI
<Portable>\ComfyUI
```

这些只是常见候选，不是硬编码真相。设置页会扫描常见磁盘目录和 Desktop 安装记录，并允许手动选择。

同机多实例时检查：

- 设置显示的核心目录；
- 设置显示的数据/节点目录；
- 选中的 Python；
- 当前 API URL；
- 服务报告的核心版本/提交。

节点安装、模型扫描和任务执行必须指向同一实例。默认服务地址是 `http://127.0.0.1:8188`；Desktop 自己启动在其他端口时可以连接该地址，但不要因此把节点安装到错误目录。

## 5. 首次启动

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd start
```

也可以双击 `start-ui.bat`。开发模式使用：

```powershell
npm.cmd run dev
```

根目录 `scripts/setup.ps1` 可用于命令行环境检查；日常用户优先使用应用设置页，因为它会保存所选实例和路径。

## 6. 模型、节点和工作流的正确安装顺序

### 6.1 选择并扫描实例

在“设置 → 系统与路径”选择 ComfyUI，确认核心/数据目录和模型根目录，然后执行离线扫描。此步骤不要求启动服务。

### 6.2 安装节点

“设置 → 节点与工作流”中的注册节点可一键安装或更新。安装器会：

1. 定位所选 ComfyUI 的 `custom_nodes` 和 Python。
2. 使用 Git clone/pull；需要安全替换时先备份原目录。
3. 应用本项目明确维护的兼容补丁。
4. 使用所选 ComfyUI Python 执行节点的 `requirements.txt`。
5. 在卡片中实时输出阶段、Git/pip 内容、超时和错误。
6. 当前批次安装完成后只重启一次 ComfyUI，并统一通过运行时节点重新检查。

可以连续点击多个节点加入等待队列。应用会锁定该批次开始时所选的 ComfyUI 实例和 Python，串行执行每个节点的 Git/pip 操作；单项失败会写入对应卡片日志并继续下一项，不会让后续节点永远等待。批次末尾统一重启和复扫，卡片会区分“排队中”“处理中”和“正在重启并复检”。重启/复检阶段不再接受新的节点，避免节点被安装到另一套环境。

面板顶端的“一键安装 / 更新缺失节点”会只加入未安装、未加载或有更新提示的 Custom Nodes；全部健康时按钮切换为“更新全部节点”。两种操作都复用同一串行队列，不会把 ComfyUI 核心升级或内置工作流文件混入节点批次。

Git clone/update 有 5–10 分钟上限；普通 Python requirements 为 15 分钟，Prompt Writer 的 GGUF runtime 为 20 分钟。超时会终止对应子进程树并保留已收到的日志，避免无限显示“处理中”。

当前注册的节点族包括 GGUF、Video Helper Suite、LTXVideo、SeedVR2、FlashVSR、KJNodes、Frame Interpolation、MiniMax H3 Prompt Writer、H3 Motion Context 和 Spectrum。准确仓库、目录名、用途和 required/optional 状态以 `customNodeCatalog` 为准。

Spectrum 版本分为三层：`v0.2.1` 是普通 H3 的最低可用线；当前推荐 `v0.2.7`，包含原生 ER-SDE 修复和可选的模型感知预测；设置页仍会查询上游最新发布并提供一键更新，但高于最低线的旧版不会只因“不是最新版”而被判定不可用。LightX2V Turbo 与 Spectrum 同开至少需要 `v0.2.6`；`model_aware_mode` 至少需要 `v0.2.7`，默认关闭。

注意：MiniMax H3 基础生成节点属于 ComfyUI 核心，不应伪装成第三方节点。如果核心节点缺失，应更新/切换正确的 ComfyUI 核心并重新扫描。

### 6.3 下载权重

大型模型目前不由 Git 仓库携带，也通常不由应用自动下载。设置页每个组件的信息入口提供：

- 官方或社区来源；
- 推荐文件名；
- 相对于模型根目录的目标子目录；
- 可选/必需状态和注意事项。

将文件放入显示的目录后重新扫描。不要根据模型显示名猜目录；例如扩散模型、GGUF UNet、文本编码器、VAE、LoRA 和 latent upscaler 属于不同分类。

### 6.4 工作流

执行工作流必须是 ComfyUI **API 格式**：节点 ID 为 key，每个节点包含 `class_type` 和 `inputs`。普通 UI workflow 不能直接提交到 `/prompt`。

应用自带生产工作流位于 `workflows/`，并由 adapter 注入 Prompt、素材、Seed、尺寸、帧数、LoRA 和输出路径。设置页可下载的官方工作流主要用于在 ComfyUI 中查看和比对，不自动证明应用生产 workflow 运行成功。

### 6.5 两阶段验证

- **加入队列**：使用保存路径离线复扫模型组件，并静态检查 workflow/adapter。ComfyUI 停止不应无故阻止入队。
- **启动任务**：连接或启动 ComfyUI，通过 `/object_info` 检查真实节点，再提交 `/prompt`。

模型、节点和服务状态必须给出不同错误。不要把“服务未启动”显示成“模型未安装”。

## 7. 当前模型族的依赖重点

### MiniMax H3 FL2VA / R2V

- FL2VA 与 R2V 使用不同扩散权重，不能互换。
- 共同依赖 H3 文本编码器、视频 VAE、音频 VAE 和足够新的 ComfyUI 核心节点。
- R2V 支持多参考图片；Motion Context 是可选的 R2V 续写增强节点，不是基础 FL2VA 的必需项。
- LightX2V Turbo、Realism People 和 PinkFluffyBunny 是 LoRA，不是独立视频模型；兼容模式、顺序、强度和冲突由 LoRA catalog 管理。LightX2V Turbo 使用原生 ER-SDE/Beta 路径，Spectrum `v0.2.6+` 可叠加；更早版本必须先更新。
- H3 实时预览是可选能力：更新 KJNodes 以获得 `ModelPreviewOverrideKJ`，并把 Kijai 的 `taeh3.safetensors` 放入 `models/vae_approx`。设置页会离线检查 KJNodes 的预览源码，服务启动后再通过 `/object_info` 验证节点注册；它只负责采样期间的低分辨率 RGB 预览，不替代 `models/vae` 中的最终视频 VAE。队列开关默认关闭，缺少节点或权重时保持原工作流运行。
- SageAttention、Spectrum、Cache/Attention patch 是模型范围内的策略，不得泄漏到 Qwen、Sulphur 或其他工作流。

### Sulphur 2 / LTX 2.3

- 使用 GGUF/低显存模型变体、LTX 文本连接器、视频/音频 VAE 和 latent upscaler。
- 原生视频续写依赖 LTXVideo 节点；其 overlap 语义与 H3 边界帧接续不同。

### Qwen-Image-Edit-2511 / FLUX.2 Klein

- 图片模型有独立的扩散模型、编码器和 VAE 组件。
- Qwen 多图/Canvas 标记会影响实际图片输入槽数量；workflow adapter 和 Create 限制必须一致。
- 图片任务同样先离线入队检查，执行时再验证节点。

### 视频增强

- SeedVR2、FlashVSR、Real-ESRGAN 和 RIFE 各自有权重与节点要求。
- 这些是生成后的独立重型阶段，仍遵守单 GPU 重任务策略和阶段卸载规则。

## 8. 代理与网络问题

应用代理默认关闭。开启后，节点 Git/pip、工作流下载等使用设置的 HTTP/HTTPS/SOCKS 代理；默认示例为 `127.0.0.1:7890`。

排错时查看节点卡片实时日志和“设置 → 日志”。常见问题：

- Git 不在 PATH；
- 代理地址不可达或证书失败；
- GitHub/Hugging Face 限速；
- 选错 ComfyUI Python，依赖装进了系统 Python；
- ComfyUI 正占用节点文件，导致 Windows 替换失败；
- 节点上游 requirements 与当前 Torch/CUDA ABI 不兼容。

可以连续点击不同节点加入应用内安装队列；同一节点不会重复入队，Git/pip 始终串行。不要同时启动第二个 Local Video Studio 实例安装同一套 ComfyUI，也不要在批次运行时从外部修改对应节点目录。

## 9. 验证

代码级门禁：

```powershell
npm.cmd run verify
```

模型/节点变更还需要：

1. 服务关闭时离线扫描正确；
2. 多 ComfyUI 实例选择正确；
3. 安装成功、失败和超时都有实时日志；
4. 重启后 `/object_info` 验证需要的节点；
5. 以低风险参数完成真实最小生成。

只有第 5 项成功才能称为“模型跑通”。类型检查、JSON 构建或节点文件存在只能称为静态验证。

## 10. 官方参考

- [ComfyUI Desktop for Windows](https://docs.comfy.org/installation/desktop/windows)
- [ComfyUI Portable](https://docs.comfy.org/installation/comfyui_portable_windows)
- [ComfyUI workflow/API concepts](https://docs.comfy.org/development/core-concepts/workflow)
- [ComfyUI Manager](https://docs.comfy.org/manager/install)
- [FFmpeg](https://ffmpeg.org/download.html)
