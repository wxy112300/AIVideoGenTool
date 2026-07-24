# 依赖、环境与初始化

## 1. 当前实现的技术边界

当前第一阶段采用 **Electron + TypeScript + Vite**。Electron 只负责桌面窗口、文件选择、读取本地图片、原子化状态保存和本地服务通信；模型加载、CUDA、采样、VAE 解码与视频输出仍由 ComfyUI 负责。

这样拆分有两个好处：

1. GUI 不绑定某个 Python、PyTorch 或 CUDA 版本。
2. Sulphur 2、Wan 2.2、HunyuanVideo 等模型可以各自维护独立的 ComfyUI API 工作流，不需要在应用代码中硬编码节点编号。

## 2. 模块依赖矩阵

| 模块 | 当前方案 | 是否已接线 | 本地接手时要做的事 |
|---|---|---:|---|
| 桌面 GUI | Electron 43 + 原生 TypeScript/HTML/CSS | 是 | 在 Windows 上运行并检查缩放、文件选择和深色界面 |
| 前端构建 | Vite 8 | 是 | `npm run dev` / `npm run build` |
| 类型和测试 | TypeScript 7 + Vitest 4 | 是 | 扩充队列与工作流测试 |
| 状态持久化 | 原子替换 JSON | 是（基础版） | 数据量增大后迁移 SQLite；视频和图片只保存路径 |
| 本地提示词扩写 | LM Studio OpenAI 兼容 `/v1/chat/completions` | 是 | 启动本地服务器、加载模型、实测模板 |
| ComfyUI 连接 | HTTP API + WebSocket，history 轮询兜底 | 是 | 用真实工作流验证 `progress/execution_error` 消息和输出结构 |
| I2V 模型适配 | API 工作流 JSON + 占位符替换 | Sulphur/Wan/Hunyuan 八组模型已接入 | 新模型继续按独立资源映射和真实 `/prompt` 校验接入 |
| 视频编码 | ComfyUI 工作流输出节点 | 依赖工作流 | VideoHelperSuite 1.7.9 由应用修复 ComfyUI 0.18 meta-batch 兼容层 |
| 安全取消/部分视频 | 调用 `/interrupt` | 安全中止已接；部分视频未接 | 需要工作流按片段/帧落盘，并用 FFmpeg 合成已完成帧 |
| 历史 | 保存任务快照、解析 outputs、详情和 Explorer 定位 | 作品版本组已接 | 后续增加路径重定位与导入 |
| Frame Interpolation | RIFE 2×/4× | 是 | 新机复制/下载 `rife47.pth` 并测试多帧画质 |
| 分辨率提升 | SeedVR2 / FlashVSR / Real-ESRGAN | 是 | 新环境需按设置页补齐节点与权重；Hunyuan SR 属于生成管线第二阶段 |
| 模型扫描 | 文件、组件、自定义节点和服务扫描 | 是 | 后续增加组件版本锁定和生成前 dry-run |
| Windows 文件操作 | 图片/工作流/目录选择、Explorer 定位 | 部分 | 增加复制真实文件到剪贴板 |
| 安装包 | 尚未配置 | 否 | 功能稳定后接 Electron Forge 或 Builder，生成 Windows 安装包 |

## 3. 必需软件

### GUI 开发机

- Windows 10/11 x64。
- Node.js 22 或 24 LTS；不要使用已 EOL 的 Node 20。
- npm（随 Node.js 安装）。
- Git（推荐，脚本不强制）。

Electron 官方 Windows 教程明确提示桌面开发不要在 WSL 中执行，应在 PowerShell/Windows 环境直接运行：

- https://www.electronjs.org/docs/latest/tutorial/tutorial-first-app
- https://nodejs.org/en/download

### 生成机

- NVIDIA 驱动和可被 `nvidia-smi` 正确识别的 RTX 4090。
- ComfyUI Desktop、Portable 或手动安装三选一。
  - 已经存在可用 ComfyUI 时，不要为了本工具重复安装另一套。
  - Portable 自带独立 `python_embeded`，通常不需要把 Conda 或 Python 加到系统 PATH。
  - Desktop 已包含 ComfyUI Manager。
- LM Studio，加载一个适合中文扩写的小模型并启动 Local Server。
- FFmpeg：基础提交不是硬依赖；“安全取消后输出可播放的部分视频”和独立后处理需要它。

官方参考：

- ComfyUI Windows Desktop: https://docs.comfy.org/installation/desktop/windows
- ComfyUI Windows Portable: https://docs.comfy.org/installation/comfyui_portable_windows
- ComfyUI Manager: https://docs.comfy.org/manager/install
- LM Studio Local Server: https://lmstudio.ai/docs/developer/core/server
- LM Studio OpenAI compatibility: https://lmstudio.ai/docs/developer/openai-compat
- FFmpeg downloads: https://ffmpeg.org/download.html

> 通常不必单独安装完整 CUDA Toolkit。ComfyUI/PyTorch 环境携带其所需 CUDA runtime；先以现有 ComfyUI 能否正常生成和 `nvidia-smi` 是否正常为准。只有自定义 CUDA 扩展明确要求编译工具链时，再安装匹配版本的 Toolkit。

## 4. 首次初始化

在 Windows PowerShell 中进入仓库：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\setup.ps1
```

如果 ComfyUI 不在文档中的默认目录：

```powershell
.\scripts\setup.ps1 -ComfyRoot "D:\AI\ComfyUI"
```

脚本会：

1. 检查 Node、npm、Git、FFmpeg、`nvidia-smi`。
2. 查找 ComfyUI 的 Portable Python、Desktop `.venv` 或系统 Python。
3. 统计常见模型目录是否有文件。
4. 尝试连接 ComfyUI `8188` 和 LM Studio `1234`。
5. 安装 npm 依赖、运行测试并构建。

也可以直接双击仓库根目录的 `start-ui.bat` 完成依赖安装、构建和启动。网络较慢且已有本机
HTTP 代理时，使用代理版入口：

```bat
start-ui-proxy.bat http://127.0.0.1:7890
```

代理地址按“命令行参数 → `LOCAL_VIDEO_STUDIO_PROXY` 环境变量 → 交互输入”的顺序选择；交互输入
直接回车时默认使用 `http://127.0.0.1:7890`。该脚本设置标准 HTTP/HTTPS、npm、Electron 和 pip
代理变量，并让 localhost/127.0.0.1 绕过代理。所有变量只在当前启动进程树中生效，不会污染系统配置。

手动命令：

```powershell
npm install
npm test
npm run build
npm run dev
```

## 5. ComfyUI 工作流准备

必须从 ComfyUI 导出 **API 格式**工作流，而不是普通 UI workflow。官方说明中，API 工作流是以节点 ID 为 key，并含 `class_type` 与 `inputs` 的 JSON 对象：

- https://docs.comfy.org/development/core-concepts/workflow
- https://docs.comfy.org/development/overview

导出后，把需要由 GUI 注入的值替换为占位符：

```json
{
  "12": {
    "class_type": "CLIPTextEncode",
    "inputs": {
      "text": "{{PROMPT}}",
      "clip": ["4", 1]
    }
  },
  "27": {
    "class_type": "LoadImage",
    "inputs": {
      "image": "{{INPUT_IMAGE}}"
    }
  }
}
```

当前支持：

- `{{PROMPT}}`
- `{{NEGATIVE_PROMPT}}`
- `{{SEED}}`
- `{{INPUT_IMAGE}}`
- `{{END_IMAGE}}`
- `{{WIDTH}}` / `{{HEIGHT}}`
- `{{BASE_WIDTH}}` / `{{BASE_HEIGHT}}`：双阶段生成的第一阶段尺寸
- `{{HALF_WIDTH}}` / `{{HALF_HEIGHT}}`：LTX 2.3 latent 2× 前的尺寸
- `{{DURATION}}`
- `{{SOURCE_FPS}}`：插帧前名义帧率
- `{{FPS}}`：成片目标帧率
- `{{FRAMES}}`：视频模型实际生成帧数
- `{{OUTPUT_FRAMES}}`：插帧后精确裁剪帧数
- `{{HIGH_MODEL}}` / `{{LOW_MODEL}}`
- `{{TEXT_ENCODER}}` / `{{VAE_MODEL}}`
- `{{OUTPUT_FILENAME}}`

单独占据整个字符串的数值占位符会保持 number 类型；嵌入普通字符串时会转为文字。
`{{END_IMAGE}}` 还是工作流能力标志：没有该占位符时，应用不会上传或静默忽略尾帧。

### 5.1 RTX 4090 24 GB 生成基线

24 GB 不按“只能生成几秒”的低显存设备处理。应用以模型实际生成帧数约束显存，
输出时长只是第二层边界：

| 模型 | 当前验证预算 | 推荐首测 | 主要显存策略 |
|---|---:|---|---|
| Wan 2.2 TI2V-5B | 121 帧 | 已实测 720p、121 帧、24 FPS | FP8 运行权重、FP8 T5、DynamicVRAM、tiled VAE |
| Wan 2.2 14B FP8/GGUF | 81 帧 | 480p 后再测 720p | 高/低噪声专家间卸载、FP8 或 Q4/Q5、按层反量化 |
| HunyuanVideo 1.5 | 121 帧 | 720p、121 帧、24 FPS | 模型 CPU offload、FP8 文本编码器、tiled VAE |
| Sulphur 2 / LTX 2.3 | 121 帧 | 低分辨率首阶段、121 帧 | FP8 checkpoint、DynamicVRAM、阶段卸载、latent x2 |

默认输出为 5 秒。10 秒可以用 RIFE 2× 将 121 个模型帧插值到 24 FPS 成片；
也可以使用模型原生续写/长视频工作流。不要把单次 241 帧采样默认视为已验证能力。

上游参考：

- Wan 2.2 官方仓库（TI2V-5B 明确支持 24 GB RTX 4090、5 秒 720p@24 FPS）：
  https://github.com/Wan-Video/Wan2.2
- HunyuanVideo 1.5（最低 14 GB with offload，默认 121 帧，CPU offload 与 VAE tiling）：
  https://github.com/Tencent-Hunyuan/HunyuanVideo-1.5
- LTX-2 / LTX-Video（FP8、CPU offload、VAE tiling、视频续写与长视频）：
  https://github.com/Lightricks/LTX-2
- ComfyUI 内存管理和 DynamicVRAM：
  https://github.com/Comfy-Org/ComfyUI
- ComfyUI-GGUF 按层反量化实现：
  https://github.com/city96/ComfyUI-GGUF
- WanVideoWrapper block swap 参考实现：
  https://github.com/kijai/ComfyUI-WanVideoWrapper

应用启动 ComfyUI 时保留其默认 async offload 和 pinned memory，不强制
`--lowvram`，并以 `--reserve-vram 2 --cache-none` 启动。DynamicVRAM 不可用时，
ComfyUI 自身会回退到 legacy ModelPatcher 的 smart partial loading。

本机首次正式基准使用 Wan 5B、1280×720、121 模型帧、24 FPS、20 steps、关闭
RIFE，总执行时间 255.3 秒。`ffprobe` 验证输出为 H.264、5.0417 秒、121 帧。
本次采样进程在结果回传时被终端中止，峰值 VRAM/RAM 数据没有可靠保存，后续应
重复同一 seed 和输入补齐峰值，不用空闲时的显存数值代替峰值。

## 6. 推荐的本地验证顺序

1. 在 ComfyUI 中手动运行某模型的原始工作流。
2. 用“Export Workflow (API)”导出 JSON。
3. 只替换提示词、首帧、Seed、尺寸和输出名前缀。
4. 在本工具设置页测试 ComfyUI 与 LM Studio。
5. 建立 1 秒、480p 的最小任务，检查上传、提交、历史返回。
6. 用 Wan 5B 测试 5 秒、720p、121 模型帧，并记录采样、VAE、编码各阶段的
  峰值 VRAM、系统 RAM、耗时和输出节点。
7. 再按 Wan 14B 81 帧、Hunyuan 121 帧、Sulphur 121 帧逐个建立真实基准；
  不要一次开放尚未实测的模型帧数。
8. 用 3 帧短视频验证 Real-ESRGAN 分 3 批执行且输出仍为 3 帧，再验证 SeedVR2/
  FlashVSR 的保守批大小。
9. 最后做取消、断线恢复、连续队列和模型切换。

不要直接提交 30–60 秒单次采样；超过 10 秒应使用续写、重叠分段或模型原生长视频工作流。
