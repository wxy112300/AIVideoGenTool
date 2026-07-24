# 云端实现状态与本机边界

> 历史说明：本文记录项目早期“无本地 GPU 环境”阶段的边界，不再代表
> 2026-07-24 的实际完成度。模型扫描、历史播放、Wan/Hunyuan 内置工作流、
> 4090 显存优化和 RIFE 插帧已经在本机实现。继续开发前请以
> `docs/LOCAL_CODEX_HANDOFF.md` 为当前唯一交接基线。

本文用于防止后续开发把“代码已经存在”误认为“模型环境已经验证”。

## 云端可以完成且已经完成

| 功能 | 状态 | 验证方式 |
|---|---|---|
| Electron 主进程、preload 隔离和 renderer 构建 | 完成 | TypeScript + production build |
| 草稿、设置、队列、历史持久化 | 完成 | 原子 JSON 写入；启动时状态恢复 |
| Windows 安全文件名 | 完成 | 单元测试 |
| Workflow 占位符递归替换 | 完成 | 单元测试覆盖字符串和 number |
| API workflow 结构校验 | 完成 | 检查节点 `class_type/inputs` 及必需占位符 |
| LM Studio OpenAI 兼容请求 | 完成 | 请求和错误处理代码；待本地服务联调 |
| ComfyUI HTTP 客户端 | 完成 | system stats、upload、prompt、history、interrupt |
| ComfyUI WebSocket 进度框架 | 完成 | 解析 `progress` 和 `execution_error`，HTTP 轮询兜底 |
| 队列基础管理 | 完成 | 移动、复制、重试、按模型/工作流稳定分组 |
| ComfyUI 输出解析 | 完成 | 常见 media collection fixture 单元测试 |
| 历史详情 | 完成（基础） | 参数快照、原始 outputs、输出文件与 Explorer 定位 |
| 环境检查 | 完成 | PowerShell 检查 Node、服务、模型目录、GPU、FFmpeg |

## 只能在本地 ComfyUI/RTX 4090 环境完成

### 1. 模型 API 工作流

每个模型的节点、输入名和自定义节点版本不同，必须在实际 ComfyUI 中：

1. 先手动成功生成。
2. 导出 API 格式 JSON。
3. 替换 GUI 占位符。
4. 通过本应用做 1 秒/480p 最小任务。
5. 保存一份脱敏后的 `/history/{prompt_id}` 返回作为测试 fixture。

没有真实节点环境时，不应猜测 Sulphur 2、Wan 2.2 或 HunyuanVideo 的节点编号。

### 2. 显存策略和耗时估计

4090 的峰值显存取决于模型文件、精度、分块、TeaCache、CPU offload、自定义节点版本和输入比例。云端只能实现记录字段和估算接口，不能给出可信常数。需要本地建立 benchmark 表。

### 3. 安全取消与部分视频

`/interrupt` 只能保证停止当前 ComfyUI 执行，不保证现有输出节点会留下可播放视频。正式方案需要：

- 工作流持续把已完成帧写入任务临时目录。
- 中止后等待 GPU 节点退出。
- 使用 FFmpeg 把完整帧序列编码到临时视频。
- 验证视频可解码后原子重命名为 `*-partial.mp4`。
- 记录实际帧数、时长和取消位置。

这需要真实采样器和视频节点验证，当前 UI 会明确提示此限制。

### 4. 模型组件扫描

仅按文件名扫描可能误判。完整实现应结合：

- ComfyUI `/object_info` 暴露的节点和选项。
- ModelProfile 声明的 checkpoint、VAE、text encoder、LoRA、自定义节点。
- 一次最小 dry-run/真实运行。

### 5. 视频播放与放大

需要拿到真实 output path、编码格式和版本关系后再完成：

- 历史卡片直接播放。
- 悬停预览和 seek。
- SeedVR2、FlashVSR、Real-ESRGAN 工作流。
- 原作品与放大版本归组。

## 本地联调时建议保留的诊断材料

- ComfyUI 版本和 commit。
- `custom_nodes` 清单及版本。
- API workflow JSON。
- `/prompt` 错误正文。
- WebSocket 消息样本。
- `/history/{prompt_id}` 完整脱敏响应。
- `nvidia-smi` 峰值显存记录。
- 输出视频的 `ffprobe` JSON。

这些材料可以转成固定 fixture，让后续大部分回归测试继续在无 GPU 环境运行。
