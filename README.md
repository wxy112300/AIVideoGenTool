# Local Video Studio

Local Video Studio 是一个面向 Windows 与本地 ComfyUI 的图片/视频创作工作台。它把参考素材、提示词、模型参数、LoRA、持久化队列、运行监测和作品历史组织到一个 Electron GUI 中，不要求用户反复编辑 ComfyUI 节点图。

当前开发版本：**0.27.0**。ComfyUI 启动、就绪、降级、重启、停止和错误状态现由主进程统一维护，并同步到队列、设置与顶部通知；快速启动后立即取消不会再误报 ComfyUI 已退出或让已取消任务重新进入执行。版本变化见 [CHANGELOG.md](CHANGELOG.md)。项目仍在 `0.x` 阶段，优先支持 Windows、NVIDIA GPU 和本地 ComfyUI。

> 模型权重、ComfyUI 和第三方节点不包含在本仓库中。仅下载模型文件并不等于工作流可用；对应的 ComfyUI 核心节点、第三方节点和 Python 依赖也必须完整。

## 当前能力

- 图片处理：多参考图编辑、批量候选、Prompt 版本、Canvas 定位标记、LaMa Mask 局部移除和图片版本历史。
- 视频创作：首帧/首尾帧图生视频、H3 多参考 R2V、视频续写、原生音频和目标帧率处理。
- LoRA 堆栈：顺序、强度、兼容模型、触发词和冲突提示随队列快照保存。
- 本地队列：单重型 GPU 阶段执行，支持暂停/取消、阶段进度、实时预览和性能摘要。
- 作品历史：图片和视频分区、版本管理、完整提交参数、文件操作和继续创作。
- 环境管理：离线扫描多个 ComfyUI 安装、核心/数据目录、模型、节点、工作流和 Python 环境。
- 本地提示词辅助：通过所选 ComfyUI 运行 Qwen3.5、Qwen3.6/Qwen3.8 MultiModal 或 MiniMax H3 Prompt Writer/Gemma，不要求独立 LM Studio 或 llama-server。

## 支持范围

模型和组件的准确状态以应用“设置”页及 `src/core/catalog/` 为准。README 只列当前主要模型族，避免文件名或变体更新后形成第二份过期清单。

| 类别 | 当前主要支持 |
| --- | --- |
| 视频生成 | MiniMax H3 T2VA/FL2VA（INT8、INT4、实验性 Q3 GGUF）、MiniMax H3 R2V（INT8、INT4）、Sulphur 2 / LTX 2.3；另保留 Wan 2.2 14B + NSFW 兼容配置 |
| 图片处理 | Qwen-Image-Edit-2511、FLUX.2 Klein 4B |
| 视频增强 | SeedVR2、FlashVSR、Real-ESRGAN、RIFE 插帧 |
| H3 LoRA | LightX2V Turbo v1.0（8-step/768p 4-step）、Ref2V Turbo、Realism People、PinkFluffyBunny NSFW |
| Prompt | Qwen3.5 2B/4B、Qwen3.6/Qwen3.8 27B Q4 MultiModal、MiniMax H3 Prompt Writer 的 Gemma 4 GGUF 配置 |

Wan 2.2 的常规/合并配置、HunyuanVideo 1.5 及其他旧模型中的大部分已经从新建任务列表淘汰；旧队列和历史仍保留原模型名称。当前显式保留的 Wan 2.2 14B + NSFW 兼容配置及未来变化，以 catalog 的 `retired` 标记为准。

## 快速开始

### 1. 准备基础环境

- Windows 10/11。
- Node.js 22 LTS 或更高版本。
- Git（节点安装/更新需要）。
- ComfyUI Desktop、Portable 或源码安装之一。
- NVIDIA 驱动；H3 推荐 24GB 级显存和充足系统内存。
- FFmpeg；视频裁帧、续写和部分后处理需要。

通常无需单独安装完整 CUDA Toolkit。优先使用 ComfyUI 自身 Python/PyTorch 所带的 CUDA runtime；只有某个自定义 CUDA 扩展明确要求编译工具链时才额外安装。

Qwen3.6/Qwen3.8 MultiModal 与 MiniMax H3 Prompt Writer 共用同一个 JamePeng `llama-cpp-python` GPU 构建。安装器会按所选 ComfyUI 的 Python/CUDA 版本选择预编译 wheel；不支持的组合会在下载前明确提示，不会偷偷源码编译或安装第二个 llama 服务。节点更新不会覆盖已经通过 CUDA 自检的共享后端，具体日志和前置条件会显示在设置 → 节点与工作流。

### 2. 克隆并启动 GUI

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

### 3. 在设置中选择正确的 ComfyUI

打开“设置 → 系统与路径”：

1. 选择实际使用的 ComfyUI 安装。Desktop 启动器目录、核心目录和数据/节点目录可能不同。
2. 确认接口地址；默认是 `http://127.0.0.1:8188`。
3. 确认模型目录、视频/图片输出目录和输入素材库。
4. 执行重新扫描。离线扫描不要求先启动 ComfyUI；运行时节点验证才需要服务。

同一台电脑存在多个 ComfyUI 时，务必确认“所选安装”和当前连接的服务是同一个实例。否则模型可能扫描成功，节点却安装到了另一套目录。

### 4. 按顺序补齐工作流依赖

一个模型能够生成，至少需要以下三层同时成立：

1. **模型组件**：扩散模型、文本/视觉编码器、VAE、LoRA 等文件位于 catalog 指定目录。
2. **节点与 Python 依赖**：ComfyUI 核心节点版本满足要求；第三方节点已安装，并在所选 ComfyUI Python 中安装了 `requirements.txt`。
3. **工作流与运行时验证**：应用有对应的 API workflow/adapter，启动任务时 ComfyUI `/object_info` 能看到真实节点。

推荐操作顺序：

1. 在“设置 → 节点与工作流”先安装或更新缺失节点。
2. 查看安装卡片中的实时日志。`git`、`pip`、兼容补丁、超时和错误都会留在卡片内；完成后按提示重启/复检 ComfyUI。
3. 在视频模型、图片模型、LoRA 或增强页点击缺失组件的信息图标，按显示的来源、推荐文件名和目标子目录下载权重。
4. 再次离线扫描。服务启动后进行运行时复检。
5. 用低分辨率、短时长或单张候选完成一次最小真实测试，再提高负载。

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
- 不同量化、LoRA、Attention、Cache 或 Offload 组合可能改变显存、速度和质量；应用只在对应工作流范围内应用策略，不承诺任意组合兼容。
- 实验性模型或社区转换的“可识别”不代表已经在所有硬件上通过运行测试。

## License

仓库暂未声明开源许可证。公开使用、再分发或贡献前，请由维护者补充明确的 `LICENSE` 文件；各模型、LoRA 和第三方节点继续受各自许可证约束。
