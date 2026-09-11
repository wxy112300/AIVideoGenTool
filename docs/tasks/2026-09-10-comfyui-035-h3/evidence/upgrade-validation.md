# ComfyUI 0.35.0 / H3 执行验证

- 日期：2026-09-11
- 任务：[TASK](../TASK.md)
- 计划：[PLAN](../PLAN.md)
- 结论级别：代码与静态/构建验证完成；ComfyUI 0.35 schema、CUDA/Sage kernel 导入及低分辨率底层 H3 smoke 已验证，精确的 Kitchen + SOL + dynamic VRAM + async offload 组合在 Spectrum-on 1/2 步探针中通过；应用自有启动链、完整 20 步应用队列成片、PDD 和质量评估仍未完成。

## Baseline

| 项目 | 结果 | 级别 |
| --- | --- | --- |
| Git 起点 | `fa75dfb` | source |
| 应用版本 | `0.60.0` | source |
| 选定 ComfyUI | `v0.35.0-6-ga7b1d39d`，本机安装目录工作区干净 | source/static |
| Python / Torch | Python `3.12.11`；Torch `2.10.0+cu130`；torchvision `0.25.0+cu130`；torchaudio `2.10.0+cu130` | static package metadata |
| H3 acceleration packages | SageAttention `2.2.0+cu130torch2.10`；Triton Windows `3.6.0.post26`；Comfy Kitchen `0.2.33`；Comfy AIMDO `0.5.3` | static package metadata |
| ComfyUI endpoint | 隔离 smoke harness 在 `http://127.0.0.1:8188` 启动成功；应用自有启动链的 full/custom-node 初始化在 180s 内未监听 | runtime partial / app launcher blocked |
| `/object_info` / `/system_stats` | 返回实时 schema/stats；ComfyUI `0.35.0`、RTX 4090、Torch `2.10.0+cu130`；所需 H3、VAE、Sage/KJ、采样、视频/音频保存节点均注册 | runtime/schema pass |
| GPU/CUDA kernel/生成 | `cudaMallocAsync` 启用；Sage kernel 实际进入 `sageattn_qk_int8_pv_fp16_cuda`；精确 Kitchen + SOL + dynamic VRAM + async offload 图在禁用 Comfy compiler 的 1/2 步探针中均成功，2 步输出可由 ffprobe 读取；另有 compiler auto 的 20 步冷启动探针被安全中止 | runtime partial; no OOM |

## Runtime smoke（2026-09-11，隔离状态）

本轮按用户授权启动了隔离 Electron 与 ComfyUI，不改用户生产状态；只使用已有 H3 权重和一张本机输入图。测试图为 `864x480`，并将采样步数限制为 1/2 步；没有运行大分辨率、长时长片段或并行 GPU 任务。

| 检查 | 结果 | 证据与边界 |
| --- | --- | --- |
| ComfyUI 0.35 初始化 | pass | `/system_stats` 返回 `comfyui_version=0.35.0`，设备为 RTX 4090；包版本包含 Comfy Kitchen `0.2.33`、Comfy AIMDO `0.5.3`、frontend `1.51.10`。 |
| H3 API schema | pass | `/object_info` 注册 `UNETLoader`、`CLIPLoader`、`VAELoader`、`MiniMaxH3ImageToVideo`、`KSamplerSelect`、`BasicScheduler`、`RandomNoise`、`BasicGuider`、`SamplerCustomAdvanced`、`PathchSageAttentionKJ`、`VRAM_Debug`、`VAEDecode`、`VAEDecodeAudio`、`CreateVideo`、`SaveVideo`；模型列表指向本机 FL2VA/Ref2VA、Qwen3-VL、INT8 ConvRot VAE 文件。 |
| 应用入队/策略快照 | pass | 通过当前 `window.studio.enqueue` 建立低分辨率 FL2VA 任务，快照保留 `sage`、`compatibility`、`compiler=auto`、`int8-convrot`、preview off；随后 `startQueue` 正确识别外部服务非应用自有并进入本地接管路径，任务最终按测试边界取消。 |
| 应用自有启动 | blocked | `startLocalService` 在 `starting` 阶段超时 180s；full custom-node 与 `--disable-all-custom-nodes` 启动均在 server 监听前停留于 builtin/custom-node 初始化。该次没有 OOM 迹象，相关测试 Python 子进程已按精确 PID 停止。 |
| app-rendered 图底层提交 | partial pass | 复用 `src/core/workflow.js` 渲染 `workflows/minimax_h3_i2v_api.json`，图为 `864x480`、5 帧，并接入 SageAttention patch。标准 20-step prompt `1ddebbcb-d26d-4a9f-9441-173c9d2f275d` 返回 HTTP 200 且 `node_errors={}`，但在模型初始化阶段未在有界窗口完成，随后停止。 |
| Spectrum replay 进度/单遍修复 | pass | 应用生成图已写入 `offline_smoothing_replay=false`；手工 replay 图仍可运行，原始双遍进度会按 `2 × outer steps` 归一化，因此第一遍不会再伪装成整项任务的 `20/20`。 |
| Kitchen + SOL + native smoke | pass（1/2 步） | 图中实际为 `ModelAttentionBackend → BlockSparseAttention(selection="sol-attn", selection.tau=1.3) → SpectrumApplyMiniMaxH3(offline_smoothing_replay=false)`。1 步 prompt `8c19ba63-2d3c-4a04-93db-92cddc095861` 与 2 步 prompt `84f3261e-365a-4e4d-85f6-b49ee319d759` 均返回成功；2 步日志为 `single_pass`、`actual_steps=2`、`forecast_steps=0`、`offline_replay_steps=0`、`fallbacks=0`，输出 `h3-kitchen-sol-native-2step_00001_.mp4` 的时长/大小为 `2.333333s / 524058 bytes`。 |
| native + async + compiler auto | bounded failure | 20 步 prompt `e48047e0-db19-448c-9c72-483d6bfbb1ce` 在 H3 首次 actual forward 后长期没有进入下一步；不是 CUDA OOM，但显存约 `23.5/24.564 GiB`、进程私有内存约 `61.8 GiB`，已在有界窗口内中止。当前 4090 的安全短测证明采用 `--disable-comfy-compiler` 后可完成，但不把 compiler auto 的完整 20 步声明为稳定。 |
| 显存安全 | pass（短测范围） | native smoke 使用 `--cache-none --reserve-vram 0.5 --enable-dynamic-vram --async-offload 2 --disable-comfy-compiler`，设备为 `cudaMallocAsync`；2 步 VRAM_Debug 的最大占用约 `21.4/23.98 GiB`，未发生 CUDA OOM。测试停止后 GPU 回落至约 `1.66 GiB`；该结果不代表任意分辨率/时长均安全。 |
| 资源清理 | pass | 8188 与本轮测试进程均已释放，GPU 已空闲；临时 smoke 输出保留在系统 Temp 供本记录核验，没有删除用户模型、主 ComfyUI 数据库或用户输出。 |

本轮计为“schema + graph submission + exact low-resolution service smoke”证据；不能写成应用队列端到端 20 步成片通过。PDD 两个 LoRA 没有 runtime 结果，因为本机缺少对应 pruned PDD 权重；没有下载或安装外部资产。

## Implemented behavior

- 核心兼容推荐统一为 `0.35.0`；旧工作流最低版本没有被整体替换。
- H3 新任务使用单一 execution policy snapshot：dense `sage` / `sage-triton` / `pytorch` / `comfy-kitchen`、sparse `auto` / `off` / `sol-attn` / native `sla` / fail-closed `vsa`、runtime `compatibility` / `native`、compiler `auto` / `disabled`、Spectrum 和 preview。
- `ModelAttentionBackend` 使用 0.35 API 值 `pytorch attention` / `comfy kitchen attention`；`BlockSparseAttention` 使用 DynamicCombo `sol-attn` / `sla` / `vsa` schema。claim-time 会根据实时 `/object_info` 检查节点、输入类型、输出 MODEL、DynamicCombo 选项和 sink conditioning。
- H3 Memory/H3-Optimizations 旧路线已撤回：活动 catalog、扫描、批量安装、设置和 workflow metadata 不再使用；旧字段可读，兼容适配只移除旧节点，不会重新注入。
- 新队列任务保存 H3 execution policy snapshot；等待中的 H3 任务会在保存 dense/sparse attention、runtime 或 compiler 设置后刷新该策略，与入队时间无关；任务开始运行后保持本次执行不变。失败/取消任务在 reset 重试时刷新，History/retry 仍保留已实际执行的快照，旧记录仍可读取。
- PDD FL2VA/Ref2VA 使用普通 `LoraLoaderModelOnly`，固定 8 steps、Euler、Simple、video shift 12、audio shift 3、CFG 1.0，并仅接受与 pruned INT8 ConvRot 基座匹配的 pruned 文件。没有添加新最终 VAE。
- Spectrum 仍为本轮新增 H3 比较的必要路径；Motion Context 的 Spectrum-off guard 没有被改写。
- 应用生成图默认关闭高内存 `offline_smoothing_replay`；这修复了旧图第一遍显示 `20/20` 后进入 replay 重载而无进度的问题。手工 replay 图保留兼容支持，并使用双遍进度。

## PDD asset evidence

来源提交：[Kijai/MiniMax-H3-experimental `f94b1bcc9442e531b73e0ee819ddfc3656072648`](https://huggingface.co/Kijai/MiniMax-H3-experimental/commit/f94b1bcc9442e531b73e0ee819ddfc3656072648)。应用 catalog 固定使用 pruned pair：

| Catalog ID | Filename | Bytes | SHA256 | Base |
| --- | --- | ---: | --- | --- |
| `h3-pdd-fl2va-8step` | `MiniMax-H3-FL2VA-Acc-8Step_pruned_comfy.safetensors` | `1725921392` | `e97b813a6f857b9dab310f31ec30a8334f63a3e7dcb5d07c0c91933d3447a897` | `minimax_h3_fl2va_pruned_int8_convrot.safetensors` |
| `h3-pdd-ref2va-8step` | `MiniMax-H3-Ref2VA-Acc-8Step_pruned_comfy.safetensors` | `1725921392` | `6f18e1c2eccb14b37322607730f26b16bf1169b56cd098ea006cffaec43d1e39` | `minimax_h3_ref2va_pruned_int8_convrot.safetensors` |

The same pinned source also publishes the non-pruned FL2VA/Ref2VA pair; they are intentionally not accepted for the app's pruned bases. Files are user-managed and were not downloaded by this task. The native loader/recipe reference is [ComfyUI-MiniMax-H3-PDD-Acc](https://github.com/Jalen-Brunson/ComfyUI-MiniMax-H3-PDD-Acc/blob/main/README.md).

## Checks

| Command | Result |
| --- | --- |
| `npm.cmd test -- --run tests/h3-memory-policy.test.ts tests/h3-memory-workflow.test.ts tests/h3-execution-policy.test.ts tests/workflow.test.ts` | 4 files, 89 tests passed |
| `npm.cmd test -- --run tests/video-loras.test.ts tests/model-catalog.test.ts` | 2 files, 38 tests passed |
| `npm.cmd test -- --run tests/workflow.test.ts tests/video-loras.test.ts tests/model-catalog.test.ts tests/workflow-metadata.test.ts tests/comfy-compatibility.test.ts tests/environment.test.ts` | 6 files, 200 tests passed |
| `npm.cmd test -- --run tests/dependency-catalog.test.ts tests/dependency-scanner.test.ts tests/dependency-installer.test.ts tests/node-install-queue.test.ts tests/settings-accessibility.test.ts tests/comfy-log-bridge.test.ts` | 6 files, 94 tests passed |
| `npm.cmd test -- --run tests/comfy-runtime-service.test.ts tests/h3-workflow-contract.test.ts tests/video-policy.test.ts tests/h3-execution-policy.test.ts tests/h3-memory-policy.test.ts tests/h3-memory-workflow.test.ts tests/workflow.test.ts tests/video-loras.test.ts tests/model-catalog.test.ts` | 9 files, 149 tests passed |
| `npm.cmd run typecheck` | passed |
| `npm.cmd run build` | passed; Vite 2308 modules transformed; Electron output contains native H3 policy/patch modules |
| `npm.cmd run test -- tests/store.test.ts tests/draft-settings-services.test.ts tests/queue-controls.test.ts` | passed; 3 test files, 63 tests |
| `npm.cmd run verify` | passed; 173 test files, 1455 tests, production build, and 20 UI contrast pairs |
| `git diff --check` | passed |

The final `npm.cmd run verify` is the authoritative whole-tree check and passed after the replay-progress fix, test, and documentation edits.

## Remaining runtime work

应用自有 ComfyUI 启动链仍需解决 builtin/custom-node 初始化阶段的超时，并在应用队列入口完成一次最终文件闭环；随后才有意义地做完整 20 步、普通 H3、旧 queue/history retry、PDD（补齐 matching pruned 权重后）和质量记录。当前 4090 的可用短测组合是 native + Kitchen + SOL + Spectrum-on + `--disable-comfy-compiler`，每次仍只运行一个 GPU 阶段，显存接近 24 GB 即停止；保持 Motion Context 的 Spectrum-off 已知边界，不重启远程 endpoint。
