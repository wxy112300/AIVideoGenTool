# AIVideoGenTool / Local Video Studio

面向本地 ComfyUI 的 Image-to-Video Windows 桌面工作台。目标是把参考图、提示词扩写、模型工作流、持久队列和生成历史整合为一个不要求用户直接操作节点图的 GUI。

## 当前实现

第一阶段基础工程已经包含：

- Electron + TypeScript + Vite 桌面应用。
- 创建、队列、历史、设置四个页面。
- 草稿、提示词版本、队列和历史的本地持久化。
- LM Studio OpenAI 兼容 API 提示词扩写。
- ComfyUI 图片上传、API workflow 提交、完成轮询和任务中止。
- 工作流占位符注入，允许每个视频模型使用独立 JSON。
- Windows PowerShell 环境检查与初始化。

模型专属工作流、WebSocket 真实进度、安全取消后的部分视频合成、完整历史版本和分辨率提升仍需在带有 ComfyUI/RTX 4090 的本地机器继续实现和验证。

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
- `prototypes/`：已确认的交互原型，正式实现应继续以它为视觉与交互参考。

## ComfyUI 工作流

从 ComfyUI 导出 API 格式 JSON 后，可使用以下占位符：

```text
{{PROMPT}} {{NEGATIVE_PROMPT}} {{SEED}}
{{INPUT_IMAGE}} {{END_IMAGE}}
{{WIDTH}} {{HEIGHT}} {{DURATION}} {{FPS}} {{FRAMES}}
{{OUTPUT_FILENAME}}
```

应用会在提交 `/prompt` 前递归替换它们。详细方法见 `docs/DEPENDENCIES_AND_SETUP.md`。
