# H3 Native AV、Extend 与长视频

- Status: needs-review
- Updated: 2026-09-12
- Owner: unassigned
- Route: integration / blocked-by-evidence
- Scope: 合并 Native Masked AV、Motion Context、H3 Continuum 与长视频方案的关系；不把不同 continuation 语义合成一个 provider。
- Authority: [Workflow Contract](../../WORKFLOW_CONTRACT.md)、[H3 high-resolution task](../2026-09-07-h3-high-resolution/TASK.md)、[current catalog](../../../src/core/catalog/dependencies/nodes.ts)

## Resume

- 当前应用已经有 H3 JointAV artifact、History lineage 与 H3 Continuum bridge；发布记录明确完整 GPU 视频续写仍需目标环境的最小真实任务。
- Motion Context、FL2VA boundary continuation、Continuum JointAV continuation 和 Native Masked AV 是不同路径。它们不能互相静默 fallback，也不能因共享 “Extend” 文案而共用完成状态。
- 旧 Native Masked AV 与长视频方案的设计、时间网格和安全边界已归档；它们在当时没有 Native workflow 的真实生成证据，不能由目录名或旧 P0 记录升级为 runtime-ready。
- 2026-09-12 另一台目标电脑两次提交 Continuum 768p/14s 时，均在采样前被应用误报 `H3ContinuumLoadVideo.file` 不是 `STRING`。第一次修复只覆盖旧式“字符串选项数组”编码；固定的 Continuum V3 节点实际声明 `io.Combo.Input(upload=video)`，ComfyUI 0.35 会在 `/object_info` 中使用 `["COMBO", { options: ... }]`。运行时契约现已按输入 socket 的真实 `COMBO` 类型校验，同时兼容旧编码，且保留非 Combo 类型的 fail-closed 检查。该记录只证明提交前误拦截，不证明完整 GPU 续写已通过。
- 2026-09-12 Continuum 首次真实进入图执行后，应用进度在采样开始前跳到 80% 以上且没有正确 Step。根因是源 JointAV 为提取边界帧而执行的前置 `VAEDecode` 被通用映射当成最终输出解码，随后单调进度保护阻止回退；同时 `H3ContinuumSamplerV38` 未登记为 step-tracked sampler。当前进度上下文会从实际 API 图识别 source-state/source-decode/source-frame/sampler/assembly 角色，前置解码保持在 5%–14%，Sampler 使用 14%–80% 并上报 Step，最终 VAE/拼接/保存仍位于尾段。

## Next

1. 接手者先核对是否已有新的 Continuum/Native AV 运行报告；有则复用，不重复下载或调查同一资产。
2. 若要继续 Native Masked AV，先固定当前 ComfyUI/core revision、节点 schema、mask 几何、音频时间网格和最小 smoke，再单独决定是否接入产品 queue。
3. 若继续 Continuum，沿现有 bridge/artifact/History 语义建立一个有界片段验证，记录 A/V 同步、恢复、取消、合并和残留清理；未完成前不开放自动长批次。

## Evidence

- [P0 baseline](evidence/H3_P0_EVIDENCE_BASELINE.md)
- [Long-video P0 evidence](evidence/H3_LONG_VIDEO_P0_EVIDENCE.md)
- [H3 1080p/1440p research](../../research/h3/2026.9.2-h3-1080-1440-integration-research.md)
- [Archived Native Masked AV plan](../../archive/h3-long-video/H3_NATIVE_MASKED_AV_LONG_VIDEO_PLAN.md)
- [Archived long-video plan](../../archive/h3-long-video/LONG_VIDEO_CAPABILITY_ENHANCEMENT_PLAN.md)

## Stop conditions

- Native Masked AV 没有当前 schema/真实输出证据时，保持 needs-review，不宣称产品化。
- 只证明 artifact bridge 或 /object_info 时，不宣称完整长视频 runtime-ready。
- 任何路径发生 A/V 不同步、artifact lineage 丢失、取消后残留或跨 provider fallback 时，停在当前片段。
