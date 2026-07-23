# AIVideoGenTool

面向本地 ComfyUI 的易用型 Image-to-Video 工作台，目标是在 RTX 4090 24GB 环境下，将模型选择、提示词扩写、队列执行、历史管理和视频放大整合为接近 Grok 使用体验的桌面 GUI。

## 当前内容

- `prototypes/`：已通过逐页讨论形成的交互原型。
- `prototypes/preview/`：可以直接用浏览器打开并互相导航的独立预览页面。
- `docs/PRODUCT_REQUIREMENTS.md`：完整产品需求与验收标准。
- `scripts/build-prototypes.mjs`：重新构建独立预览。

## 查看原型

从 `prototypes/preview/create.html` 开始，顶部导航可以切换创建、队列、历史和设置页面。

修改原型片段后执行：

```powershell
node scripts\build-prototypes.mjs
```

当前仓库处于产品设计与交互原型阶段，尚未接入真实 ComfyUI、LM Studio 或 Windows 原生文件操作。
