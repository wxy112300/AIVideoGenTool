# H3 Native AV、Extend 与长视频

- Status: archived / closed（2026-09-16；用户确认 H3 Native AV/Extend 任务完成；后续长视频质量与真实 smoke 另立任务）
- Updated: 2026-09-16
- Owner: unassigned
- Route: integration / blocked-by-evidence
- Scope: 合并 Native Masked AV、Motion Context、H3 Continuum 与长视频方案的关系；不把不同 continuation 语义合成一个 provider。
- Authority: [Workflow Contract](../../../WORKFLOW_CONTRACT.md)、[H3 high-resolution task](../../../tasks/2026-09-07-h3-high-resolution/TASK.md)、[current catalog](../../../../src/core/catalog/dependencies/nodes.ts)

## Resume

- 当前应用已经有 H3 JointAV artifact、History lineage 与 H3 Continuum bridge；发布记录明确完整 GPU 视频续写仍需目标环境的最小真实任务。
- Motion Context、FL2VA boundary continuation、Continuum JointAV continuation 和 Native Masked AV 是不同路径。它们不能互相静默 fallback，也不能因共享 “Extend” 文案而共用完成状态。
- 旧 Native Masked AV 与长视频方案的设计、时间网格和安全边界已归档；它们在当时没有 Native workflow 的真实生成证据，不能由目录名或旧 P0 记录升级为 runtime-ready。
- 2026-09-12 另一台目标电脑两次提交 Continuum 768p/14s 时，均在采样前被应用误报 `H3ContinuumLoadVideo.file` 不是 `STRING`。第一次修复只覆盖旧式“字符串选项数组”编码；固定的 Continuum V3 节点实际声明 `io.Combo.Input(upload=video)`，ComfyUI 0.35 会在 `/object_info` 中使用 `["COMBO", { options: ... }]`。运行时契约现已按输入 socket 的真实 `COMBO` 类型校验，同时兼容旧编码，且保留非 Combo 类型的 fail-closed 检查。该记录只证明提交前误拦截，不证明完整 GPU 续写已通过。
- 2026-09-12 Continuum 首次真实进入图执行后，应用进度在采样开始前跳到 80% 以上且没有正确 Step。根因是源 JointAV 为提取边界帧而执行的前置 `VAEDecode` 被通用映射当成最终输出解码，随后单调进度保护阻止回退；同时 `H3ContinuumSamplerV38` 未登记为 step-tracked sampler。当前进度上下文会从实际 API 图识别 source-state/source-decode/source-frame/sampler/assembly 角色，前置解码保持在 5%–14%，Sampler 使用 14%–80% 并上报 Step，最终 VAE/拼接/保存仍位于尾段。
- 2026-09-16 固定 Continuum 3.8.2 后复核源码确认：原生 V3 引擎和 runtime coordinator 一直支持 `initial_state`，但公开 V3.8 Production facade 未把它转发到内部 advanced 字典。旧内置图因此没有使用已有 bridge，反而把同一来源同时解码为 `first_frame` 并上传为 Video Guide，形成重复像素条件。当前改为应用薄 facade 在 Production 与 V3 engine 之间只注入 `initial_state`，其余 V3.8 resolution、Standard masked AV、diagnostics、review 与 storage 路径保持上游实现；内置图恢复 `JointAV -> capture_state -> V3.8 initial_state`，不再重复连接 First Image/Video Guide。静态契约、Python MRO/schema probe 与单元测试已通过；ComfyUI 未运行，真实 GPU 接缝质量仍待 smoke。
- 同日首次真实 `/object_info` 暴露 0.3.1 模块定位缺陷：Continuum 包已加载时，根 `nodes.py` 与内部 `v3/nodes.py` 同名，旧发现逻辑误返回根模块。0.3.2 改为核对完整相对路径尾部；在先加载官方 Continuum 根包、再加载应用节点的同构探针中，已解析到实际 `v3/nodes.py`，`initial_state` schema 与注入 MRO 均通过。
- 同日 10 秒来源视频的真实 Extend 输出在约 10.16 秒边界出现显著运动跳变；逐帧检查确认来源段完整保留，接缝相邻帧 MAD 约为边界前中位数的 5.99 倍。根因不是画面内容或 Spectrum：V3.8 的 `H3ContinuumAssembleSeamV35` 已移除 22 帧保护前缀，应用最终拼接却再次从生成结果跳过 `22 / 24` 秒，恰好删掉用于平滑接续的近一秒。最终拼接现对 Continuum（含 V3.8）从节点组装输出的 0 秒开始；普通 overlap Extend 与 FL2VA 的既有裁切规则不变。静态与回归测试已通过，仍需用相同运动素材做一次真实 GPU 接缝复测。
- 随后的三次 14 秒真实 V3.8 Continuum（两次 480p、一次 768p）均选中保存 latent，serializer 实际产出了 safetensors，completion 也返回节点 19；但 History 标为 `save-failed: video tensor 的时间 shape 必须为 102`，没有提交相邻 manifest。payload 的实际 shape 为 `video=[1,24,107,H/16,W/16]`、`audio=[1,32,2,603]`，证明 sampler 原始 latent 包含 22 帧保护前缀，共 362 帧；旧应用却按不含前缀的 345 帧构造元数据。V3.8 采样预算与 artifact frameCount 现统一按“可见时长 + 22 帧前缀”的 H3 网格计算，14 秒为 362 帧，同时最大可选时长会遵守真实 362 帧预算。合成 payload 的 manifest commit 回归已通过；现存三份 orphan payload 已通过生产 commit 链重新校验 header/shape、流式计算 SHA-256、原子写入 manifest，并把对应 History 状态恢复为 `available`。恢复前状态备份保留在应用 userData 目录。

## Next

1. 接手者先核对是否已有新的 Continuum/Native AV 运行报告；有则复用，不重复下载或调查同一资产。
2. 若要继续 Native Masked AV，先固定当前 ComfyUI/core revision、节点 schema、mask 几何、音频时间网格和最小 smoke，再单独决定是否接入产品 queue。
3. Continuum 下一步在已安装 3.8.2 且重启应用后，用同一 History JointAV 和相同运动素材做一个有界片段 smoke，重点确认最终拼接不再二次裁掉节点已组装的接缝，并记录 A/V 同步、恢复、取消、合并和残留清理；未完成前不开放自动长批次。

## Evidence

- [P0 baseline](evidence/H3_P0_EVIDENCE_BASELINE.md)
- [Long-video P0 evidence](evidence/H3_LONG_VIDEO_P0_EVIDENCE.md)
- [H3 1080p/1440p research](../../../research/h3/2026.9.2-h3-1080-1440-integration-research.md)
- [Archived Native Masked AV plan](../H3_NATIVE_MASKED_AV_LONG_VIDEO_PLAN.md)
- [Archived long-video plan](../LONG_VIDEO_CAPABILITY_ENHANCEMENT_PLAN.md)

## Stop conditions

- Native Masked AV 没有当前 schema/真实输出证据时，保持 needs-review，不宣称产品化。
- 只证明 artifact bridge 或 /object_info 时，不宣称完整长视频 runtime-ready。
- 任何路径发生 A/V 不同步、artifact lineage 丢失、取消后残留或跨 provider fallback 时，停在当前片段。
