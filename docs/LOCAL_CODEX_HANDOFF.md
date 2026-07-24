# Local Video Studio 当前交接基线

更新时间：2026-07-24

当前分支：`main`

交接基线：本文所在 `main` 最新提交

本文是换机或更换 agent 后继续开发的首要入口。长期产品目标仍以
`docs/PRODUCT_REQUIREMENTS.md` 为准；本文只描述已经落地的能力、真实验证边界、
本机环境、已知风险和下一步顺序。

## 1. 对产品需求的当前理解

这是一个面向本地 ComfyUI 的 Windows Image-to-Video 工作台，而不是 ComfyUI
节点编辑器的替代品。用户应该只需要选择参考图、提示词、模型、时长、输出
分辨率和目标帧率；应用负责：

- 扫描当前 Windows 用户下的 ComfyUI、模型、自定义节点和本地服务。
- 只展示组件完整的模型，并为缺失项说明下载地址和目标目录。
- 为不同模型选择正确的内置 API workflow，不要求用户了解节点图。
- 持久保存草稿、队列、失败任务、历史记录和设置。
- 一次只执行一个重型 GPU 任务，展示节点进度、预览和系统性能。
- 在扩散模型、VAE、插帧和后处理之间主动释放显存，优先保证 RTX 4090
  24GB 不会因为上一阶段残留而爆显存。
- 输出可播放的视频，并让历史记录、详情页和真实文件保持一致。
- 把超分辨率结果作为同一作品的版本，而不是重复的历史卡片。

帧率的产品语义已经明确拆分：

- **目标帧率**：最终视频编码使用的 FPS。
- **生成帧率/模型帧数**：视频大模型实际生成的帧，决定主要计算量。
- **Frame Interpolation**：可选 RIFE 2×/4×。应用会生成较少的模型帧，
  插帧后精确裁到 `时长 × 目标 FPS`，再按目标 FPS 编码。

## 2. 已经完成

### 2.1 桌面应用与进程生命周期

- Electron 43 + TypeScript + Vite；preload 隔离，renderer 不直接开放 Node。
- 顶层原生菜单已移除，窗口直接呈现应用 UI。
- `start-ui.bat` 会安装依赖、构建并启动桌面程序。
- 开发启动脚本会在窗口退出时清理本工具的 Vite、TypeScript watcher 和
  Electron 子进程，避免遗留 5173 端口。
- 关闭窗口时若有运行任务会二次确认；强制退出会中止当前 ComfyUI Prompt。
- ComfyUI 服务不随 GUI 退出，符合当前产品约定。

### 2.2 创建页

- 单张参考图选择、预览、拖入、拖拽覆盖和一键删除。
- 提示词可正常连续输入，不再因全页刷新丢焦点。
- 清空会真正清除提示词和参考图，并使用统一样式的确认弹窗。
- 本地 LM Studio 提示词扩写和提示词版本前后切换。
- 模型、比例、480/540/720p、时长、目标 FPS、动作幅度和 Seed。
- 目标 FPS 下拉只显示纯帧率，不再混入“某模型推荐”文案。
- Frame Interpolation：关闭、RIFE 2×、RIFE 4×。
- UI 会显示预计模型帧数和最终成片帧数。
- 自动文件名、入队快照和内置工作流自动选择。

### 2.3 队列与执行

- 等待、运行、完成、失败和取消状态持久化。
- 手动开始、当前任务完成后暂停、移动、复制、移除、重试和按模型优化顺序。
- 当前运行任务只占一张展开卡片，展示：
  - 当前步骤与节点进度。
  - 已运行时间。
  - ComfyUI 实时预览（取决于服务是否发送 preview）。
  - CPU、内存、GPU、显存和温度。
  - 当前任务取消按钮。
- ComfyUI HTTP 上传、`/prompt`、WebSocket 进度、history 轮询兜底和
  `/interrupt`、`/free` 已接通。
- 只有真实节点执行、采样进度、预览或终态才刷新活动时间；普通 WebSocket
  状态广播不会掩盖卡死。连续 3 分钟没有真实进展时停止队列并重启 ComfyUI。
- OOM、卡死或显存释放失败会暂停后续队列；取消会清空模型与缓存显存。
- 应用重启时，遗留的 `running` 任务恢复为 `waiting`。

注意：这里的“暂停”是本条完成后停止继续队列，不是暂停并恢复 CUDA 采样。

### 2.4 历史与文件

- 成功任务进入历史，记录 Prompt ID、提示词、模型、Seed、分辨率、时长、
  FPS、插帧方式、工作流和 ComfyUI outputs。
- 历史卡片和详情页均可播放真实视频。
- 瀑布流列数随窗口宽度稳定变化，不会因删除一项随机变列。
- 相册模式使用更紧凑卡片，以便快速浏览更多作品。
- 随机帧/第一帧封面、悬停播放、预览进度条和详情页播放器。
- 详情页保持“历史”导航选中，返回历史按钮固定在易访问位置。
- 右键菜单支持查看详情、使用参数再创建、复制路径、打开所在目录、
  复制提示词和删除。
- 删除会二次确认，并同时删除视频文件与历史记录。
- 详情页也可删除视频和记录。
- 输出目录可在设置页指定；历史记录的实际文件路径会随任务保存。
- 原始视频和 Upscale 结果按作品归组，详情页可切换版本和默认版本。

### 2.5 设置与环境

- 设置页保留系统、视频模型、节点、提示词和提升模型分类。
- 扫描 Node、Git、FFmpeg、NVIDIA GPU、ComfyUI、LM Studio 和服务端口。
- ComfyUI 路径会扫描当前用户名以及 C/D 盘常见目录，不再写死 `Alice`。
- 支持 Desktop、手动源码和 Portable 结构。
- ComfyUI 默认 API 地址为 `http://127.0.0.1:8188`；旧的本机 8000
  设置会迁移到 8188。
- 可修改端口、检测已提前启动的 Desktop 服务、启动和重启本机服务。
- ComfyUI 启动检测允许较长冷启动时间。
- 代理默认关闭，默认地址 `http://127.0.0.1:7890`。
- 代理会用于 Git/Pip 自定义节点安装，并传递给由本工具启动或重启的
  ComfyUI，使节点首次下载权重时也能使用代理。
- 每个缺失模型组件都有下载来源、建议文件名和目标目录。
- 可安装/修复自定义节点，并在 UI 中查看安装日志。
- 已扫描 ComfyUI-GGUF、VideoHelperSuite、KJNodes、Frame Interpolation、
  SeedVR2、FlashVSR 等节点。

### 2.6 已接入的视频模型

| 模型 ID | UI 名称 | 内置工作流 | 当前验证 |
|---|---|---|---|
| `wan22_5b` | Wan 2.2 I2V 5B | `workflows/wan22_5b_i2v_api.json` | 4090 上完成过 1–3 秒真实生成 |
| `hunyuan15` | HunyuanVideo 1.5 I2V | `workflows/hunyuan15_i2v_api.json` | API 节点与工作流校验通过；仍需完整生成基准 |
| `hunyuan15_sr` | HunyuanVideo 1.5 I2V + 1080p SR | `workflows/hunyuan15_sr_i2v_api.json` | 官方 20 步 720p + 8 步 SR 分支；服务端解析与首阶段执行验证通过 |
| `sulphur2` | Sulphur 2 FP8 | `workflows/sulphur2_ltx23_i2v_api.json` | 37 个节点与本机 ComfyUI 0.18.2 签名校验通过；本机尚缺 Sulphur 权重 |
| `wan22_14b_nsfw` | Wan 2.2 I2V 14B + NSFW | `workflows/wan22_14b_i2v_api.json` | 完整组件识别和 `/prompt` 校验通过 |
| `wan22_remix` | Wan 2.2 Remix v3 | `workflows/wan22_14b_gguf_i2v_api.json` | 完整组件识别和 `/prompt` 校验通过 |
| `wan22_smoothmix` | Wan 2.2 SmoothMix I2V | 同上 | 完整组件识别；共享 GGUF 工作流 |
| `wan22_dasiwa` | DaSiWa SynthSeduction v9 | 同上 | 完整组件识别；共享 GGUF 工作流 |

Wan 14B 使用 High/Low 双阶段 20 步采样，并使用
`wan_2.1_vae.safetensors`。GGUF 工作流必须使用
`UnetLoaderGGUFAdvanced`：本机同时安装了 FantasyTalking 的同名
`UnetLoaderGGUF`，后者返回 `WANVIDEOMODEL`，会和标准采样器产生类型冲突。

Sulphur 2 使用完整 `sulphur_dev_fp8mixed.safetensors`、Gemma 3 文本编码器、
官方 distill LoRA 和 LTX 2.3 latent x2 upscaler。官方明确说明完整 Sulphur 模型
不能再叠加 Sulphur LoRA；内置图只叠加 distill LoRA。

### 2.7 分辨率提升与作品版本

- SeedVR2、FlashVSR、Real-ESRGAN 已成为正式队列任务，不再是禁用按钮。
- Real-ESRGAN 每批 1 帧；SeedVR2 每批 5 帧且内部 batch 为 1；FlashVSR 每批
  16 帧并启用 Low VRAM。每批在后处理前通过 `VRAM_Debug` 卸载模型。
- Real-ESRGAN 已用 64×64、3 帧输入真实跑通 3 次 meta-batch；产品等待链只在
  最终批完成后返回成功，输出经 ffprobe 验证为 128×128、24 FPS、3 帧。
- 应用会修复并锁定 VideoHelperSuite 1.7.9 的 ComfyUI 0.18 队列元组与跨
  requeue BatchManager 状态兼容层；旧节点备份放在 `ComfyUI/node-backups`，
  不会作为重复自定义节点加载。
- SeedVR2 与 FlashVSR 的节点类型和输入签名已用本机 `/object_info` 校验。
- FlashVSR 必须五个权重齐全才可用；本机目前只有主模型，因此保持禁用。
- Hunyuan 1080p SR 需要第一阶段 latent、文本和首帧条件，属于生成模型变体，
  不出现在通用视频放大弹窗中。

### 2.8 显存安全与 Frame Interpolation

- 所有生成入口硬限制为最多 2 秒；Wan 5B 最多 49 个模型帧，14B/Hunyuan/
  Sulphur 等重模型最多 25 个模型帧，超出预算的组合不能入队。
- ComfyUI 由应用以 `--lowvram --reserve-vram 4 --cache-none` 启动，并关闭异步
  offload 和 pinned memory；默认策略宁可降低速度，也不以系统卡死换吞吐量。
- 所有视频 VAE 解码都强制 tiled；Sulphur 低分辨率阶段结束后会先卸载，再进入
  高分辨率阶段。

当前插帧顺序：

```text
扩散采样
  → VRAM_Debug 卸载扩散模型
  → VAEDecodeTiled（256 tile / temporal 16）
  → VRAM_Debug 再次卸载模型与 VAE
  → RIFE VFI（BF16、batch=1、每帧清缓存）
  → ImageFromBatch 精确裁帧
  → CreateVideo / SaveVideo
```

- Wan/Hunyuan 的生成帧数满足 `4n+1`。
- 插帧后帧数精确裁到 `round(duration × target FPS)`。
- RIFE 4.7 权重已纳入设置页环境扫描。
- 本机 RIFE 单帧执行成功，耗时约 0.45 秒。
- 完整 Wan 5B + 动态插帧 workflow 已通过 ComfyUI `/prompt` 校验；
  为避免重复跑大模型，校验后主动中止，尚未形成多帧性能基准。
- RIFE 节点会在 ComfyUI Python 进程中缓存一个较小模型；主要的 5B/14B
  扩散模型和 VAE 会在插帧前卸载。后续若仍需要压低常驻显存，可修改上游
  RIFE 节点增加显式移回 CPU/清空模块缓存。

### 2.9 测试状态

提交前要求：

- `npm test -- --run` 全部通过。
- `npm run build` 的 TypeScript、renderer production build 和 Electron
  TypeScript build 全部通过。
- 8 个生成工作流和 3 个 Upscale 工作流应继续通过本机 `/object_info` 节点签名校验。

## 3. 当前机器环境（不会随 Git 仓库迁移）

### 3.1 路径

```text
仓库：
E:\Projects\AIVideoGenTool

ComfyUI Desktop 程序源码：
D:\Program Files\ComfyUI\resources\ComfyUI

ComfyUI 当前用户数据根目录：
C:\Users\Wuyouwofang\Documents\ComfyUI

模型目录：
C:\Users\Wuyouwofang\Documents\ComfyUI\models

输出目录（未在设置中覆盖时）：
C:\Users\Wuyouwofang\Documents\ComfyUI\output

应用状态：
C:\Users\Wuyouwofang\AppData\Roaming\ai-video-gen-tool\studio-state.json
```

状态 JSON 只保存元数据和绝对路径，不包含大型图片/视频本体。换机要保留历史
播放，必须同时复制输出视频，并修复状态文件中的旧绝对路径；只复制 Git 仓库
不会带走历史记录和模型。

### 3.2 已下载的主要权重

```text
Wan 2.2 5B + UMT5 + wan2.2_vae
Wan 2.2 14B high/low FP8
NSFW Wan UMT5
Wan 2.1 VAE
Wan Remix v3 High/Low Q5_K_M
SmoothMix High/Low Q5_K_M
DaSiWa v9 High/Low Q4
HunyuanVideo 1.5 720p I2V
HunyuanVideo 1.5 1080p SR（双阶段工作流已接入）
Hunyuan 1.5 VAE、Qwen 2.5 VL、ByT5、SigCLIP
SeedVR2 / FlashVSR / Real-ESRGAN 相关文件（后端已接入；FlashVSR 缺四个配套权重）
LTX 2.3 checkpoint、Gemma 3、distill LoRA、latent x2 upscaler（Sulphur 主模型尚未下载）
```

RIFE 权重：

```text
C:\Users\Wuyouwofang\Documents\ComfyUI\custom_nodes\
  ComfyUI-Frame-Interpolation\ckpts\rife\rife47.pth
```

仓库中的 `model_download_todo.txt` 是本轮下载来源记录，不代表所有条目都已经
在 GUI 中完成端到端生成验证。

## 4. 换机继续开发

### 4.1 Git 与 Node

```powershell
git clone git@github.com:wxy112300/AIVideoGenTool.git
cd AIVideoGenTool
npm ci
npm test
npm run build
.\start-ui.bat
```

需要代理完成首次依赖安装时，使用 `.\start-ui-proxy.bat http://127.0.0.1:7890`；不传地址会交互询问。

推荐 Windows 10/11、Node.js 22 或 24 LTS、Git、FFmpeg 和 NVIDIA 驱动。
不要在 WSL 中运行 Electron/ComfyUI 桌面联调。

### 4.2 ComfyUI

1. 安装或复制 ComfyUI Desktop/Portable/手动环境。
2. 将模型放到新用户的 ComfyUI `models` 目录。
3. 安装设置页列出的自定义节点。
4. 保证 KJNodes、ComfyUI-GGUF 和 Frame Interpolation 能在 `/object_info`
   中被识别。
5. 在设置页填写新机器的模型目录和输出目录。
6. 使用 8188；如果换端口，设置页和 ComfyUI 启动参数必须一致。
7. 网络不稳定时先开启代理，再点击“重启 ComfyUI”，使代理进入 Python
   子进程。
8. 先跑 1 秒/480p，再逐步增加时长和分辨率。

### 4.3 可选迁移本机状态

关闭 GUI 后复制：

```text
%APPDATA%\ai-video-gen-tool\studio-state.json
```

还要复制状态中引用的输入图片和输出视频。由于当前记录保存绝对路径，用户名、
盘符或目录变化后，旧历史可能无法播放。更稳妥的换机方案是只迁移模型和视频，
在新机生成新的状态；后续应实现路径重定位/导入功能。

## 5. 还没有完成

### P0：下一个接手者应优先处理

1. **真实模型基准**
   - Hunyuan 1.5、Wan 14B 原版、Remix、SmoothMix、DaSiWa 尚未分别完成
  1 秒/2 秒真实生成和峰值显存记录；不要绕过 2 秒硬上限做单任务长测。
   - 需要保存耗时、采样阶段、VAE、RIFE、编码和 `nvidia-smi` 数据。
2. **RIFE 多帧端到端测试**
   - 分别测试 24 FPS + 2×、24 FPS + 4×、25 FPS + 2×、30 FPS + 2×。
   - 检查快速运动、遮挡和镜头切换的插帧伪影。
3. **安全取消的部分视频**
   - 当前 `/interrupt` 能停止任务，但不能保证保存可播放的部分视频。
   - 需要帧临时目录 + FFmpeg 原子合成 `*-partial.mp4`。
4. **换机路径迁移**
   - 状态和历史保存绝对路径；尚无导出、导入和批量重定位功能。
5. **错误与预检**
   - 在重型生成前检查 RIFE checkpoint 是否存在，避免生成结束才下载/失败。
   - 对 OOM、模型缺失、节点版本冲突给出更明确的一键修复动作。

### P1：核心产品仍缺

1. **完整可复现记录**
   - 尚未保存 Steps、CFG、Sampler、Scheduler、VAE 参数、每阶段耗时和峰值显存
     的不可变快照。
2. **真正暂停当前采样**
   - 当前只能“本条完成后暂停队列”，没有挂起/恢复正在运行的 CUDA 任务。
3. **长视频策略**
  - 当前单任务硬限制为 2 秒；超过 2 秒需要分段生成、重叠帧、续写和拼接。
4. **首尾帧**
   - 数据结构保留 `endImagePath`，但内置工作流没有完成统一的首尾帧生成体验。
5. **缺权重模型的真实测试**
  - Sulphur 2 和 FlashVSR 已接工作流与环境扫描，但本机权重不完整，尚未真实执行。

### P2：工程化与体验

- Windows 安装包、自动更新、签名和发布流程。
- JSON 状态迁移 SQLite。
- 可配置应用状态/数据库目录。
- 历史搜索、筛选、批量操作和更完整键盘交互。
- 更系统的组件版本锁定与环境导出清单。
- UI 字体、密度、窄窗口和超长中文内容继续做视觉回归。
- 保存脱敏的 ComfyUI history/WebSocket fixture，减少以后对真实 GPU 的回归依赖。

## 6. 下一轮推荐顺序

1. 新机完成 `npm ci`、测试和构建。
2. 在设置页扫描环境，先解决所有红色必需项。
3. 用 Wan 5B 跑 1 秒/480p/关闭插帧，确认基础链路。
4. 用 Wan 5B 跑 2 秒/24 FPS/RIFE 2×，确认迁移后的 RIFE 权重和最大安全片段。
5. 按 14B 原版 → Remix → SmoothMix → DaSiWa → Hunyuan 顺序做最小生成。
6. 把真实结果补成 benchmark/fixture。
7. 开始实现 P0 的“安全取消部分视频”，再做超过 2 秒的分段生成与拼接。

## 7. 关键代码

- `electron/main.ts`：IPC、队列 worker、历史写入和退出处理。
- `electron/services/comfy-ui.ts`：ComfyUI HTTP/WebSocket、节点阶段和取消。
- `electron/services/environment.ts`：路径、模型、节点、代理、服务启动与修复。
- `electron/store.ts`：原子 JSON 持久化和旧状态迁移。
- `src/core/workflow.ts`：模型资源映射、帧数、RIFE 动态节点和占位符。
- `src/core/upscale.ts`：三种 Upscale 工作流、分批大小和批间显存卸载。
- `src/main.ts`：创建、队列、历史、详情和设置页面交互。
- `src/style.css`：正式应用样式。
- `workflows/`：内置 API workflows。
- `tests/`：46 项无 GPU 回归测试。

## 8. 工作流占位符

```text
{{PROMPT}} {{NEGATIVE_PROMPT}} {{SEED}}
{{INPUT_IMAGE}} {{END_IMAGE}}
{{WIDTH}} {{HEIGHT}} {{DURATION}}
{{SOURCE_FPS}} {{FPS}} {{FRAMES}} {{OUTPUT_FRAMES}}
{{HIGH_MODEL}} {{LOW_MODEL}} {{TEXT_ENCODER}} {{VAE_MODEL}}
{{OUTPUT_FILENAME}}
```

`FPS` 是成片目标 FPS，`SOURCE_FPS` 是插帧前的名义 FPS，`FRAMES` 是大模型
实际生成帧数，`OUTPUT_FRAMES` 是最终精确裁剪帧数。
