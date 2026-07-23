# 本地 Codex 接手说明

## 已完成

- Electron 安全桌面壳（`contextIsolation`，renderer 不开放 Node）。
- 创建、队列、历史、设置四个一级页面。
- 图片和 ComfyUI API workflow 原生文件选择。
- 草稿、提示词版本、设置、队列与历史的原子 JSON 持久化。
- LM Studio 连接测试与 OpenAI 兼容提示词扩写。
- ComfyUI 连接测试、参考图上传、任务提交、历史轮询与 interrupt。
- 工作流递归占位符注入。
- 应用重启时把遗留 `running` 任务恢复为 `waiting`。
- 成功任务写入历史快照。
- PowerShell 环境检查和初始化脚本。

## 还没有完成或仅有框架

1. **模型工作流**：仓库不应假设节点编号。需要在本地 ComfyUI 分别导出 Sulphur 2、Wan 2.2 5B、HunyuanVideo 1.5 的 API JSON。
2. **真实进度**：当前轮询 history，进度为保守的合成值。应接 ComfyUI WebSocket 的 `progress`、`executing`、`execution_error`。
3. **安全取消**：已经调用 `/interrupt`，但部分视频是否可播放取决于工作流是否持续保存帧。推荐设计为生成帧临时目录 + FFmpeg 原子编码。
4. **输出解析**：当前完整保存 ComfyUI outputs，尚未把 `filename/subfolder/type` 解析为历史视频真实路径。
5. **SQLite**：第一版使用原子 JSON，便于无原生编译依赖启动。历史与版本功能扩展后应迁移 SQLite，并保留 schema migration。
6. **模型扫描**：需要结合 `/object_info`、模型目录和每个 ModelProfile 的 required components 做完整性检查。
7. **队列操作**：拖动排序、同模型优化、复制任务、失败任务编辑尚未实现。
8. **历史交互**：真实播放、悬停预览、版本组、详情页和 Explorer/剪贴板尚未实现。
9. **Upscale**：原型已有弹窗，正式代码尚未接 SeedVR2/FlashVSR/Real-ESRGAN。
10. **Windows 打包**：应在功能稳定后接 Forge/Builder；先不要把模型或 ComfyUI 一起塞进安装包。

## 建议第一轮本地任务

1. 运行 `.\scripts\setup.ps1`。
2. 修复任何 Windows/Electron 构建差异。
3. 准备一个当前机器上已经能手动成功的 1 秒 I2V API workflow。
4. 替换占位符并通过 GUI 入队。
5. 记录 `/prompt` 请求、Prompt ID、WebSocket 消息与 `/history/{id}` 返回。
6. 把输出解析和真实进度补上，添加一份脱敏 fixture 测试。

## 关键代码位置

- `electron/main.ts`：IPC、队列 worker、任务状态机。
- `electron/services/comfy-ui.ts`：ComfyUI HTTP 适配。
- `electron/services/lm-studio.ts`：本地扩写。
- `electron/store.ts`：原子状态持久化。
- `src/core/workflow.ts`：工作流占位符替换与输出尺寸。
- `src/main.ts`：当前无框架 renderer UI。
- `docs/DEPENDENCIES_AND_SETUP.md`：依赖矩阵和环境初始化。
