# Konohamaru DLSS5 节点接入
- Status: needs-review
- Updated / Owner: 2026-09-10 / current agent
- Scope / Authority: 接入 `Konohamaru04/ComfyUI-NVIDIA-DLSS-Frame-Interpolation` 作为新的可选 DLSS5 upscale provider，复用现有 upscale 面板；支持视频超分/Neural Rendering 与 DLSSG 补帧串联。旧 HECer/AetherScale 保持归档兼容，不重新启用。
- Baseline: `79c1d6c`；工作树已有 harness 文档和环境扫描的未提交改动，均不属于本任务；上游固定 revision `c755e274a405a7a47667bd567d489b6845066bcf`
- Execution: direct（默认）

## Resume
- 已确认 / 决定：上游提供 `NvidiaDLSSVideoUpscale`、`NvidiaDLSSFrameInterpolation`、`NvidiaDLSSImageUpscale`；视频 upscale 暴露 1x/1.5x/1.724x/2x/3x 和 NR style/intensity 等参数。官方 README 给出先 upscale 再 interpolation 到 120 FPS 的组合案例，因此产品链路采用 `LoadVideo → VideoUpscale(NR) → FrameInterpolation(可选) → SaveVideo`。
- 已完成：catalog/provider ID、Git LFS 安装与 pointer/缺失文件 fail-closed 校验、workflow adapter、队列/历史不可变快照、执行前 `/object_info` schema/runtime 复检、进度阶段、现有 upscale 面板控件、三语 locale、JS 镜像和 focused regression tests；本轮已从活动 Upscale 弹窗移除旧 DLSS5/AetherScale 选项，保留底层历史执行兼容，并将 Konohamaru 的 NR 风格、强度和补帧控件调整为独立整行的响应式布局；同时兼容 ComfyUI 新旧两种 Combo `object_info` 编码，避免新版 `COMBO` schema 被误报为枚举非法。
- 已完成真实 smoke：在隔离的 ComfyUI 0.34.0 / RTX 4090 / driver 616.56 上，以当前应用 graph builder 生成 API workflow 并直接提交到本机 ComfyUI；schema 校验、节点执行和队列链路均通过。原始 864×480、3×、60 FPS 补帧、Require Neural=true 的任务稳定在 VideoUpscale 节点返回预期错误；1.5×/1.724×/2×/3× 四种倍率及 1280×736→1920×1104 的较高分辨率 1.5× 对照也得到相同结果。
- 下一步：若目标是“4090 上 direct DLSS5 Neural Upscaling”，需要替换/修复上游 runtime 或找到明确支持该契约的 runtime build；本仓库不应把 Require Neural 关闭作为成功修复。补帧节点尚未在本次失败链路中执行，因为上游 upscale 阶段已先失败。
- 阻塞 / 解锁条件 / 不要重复：当前阻塞点不是 schema 或 workflow，而是 runtime 对低分辨率 NR contract 的拒绝。上游当前文档也记录 direct NR 返回 `0xBAD00005`、native-resolution fallback 成功；只有日志出现 `nr_upscaling_active=true` / `[upscaling]` 证据时才可宣称 direct Neural Upscaling。运行时 DLL 不提交本仓库。

## Implementation and resources
- 修改范围 / 保留行为：新增明确的 `dlss5-konohamaru` model/provider ID、Konohamaru-specific immutable options 和 graph builder；安装指引使用 Git LFS 并拒绝 LFS pointer/缺失运行时；活动 UI 仅提供当前 Konohamaru 和其他未归档 provider，旧 provider 仍保留底层 history/queue 执行兼容；默认严格失败，不静默回退到普通 resize。
- 必要步骤：1) catalog/runtime manifest；2) installer/scanner readiness；3) core graph/geometry/options；4) queue/enqueue/execution progress；5) renderer panel/state/locales；6) focused tests、typecheck、verify；7) 若本机 ComfyUI 和显卡资源可协调，再执行最小真实 smoke。
- 文件、build/GPU/服务归属和释放：代码与测试属于本任务；不下载第三方运行时到仓库，不启动/终止其他 ComfyUI 或 GPU 进程；真实 smoke 若执行，记录现有实例、输入、显存和输出并清理临时媒体。
- 验收：静态目录和 Git LFS 缺失文件可诊断；运行 `/object_info` 缺节点/关键输入时提交前失败；无补帧时生成超分视频，有补帧时按 `upscale → interpolation` 生成；队列/历史保留所有执行选项；面板不暴露上游不支持的控件。

## Evidence / handoff
- 关键结论及来源/版本/证据路径：
  - [upstream README at pinned revision](https://raw.githubusercontent.com/Konohamaru04/ComfyUI-NVIDIA-DLSS-Frame-Interpolation/c755e274a405a7a47667bd567d489b6845066bcf/README.md)：组合案例、视频 upscale modes、NR controls、补帧 FPS 与 fallback 报告字段。
  - [upstream `__init__.py` at pinned revision](https://raw.githubusercontent.com/Konohamaru04/ComfyUI-NVIDIA-DLSS-Frame-Interpolation/c755e274a405a7a47667bd567d489b6845066bcf/__init__.py)：实际 ComfyUI node schema 和输入枚举。
  - [upstream runtime at pinned revision](https://raw.githubusercontent.com/Konohamaru04/ComfyUI-NVIDIA-DLSS-Frame-Interpolation/c755e274a405a7a47667bd567d489b6845066bcf/dlss_engine/core/runtime.py)：执行前 runtime 文件复检、feature-18/NR 状态。
  - [upstream `.gitattributes` at pinned revision](https://github.com/Konohamaru04/ComfyUI-NVIDIA-DLSS-Frame-Interpolation/blob/c755e274a405a7a47667bd567d489b6845066bcf/.gitattributes)：DLL/EXE/addon 由 Git LFS 管理。
- 实际命令、结果、对应文件状态：`npm.cmd run typecheck` 已通过；Konohamaru focused tests 已通过（7/7，含新版 `COMBO` schema 回归）；完整 `npm.cmd run verify` 已通过（168 files / 1387 tests、production build、Electron typecheck、contrast 20 pairs）。真实 smoke 的原始任务返回 `NVIDIA completed the frame processing but reported neural upscaling inactive`；关闭 Require Neural 的对照生成了 2592×1440、24 FPS、243 帧文件，但 ReShade/runtime 证据为 `feature 18 evaluate failed with 0xbad00005`、`NR upscaling fell back to native`，不能算 direct DLSS5 upscale。
- 可复用检查 / 必须补的验证：保留 graph/schema/queue/catalog/installer 的静态边界；真实 smoke 需要本机目标 ComfyUI 已安装节点、Git LFS 已 hydration、可用 runtime 和可协调的 RTX 环境。
- 未运行项、限制、清理：未在本次失败链路中单独验证 Frame Interpolation，因为 upscale 先失败；已停止隔离 ComfyUI 8189，清理本次创建的测试输入副本和 fallback 输出，保留原始源视频不变。当前 4090 direct Neural Upscaling 仍无成功证据；output-resolution native NR 与 direct low-resolution NR 必须区分。
- 实际模型/effort；可见usage与耗时（unknown如不可得）：unknown。
- 版本影响 / Unreleased：minor（新增可选 provider）；本轮已递增 LVS 至 `0.60.0`，并把实现记录移入对应版本条目。

## 深度调查 / 2026-09-10

### 结论

当前失败不是“4090 不支持 DLSS5”，也不是 schema、workflow 或显存不足。真正的差异是 Neural Rendering 的调用契约和阶段顺序：本地 Konohamaru/RenoDX 路径把 `864×480` 的低分辨率 color 作为输入，同时要求 feature 18 直接产出 `1296×720`/`2592×1440` 的高分辨率 NR；本地签名 DLSSNR runtime 对这个低分辨率 upscaling contract 返回 `0xBAD00005`，carrier 随后保留 DLSS 输出或退回 native NR。关闭 `Require Neural Upscaling` 只会接受这个 fallback，因此“生成了大尺寸文件”不能算 direct DLSS5 Neural Upscaling。

本机隔离 A/B 已验证漏掉的是另一条可行路径，而不是单纯换 DLL：保留相同的 RTX 4090、driver 616.56、ComfyUI video worker、`nvngx_dlssnr.dll` 和 DLSS SR runtime，仅加入官方 `neural-upstream v0.3.0` add-on 后，feature 18 在 render resolution `864×480` 成功执行，再由 DLSS SR 输出 `1296×720`。隔离日志包含 `SNIPPET CreateFeature(18, 864x480) -> 0x00000001` 与 `codec=1 ran=1 rebound colour`；这是真正的 NR 执行证据，且没有修改现有安装。

因此，4060 的“成功”不能直接反推我们的 direct upscale 路径应该成功：它可能是 native fallback、不同的 driver/runtime/add-on 组合，或者是 `neural-upstream`/Pre-SR 这种“先在 render resolution 做 NR，再交给 DLSS 放大”的路径。4090 属于同一代 Ada 路线并不是当前错误的充分解释。

### 本地对照

| 路径 | feature 18 contract | 本机结果 | 能否称为 direct Neural Upscaling |
| --- | --- | --- | --- |
| 现有 Konohamaru + RenoDX | 低分辨率 color → 高分辨率 NR | `0xBAD00005`，strict 模式失败；放宽后 native fallback | 否 |
| `neural-upstream v0.3.0` + 同一 worker/runtime | render resolution NR → DLSS SR 放大 | `CreateFeature(18)` 成功，`ran=1 rebound colour`，`864×480 → 1296×720` | 否；但是真实 Neural enhancement + DLSS upscale |
| 关闭 Require Neural | 允许 carrier 接受 native 路径 | 能出文件，但画面接近原图 | 否 |

本地 direct 路径的 ReShade 日志还显示 feature 18 资源创建成功并不等于执行成功：后续 evaluate 仍返回 `0xBAD00005`，随后明确记录 `NR upscaling fell back to native`。这正是此前“速度很快但画质很差”的原因。

### 社区核查（截至 2026-09-10）

- [Konohamaru README](https://github.com/Konohamaru04/ComfyUI-NVIDIA-DLSS-Frame-Interpolation#readme) 的 RTX 4060 Ti 验证只证明节点加载、尺寸变化和队列链路；同一 README 的测试结果明确写出 `nr_native_fallback: true`、`nr_upscaling_active: false`，并特别提醒输出尺寸变大不能证明 Neural SR 已经运行。因此它和我们的失败并不矛盾，反而说明当前节点自己的 4060 “成功”样本不能作为画质成功证据。
- [Merserk v5/v6/v7 release history](https://github.com/Merserk/dlss5-visual-enhancer/releases) 确实在持续变化：v5 放宽了旧 allowlist，v6 引入按 Turing/Ada/Blackwell 选择的架构 runtime，v7 又改成 universal runtime 并加入 VSR/HDR/更灵活的缩放。可是 [v6/v7 的公开 issue](https://github.com/Merserk/dlss5-visual-enhancer/issues/24) 仍记录 616.64、RenoDX 4.7、DLSSNR 310.8.0 组合的 feature 18 崩溃/需要手动架构选择；所以新 release 值得单独隔离测试，但目前没有证据能保证 40 系 direct NR upscaling。
- 最接近本机成功条件的是 [NIGos bridge 的 RTX 4090 报告](https://github.com/NIGos/dlss5-bridge/issues/26) 和 [neural-upstream 的对应 issue](https://github.com/matiasLombo/neural-upstream/issues/1)：4090/616.64 上 CORE 路径返回 `0xBAD0000B`，改走 signed snippet 后 feature 18 每帧执行；NR 在 1440p render resolution 先处理，DLSS 再放大到 4K。这与本机隔离 A/B 的结果一致，说明 Ada/4090 可以跑 feature 18，关键在调用路径。
- [neural-upstream v0.3.0](https://github.com/matiasLombo/neural-upstream/releases/tag/v0.3.0) 的设计就是把 NR 从通常的 DLSS 后置阶段移到 render resolution，再把增强后的 color 交给游戏的 DLSS。它不声称自己完成 direct NR upscale，但能同时实现真实 Neural enhancement 和 DLSS SR；这正是当前 Comfy worker 最有价值的候选阶段顺序。
- [HECer/ComfyUI-DLSS5](https://github.com/HECer/ComfyUI-DLSS5#readme) v0.3.1 已将 SR、当前分辨率 NR、组合模式拆开，并提供 runtime status/diagnostics；但它要求用户提供兼容的 `nvngx_dlssnr.dll`，没有公开的 RTX 4060 direct 成功证据。[lisitskyaa/ComfyUI-DLSS5-NR](https://github.com/lisitskyaa/ComfyUI-DLSS5-NR) 是更直接的 native bridge，同样要求用户自备 runtime，兼容性由 runtime 决定，且进程内 D3D12 bridge 对 ComfyUI 稳定性风险更高。
- [Blueforcer](https://github.com/Blueforcer/ComfyUI-DLSS5-Enhancer) 和 [Jadema](https://github.com/Jadema5416/ComfyUI-DLSS5-Enhancer) 的安装器仍固定拉取 Merserk 3.0 时代的包，不能视为 v6/v7 的替代验证。`DLSS5-Feeder`、`NIGos/dlss5-bridge` 和 OptiScaler 的 Pre-SR 分支主要是游戏/ReShade 工具，不是可直接放进 ComfyUI 的节点，但社区方向已经明显转向 upstream/Pre-SR，而不是强行让后置 NR 做低分辨率到高分辨率转换。
- NIGos 文档中提到的 `ngx_loader` 特别针对 driver 32.0.16.1664/1686；本机 616.56 对应 32.0.16.1656，因此不能把那个特定 loader 回退规则直接当作本机 `0xBAD00005` 的根因。真正有本地证据的是 RenoDX 后置 contract 被拒绝，以及 upstream snippet contract 成功。

### 下一步建议

1. 继续保留现有 strict guard；不要把 `Require Neural=false` 作为修复，也不要仅凭输出尺寸或 carrier 的“feature created”状态宣称 DLSS5 画质生效。
2. 视频默认采用官方 `video2dlssnr v1.3` 的明确执行路径：`DLSS SR → output-resolution temporal Neural enhancement → optional frame interpolation`；`neural-upstream v0.3.0` 保留为 image-path 兼容层，不与视频 raw-frame backend 混用。
3. 将 Merserk v7 universal runtime、HECer v0.3.1 和 lisitskyaa v0.3.0 作为后续隔离候选逐个测；它们目前只能算 runtime/架构候选，不能提前承诺解决 4090/40 系 direct NR upscale。
4. 补帧应在 upstream enhancement/upscale 链路通过后单独验证；`neural-upstream` 文档对补帧建议使用 cadence 1/Quality 路径，不能把“补帧成功”当作 NR 成功的间接证据。

本次调查只新增本节证据，没有替换用户现有 runtime、没有把第三方 DLL 放入仓库，也没有改变已接入节点的产品行为。

## 实施收口 / 2026-09-10

- 已将官方 `neural-upstream v0.3.0` 保留为 Konohamaru 的 image-path 兼容层：应用下载 `nvngx.dll.addon64` 并固定 SHA-256，先完成 Git LFS 文件检查，再安装 app-managed addon；活动 RenoDX addon 会被可恢复地改名为 `.disabled-*`，不与新 addon 混载。视频默认使用独立的官方 `video2dlssnr v1.3` runtime。
- 已把 Konohamaru 的路径、runtime verifier、视频处理器、processor report 和严格执行前 guard 通过幂等源码补丁对齐：视频转 raw-frame temporal backend，image path 继续识别 `DLSS5 NR Pre-Upscale`、feature-18 `CreateFeature` 成功和 `ran=1 rebound colour` 证据；严格模式区分真实 Neural enhancement 与 direct `nr_upscaling_active`。
- 已保留旧 `konohamaru-dlss5-<revision>` bundle ID 的队列/历史读取兼容；旧快照不会静默切换到新 runtime，旧 runtime 不在活动目录时会明确 fail closed，要求重新创建任务。
- 版本与文档：LVS `0.60.0`；README、CHANGELOG、三语 catalog/locale 已说明 video2dlssnr 执行顺序、两类 runtime 管理方式和验证边界。
- 验证：focused Konohamaru/dependency tests `82 passed`；版本变更和三语文案更新后重新执行 `npm.cmd run verify` 已通过（169 files / 1406 tests、production build、Electron typecheck、contrast 20 pairs）。

## 视频时序后端收口 / 2026-09-10

- 根因：Konohamaru/ReShade carrier 用固定 jitter 识别帧；视频 worker 对每帧提交相同 jitter 后，carrier 会重复返回首个 Neural 结果。这个问题不能靠继续替换 carrier DLL 或放宽 `Require Neural` 解决。
- 修复：视频处理器现在转发到官方 `video2dlssnr v1.3` 的 raw RGBA stdin/stdout 协议。应用固定下载 `video2dlssnr-comfyui.zip`（247402704 bytes，SHA-256 `3e872cb09471451c3e8bac8182d6599eb73745eb0ac7eb98ae059855ff103419`），只安全解压并安装 `video2dlssnr.exe`、`nvngx.dll_dlssnr.dll`、`nvngx_dlss.dll`、`nvngx_dlssnr.dll` 四个文件，不复制其内置 FFmpeg。
- 处理器用独立 feeder 连续写入完整源视频，并按输出帧精确读取 worker stdout；完成后检查 worker 的 `feature ready`/`done: … frames` 证据、输出帧数和输出尺寸，再执行原音频封装。预览帧数也会在 `nb_frames` 与“时长 × FPS”明显不一致时走 exact probe。
- 证据：本机 RTX 4090 使用同一 124 帧素材做官方 raw pipeline 时得到 124/124 帧、约 5.9 fps，首帧后的帧差持续正常；当前实际节点目录的四个 runtime 文件与已验证提取目录逐一 SHA-256 一致，runtime checker 返回空问题列表。官方仓库说明该视频协议保持输入/输出帧数一致，并建议把补帧节点接在其后。
- 限制：本轮 ComfyUI 服务当时处于离线状态，未重新提交完整 UI graph；247 MB 下载事务因网络吞吐过低主动停止，未把不完整归档安装进目标目录。目标目录使用已验证的 v1.3 提取文件，重启 ComfyUI/LVS 后仍需用短片完成一次最终端到端 smoke。

## 输出单帧修复 / 2026-09-10

- 根因：上游视频超分和补帧处理器使用 FFprobe 的 metadata `nb_frames`；部分 MP4 会返回 `1`，但仍保留完整音频/时长。处理器因此只消费第一帧，`SaveVideo` 再把该帧与原时长封装，形成“首帧铺满整段”的坏视频。
- 修复：应用管理的 Konohamaru 源码适配层在视频超分和 `frame_interpolation` 两条入口比较 `duration × FPS` 与 metadata 帧数；明显不一致时改用 `count_mode="exact"`，并记录 `frame_count_source`。旧版已应用的兼容层也会在节点更新/修复时补写该修复，补丁保持幂等。
- 验证：`npm.cmd test -- --run tests/konohamaru-runtime.test.ts tests/konohamaru-dlss5.test.ts tests/dependency-scanner.test.ts tests/comfy-ui.test.ts` 通过（84 tests）；`npm.cmd run typecheck` 通过；`npm.cmd run verify` 通过（169 files / 1419 tests、production build、Electron typecheck、contrast 20 pairs）。尚未在本轮重新占用本机 GPU 做完整视频 smoke。
- 使用：更新应用后，在“节点与依赖”对 Konohamaru 执行一次“更新/修复”（让新源码兼容层写入节点目录），然后重启 ComfyUI 再重跑短片；首帧画质需在确认输出恢复完整帧序列后重新评价。

## 提升面板 UI 收口 / 2026-09-10

- Konohamaru 的模式、风格、NR 强度和 DLSSG 补帧控件改用统一 info 提示；NR 数值固定为滑杆右侧的独立输出框，避免三列布局互相挤压；中间长说明移除，保留状态框作为运行顺序与就绪状态提示。
- 磁盘预估改为按最终输出分辨率、输出 FPS、时长和 Auto H.264 目标码率计算，并为原音频/封装预留有界余量；底部补充估算依据和实际波动说明，不再按源文件体积简单乘像素比例。
- 选项重绘现在保存并恢复 `.upscale-dialog` 的滚动位置；新增面板标记、估算和滚动回归测试。`npm.cmd run verify` 已通过（170 files / 1427 tests、production build、Electron typecheck、contrast 20 pairs）。
