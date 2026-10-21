# FastH3 Omni 独立 H3 模型接入

- Status: validating（代码与本地验证完成；真实新模型成片待运行依赖）
- Updated / Owner: 2026-10-21 / 当前任务
- Scope / Authority: 用户要求新增为独立 H3 模型，套用既有逻辑；不下载权重、不替换旧模型或运行时。
- Execution: direct；无子 agent。

## Resume

- 新增 INT8 ConvRot FastH3 Omni，复用 H3 R2V 图片/视频参考、视频音轨、Prompt、队列、History 与设置扫描。
- 固定 8 步 Euler / Simple、guidance 1、video/audio shift 12/3；保留旧 H3 模型、ID 和工作流。
- 源码确认 ComfyUI v0.42.1 具备完整 PDD checkpoint 的 `pdd_steps` 加载；仓库原推荐 v0.39.2 的 PDD LoRA 支持不等于完整 checkpoint 支持。
- 首版沿用现有参考槽位，不扩展独立音频输入；不开放未经验证的 Extend、Spectrum、稀疏 attention、旧加速 LoRA 组合。
- 已完成：独立 catalog/三语模型说明、固定权重下载/哈希指引、专用 R2V 图、8 步 PDD 采样、模型切换、Prompt/queue/AV/History 复用，以及创建/入队/执行前的核心版本门槛。稀疏 attention 在此模型解析为 off，保留全局设置和旧 H3 行为；切回 Base 恢复标准步数。
- 已完成：其输出进入继续创作时回到普通受支持的 H3 R2V 续写模型，保留 source asset/version 身份，不误用 Omni checkpoint 做续写。
- 2026-10-21 后续：按用户要求将全应用及 Omni 推荐核心统一为 0.42.3；Omni 最低线仍为 0.42.1，各旧工作流最低线不变。同步依赖说明和 Unreleased，25 项相关测试与 typecheck 通过。
- 当前安装身份待核对：用户报告已升至 0.42.3，但应用设置选中的源码目录在此次只读检查中 `comfyui_version.py` / `pyproject.toml` 均自报 0.42.0，HEAD `40dcb30a96fc345f54632c56af81a4a320c2fc1e`，describe 为 `v0.42.0-15-g40dcb30a9`。未修改安装或路径，未据此宣称运行时已通过 Omni 门槛。
- 下一步：确认选中核心/运行服务达到 0.42.1+ 并补齐新权重后，从隔离状态做单图 480p/5秒/8步真实生成，再验视频参考、音轨、播放/重启/取消与同参数对照。补齐前不声称 smoke passed 或速度/质量收益。

## Evidence / handoff

- 官方 Comfy 模型：`FastVideo/FastH3-Omni-Comfy@82eff2a6eee6c962846879f4bab52610a4df24d3`。
- 权重：`diffusion_models/fasth3_omniref_8step_pruned_int8_convrot.safetensors`；22,213,723,064 bytes；SHA-256 `851b2dc9670ed864b7f1e951ac9da047d83b1c04ded9bfcc1a9e5bba0ee33f80`。
- 官方配套 NVFP4 encoder、FP16/INT8 video VAE、FP32 audio VAE 与当前共享组件哈希相同。
- [官方模型卡](https://huggingface.co/FastVideo/FastH3-Omni-Comfy)、[转换与数值边界](https://huggingface.co/FastVideo/FastH3-Omni-Comfy/blob/82eff2a6eee6c962846879f4bab52610a4df24d3/conversion/CONVERSION.md)。原生 Comfy 与 FastVideo 的网格/VSA/量化不同，不承诺同速同质。
- 基线存在无关未提交的 History 删除和 UI 设计工作；保留全部。开始时其余任务均无 active 执行状态；本次独占完整 verify 构建和隔离 Electron，未执行 GPU 生成。
- 版本影响：minor 功能；已写 Unreleased，不 bump、不打包、不发布。
- Focused：7 文件 / 161 项通过；后续新增的普通续写回退旅程纳入完整 verify。
- `npm.cmd run verify`：240 单元测试文件 / 2328 项、6 集成测试文件 / 91 项、双 TypeScript 检查、干净 renderer/web/Electron 构建、20 项对比度全部通过。日志在忽略的 `temp/fasth3-verify.log`。测试使用任务专用 TEMP，避免旧共享测试日志的权限错误。
- 生产 DOM + 合成外部端口旅程：旧核心阻塞→修复版本证据→缺参考阻塞→真实选择参考/Enhance/enqueue 按钮→新 task ID；8步/24FPS/工作流/参考快照固定；切回 Base；Omni 来源进入普通 R2V 续写。此层不冒充 Electron IPC 或 GPU。
- 真实隔离 Electron：新模型选项显示“缺组件”且不可选；实际点击 Settings 视频模型及下载指引，核对来源 revision、文件名、SHA-256、目录和核心要求。通过真实 AppApi 离线扫描确认只缺新的 diffusion checkpoint，原共享组件已存在；所选 Desktop core 为 v0.39.0 / `d91ed5f5b7fa60fa18464c2ad7c80254da2f0f29`。未将旧核心的节点注册当作完整 PDD 加载成功。
- 本机原始证据：`temp/create-smoke-zQRYg4/omni-ui-initial.json`、`omni-settings.json`、`omni-install-guide.png`、`inspect.json`、`cleanup.json`；不提交机器路径、用户状态或媒体。
- Cleanup：通过隔离 fixture 的 AppApi/窗口退出流程清理；队列/History 始终为空，Prompt idle，ComfyUI 未启动。确认本次 Electron PID 与 CDP/Comfy 监听均已退出/不存在。未修改用户状态、权重或已安装核心。
- 最终 scoped diff / whitespace 检查通过；原有删除均属于任务开始时的无关 dirty 基线，本次没有新增删除。
