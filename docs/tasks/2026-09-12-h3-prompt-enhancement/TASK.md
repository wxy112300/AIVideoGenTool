# H3 Prompt 增强框架修复
- Status: complete
- Updated / Owner: 2026-09-12 / current agent
- Scope / Authority: 按用户确认的研究结论修改 H3 Prompt 增强、快捷插入、三种增强后端及审计；保留十个预设、全部快捷项、已有 Draft/Queue/History 兼容性。
- Baseline: `c8fbf5d`; 开始时仅 `CHANGELOG.md` 与 `docs/research/h3/2026.9.12-h3-prompt-control-reassessment.md` 为本任务研究改动。
- Execution: direct

## Resume
- 已确认 / 决定：默认 hard-single，明确 cut/多视角才允许多镜头；快捷插入始终先进入增强器且不按模式禁用；未知事实省略；年龄不从尺度词推断；最终 H3 正文避免失败概念长清单；FL2VA、R2VA、Extend 使用不同参考语义；三个增强后端共享同一能力合同。
- 已完成 / 下一步：统一控制计划、默认单镜头、尺寸/实体/人体动作保护、摄影机结构化修复、详细扩写覆盖、快捷正文、FL2VA 双图 Rewriter、R2VA 拒绝边界、Extend 续接及三套后端兼容均已实现并验证。下一步仅是在目标 ComfyUI/H3 环境使用代表性素材做主观质量 A/B，不属于静态完成声明。
- 阻塞 / 解锁条件 / 不要重复：没有阻塞；不重新调查已记录的社区来源，不启动 GPU/ComfyUI，除非静态和单元验证完成后确有必要。

## Implementation and resources
- 修改范围 / 保留行为：`src/core/prompts/h3/`、H3 prompt/scale/camera helpers、Prompt Writer/Multimodal/Qwen-VL adapters、对应 tests、Prompt Pack/Workflow contract 和 changelog。保持 preset IDs、snippet IDs、IPC 与持久化结构兼容。
- 必要步骤（不自动拆成agent）：统一意图合同；修复 scale/subject grounding；修复详细扩写；整理快捷正文；修复 Qwen-VL FL2VA 双图；统一三个后端；补回归测试；执行 focused tests、typecheck、verify。
- 文件、build/GPU/服务归属和释放：只改仓库文件；不启动 Electron、ComfyUI 或 GPU；最终 verify 会使用 build 输出，执行前复核工作区。
- 验收：相关 Vitest、`npm.cmd run typecheck`、`npm.cmd run verify`；检查 scoped diff、链接、无意外删除。

## Evidence / handoff
- 关键结论及来源/版本/证据路径：`docs/research/h3/2026.9.12-h3-prompt-control-reassessment.md`；产品合同同步到 `docs/PROMPT_PACK_DESIGN.md` 与 `docs/WORKFLOW_CONTRACT.md`。
- 实际命令、结果、对应文件状态：聚焦 H3/后端/快捷测试 13 个文件、164 项全部通过；快捷占位选择 2 项通过；`npm.cmd run typecheck` 通过；`npm.cmd run verify` 通过（177 个测试文件、1483 项测试、production build、20 组 UX 对比度）。`git diff --check` 通过，仅报告仓库既有 LF→CRLF 提示，无空白错误或删除文件。
- 可复用检查 / 必须补的验证：单镜头 policy、FL2VA/R2VA mode contract、双图 ImageBatch、camera/scale repair、详细扩写合同及快捷项回归均有 Vitest 覆盖。
- 未运行项、限制、清理：未启动 Electron、ComfyUI 或 GPU，未进行真实 Qwen/H3 视频质量 A/B；静态测试不能证明人物结构、角色对应或成片质量改善，需要用同 seed/素材/参数对照旧新 prompt。构建产物由标准 `verify` clean/build 流程管理，无运行服务需要清理。
- 实际模型/effort；可见usage与耗时：current model / unknown。
- 版本影响 / Unreleased：预计 patch；更新现有 Unreleased 条目。
