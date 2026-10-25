# FastH3 Omni 独立 H3 模型接入

- Status: validating（官方 VSA 接线、真实 UI/GPU/History 已验证；768p/15 秒同参数性能 A/B 未做）
- Updated / Owner: 2026-10-24 / 当前任务
- Scope / Authority: 用户要求新增为独立 H3 模型，套用既有逻辑；不下载权重、不替换旧模型或运行时。
- Execution: direct；无子 agent。

## Resume

- 新增 INT8 ConvRot FastH3 Omni，复用 H3 R2V 图片/视频参考、视频音轨、Prompt、队列、History 与设置扫描。
- 固定 8 步 Euler / Simple、guidance 1、video/audio shift 12/3，使用官方 VSA10 + Comfy Kitchen dense fallback；保留旧 H3 模型、ID 和工作流。
- 当前正确最低线为 ComfyUI v0.42.0：已核对官方该标签的 detector 及 MiniMaxH3 实现均支持完整 checkpoint 的 `pdd_steps`。先前仅检查 v0.42.1 就设为最低线，导致误挡已有能力的 v0.42.0；2026-10-22 已修正。仓库旧推荐 v0.39.2 的 PDD LoRA 支持仍不等于完整 checkpoint 支持。
- 首版沿用现有参考槽位，不扩展独立音频输入；不开放未经验证的 Extend、Spectrum、其他稀疏 attention、旧加速 LoRA 组合。
- 已完成：独立 catalog/三语模型说明、固定权重下载/哈希指引、专用 R2V 图、8 步 PDD 采样、模型切换、Prompt/queue/AV/History 复用，以及创建/入队/执行前的核心版本门槛。2026-10-24 修正最初错误关闭 VSA 的策略；Omni 单独解析为 VSA10，不改变全局设置和旧 H3 行为；切回 Base 恢复标准步数。
- 已完成：其输出进入继续创作时回到普通受支持的 H3 R2V 续写模型，保留 source asset/version 身份，不误用 Omni checkpoint 做续写。
- 推荐核心保持用户指定的 0.42.3；本次修正仅改变 Omni 最低线（0.42.0）、相关说明和回归，不改变旧工作流最低线或本机安装。
- 当前安装身份已核对：所选源码自报 0.42.0，HEAD `40dcb30a96fc345f54632c56af81a4a320c2fc1e`，describe 为 `v0.42.0-15-g40dcb30a9`。本机 origin 为 GitCode 镜像，另外用官方 GitHub v0.42.0 标签核对 detector / model，不仅依赖镜像标签或版本名。
- 下一步：用户重启 Studio 加载本次构建、重新扫描；后续做 768p/15 秒同参数 A/B，再扩展视频参考、音轨与重启/取消。480p/5秒/8步真实成片、播放和 VSA producer 已通过；不将该小样外推成用户原参数的提速倍数。

## 2026-10-24 官方工作流与输入比例遗漏

- 用户实测 768p/15 秒约 15 分钟，与其他 H3 相同；“跟随输入”仍输出横屏。该报告不是可接受的性能验收，之前的文件/入队成功不能代替运行验证。
- [Comfy 官方 OmniRef 模板](https://github.com/Comfy-Org/workflow_templates/blob/1524172f454aff9c87b7e5ebc143af95542bf8f0/templates/video_fasth3_ominiref_r2v.json) 已明确要求 VSA10；最初把“尚未验证”实现成永远 dense 是接入遗漏。参数为 `selection=vsa`、`keep_percent=10`、`start/end=0/1`、`min_tokens=12288`、`extra_tokens=256`（核心在 VSA 下忽略它）、`sink_conditioning=exact_kv_and_rows`，dense fallback 是 Comfy Kitchen。不是必须另接 FastVideo 服务才有此能力。
- 修复独立执行策略、bundled graph、catalog 必需节点、旧 Omni task 的 graph 归一化与重复/冲突检查。只此权重启用 VSA，其他 H3 的 VSA 门槛、全局设置、Spectrum/LoRA 边界保持；verbose 记录 producer 是否实际使用稀疏路径，不能仅凭节点存在宣称生效。
- 比例根因：R2V 预览/入队读取图片尺寸后仅写入参考槽，而 source 比例计算读取通用 sourceWidth/Height；无值回落 16:9。现在 Picture 1 尺寸参与草稿归一化、不可变任务与最终图宽高。显式比例仍优先，Motion Context 使用源视频；不重写已完成媒体或 History。
- 检查：最终 7 文件 / 55 项 focused 与类型检查通过。第一轮默认并发使两个无关 Python/安装探针 5 秒超时，限制为 4 workers 后完整门禁通过 2527 单元、91 集成、类型/生产构建、740 对比度（`temp/fasth3-gate-fix/verify-vsa-ratio-retry.log`）。随后补入 Motion Context 的 source 比例保护，整库复查碰到同时进行的 UI M9 样式断言失败（`tests/ux-ui-tokens.test.ts`，`verify-vsa-ratio-final.log`），没有修改该任务的文件/断言；55 项 final focused 已含该保护。不能把前一轮完整门禁当成最终整库状态全绿。
- 真实文件与运行身份：现有权重文件头含 150 个 gate tensor；所选 core HEAD 仍为 `40dcb30a96fc345f54632c56af81a4a320c2fc1e`，Python 为 PyTorch 2.10.0+cu130 / comfy-kitchen 0.2.39，RTX 4090 sparse kernel 探针可用。未下载/替换模型或升级 core/Python。
- 真实 GPU：`temp/create-smoke-RXfbvY`，任务 `ec604004-a5d0-4011-831b-b73809bb0455`。AppApi 启动自有 8318 runtime，提交图为 480×864/124帧/8步，原生日志确认 `sparse producer path: 15722 tokens, VSA tiles (18752 padded rows, 13 prefix tiles)`。队列报告总计 66 秒（含加载/编码/采样/解码/写出），不是旧 dense 路径的同参数 A/B。
- UI / History：`temp/fasth3-vsa-ratio/ui-768-gate.json` 对 768p/15秒选择验证缺 Slot 可见阻塞→补齐竖图→显示768×1376→实际鼠标入队→task `aad9f56e-bdbf-4472-8321-a6324b818994`；该 waiting task 随后仅从自有 fixture 移除，未执行第二次生成。`history.json` 验真实480×864成片的解码帧推进与返回；ffprobe/ffmpeg 完整解码通过，124帧/24FPS、5.167秒、32kHz双声道AAC。
- Cleanup：队列结束后按应用既有 queue-stop 生命周期终止自有 ComfyUI 树，日志中的退出码1伴随成功的 ForceStop/ProcessTerminated 记录，不视为生成崩溃。随后 `close-fixture-smoke` 关闭自有 Electron，确认 26748/67648/11564 和 7807/8318 已退出。其余任务的 Electron/端口未操作。原始媒体、状态和日志留忽略目录，不提交。

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
