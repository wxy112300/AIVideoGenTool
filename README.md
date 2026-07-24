# AIVideoGenTool / Local Video Studio

面向本地 ComfyUI 的 Image-to-Video Windows 桌面工作台。目标是把参考图、提示词扩写、模型工作流、持久队列和生成历史整合为一个不要求用户直接操作节点图的 GUI。

## 当前实现

当前版本已经包含：

- Electron + TypeScript + Vite 桌面应用。
- 创建、队列、历史、设置四个页面。
- 草稿、提示词版本、队列和历史的本地持久化。
- LM Studio OpenAI 兼容 API 提示词扩写。
- ComfyUI 图片上传、API workflow 提交、完成轮询和任务中止。
- ComfyUI WebSocket 真实节点进度与执行错误监听，并以 history 轮询作为兼容兜底。
- 工作流占位符注入，允许每个视频模型使用独立 JSON。
- API workflow 格式与必需占位符校验。
- 队列上移/下移、复制、重试和按模型/工作流优化顺序。
- ComfyUI 输出文件解析、历史详情快照和 Explorer 文件定位。
- Windows 环境扫描、自定义节点安装/修复、下载代理和 ComfyUI 启动/重启。
- Wan 2.2 5B、HunyuanVideo 1.5、Wan 14B、Remix、SmoothMix、DaSiWa
  内置工作流。
- RIFE 2×/4× Frame Interpolation，区分模型帧数与成片目标 FPS。
- 扩散模型卸载、VAE 分块、再次卸载、插帧和精确裁帧的显存安全管线。
- 队列性能监测、实时预览、历史视频播放、右键菜单和视频/记录同步删除。
- 应用退出时清理自身开发进程并中止当前大模型计算。

安全取消后的部分视频、真实 Upscale 后端、历史作品版本组、长视频分段、
Sulphur 2 和 Windows 安装包仍未完成。最新、最完整的交接状态见
[`docs/LOCAL_CODEX_HANDOFF.md`](docs/LOCAL_CODEX_HANDOFF.md)。

## 快速开始

Windows PowerShell：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\setup.ps1
npm run dev
```

也可以手动执行：

```powershell
npm install
npm test
npm run build
npm run dev
```

## 文档

- `docs/PRODUCT_REQUIREMENTS.md`：完整产品需求与验收标准。
- `docs/DEPENDENCIES_AND_SETUP.md`：模块依赖、必需软件和初始化步骤。
- `docs/LOCAL_CODEX_HANDOFF.md`：本地 ComfyUI 环境的后续接手任务。
- `docs/CLOUD_IMPLEMENTATION_STATUS.md`：项目早期云端/本机边界的历史记录。
- `prototypes/`：已确认的交互原型，正式实现应继续以它为视觉与交互参考。

## ComfyUI 工作流

从 ComfyUI 导出 API 格式 JSON 后，可使用以下占位符：

```text
{{PROMPT}} {{NEGATIVE_PROMPT}} {{SEED}}
{{INPUT_IMAGE}} {{END_IMAGE}}
{{WIDTH}} {{HEIGHT}} {{DURATION}}
{{SOURCE_FPS}} {{FPS}} {{FRAMES}} {{OUTPUT_FRAMES}}
{{HIGH_MODEL}} {{LOW_MODEL}} {{TEXT_ENCODER}} {{VAE_MODEL}}
{{OUTPUT_FILENAME}}
```

应用会在提交 `/prompt` 前递归替换它们。详细方法见 `docs/DEPENDENCIES_AND_SETUP.md`。
