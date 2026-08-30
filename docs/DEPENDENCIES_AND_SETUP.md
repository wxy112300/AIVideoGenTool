# 依赖、环境与初始化

本文说明 Local Video Studio 如何识别和使用 ComfyUI。模型名称、组件文件和下载目标的代码事实位于 `src/core/catalog/`；节点仓库和离线/运行时探针位于 `electron/services/environment.ts`。本文不复制完整文件清单。

## 1. 运行边界

Local Video Studio 是 Electron + TypeScript + Vite 桌面应用。它负责素材、参数、队列、历史、文件管理和 ComfyUI 通信；模型加载、CUDA、采样、VAE、音频和媒体输出由 ComfyUI 执行。

提示词辅助同样通过所选 ComfyUI 运行：

- Qwen3.5 使用 ComfyUI 核心 `TextGenerate` 路径。
- Gemma 4 使用 ComfyUI MiniMax H3 Prompt Writer 节点及其 ComfyUI Python 依赖。
- Gemma 4 26B-A4B UNSEEN NSFW 使用配套的 `UNSEEN_Gemma_4_26B_NSFW_Q4_K_M.gguf` 与 `mmproj-gemma4-vision-q4_0.gguf`；4090 24GB 档位保持标准 16K 上下文。
- Qwen3.6 / Qwen3.8 27B Q4（可选）使用 `ComfyUI-MultiModal-Prompt-Nodes` 的 `VisionLLMNode`；它只依赖所选 ComfyUI 的 Python 环境，不需要 LM Studio、llama-server 或第二个服务。Qwen3.8 当前登记的是 JonathanColetti 的非 MTP Uncensored Q4 与配套 vision 投影文件。
- 旧状态中可能仍有 LM Studio/llama-server 字段用于兼容迁移，但当前 UI 不要求、也不推荐安装独立服务。

## 2. 五种不同的“已安装”

排错时必须区分以下状态：

1. **ComfyUI 安装存在**：能找到 Desktop、Portable 或源码安装。
2. **数据目录正确**：`models`、`custom_nodes`、`input`、`output` 属于实际使用的实例。
3. **组件文件存在**：catalog 能离线识别扩散模型、编码器、VAE、LoRA 等文件。
4. **节点文件存在**：自定义节点目录和必要入口文件存在，Python requirements 已安装。
5. **运行时可用**：当前连接服务的 `/object_info` 包含工作流要求的节点，最小任务真实成功。

设置页把离线识别和运行时验证分开。ComfyUI 未启动时仍可管理路径、模型和节点；“文件检查通过”不能写成“运行时已验证”。

应用启动、用户手动扫描和关键路径变更执行完整环境扫描。服务启停只刷新 API、ComfyUI 核心兼容性与节点注册状态；节点、Python 或加速依赖安装后执行依赖刷新，并复用最近完整扫描中的模型文件、GPU 和系统工具证据。若应用尚无相同设置与 ComfyUI 数据根的完整快照，局部刷新会自动回退完整扫描。

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

一般不需要为 ComfyUI 本体单独安装系统级完整 CUDA Toolkit。Portable 使用 `python_embeded`，Desktop/源码安装通常使用自己的 `.venv`。节点依赖必须安装进这套 Python，而不是随便一个系统 Python。Windows 的 Gemma Prompt Writer 与 Qwen3.6/Qwen3.8 MultiModal Prompt Nodes 共用固定的 JamePeng `llama-cpp-python` 预编译 GPU 后端；安装器不会静默改走 CPU，也不会在用户电脑上临时源码编译。

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

本地开发、自动诊断和代理协作优先使用运行时 harness，而不是通过桌面界面点击。先执行 `npm.cmd run build`，然后可直接复用应用保存的所选 ComfyUI 设置：

```powershell
npm.cmd run harness:comfy -- probe-prompt-writer
npm.cmd run harness:comfy -- scan --json
npm.cmd run harness:comfy -- restart-comfy
npm.cmd run harness:comfy -- repair-prompt-writer
```

`probe-prompt-writer` 是默认的只读操作，直接检查 `/h3studio/status`、模型接口和 GGUF diagnostics。`restart-comfy` 复用应用的本地进程所有权和启停服务；CLI harness 使用已有的隐藏 detached launcher，避免命令结束时关闭它启动的 ComfyUI，Electron 应用仍保留可见控制台。`repair-prompt-writer` 复用节点安装器、安全备份、兼容补丁、Python 语法校验、重启和运行时复检。可用 `--state <studio-state.json>` 指向另一份明确的应用状态，或用 `--json` 取得机器可读结果。只有这些服务接口无法覆盖且任务确实依赖 GUI 状态时，才应使用桌面自动化。

## 6. 模型、节点和工作流的正确安装顺序

### 6.1 选择并扫描实例

在“设置 → ComfyUI 环境”选择 ComfyUI，确认核心/数据目录、Python 和模型根目录，然后执行离线扫描。此步骤不要求启动服务。ComfyUI 环境页还负责服务状态、核心版本/兼容性和安全修复；应用目录、代理和队列策略仍属于“设置 → 应用与路径”。

### 6.2 安装节点

“设置 → 节点与依赖”中的可管理第三方节点和 Python 运行依赖可一键安装或更新。`llama-cpp-python`、SageAttention、Triton、KJNodes 等可安装依赖也属于此页；它们的修复不能被描述成 ComfyUI 核心修复。安装器会：

1. 定位所选 ComfyUI 的 `custom_nodes` 和 Python。
2. 使用 Git clone/pull；需要安全替换时先备份原目录。
3. 应用本项目明确维护的兼容补丁。
4. 使用所选 ComfyUI Python 执行节点的 `requirements.txt`。
5. 在卡片中实时输出阶段、Git/pip 内容、超时和错误。
6. 当前批次安装完成后只重启一次 ComfyUI，并统一通过运行时节点重新检查。

可以连续点击多个节点加入等待队列。应用会锁定该批次开始时所选的 ComfyUI 实例和 Python，串行执行每个节点的 Git/pip 操作；单项失败会写入对应卡片日志并继续下一项，不会让后续节点永远等待。批次末尾统一重启和复扫，卡片会区分“排队中”“处理中”和“正在重启并复检”。重启/复检阶段不再接受新的节点，避免节点被安装到另一套环境。

应用可管理的节点卸载时会永久删除匹配的 `custom_nodes` 目录，不创建或依赖本地备份；需要恢复时重新执行一键安装，由 catalog 声明的仓库、版本规则和兼容补丁重新下载构建。确认对话框会提示本地修改不会保留。手动安装的节点不由应用卸载；如果 ComfyUI 原本没有运行，卸载也不会为了刷新节点而启动它。

面板顶端的一键操作会加入未安装、低于 catalog 推荐版本、需要应用兼容修复，或已安装但 catalog 基础节点类型全部未在 `/object_info` 注册的 Custom Nodes。最后一种状态表示整个节点包很可能在启动时导入失败；修复会安全更新节点、使用所选 ComfyUI Python 重装 requirements，并在批次末尾重启复检。仅缺少部分或可选节点类型时仍只显示运行时告警，不会反复重装。所有实际安装项复用同一串行队列，并在批次末尾最多重启一次，不会把 ComfyUI 核心升级或内置工作流文件混入节点批次。

Git clone/update 有 5–10 分钟上限；普通 Python requirements 为 15 分钟，共用的 `llama-cpp-python` Windows wheel 下载与自检为 45 分钟。安装日志显示下载百分比；超时会终止对应子进程树并保留已收到的日志，避免无限显示“处理中”。

当前注册的节点族包括 GGUF、Video Helper Suite、LTXVideo、SeedVR2、FlashVSR、KJNodes、Frame Interpolation、ComfyUI MultiModal Prompt Nodes、ComfyUI Qwen-VL LoRA、MiniMax H3 Prompt Writer、H3 Motion Context 和 Spectrum。准确仓库、目录名、用途和 required/optional 状态以 `customNodeCatalog` 为准；其中 `priority` 是设置页的稳定显示/批量安装顺序，数值越小越优先。新增节点必须根据通用程度、主链路影响和实际使用频率填写优先级：视频主链路与通用节点在前，提示词/图片/后处理功能居中，特定模式和实验性节点在后；未知旧条目自动排到末尾。

节点目录中的 `releaseSource: "github-release"` 表示设置页会查询对应 GitHub Releases。查询结果按仓库缓存 6 小时；网络失败或仓库没有 Release 时只缓存 1 分钟，不会让离线扫描变成失败。远端 Release 只作为“最新发布”信息展示，不参与 `updateAvailable`、兼容性颜色或批量安装选择；非版本标签会被忽略。可执行更新只由应用 catalog 中随版本发布的推荐版本、最低兼容线和兼容修复规则决定。

工作流来源元数据集中在 `src/core/workflow-metadata.ts`。它覆盖 `workflows/` 下的全部 API JSON，记录 `/prompt` schema、推荐 ComfyUI 核心版本、使用的节点包和上游来源；API JSON 本身不放额外顶层字段，避免被 ComfyUI 当成节点解析。

Qwen3.6/Qwen3.8 本地多模态路径有明确的 Python ABI 边界：节点仓库的普通 requirements 只安装轻量依赖，安装器会跳过其中可能覆盖后端的普通 `llama-cpp-python`，改用项目统一的固定 JamePeng GPU wheel。Windows 当前支持 Python 3.10–3.14；CUDA wheel 提供 12.4/12.6/12.8/13.0/13.1，并明确映射 12.5→12.4、12.7→12.6、12.9→12.8、13.2→13.1。超出矩阵时会在下载前失败并写明 Python/CUDA 版本，不会尝试 CPU fallback 或本地源码编译。设置页会把“节点目录已安装”“VisionLLMNode 已加载”“共享运行库自检”和“模型/vision 投影文件完整”分开显示，实际运行仍在 ComfyUI 启动后验证。4090 默认使用 Q4_K_M、8K 上下文，并在释放其他模型后按实时空闲显存选择设备：至少 20 GiB 时启用全部 GPU 层，余量不足或遥测不可用时才使用 CPU；不得用固定 CPU 清单覆盖这一判断。安装器会把仍固定在 4K 的节点实现适配到 8K，避免 H3 长指令和视觉 token 挤占全部输出空间。Qwen3.8 上游将视觉投影命名为 `Qwen3.8-...-vision-f16.gguf`，而节点原版只登记 `mmproj*` 文件且尚未识别 Qwen3.8 名称；一键安装/修复会把该文件登记为 mmproj、从主模型列表排除，并按其 `qwen35` 架构使用 Qwen3.5 vision handler。设置离线扫描会提示旧节点需要修复，运行时还会在上传图片和提交工作流前核对 `/object_info` 的精确枚举值。扩写完成后请求 ComfyUI `/free` 释放显存，再交给 H3；Qwen3.8 当前不启用 MTP/speculative 路径。

### Gemma / H3 Prompt Writer 的 llama-cpp-python

Gemma 4 的 H3 Prompt Writer 运行时与节点目录、GGUF/mmproj 模型文件是三个独立状态。当前推荐上游 0.4.1；0.3.x 基础节点不再携带必需 Python 依赖，Direct GGUF 的可选 `requirements-gguf.txt` 由本应用的共享运行时安装器接管。设置 → 节点与依赖会单独扫描所选 ComfyUI Python 中的 `llama-cpp-python`，并提供安装、重装/修复和卸载。Windows 统一使用固定版本的 JamePeng CUDA/CPU 动态后端（`0.3.46`，CUDA 12.9 映射到已发布的 `cu128` wheel）；它在运行时选择兼容 CPU 实现，并加载独立 `ggml-cuda.dll`，避免旧静态 wheel 能导入却在加载 GGUF 时触发 `0xC000001D`。探针会显式注册动态后端后再判断 GPU offload，安装器只替换此包而不重装 ComfyUI 的 NumPy/Pillow 等公共依赖。约 299 MB 的 wheel 下载会在设置日志中显示百分比，慢速网络等待上限为 45 分钟。节点安装与运行依赖修复还会为 Prompt Writer 应用 `GGMLType` KV 常量兼容层、Gemma 4 原生 chat handler 和非 Thinking 输出预算，让 Direct Gemma 默认保持 16K Standard，不会因为普通输入自动扩展到 24K Extended，以免在 24GB 显卡上把 KV cache 推到显存上限；UNSEEN NSFW 4090 档位使用 Q4_K_M 主模型和匹配的 q4_0 vision projector，并降低批处理大小以适配 24GB 显存；GGUF 模型与多模态 chat handler 的清理也会改为幂等流程，`Llama.close()` 已关闭 handler 时不会再次释放同一资源、覆盖生成结果或留下虚假的 loaded 状态。更新前如果发现节点目录存在本地改动（包括应用自动写入的兼容层），安装器会用同一个完整适配器核对补丁指纹并查询上游 HEAD；只有上游有变化时才把旧目录移到 `node-backups`，再下载并校验干净副本，避免 `git pull` 因本地修改失败和重复创建备份。节点批次重启后还会检查 `/h3studio/status`、`/models`、GGUF diagnostics 与共享 llama 运行库；如果 0.3.x 节点自带的轻量诊断探针显示 `gpu_offload:false`，设置页会把它作为提示而不是失败，最终以应用侧 torch-first 共享运行库自检和实际生成前检查为准。自检失败会保留完整 pip 日志和原生退出码，不会把 CPU 版或无法确认的包标记为就绪。

H3 Prompt Writer 与可选 MultiModal Prompt Nodes 共用同一个 Python 包名，不能在同一 ComfyUI 环境中各自安装两个版本。两个节点的安装入口和“修复运行依赖”现在都调用同一个安装器、固定版本和 CUDA 自检；节点 `requirements.txt` 中的普通 `llama-cpp-python` 条目会被过滤，安装其中一个不会再用 PyPI 或 Git 源码构建覆盖另一个。相同 ComfyUI 的并发安装请求会合并为一个事务；已有 CUDA 自检通过的后端不会因更新 Prompt Writer 被重装。当前 Python/CUDA 不在预编译矩阵时，安装器会在下载前明确失败并保留日志，不会偷偷回退到 CPU 或启动第二个 llama 服务。模型权重不由此步骤下载，仍由提示词模型卡片中的模型目录检查负责。

### MiniMax H3 Prompt Rewriter LoRA 8B（Qwen3-VL）

这是与 Gemma/GGUF 路径并列的绑定 PEFT 组合：基座是 `Qwen/Qwen3-VL-8B-Instruct`，适配器是官方 [`lightx2v/MiniMax-H3-Prompt-Rewriter-LoRA-8B`](https://huggingface.co/lightx2v/MiniMax-H3-Prompt-Rewriter-LoRA-8B)。它通过 ComfyUI Qwen-VL LoRA 节点读取参考图片/视频并重写 H3 Prompt；不能把 adapter 套到 Qwen3.6、Qwen3.8 GGUF 或 H3 视频扩散模型上。

文件目录：

```text
<ComfyUI data>/models/LLM/Qwen-VL/qwen3-vl-8b-instruct/
  model-00001-of-00004.safetensors ... model-00004-of-00004.safetensors

<ComfyUI data>/models/LLM/Qwen-VL-LoRA/minimax-h3-prompt-rewriter-8b/
  adapter_model.safetensors
```

设置页只把这些大体积 safetensors 作为用户必需组件。Qwen 的 `config.json`、权重索引、tokenizer、图像/视频预处理文件以及 LoRA 的 `adapter_config.json` 由应用内置清单，在首次实际扩写前自动下载到上述目录；它们不会被要求用户逐个寻找或手动下载。自动准备失败会保留具体日志，并提示检查网络/代理。启动 ComfyUI 后还要通过 `/object_info` 确认 `QwenVLModelLoader`、`QwenVLLoRALoader` 和 `QwenVLCaption` 已加载。设置页会分别显示文件扫描与节点运行时验证，不把“文件存在”误当成“工作流已经跑通”。

ComfyUI Desktop 某些版本在嵌入式控制台关闭后会让节点的普通 `print()` 抛出 `[Errno 9] Bad file descriptor`，这发生在模型加载前，并不代表权重损坏。重新扫描时如果发现 Qwen-VL 节点仍使用该输出方式，设置页会把它标为“需修复”并提供“一键补齐/更新”；安装器会针对当前选择的 ComfyUI **数据目录**应用可重复的兼容层，保留节点更新策略，不写入机器固定路径。应用后必须重启 ComfyUI，再进行运行时复检。

Spectrum 版本分为三层：`v0.2.1` 是普通 H3 的最低可用线；当前推荐 `v0.2.20`。`v0.2.17` 补完 H3 Continuum 互操作：混合 VIDEO/AUDIO mask 可继续使用原生 H3 forecast，learned-latent sampler-2 refinement 不继承 sampler-1 的 Continuum actual-prefix，旧版 ComfyUI 核心缺少 `mask_row_values` 时安全降级为一次原生 H3 transformer 评估；`v0.2.18–v0.2.20` 增加并修复可选 MiniMax H3 RefDelta Solver v0.2.0+ API-v1 互操作、嵌套 custom-node 命名空间发现和首次 ER-SDE step provenance。现有 H3 工作流、参数和既有互操作不变，RefDelta 仍不是本应用硬依赖。它保留原生 ER-SDE、KJNodes 预览回放、Untwisting RoPE 外部补丁契约和隔离的生成后研究进程。设置页会展示上游最新发布，但不会仅因它高于 catalog 推荐线就触发更新。LightX2V Turbo 与 Spectrum 同开至少需要 `v0.2.6`；`model_aware_mode` 至少需要 `v0.2.7`，默认关闭。Spectrum 不要求额外模型权重，也不把 Continuum、Diff-Aid 或 Untwisting RoPE 变成硬依赖。

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

应用自带生产工作流位于 `workflows/`，并由 adapter 注入 Prompt、素材、Seed、尺寸、帧数、LoRA 和输出路径。这些 API JSON 由应用版本统一管理，不从外部源自动下载、更新或覆盖；如需在 ComfyUI 中查看，应使用应用提供的当前版本文件。

### 6.5 两阶段验证

- **加入队列**：使用保存路径离线复扫模型组件，并静态检查 workflow/adapter。ComfyUI 停止不应无故阻止入队。
- **启动任务**：连接或启动 ComfyUI，通过 `/object_info` 检查真实节点，再提交 `/prompt`。

模型、节点和服务状态必须给出不同错误。不要把“服务未启动”显示成“模型未安装”。

## 7. 当前模型族的依赖重点

### MiniMax H3 FL2VA / R2V

- FL2VA 与 R2V 使用不同扩散权重，不能互换。
- 共同依赖 H3 文本编码器、视频 VAE、音频 VAE 和足够新的 ComfyUI 核心节点。
- R2V 支持多参考图片；Motion Context 是可选的 R2V 续写增强节点，不是基础 FL2VA 的必需项。当前推荐并作为最低兼容线的节点版本是 `v0.3.1`，兼容 ComfyUI `0.32/0.33`；它修复了 ComfyUI 0.33 的 H3 layout 变化，并保留 Ref2VA、latent 和音频连续能力。
- Motion Context 工作流使用 `context_length=22`、`audio_context_length=24`、latent Save/Load 和 Trim `match_tail`。本应用构造的 API 工作流不需要删除并重新添加节点；上游迁移说明只适用于手工保存且 widget 位置来自旧节点 schema 的 ComfyUI 画布。同一 `custom_nodes` 目录只能保留一个 Motion Context 副本，重命名 fork 也可能产生 patch 冲突。
- LightX2V Turbo、Realism People 和 AfterMidnight 是 LoRA，不是独立视频模型；兼容模式、顺序、强度和冲突由 LoRA catalog 管理。当前 FL2VA 默认使用官方 LightX2V v1.1 768p 4-step（strength 1.0、video shift 6、audio shift 3、Euler），Spectrum `v0.2.6+` 仍需按任务做同 Seed 对照。
- H3 原生音视频采样的最低 ComfyUI 版本为 `v0.31.0`，当前推荐 `v0.33.1`；推荐版本是更新提示，不是离线入队的硬性阻挡。当前支持的 Turbo 权重包括官方 v1.1 768p 4-step、v1.0 8-step 和 Ref2V 4-step，均放入所选 ComfyUI 的 `models/loras`，不要把它们当成独立基础模型。旧 v0.1 FL2VA、旧 v1.0 768p 和 PinkFluffyBunny 只保留历史兼容记录；AfterMidnight v1.2 仅用于 Ref2VA，不可移植到 FL2VA。
- H3 最终视频解码支持 `minimax_h3_video_vae_fp16.safetensors` 基线和实验性的 `minimax_h3_video_vae_int8_convrot.safetensors`。设置中的 `自动` 在下一条尚未开始的 H3 任务领取时优先选择已安装的 INT8 ConvRot；缺少该文件时回退到 FP16，明确选择的后端缺失时也回退到另一份已安装 VAE。两者都缺失时设置禁用，H3 不能入队；正在计算的任务不会因设置变化而改用另一后端。
- KJNodes 按功能使用：H3 SageAttention 模式需要 `PathchSageAttentionKJ`，TAE 实时预览只额外尝试 `ModelPreviewOverrideKJ`，显存调试使用 `VRAM_Debug`；预览缺失时自动降级，不阻塞普通生成。
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

应用代理默认关闭。开启后，节点 Git/pip 等下载操作使用设置的 HTTP/HTTPS/SOCKS 代理；应用内置工作流不通过此代理下载或覆盖；默认示例为 `127.0.0.1:7890`。

排错时查看节点卡片实时日志和“设置 → 日志”。常见问题：

- Git 不在 PATH；
- 代理地址不可达或证书失败；
- GitHub/Hugging Face 限速；
- 选错 ComfyUI Python，依赖装进了系统 Python；
- ComfyUI 正占用节点文件，导致 Windows 替换失败；
- 节点上游 requirements 与当前 Torch/CUDA ABI 不兼容。

可以连续点击不同节点加入应用内安装队列；同一节点不会重复入队，Git/pip 始终串行。不要同时启动第二个 Local Video Studio 实例安装同一套 ComfyUI，也不要在批次运行时从外部修改对应节点目录。

### ComfyUI 数据库自动修复

环境扫描发现近期数据库初始化错误时，设置 → ComfyUI 环境会根据日志中的实际 SQLite 路径区分进程锁占用、Python 依赖缺失、目录不可写、Alembic 迁移不兼容和文件损坏。自动修复必须在队列和提示词任务停止后执行，并使用当前所选 ComfyUI 的核心目录、数据目录和 Python。数据库/PyAV 等核心问题修复与节点或加速依赖重装是两类独立操作。

修复先复制备份数据库及 `-wal`、`-shm`、`-journal`、`.lock` 辅助文件，再运行当前核心的 Alembic 迁移和 SQLite `quick_check`。只有明确的迁移不兼容或数据库损坏才会隔离旧文件并创建新库；任何新建失败都会恢复备份。锁占用不等于数据库损坏，应用不会删除原库或终止外部启动的 ComfyUI，而是验证应用自己的隔离数据库能否启动。目录或数据库不属于当前所选实例时，自动修复会拒绝修改并保留诊断日志。

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
