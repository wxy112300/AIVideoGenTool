# H3 高分辨率与 JointAV 收口

- Status: active / upscale-only
- Updated: 2026-09-20
- Owner: unassigned
- Route: integration / evidence
- Scope: 仅保留 H3 learned/native 1440p Upscale 的质量与产品 Gate；JointAV serializer/loader、History、Queue、Continuum bridge 和 Motion/Continuum 消费链已由归档的 [Continuum Phase 3/4 任务](../../archive/h3-continuum-extend-recovery/TASK.md) 覆盖。
- Authority: [Workflow Contract](../../WORKFLOW_CONTRACT.md)、[Dependencies and setup](../../DEPENDENCIES_AND_SETUP.md)、[当前发布记录](../../../CHANGELOG.md)、[H3 1080p/1440p research](../../research/h3/2026.9.2-h3-1080-1440-integration-research.md)

## Resume

旧计划已完整保留在 [H3 adoption archive](../../archive/h3-adoption/)。JointAV/消费链的现行完成记录见 [Continuum Phase 3/4 归档任务](../../archive/h3-continuum-extend-recovery/TASK.md)；本卡只作为 Upscale Gate 的当前入口，不要从旧 archive 工作包恢复整套 JointAV 计划。

### 已确认到的层级

- JointAV serializer/loader、History 关联、删除/迁移边界、Queue snapshot 与 Continuum bridge 已进入当前代码和工作流合同；静态测试与当前发布记录覆盖这些接线。
- H3 1080p Create 已有真实 RTX 4090 最小复合任务记录：两次 ComfyUI prompt、1920×1088、39 帧、24 FPS、最终 JointAV 与单条 History 记录。它是执行和媒体完整性证据，不是主观画质批准。
- H3 learned 1440p History Upscale 已有 2592×1440、124 帧、12 tile 的真实运行记录，GPU VAE、MP4、JointAV 和 History 持久化通过；输出画面异常仍保留为质量问题，不能写成画质验收通过。
- Create 原生 1440p、未完成的高分辨率组合，以及没有对应 capability/runtime evidence 的路径继续 fail closed。当前代码/类型检查通过不能替代这些 Gate。

### 仍需接续

1. 先复核最新 runtime/evidence 是否已覆盖当前发布后的目标节点、权重、版本和输出质量；本次文档整理不重新启动 ComfyUI、不下载资产、不占用 GPU。
2. 若重新打开画质或产品 Gate，只建立一个有界执行包：固定源视频、JointAV、节点 revision、输出几何、帧数、A/V、显存/RAM 峰值和 History lineage；不要恢复 V3 全部工作包。
3. 只有对应真实证据齐全后，才更新 Workflow Contract 的 capability 状态或开放更高分辨率组合。

## Evidence

- [H3 P0 baseline](../../archive/h3-long-video/2026-09-07-h3-long-video/evidence/H3_P0_EVIDENCE_BASELINE.md)
- [H3 long-video P0 evidence](../../archive/h3-long-video/2026-09-07-h3-long-video/evidence/H3_LONG_VIDEO_P0_EVIDENCE.md)
- [H3 implementation research](../../research/h3/2026.8.31-ad01-x-minimaxh3-runtime-comfyui-investigation.md)
- [Archived V3 recovery plan](../../archive/h3-adoption/2026.9.2-h3-comfyui-two-pass-av-upscale-recovery-v3.md)
- [Archived V3 handoff](../../archive/h3-adoption/2026.9.2-h3-comfyui-two-pass-av-upscale-recovery-v3-handoff.md)

## Stop conditions

- 没有新的可固定 upstream/runtime evidence 时，不重新调查相同资产。
- 发现节点 schema、artifact hash、A/V 几何或内存边界不匹配时，停在当前 Gate，保留前一层可运行路径。
- 不把静态 schema、文件存在、Queue 入队成功或单次低分辨率 smoke 外推成完整高分辨率产品完成。
