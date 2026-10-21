# FastH3 Omni 独立 H3 模型接入

- Status: validating（代码与本地验证完成；真实新模型成片待运行依赖）
- Updated / Owner: 2026-10-22 / 当前任务
- Scope / Authority: 用户要求新增为独立 H3 模型，套用既有逻辑；不下载权重、不替换旧模型或运行时。
- Execution: direct；无子 agent。

## Resume

- 新增 INT8 ConvRot FastH3 Omni，复用 H3 R2V 图片/视频参考、视频音轨、Prompt、队列、History 与设置扫描。
- 固定 8 步 Euler / Simple、guidance 1、video/audio shift 12/3；保留旧 H3 模型、ID 和工作流。
- 当前正确最低线为 ComfyUI v0.42.0：已核对官方该标签的 detector 及 MiniMaxH3 实现均支持完整 checkpoint 的 `pdd_steps`。先前仅检查 v0.42.1 就设为最低线，导致误挡已有能力的 v0.42.0；2026-10-22 已修正。仓库旧推荐 v0.39.2 的 PDD LoRA 支持仍不等于完整 checkpoint 支持。
- 首版沿用现有参考槽位，不扩展独立音频输入；不开放未经验证的 Extend、Spectrum、稀疏 attention、旧加速 LoRA 组合。
- 已完成：独立 catalog/三语模型说明、固定权重下载/哈希指引、专用 R2V 图、8 步 PDD 采样、模型切换、Prompt/queue/AV/History 复用，以及创建/入队/执行前的核心版本门槛。稀疏 attention 在此模型解析为 off，保留全局设置和旧 H3 行为；切回 Base 恢复标准步数。
- 已完成：其输出进入继续创作时回到普通受支持的 H3 R2V 续写模型，保留 source asset/version 身份，不误用 Omni checkpoint 做续写。
- 推荐核心保持用户指定的 0.42.3；本次修正仅改变 Omni 最低线（0.42.0）、相关说明和回归，不改变旧工作流最低线或本机安装。
- 当前安装身份已核对：所选源码自报 0.42.0，HEAD `40dcb30a96fc345f54632c56af81a4a320c2fc1e`，describe 为 `v0.42.0-15-g40dcb30a9`。本机 origin 为 GitCode 镜像，另外用官方 GitHub v0.42.0 标签核对 detector / model，不仅依赖镜像标签或版本名。
- 下一步：用户重启 Studio 加载本次构建、重新扫描；后续使用真实权重做隔离单图 480p/5秒/8步生成，再验视频参考、音轨、播放/重启/取消与同参数对照。此版本阻塞已解决；不因 UI 可入队就声称真实成片或速度/质量收益。

## 2026-10-22 版本门槛误判修复

- 根因：先前把“已检查过的 0.42.1”误当作最低要求，三层共同 helper 因此都拒绝自报 0.42.0 的有效核心。
- 一手源码：[v0.42.0 model.py](https://github.com/Comfy-Org/ComfyUI/blob/v0.42.0/comfy/ldm/minimax/model.py) 的 `pdd_steps`/多 head 投影加载，与 [model_detection.py](https://github.com/Comfy-Org/ComfyUI/blob/v0.42.0/comfy/model_detection.py) 中按 `pdd_steps` 还原音视频 latent 维度的逻辑均已存在。model blob 为 `6e3884b71ef2fe980ce9c387a90ea032e83d64b0`，detector blob 为 `79c0e143eca5b779d5c5d2221be67e46f4c88091`。
- 修复：catalog 唯一最低值改为 0.42.0，三语描述改为插值读取它；现有 UI / enqueue / submitTask helper 自动沿用。0.39.0、0.41.9、未知版本仍拒绝；补入 0.42.0 正向断言与完整 DOM 点击旅程。
- Checks：4 文件 / 16 项 focused + typecheck 通过；完整 `verify` 在本次整合状态通过 2387 单元、91 集成、双 TS、干净构建、20 项对比度。日志 `temp/fasth3-gate-fix/verify.log`。前一个 MOSS 任务的 verify 早于本修复，未冒用为本次证据；确认其构建收尾后才运行本轮。
- 真实 Electron/UI/IPC：`temp/create-smoke-QVZnBI/omni-gate-report.json`。使用真实所选核心的离线版本证据 0.42.0 和明确标识为非权重的微型文件存在性夹具，不改用户模型。键盘选 Omni → 输入 → 缺 Slot 阻塞 → AppApi 准备自有有效 PNG 参考并刷新 → 按钮恢复 → 实际鼠标点击 → waiting task `c519128f-e175-426e-bc6d-0ba6ec5c88d8`；8 步/24FPS/队列停止。夹具不验证权重加载和 GPU 输出；全程未启动生成。
- Cleanup：`temp/create-smoke-QVZnBI/cleanup.json` 成功；ComfyUI 始终 stopped，关闭本次隔离 Electron。用户原应用未停止/重启/改状态，因此需要用户重启 Studio 才能加载新的 renderer 和主进程版本门槛。
- 影响：patch；已写 Unreleased，同步当前契约与依赖说明，无版本 bump/打包/发布。

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
