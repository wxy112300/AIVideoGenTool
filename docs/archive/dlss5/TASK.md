# DLSS5：已淘汰方案归档卡

- Status: archived / retired
- Updated: 2026-09-09
- Owner: unassigned（本卡由 harness 整理任务建立，不表示占用 DLSS5 实现文件）
- Route: archive / historical
- Scope: 保存两套已淘汰 provider 的历史边界、失败证据与停止条件；不再安排安装、更新、GPU smoke 或生产接入。
- Baseline: 2026-09-07 当前工作树只读检查 + 2026-09-04 双 provider 计划；不是本机运行状态采样。
- Authority: [双 provider 研究/实施参考](./2026.9.4-dlss5-dual-provider-parallel-integration.md)、[Workflow contract](../../WORKFLOW_CONTRACT.md)。本文仅作历史记录，不是当前执行入口。

## 归档处置

用户已明确淘汰 HECer `ComfyUI-DLSS5` 与 ComfyUI AetherScale。当前代码从活动 dependency/model catalog 和安装选项中排除两者，并拒绝新的安装、更新与修复；旧 ID 仍可被识别以支持兼容卸载，upscale 面板保留为后续 provider 替换接缝。

本次不删除用户本机已经下载的节点、DLL、runtime 或模型文件。后续若重新接入 DLSS5，应建立新的 provider 任务并重新核对当前上游、schema、runtime 与真实输出证据，不复活本卡中的执行计划。

## Resume

- HECer 的 SR 与 basic NR 必须分开。代码中 basic-NR bundle 已存在，catalog 记录基础 NR 曾实测；这不补齐 SR 所需的 `vsdlsssr.dll`，也不证明 guided NR 已通过。
- HECer SR 的旧调查记录缺少固定、兼容、可校验 wrapper；当前环境代码仍禁止其入队。未在本轮重新检查上游是否发布了新资产。
- AetherScale carrier 已有 catalog、graph/validator、scanner 和静态测试；旧计划要求真实 carrier/feature-18 输出证明。本轮未取得该运行证据，不等于代码未实现。
- 归档决定：不再执行 H1/A1/A2 或其他 DLSS5 smoke；若未来出现新的 provider，另建任务并复用现有 upscale 面板。
- 不要重复：同 hash VapourKit 全量下载/递归列举；用 Aether/Merserk DLL 改名修 HECer；因节点注册成功就宣布放大方案可用。
- 历史阻塞性质：HECer 是已记录的外部资产缺失；AetherScale 是真实验证尚未在本卡确认。两者的历史失败原因保持分开，但都不再触发当前执行。

## 历史解锁与最小实验（不再执行）

下表保留原始实验边界，供追溯当时的验收标准；归档后不得据此重新派发运行工作包。

| 工作包 | 默认分工 | 触发条件 | 动作与验收 |
| --- | --- | --- | --- |
| H1 wrapper 差量调查 | Luna 只读，负责人判断 | 新官方 release/asset、可固定来源的 wrapper，或旧负结果范围被质疑 | 只检查新增资产，记录 URL/revision/size/SHA-256/匹配成员/schema；满足 SR 条件后另排 runtime smoke |
| A1 carrier 单图 | 负责人确定资源/上限，Luna 按包执行 | 固定 runtime/schema 可用，GPU/服务归属明确，未有可复用新 smoke | `performance_2x` 一张图；记录源/输出几何、worker/feature-18 证据、耗时、峰值内存和进程清理 |
| A2 媒体一致性 | A1 通过后派发 | A1 输出与 carrier 证据齐全 | 按原计划 16–33 帧含音频短视频，核验帧数/FPS/音频、取消与残留进程；不直接开长批次 |

这些是当时的后续执行计划，并非当前运行指令。原计划的 3×、长批次、对照 benchmark 属于历史阶段；归档后不再安排这些实验。
原计划要求将 A1 证据写入 `evidence/aether-smoke.md`：当前 ComfyUI `/object_info` 快照及 hash、固定 runtime/revision、实际 worker 日志中的 carrier/feature-18 运行结果、真实输入/输出文件定位与媒体检查。fixture、READY 或仅提交成功均不能替代这些证据。
出现 hash/schema 不匹配、原生崩溃、无法中断、只有普通 resize 时，原计划要求停止对应实验并保留证据。HECer/AetherScale 互不静默回退，现有 upscale 路径保持可用。

## Evidence

| 结论 | 类别 | 已检查来源 | 限制/失效条件 |
| --- | --- | --- | --- |
| 双 provider 独立 ID/运行时；禁止混 DLL | source | [计划 §1、§11](./2026.9.4-dlss5-dual-provider-parallel-integration.md) | 后续用户或已批准契约变更 |
| 已记录 SR wrapper 缺失 | source | [旧调查](./2026.9.3-dlss5-upscale-integration-plan.md) | 新 release/hash，或原检查范围不完整；本轮未重新下载 |
| basic-NR bundle 与 SR unavailable 分离 | static | [dlss5 catalog](../../../src/core/catalog/dependencies/dlss5.ts) 的 runtime bundle/unavailableCapabilities | 当前 catalog/revision 变化；记录的 NR 实测不是本轮重测 |
| HECer SR 不可入队；Aether 按 schema/carrier 状态分级 | static | [environment](../../../electron/services/environment.ts) 的 provider status 构造 | 当前实现变化；未调用实际环境扫描 |
| carrier graph/验证代码与 fixture tests 存在 | static inspection | [aetherscale core](../../../src/core/aetherscale.ts)、[runtime](../../../electron/services/aetherscale-runtime.ts)、[tests](../../../tests/aetherscale.test.ts) | 本轮未执行 tests/runtime，不能据此宣称通过 |
| 下一次 smoke 的参数和验收 | source | 双 provider 计划 WP7 | 需在目标环境重核最小可用输入，不推定 GPU/服务现在空闲 |

## Resources / handoff

GPU、ComfyUI、端口、userData、实现文件 owner：均未领取。卡片不构成资源锁。
历史接手只需读本 Resume、计划对应 provider 的 WP7/停止条件、当时的 runtime/catalog；无需重读千行计划全部内容。
本卡记录的是文档/静态源码调查，未运行下载、安装、schema 请求、测试或真实输出；不构成产品 ready 状态。
