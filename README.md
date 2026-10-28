# Local Video Studio

面向 Windows 和本地 ComfyUI 的图片与视频创作工作台。通过一个桌面界面管理素材、提示词、生成参数、任务队列和作品历史，无需为日常创作反复编辑节点图。

Studio 负责创作流程与作品管理，ComfyUI 负责模型推理。主要面向 NVIDIA GPU；所需显存、内存和依赖随模型而异。

**当前版本：0.67.2** · [更新记录](CHANGELOG.md) · [下载与发布](https://github.com/wxy112300/AIVideoGenTool/releases)

## 开始使用

### 安装与启动

Windows 安装包和便携版请查看 [Releases](https://github.com/wxy112300/AIVideoGenTool/releases)。使用发布包无需安装 Node.js；源码开发版可能领先于发布版。

ComfyUI 本体和模型权重需另行准备。可使用 [ComfyUI Desktop](https://www.comfy.org/download) 或已有的 ComfyUI 安装；视频裁剪和部分媒体处理还需要 FFmpeg。所需节点与 Python 依赖按设置页指引安装。

从源码启动需要 Git，以及 Node.js 22 LTS 或更新的 LTS 版本，建议使用对应版本的最新补丁：

```powershell
git clone https://github.com/wxy112300/AIVideoGenTool.git
cd AIVideoGenTool
npm.cmd ci
npm.cmd run build
npm.cmd start
```

也可在安装 Node.js 后双击仓库中的 `start-ui.bat`，由启动器安装项目依赖、构建并启动应用。

### 首次创作

1. 打开 **设置 → ComfyUI 环境**，选择实际使用的 ComfyUI 安装，核对 Python 解释器和服务地址。
2. 在 **视频模型** 或 **图片模型** 中选择要用的模型，按组件卡片给出的来源和目标目录准备必需权重。
3. 在 **节点与依赖** 中补齐缺失组件。启动 ComfyUI 后重新扫描，确认运行时节点可用。
4. 返回 **创建**，填写提示词并按模式添加素材，加入队列；完成后在 **历史** 中查看、编辑或继续创作。

建议先完成一个短任务，再增加时长、分辨率或启用额外加速选项。多套 ComfyUI 并存时，确认服务、节点和 Python 属于同一实例。

扫描识别到文件不等于能够生成：模型组件、节点与 Python 依赖、实际运行时都需要匹配。详细安装与排错见 [依赖、环境与初始化](docs/DEPENDENCIES_AND_SETUP.md)。

## 可以做什么

- **图片生成与编辑**：多参考图、局部擦除与蒙版、画布标记、批量候选和版本管理。
- **视频生成与续写**：文生视频、首帧/首尾帧、多参考输入，以及 Motion Context、Continuum 续写。
- **提示词与 LoRA**：本地提示词辅助、素材引用、LoRA 叠加与强度/顺序管理。
- **任务队列**：保存提交时的完整参数，查看阶段进度、实时预览和资源使用，支持暂停与取消。
- **作品历史**：筛选、收藏、评分、标签、版本管理、继续创作，以及放大和插帧。
- **环境管理与浏览**：检查模型、节点和 Python 依赖，安装或更新所需组件；可开启手机/iPad 局域网视频浏览。

## 支持的模型

### 视频生成与续写

| 模型 / 路线 | 主要能力与变体 |
| --- | --- |
| MiniMax H3 T2VA / FL2VA | 文生视频、首帧 / 首尾帧；INT8、INT4，以及实验性 Q3 GGUF |
| MiniMax H3 R2V / Ref2VA | 多参考图片 / 视频输入；INT8、INT4 |
| FastH3 Omni | 多参考 INT8，8 步生成 |
| MiniMax H3 Continuum | Native AV 接续与多段长视频 |
| H3 Motion Context | 基于源视频运动与音频上下文续写 |
| Sulphur 2 / LTX 2.3 | GGUF 视频生成与续写 |
| Wan 2.2 I2V 14B + NSFW | 保留的兼容配置 |

### 图片生成与处理

| 模型 | 主要能力与变体 |
| --- | --- |
| Qwen Image 2.1 | 文生图、多图编辑；原生、Turbo、Uncensored GGUF Q8_0 / Q6_K |
| Qwen-Image-Edit-2511 | 多参考图片编辑 |
| MOSS Image | SFT INT8、社区 PornMaster V1 INT8；文生图 |
| OmniGen2 | 文生图、参考编辑与多图组合 |
| HiDream-O1-Image | 图片生成与单图参考编辑 |
| Z-Image / Z-Image-Turbo | 原生生成 / 图生图，以及 Turbo 快速生成 / 参考控制 |
| FLUX.2 Klein Base 4B | 轻量图片生成与单图编辑 |
| BiRefNet / LaMa | 自动抠图 / 蒙版局部移除 |

### 放大与插帧

| 模型 / 路线 | 用途 |
| --- | --- |
| MiniMax H3 原生二次采样 / Learned 3D Latent Upscaler | 基于已保存的 H3 JointAV 提升分辨率 |
| SeedVR2 | 视频超分辨率；3B / 7B，以及原生 3B INT8 ConvRot 路线 |
| FlashVSR | 视频超分辨率 |
| Real-ESRGAN x4plus | 通用画面放大 |
| RIFE | 视频插帧与目标帧率处理 |

### 本地提示词辅助

| 模型 / 后端 | 主要配置 |
| --- | --- |
| Qwen3.5 | 2B / 4B 多模态提示词助手 |
| Qwen3.6 / Qwen3.8 | 27B Q4 MultiModal 社区配置 |
| Qwen3-VL 8B + MiniMax H3 Prompt Rewriter LoRA | H3 专用提示词重写 |
| Gemma 4 / MiniMax H3 Prompt Writer | E4B、12B、26B-A4B GGUF，含社区 Uncensored / UNSEEN NSFW 配置 |
| Strata / Qwen3.8-Flash-Next | 独立本地提示词后端 |

另提供 H3 的 LightX2V Turbo、PDD、Turbo-SLA、Cinema、运动 / 镜头控制、全景 / VR、Ref2V Turbo、FaceSwap 等 LoRA，以及 Qwen Image 图片 LoRA。LoRA 的适用基座、叠加限制和必需文件见设置页。

以上为当前接入范围，具体可用性取决于对应模型文件、节点、Python 依赖及硬件资源。已退役的模型保留旧队列与历史兼容，不作为当前新建能力列出。

## 文档与工具

| 需要了解 | 入口 |
| --- | --- |
| 安装、模型目录、依赖与故障排查 | [环境与依赖](docs/DEPENDENCIES_AND_SETUP.md) |
| 作品文件、迁移和删除 | [资产生命周期](docs/runbooks/ASSET_LIFECYCLE.md) |
| 资料库、备份与 NAS | [存储与 NAS 手册](docs/runbooks/LIBRARY_STORAGE_AND_NAS.md) |
| 开发、架构与工作流 | [开发文档入口](docs/README.md) |
| 版本变化 | [更新记录](CHANGELOG.md) |
| 独立 Strata Agent 启动器（开发中） | [工具说明](Tools/Strata-Agent/README.md) |

## 开发

```powershell
npm.cmd run dev       # 开发模式
npm.cmd run verify    # 全量测试、类型检查、构建与文本对比度检查
```

开发约定见 [AGENTS.md](AGENTS.md)。

## License

本项目使用 [MIT License](LICENSE)。模型权重、LoRA、ComfyUI 和第三方节点分别遵循各自的许可证与使用条款。
