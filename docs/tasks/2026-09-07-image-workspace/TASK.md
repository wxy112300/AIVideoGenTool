# 图片工作台剩余事项

- Status: needs-review
- Updated: 2026-09-07
- Owner: unassigned
- Route: image / follow-up
- Scope: 从已完成的图片创建、队列、历史和编辑闭环中提取尚未完成的独立 AI 图片放大；不重新打开已完成的工作台阶段。
- Authority: [UX Contract](../../UX_CONTRACT.md)、[Workflow Contract](../../WORKFLOW_CONTRACT.md)、[image model research](../../research/image-edit/IMAGE_EDIT_MODEL_RESEARCH.md)

## Resume

- 旧长计划已归档到 [image-workspace archive](../../archive/image-workspace/IMAGE_WORKSPACE_IMPLEMENTATION_PLAN.md)。其中的版本 0.9.0、阶段编号和早期 CPU VAE 描述都是历史基线，不是当前产品入口。
- 当前代码已经拥有图片创建、图片批次队列、项目/版本 History、继续编辑、视频交接、Qwen Image Edit 2511 与 FLUX.2 Klein 路径；当前 Qwen 图片 VAE 合同要求 GPU VAE，失败时不能自动回退 CPU。
- 尚未形成独立、可验收的 AI image upscale QueueTask、模型/provider 选择、版本 lineage、取消/恢复和真实输出证据。创建页不应因此重新加入放大参数。

## Next

1. 先确定要支持的图片放大 provider、目标几何和权重/节点来源，形成一个独立小范围方案。
2. 复用现有图片项目/版本与重 GPU 互斥规则；成功结果写入同一项目的新 upscale 版本，失败/取消不得进入成功版本。
3. 完成静态 graph/schema、focused tests 和目标机器最小真实图片 smoke 后，再更新当前契约和设置状态。

## Stop conditions

- 不从归档计划恢复旧 CPU VAE 路径。
- 文件存在、节点注册或类型检查通过不等于图片放大 runtime-ready。
- 不为尚未确定 provider 的能力创建第二套图片历史、队列或项目状态。
