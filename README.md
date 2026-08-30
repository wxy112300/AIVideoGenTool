# Local Video Studio

Local Video Studio 是一个面向 Windows 与本地 ComfyUI 的图片/视频创作工作台。它把参考素材、提示词、模型参数、LoRA、持久化队列、运行监测和作品历史组织到一个 Electron GUI 中，不要求用户反复编辑 ComfyUI 节点图。

当前开发版本：**0.55.0**。创建页与历史详情会显示 H3 输入素材分辨率，并在创建提交区显示预估 Token、历史生成参数中显示实际 Token。H3 入队会复用已有环境扫描缓存，在冷启动时将依赖检查延后到任务准备阶段，同时保留输入图片归档和校验；设置页已完成 ComfyUI 环境、节点与依赖、应用与路径的职责拆分；提示词增强新增 H3 角色尺度语义保护，可在保留参考角色身份、年龄、比例、姿态和行为的同时描述巨大化/缩小化场景；“影视细节扩写”按动作因果自由分配时间，不再强制固定数量和等距时间段，并把篇幅优先用于动作、反应、镜头路径和连续性。提示词模型新增 Gemma 4 26B-A4B UNSEEN NSFW Q4 档位，使用匹配的 Q4 vision projector 和 16K 标准上下文，面向 RTX 4090 24GB 的成人/敏感图像描述。队列支持折叠操作菜单、提升到队首、随机 Seed，以及可拖动且支持任务跨线移动的批次停止线。性能页支持 H3 Attention 后端选择及 MiniMax H3 视频 VAE 的自动、FP16/实验性 INT8 ConvRot 选择；VAE 设置会在下一条尚未开始的 H3 任务领取时生效，并按实际扫描结果禁用不可用选项。H3 Memory Optimization 暂时从创建与队列执行中隐藏并强制关闭，设置页仍保留可选的上游节点安装入口；内置核心和工作流 JSON 仍由应用内部管理。版本变化见 [CHANGELOG.md](CHANGELOG.md)。项目仍在 `0.x` 阶段，优先支持 Windows、NVIDIA GPU 和本地 ComfyUI。

> 模型权重、ComfyUI 和第三方节点不包含在本仓库中。仅下载模型文件并不等于工作流可用；对应的 ComfyUI 核心节点、第三方节点和 Python 依赖也必须完整。

## 当前能力

- 图片处理：多参考图编辑、批量候选、Prompt 版本、Canvas 定位标记、LaMa Mask 局部移除和图片版本历史。
- 视频创作：首帧/首尾帧图生视频、H3 多参考 R2V、视频续写、原生音频和目标帧率处理。
- LoRA 堆栈：顺序、强度、兼容模型、触发词和冲突提示随队列快照保存。
- 本地队列：单重型 GPU 阶段执行，支持暂停/取消、阶段进度、实时预览和性能摘要。
- 作品历史：图片和视频分区、版本管理、完整提交参数、文件操作和继续创作。
- 环境管理：离线扫描多个 ComfyUI 安装、核心/数据目录、模型、节点、工作流和 Python 环境。
- 本地提示词辅助：通过所选 ComfyUI 运行 Qwen3.5、Qwen3.6/Qwen3.8 MultiModal、Qwen3-VL 8B + H3 Prompt Rewriter LoRA，以及 MiniMax H3 Prompt Writer 的 Gemma 4 通用/UNSEEN NSFW GGUF。

## 支持范围

模型和组件的准确状态以应用“设置”页及 `src/core/catalog/` 为准。README 只列当前主要模型族，避免文件名或变体更新后形成第二份过期清单。

| 类别 | 当前主要支持 |
| --- | --- |
| 视频生成 | MiniMax H3 T2VA/FL2VA（INT8、INT4、实验性 Q3 GGUF）、MiniMax H3 R2V（INT8、INT4）、Sulphur 2 / LTX 2.3；另保留 Wan 2.2 14B + NSFW 兼容配置 |
| 图片处理 | HiDream-O1-Image、Z-Image / Z-Image-Turbo、Qwen-Image-Edit-2511、FLUX.2 Klein 4B |
| 视频增强 | SeedVR2、FlashVSR、Real-ESRGAN、RIFE 插帧 |
| H3 LoRA | LightX2V Turbo v1.1（768p 4-step）/ v1.0（8-step）、可选 v4 step600（6–8-step 质量 Turbo）、Camera Motion、Ref2V Turbo、Realism People、AfterMidnight Ref2VA NSFW |
| Prompt | Qwen3.5 2B/4B、Qwen3.6/Qwen3.8 27B Q4 MultiModal、Qwen3-VL 8B + MiniMax H3 Prompt Rewriter LoRA、MiniMax H3 Prompt Writer 的 Gemma 4 通用/UNSEEN NSFW GGUF |

表中的“支持”表示相关 UI、队列快照和 ComfyUI 工作流已经纳入当前集成范围。实际可用性仍取决于模型文件、节点版本、Python 依赖、PyTorch/CUDA 运行时和硬件资源；各组合应以设置页检查结果及真实最小任务为准。H3 768p 对运行时兼容性较为敏感，不匹配的 CUDA 扩展可能回退到通用实现，从而增加显存占用或降低执行性能。

Wan 2.2 的常规/合并配置、HunyuanVideo 1.5 及其他旧模型中的大部分已经从新建任务列表淘汰；旧队列和历史仍保留原模型名称。当前显式保留的 Wan 2.2 14B + NSFW 兼容配置及未来变化，以 catalog 的 `retired` 标记为准。

## 快速开始

### 1. 安装基础环境和 ComfyUI

- Windows 10/11。
- Node.js 22 LTS 或更高版本。
- Git（节点安装/更新需要）。
- NVIDIA 驱动；H3 推荐 24GB 级显存和充足系统内存。
- FFmpeg；视频裁帧、续写和部分后处理需要。

从官方渠道安装一种 ComfyUI 发行方式：

- [下载 ComfyUI Desktop](https://www.comfy.org/download)：推荐给首次使用者，可管理实例、ComfyUI 核心和 PyTorch。
- [ComfyUI Desktop for Windows 安装说明](https://docs.comfy.org/installation/desktop/windows)。
- [ComfyUI Portable for Windows 安装说明](https://docs.comfy.org/installation/comfyui_portable_windows)：适合需要便携目录的用户。

MiniMax H3 原生音视频节点要求 ComfyUI `0.31.0` 或更高版本，当前推荐基线为 `0.33.1`。Desktop 用户可在实例的 **Update** 页面选择核心更新频道并检查更新；应用设置页也会显示所选实例的版本、兼容状态和更新入口。

通常无需单独安装完整 CUDA Toolkit。优先使用 ComfyUI 自身 Python/PyTorch 所带的 CUDA runtime；只有某个自定义 CUDA 扩展明确要求编译工具链时才额外安装。

### H3 运行时兼容性

H3 的 CUDA 扩展要求 PyTorch、CUDA runtime 和扩展 wheel 的 ABI 相互匹配。最低支持 PyTorch 2.10；当前 Windows/NVIDIA 稳定回退与实测基线如下：
- 启用 SageAttention 时，使用与当前 Torch minor/cu130 精确匹配的 Triton 和 SageAttention wheel，并通过原生 `_fused` 扩展导入检查
已知 `torch 2.8.0+cu129` 不满足当前 comfy-kitchen H3 INT8 ConvRot CUDA 内核的 CUDA 13.0 要求；`torch 2.9.1+cu130` 虽可加载 CUDA backend，但本项目的 4090 H3 768p/15s 实测出现更高显存峰值，因此低于最低基线。更高的 Torch 2.x 版本只有在 torch/torchvision/torchaudio minor 与 cu130 标签一致时才满足基础运行时要求；SageAttention 仍需 Comfy 官方发布该 Torch minor 的精确 wheel，并通过 `_fused` 导入和 CUDA 自检。当前官方 Windows cu130 SageAttention 索引发布到 Torch 2.11，Torch 2.12/2.13 可使用 PyTorch Attention，但不能仅凭版本更高判定 SageAttention 可用。
使用 ComfyUI Desktop 时，建议优先通过实例更新页选择稳定回退 `2.10.0+cu130`，再返回本应用重新扫描并补齐 comfy-kitchen、Triton 及 SageAttention。H3 修复器会将低于 2.10 或三件套不一致的环境修复到该组合；满足最低要求的更高版本不会被静默降级。若新版尚无匹配的 SageAttention wheel，修复器会保留当前环境并明确提示使用 PyTorch Attention。

- `torch 2.10.0+cu130`
- `torchvision 0.25.0+cu130`
- `torchaudio 2.10.0+cu130`
- `comfy-kitchen 0.2.31`，运行时探针能够识别 `cuda` backend
- 启用 SageAttention 时，使用与 Torch 2.10/cu130 匹配的 Triton 和 SageAttention wheel，并通过原生 `_fused` 扩展导入检查

已知 `torch 2.8.0+cu129` 不满足当前 comfy-kitchen H3 INT8 ConvRot CUDA 内核的 CUDA 13.0 要求；`torch 2.9.1+cu130` 虽可加载 CUDA backend，但本项目的 4090 H3 768p/15s 实测出现更高显存峰值，因此不再作为当前 H3 ready 基线。设置页同时检查 Torch 三件套、comfy-kitchen backend、Triton、SageAttention wheel 和 `_fused` 原生扩展，不以包名或版本号存在作为 CUDA 内核就绪的依据。

使用 ComfyUI Desktop 时，建议优先通过实例更新页选择 `2.10.0+cu130`，再返回本应用重新扫描并补齐 comfy-kitchen、Triton 及 SageAttention。H3 修复器使用该实例的同一个 `.venv` 和 PyTorch 官方 cu130 wheel；由修复器直接更改 Python 包后，Desktop 可能将当前组合标记为外部安装。

Qwen3.6/Qwen3.8 MultiModal 与 MiniMax H3 Prompt Writer 共用同一个 JamePeng `llama-cpp-python` GPU 构建。安装器会按所选 ComfyUI 的 Python/CUDA 版本选择预编译 wheel；不支持的组合会在下载前明确提示，不会偷偷源码编译或安装第二个 llama 服务。节点更新不会覆盖已经通过 CUDA 自检的共享后端，具体日志和前置条件会显示在设置 → 节点与依赖。

官方 [`lightx2v/MiniMax-H3-Prompt-Rewriter-LoRA-8B`](https://huggingface.co/lightx2v/MiniMax-H3-Prompt-Rewriter-LoRA-8B) 是绑定 `Qwen/Qwen3-VL-8B-Instruct` 的 PEFT 适配器。它与 Qwen-VL 节点一起读取参考图片/视频并重写 H3 提示词；不能套到 Qwen3.6、Qwen3.8 GGUF 或 H3 视频模型。设置页分别扫描 Qwen3-VL 基座文件、adapter 文件和节点依赖。

### 2. 克隆并启动 Local Video Studio

```powershell
git clone https://github.com/wxy112300/AIVideoGenTool.git
cd AIVideoGenTool
```

双击 `start-ui.bat`，或执行：

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd start
```

开发模式：

```powershell
npm.cmd run dev
```

npm 下载需要本机代理时可使用：

```bat
start-ui-proxy.bat http://127.0.0.1:7890
```

### 3. 完成首次环境配置

启动界面后打开 **设置 → 系统与路径**：

1. 从扫描结果中选择实际使用的 ComfyUI 实例。Desktop 启动器、核心源码和数据目录可能位于不同位置。
2. 核对 ComfyUI 核心目录、数据/节点目录和 Python 解释器是否属于同一实例。
3. 确认接口地址；默认是 `http://127.0.0.1:8188`。
4. 确认模型目录、视频/图片输出目录和输入素材库。
5. 点击 **重新扫描**。离线扫描可检查文件和版本；启动 ComfyUI 后再次扫描，才能验证运行时节点。

同一台电脑存在多个 ComfyUI 时，务必确认“所选安装”和当前连接的服务是同一个实例。否则模型可能扫描成功，节点却安装到了另一套目录。

### 4. 使用应用内安装和修复功能

设置页提供以下自动化操作：

| 设置分类 | 可执行操作 |
| --- | --- |
| 系统与路径 | 扫描 ComfyUI 实例、检查核心版本；Desktop 安装通过官方更新入口管理核心 |
| 节点与依赖 | 一键安装或更新 catalog 登记的 Custom Nodes 及其 Python requirements |
| 性能与加速 | 检查 PyTorch/CUDA、comfy-kitchen backend、Triton、SageAttention 和 KJNodes；按当前环境执行 H3 修复和 CUDA 自检 |
| 提示词扩展 | 为可选的本地提示词模型安装节点和共享 `llama-cpp-python` GPU 运行依赖 |

这些操作会显示实时阶段和日志，并在需要时重启应用管理的 ComfyUI。以下内容仍需用户处理：

- ComfyUI 本体应从官方渠道安装；应用不会静默创建新的 ComfyUI 发行版。
- 扩散模型、文本编码器、VAE 和 LoRA 等大型权重需要按模型卡片提供的来源下载。
- 模型卡片中的 **i** 按钮会显示下载地址、推荐文件名和相对于 ComfyUI `models` 的目标子目录。

节点页顶部的一键操作处理缺失、低于 catalog 推荐版本、需要兼容修复，或文件已安装但整个节点包未注册的已登记节点；修复后会统一重启并复检。MiniMax H3 基础生成节点属于 ComfyUI 核心；如果这些节点缺失，应先更新 ComfyUI，而不是安装名称相似的第三方节点。

### 5. 完成第一个 MiniMax H3 任务

以下流程以 24GB 级 NVIDIA GPU 和 **MiniMax H3 FL2VA · INT8** 为推荐起点：

1. 在 **设置 → 系统与路径** 选择 ComfyUI `0.31.0+` 实例并完成扫描；建议使用当前推荐基线 `0.33.1`。
2. 在 **设置 → 性能与加速** 检查 H3 运行时。Desktop 用户优先在 Desktop 中选择 `PyTorch 2.10.0+cu130`，再返回应用重新扫描；随后执行 H3 环境修复以补齐匹配的 Triton、SageAttention 和 H3 CUDA 内核。
3. 打开 **设置 → 视频模型**，找到 **MiniMax H3 FL2VA · INT8**。对每个缺失的必需组件点击 **i**：
	- 下载 FL2VA INT8 扩散模型并放入卡片显示的 `models/diffusion_models` 目录；
	- 下载 H3 文本编码器并放入 `models/text_encoders`；
	- 下载视频 VAE 和音频 VAE 并放入 `models/vae`；
	- TAE 实时预览权重属于可选组件，不影响基础生成。
4. 保留卡片给出的推荐文件名。文件复制完成后点击 **重新扫描**，确认必需组件均已识别。
5. 在 **设置 → 节点与依赖** 安装扫描结果标记为缺失的节点。SageAttention 模式需要 KJNodes；Spectrum、TAE 实时预览和 H3 Motion Context 均为可选能力，不是基础 FL2VA 首次生成的前置条件。
6. 启动 ComfyUI，并再次扫描，确认 H3 核心节点通过运行时验证。
7. 打开 **创建 → 视频**，选择 **MiniMax H3 FL2VA · INT8**。添加首帧图片，或不添加图片以使用 T2VA；输入提示词并选择较短时长。768p 是官方质量基线；显存不足时可选择 360p/480p 低显存实验档，540p/720p 也保留为中间档位，但较低分辨率的结果不代表 H3 的标准质量。
8. 加入队列，在队列页查看 ComfyUI 阶段、采样进度、显存和安装/运行日志。首次任务成功输出后，再逐步增加时长或启用 Turbo、Spectrum 和实时预览。

FL2VA 与 R2V 使用不同的扩散模型。需要多参考图片或视频时，应改选 **MiniMax H3 R2V**，并按其模型卡片下载 Ref2VA 权重；不要复用 FL2VA 扩散模型。LightX2V Turbo v1.1 768p/8-step 和 Ref2V 文件是 LoRA，应放入 `models/loras`，不能替代基础扩散模型；AfterMidnight 只适用于 Ref2VA。

### 6. 理解就绪状态

一个模型能够生成，至少需要以下三层同时成立：

1. **模型组件**：扩散模型、文本/视觉编码器、VAE、LoRA 等文件位于 catalog 指定目录。
2. **节点与 Python 依赖**：ComfyUI 核心节点版本满足要求；第三方节点已安装，并在所选 ComfyUI Python 中安装了 `requirements.txt`。
3. **工作流与运行时验证**：应用有对应的 API workflow/adapter，启动任务时 ComfyUI `/object_info` 能看到真实节点。

节点可以由应用一键安装；大型模型权重目前通常由用户从设置页给出的官方/社区来源手动下载。不要把模型文件放进仓库。

详细目录、安装状态含义和排错流程见 [依赖、环境与初始化](docs/DEPENDENCIES_AND_SETUP.md)。

## 数据位置

- 应用状态、草稿、队列和历史元数据由 Electron 用户数据目录管理；媒体本身保存为文件路径，不以 Base64 塞进状态文件。
- 输入图片在任务加入队列时按内容哈希归档到设置的输入素材库，默认位于 ComfyUI `input/LocalVideoStudio`。
- 图片和视频输出目录可在设置中分别指定；历史记录保存实际输出路径。
- 模型权重使用所选 ComfyUI 的模型目录，具体子目录由 catalog 组件卡片给出。

迁移、整理或删除媒体前请使用应用内提供的确认与整理工具；不要直接批量移动仍被队列或历史引用的文件。

## 验证与开发

```powershell
npm.cmd run typecheck
npm.cmd run test
npm.cmd run verify
```

`npm.cmd run verify` 会执行全部测试、TypeScript 检查和生产构建。它证明代码和静态工作流通过，不等同于某个本地模型已经真实生成成功。

开发者和 Coding Agent 从 [AGENTS.md](AGENTS.md) 与 [Agent Start Here](docs/AGENT_START_HERE.md) 开始；模型/工作流、架构、UX 分别由以下契约约束：

- [工作流契约](docs/WORKFLOW_CONTRACT.md)
- [架构契约](docs/ARCHITECTURE_CONTRACT.md)
- [UX 契约](docs/UX_CONTRACT.md)

## 当前限制

- 暂无正式 Windows 安装包，当前从源码启动。
- ComfyUI 和社区节点持续变化；设置页的离线扫描、运行时验证与真实最小测试缺一不可。
- H3 的 PyTorch、CUDA runtime 和 comfy-kitchen backend 需要联合验证；启用 SageAttention 时还需验证匹配的 Triton 与 SageAttention wheel。软件包可导入不等同于 CUDA 内核已经启用。
- 不同量化、LoRA、Attention、Cache 或 Offload 组合可能改变显存、速度和质量；应用只在对应工作流范围内应用策略，不承诺任意组合兼容。
- 实验性模型或社区转换的“可识别”不代表已经在所有硬件上通过运行测试。

## License

本项目采用 [MIT License](LICENSE)。模型权重、LoRA、ComfyUI 和第三方节点不随本项目重新授权，仍分别受其来源项目和发布页面所列许可证及使用条款约束。
