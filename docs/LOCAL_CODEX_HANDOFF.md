# Local Video Studio 当前交接基线

更新时间：2026-08-04

当前分支：`main`

交接基线：本文所在 `main` 最新提交

本文是换机或更换 agent 后继续开发的首要入口。长期产品目标仍以
`docs/PRODUCT_REQUIREMENTS.md` 为准；本文只描述已经落地的能力、真实验证边界、
本机环境、已知风险和下一步顺序。

图片工作台的新需求、数据契约、分阶段实施和多 Agent 文件所有权见
`docs/IMAGE_WORKSPACE_IMPLEMENTATION_PLAN.md`。该模块目前完成的是交互原型，不能按
原型画面推断正式 Electron 功能已经实现。

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
- 新增“推理加速”分类：按所选 ComfyUI 实例识别其独立 Python、Torch、CUDA、
  GPU SM、SageAttention、Triton 和 KJNodes；支持一键安装、实时日志、CUDA 自检，
  且只接受 ComfyUI 官方 wheel matrix 中真实存在的组合。
- H3 可在模型级 SageAttention CUDA FP16 与 PyTorch 兼容模式间切换；不会全局
  修改其他模型的 Attention。

### 2.6 已接入的视频模型

新增模型进入下表前，必须完成 [2.9 新模型接入的显存门禁](#29-新模型接入的显存门禁)，
并把实测能力和未验证边界写入“当前验证”列。

| 模型 ID | UI 名称 | 内置工作流 | 当前验证 |
|---|---|---|---|
| `wan22_5b` | Wan 2.2 I2V 5B | `workflows/wan22_5b_i2v_api.json` | 4090 上完成 720p、5 秒、121 帧正式基准 |
| `minimax_h3_fl2va` | MiniMax H3 FL2VA | `workflows/minimax_h3_i2v_api.json` | RTX 4090 完成 864×480、39帧、24FPS、原生立体声音频；总执行86.505秒 |
| `hunyuan15` | HunyuanVideo 1.5 I2V | `workflows/hunyuan15_i2v_api.json` | API 节点与工作流校验通过；仍需完整生成基准 |
| `hunyuan15_sr` | HunyuanVideo 1.5 I2V + 1080p SR | `workflows/hunyuan15_sr_i2v_api.json` | 官方 20 步 720p + 8 步 SR 分支；服务端解析与首阶段执行验证通过 |
| `sulphur2` | Sulphur 2 GGUF | Q2: `workflows/sulphur2_ltx23_i2v_gguf_q2_api.json` / `workflows/sulphur2_ltx23_extend_gguf_q2_api.json`; Q3/Q4: 对应 `*_gguf_dev_api.json` | 四个图已通过本机 ComfyUI 节点 schema；FP8 Extend 实测导致严重桌面卡顿，GGUF 尚未运行重型 benchmark |
| `wan22_14b_nsfw` | Wan 2.2 I2V 14B + NSFW | `workflows/wan22_14b_i2v_api.json` | 完整组件识别和 `/prompt` 校验通过 |
| `wan22_remix` | Wan 2.2 Remix v3 | `workflows/wan22_14b_gguf_i2v_api.json` | 完整组件识别和 `/prompt` 校验通过 |
| `wan22_smoothmix` | Wan 2.2 SmoothMix I2V | 同上 | 完整组件识别；共享 GGUF 工作流 |
| `wan22_dasiwa` | DaSiWa SynthSeduction v9 | 同上 | 完整组件识别；共享 GGUF 工作流 |

Wan 14B 使用 High/Low 双阶段 20 步采样，并使用
`wan_2.1_vae.safetensors`。GGUF 工作流必须使用
`UnetLoaderGGUFAdvanced`：本机同时安装了 FantasyTalking 的同名
`UnetLoaderGGUF`，后者返回 `WANVIDEOMODEL`，会和标准采样器产生类型冲突。

Sulphur 2 使用设置选择的 Q2/Q3/Q4 GGUF transformer、Gemma 3、LTX text connector、
独立视频/音频 VAE 和 latent x2 upscaler。Q2 是 distilled transformer，不叠加 LoRA；
Q3/Q4 是 dev transformer，内置图叠加 distill LoRA。I2V、Extend、环境扫描和任务快照
必须使用同一个档位。

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

- 新任务默认 5 秒、24 FPS、关闭插帧。单段输出最多 10 秒，超出需要续写或分段。
- Wan 5B、Hunyuan 1.5、Sulphur 2 当前预算为 121 个模型帧；Wan 14B FP8/GGUF
  在真实基准完成前采用 81 帧预算。限制按实际模型帧计算，不再按秒数一刀切。
- ComfyUI 由应用以 `--reserve-vram 1 --cache-none --disable-pinned-memory
  --disable-async-offload` 启动，不强制 `--lowvram`。这是 Windows RTX 4090 上 H3
  完整跑通的稳定档；默认异步固定内存卸载会造成超过90GB committed memory和换页。
- 本机日志确认 PyTorch 2.8、RTX 4090 24 GB、63.8 GB RAM、DynamicVRAM 和
  comfy-aimdo 0.4.10 均可用。
- Wan 14B 高噪声专家完成后先通过 `VRAM_Debug` 卸载，再加载低噪声专家；
  第二次卸载仍位于低噪声采样和 tiled VAE 之间。
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
- Sulphur/LTX 的生成帧数满足 `8n+1`。
- 插帧后帧数精确裁到 `round(duration × target FPS)`。
- 10 秒、24 FPS、RIFE 2× 只需生成 121 个模型帧，因此属于当前 Wan 5B、
  Hunyuan 和 Sulphur profile；Wan 14B 暂不开放该组合。
- RIFE 4.7 权重已纳入设置页环境扫描。
- 本机 RIFE 单帧执行成功，耗时约 0.45 秒。
- Wan 5B 已在新启动策略下完成 1280×720、121 帧、24 FPS、20 steps 的正式基准：
  ComfyUI history 显示执行 255.3 秒，`ffprobe` 验证 H.264、5.0417 秒、121 帧。
- 该次采样 runner 在结果回传时被终端中止，峰值 VRAM/RAM 没有可靠保存；输出和
  history 均成功，但仍需用相同 seed/输入补测峰值，不能以空闲显存冒充峰值。
- 完整 Wan 5B + 动态插帧 workflow 已通过 ComfyUI `/prompt` 校验；10 秒 RIFE 2×
  的 121→240 帧端到端性能基准仍待完成。
- RIFE 节点会在 ComfyUI Python 进程中缓存一个较小模型；主要的 5B/14B
  扩散模型和 VAE 会在插帧前卸载。后续若仍需要压低常驻显存，可修改上游
  RIFE 节点增加显式移回 CPU/清空模块缓存。

### 2.9 新模型接入的显存门禁

以后接入任何新视频生成或视频增强模型，都必须先完成下面的检查。不要再次用
统一的“最多几秒”代替模型级显存设计：时长不是主要资源维度，模型实际生成帧数、
分辨率、latent 尺寸、权重精度、同时驻留的模型阶段和 VAE/后处理峰值才是。

1. **先确认上游基线，不凭印象设限制**
   - 查官方仓库、模型卡和维护活跃的上游实现，记录推荐分辨率、模型帧数、FPS、
     默认 steps、最低 VRAM、offload/quantization 参数和原生长视频能力。
   - 明确哪些结论来自原始 BF16/FP16 模型，哪些来自本项目实际使用的 FP8、GGUF、
     蒸馏或量化版本；不能把原始 80 GB 要求直接套到 FP8/GGUF 工作流。
2. **按资源阶段拆工作流**
   - 列出文本编码器、DiT/UNet、多个 expert、ControlNet、VAE、SR、插帧和编码阶段。
   - 在产生大权重的阶段结束处卸载该阶段模型。多 expert 模型必须检查专家切换边界，
     双阶段生成必须检查低分辨率到高分辨率/SR 的边界。
   - 不要在管线末尾用统一清理掩盖前一阶段的驻留问题；哪个阶段加载模型，哪个阶段
     负责在最后一个消费者之后释放它。
3. **建立独立的 model frame profile**
   - profile 以模型实际帧数和模型要求的 `4n+1`、`8n+1` 等时间约束为核心，同时
     记录已验证分辨率和工作流版本；输出秒数只作为产品分段边界。
   - 未实测模型先采用有官方依据的保守帧数，完成基准后再提高。禁止为了“绝不 OOM”
     随意回退到 1–2 秒，也禁止因为一次 smoke test 成功就直接开放超长单次采样。
   - RIFE 只减少模型需要生成的帧数，不改变输出目标帧数；长视频还应评估原生续写、
     context window、重叠分段和拼接，而不是只提高单次模型帧数。
4. **分别处理权重峰值、activation 峰值和 VAE 峰值**
   - FP8/GGUF、CPU/block/group offload 主要解决权重驻留；attention backend、分辨率
     和模型帧数主要影响 sampling activation；tiled VAE 只解决 encode/decode 峰值。
   - 不得把“已经 tiled VAE”写成 DiT sampling 不会 OOM 的证据，也不得把 GGUF
     文件大小直接等同于运行时峰值。
5. **保留 ComfyUI 的有效内存管理能力**
   - 默认优先保留 DynamicVRAM 的能力；修改 async offload 或 pinned memory 必须有
     该模型的复现证据。H3 已提供“默认异步路径卡死、同步路径86.505秒完成”的本机
     对照，因此 Windows 24GB 稳定档明确关闭两者；仍不得无依据加入 `--lowvram`。
   - 修改启动参数后必须重启应用管理的 ComfyUI，并同时检查实际 Python 命令行和启动
     日志；只看 TypeScript 配置不算验证。日志至少应确认 allocator、VRAM state、
     DynamicVRAM、async offload、pinned memory 和 reserve 值。
6. **用分层实测决定开放边界**
   - 依次完成 `/object_info` 节点签名、`/prompt` 解析、1 秒/480p smoke test、官方或
     推荐基线、RIFE/后处理、取消/OOM/stall 恢复和连续模型切换。
   - 正式基准固定输入、seed、分辨率、模型帧数、steps 和工作流版本，记录采样、VAE、
     后处理、总耗时、峰值 VRAM、峰值系统 RAM、输出路径及 Prompt ID，并用 `ffprobe`
     验证分辨率、FPS、时长和精确帧数。
   - 峰值采集失败就明确标记缺失并重测；空闲显存、结束后显存和单次截图都不能冒充
     峰值。一次成功只证明该组合可运行，不自动证明更高分辨率或更多帧安全。
7. **安全机制与能力 profile 分离**
   - OOM/stall interrupt、`/free`、服务重启和暂停后续队列始终保留，它们是故障恢复，
     不是降低模型能力的理由。
   - 每个新 profile 都要增加无 GPU 边界测试；每个阶段卸载都要增加工作流连线断言；
     实测结论和未验证边界同步写回本文及 `docs/DEPENDENCIES_AND_SETUP.md`。

出现以下信号时应停止继续叠加限制并重新检查架构：同一限制影响所有模型、需要用
任意秒数或显存阈值猜测安全性、VAE tiling 被用来解释采样峰值、修改源码后运行中的
ComfyUI 仍带旧参数、或一次修复需要在管线末尾追加多个特殊清理节点。

### 2.10 测试状态

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

当前选择的 ComfyUI Desktop 2 实例：
D:\Comfy-Desktop\ComfyUI-Installs\ComfyUI

当前实例核心源码：
D:\Comfy-Desktop\ComfyUI-Installs\ComfyUI\ComfyUI

当前实例 Python：
C:\Users\Wuyouwofang\Documents\ComfyUI\.venv\Scripts\python.exe

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
Sulphur 2 / LTX 2.3 旧 FP8 checkpoint 与配套组件（保留但不再由内置图选择）；Q2/Q3/Q4 GGUF 与 split connector/VAE 按所选档位补齐
MiniMax H3 FL2VA INT8 ConvRot、Qwen3-VL 32B NVFP4 AWQ、视频 VAE 与音频 VAE
```

H3 Attention 环境：

```text
ComfyUI 0.30.1
Python 3.12.11
PyTorch 2.8.0+cu129 / CUDA 12.9
SageAttention 2.2.0+cu129torch2.8
triton-windows 3.4.0.post21
KJNodes PathchSageAttentionKJ 已通过 /object_info 验证
```

旧 KJNodes 在自动更新前已备份到：

```text
C:\Users\Wuyouwofang\Documents\ComfyUI\node-backups\comfyui-kjnodes-1785815074202
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
5. 在“推理加速”中点击“一键安装并自检”；安装器必须显示所选实例的真实 Python，
   不能对系统 Python 或另一个 ComfyUI 目录安装。
6. 在设置页填写新机器的模型目录和输出目录。
7. 使用 8188；如果换端口，设置页和 ComfyUI 启动参数必须一致。
8. 网络不稳定时先开启代理，再点击“重启 ComfyUI”，使代理进入 Python
   子进程。
9. 先跑 1 秒/480p，再逐步增加时长和分辨率。

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
   - MiniMax H3、Hunyuan 1.5、Wan 14B 原版、Remix、SmoothMix、DaSiWa 尚未分别完成
  81/121 帧真实生成和峰值显存记录；未实测模型不要提高对应 frame profile。
   - 需要保存耗时、采样阶段、VAE、RIFE、编码和 `nvidia-smi` 数据。
   - H3 已完成 864×480/39 帧基准：Euler + simple + 20步 + Sage FP16，总执行
     86.505秒，输出39帧/24FPS/1.625秒并含AAC双声道。官方 res_multistep 与默认
     pinned/async offload 在本机组合会严重换页；生产图使用已验证配置。
     Prompt ID：`35c78c1c-d09a-4d53-b935-9736ea98cad3`；输出：
     `C:\Users\Wuyouwofang\Documents\ComfyUI\output\codex-h3-euler-final-proof_00001_.mp4`。
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
  - 当前单段输出上限为 10 秒；超过 10 秒需要分段生成、重叠帧、续写和拼接。
4. **首尾帧**
   - 数据结构保留 `endImagePath`，但内置工作流没有完成统一的首尾帧生成体验。
5. **已接模型的真实测试**
  - Sulphur 2 原生 Extend 已完整接入；旧 FP8 图进入采样后约占 23.4/24.6 GB 显存并造成严重桌面卡顿，已退出生产路由。
  - 四个 GGUF 图已通过 JSON、静态安全契约和本机 ComfyUI 节点 schema，尚未下载完整档位并运行重型 benchmark。
  - FlashVSR 仍缺配套权重，尚未真实执行。

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
3. 在推理加速页完成 Sage/Triton/KJNodes 一键安装和 CUDA 自检。
4. 用 Wan 5B 跑 1 秒/480p/关闭插帧，确认基础链路。
5. 关闭无关高内存程序后重测 H3 864×480/39 帧，同时记录 RAM commit、磁盘换页、
   单步耗时和显存；仍换页时再单独比较 `--fast-disk`，不要直接扩大时长。
6. 用 Wan 5B 跑 5 秒/720p/121 帧，记录 DynamicVRAM、采样和 tiled VAE 峰值。
7. 用 Wan 5B 跑 10 秒/24 FPS/RIFE 2×，确认 121 模型帧到 240 成片帧。
8. 按 14B 原版 81 帧 → Remix → SmoothMix → DaSiWa → Hunyuan 121 帧顺序测试。
9. 按设置中选择的 Sulphur 档位补齐 GGUF 与 split 组件；只有用户明确许可后才运行 360p/49 帧 benchmark。
10. 把真实结果补成 benchmark/fixture，再按结果提高或收紧单模型 profile。

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
- `tests/`：Vitest 无 GPU 回归测试；测试数量会随功能增加，不在交接文档中固定。

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
