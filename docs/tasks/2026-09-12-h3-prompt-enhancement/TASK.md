# H3 Prompt 增强框架修复
- Status: complete
- Updated / Owner: 2026-09-19 / current agent
- Scope / Authority: 按用户确认的研究结论修改 H3 Prompt 增强、快捷插入、三种增强后端及审计；保留十个预设、全部快捷项、已有 Draft/Queue/History 兼容性。
- Baseline: `c8fbf5d`; 开始时仅 `CHANGELOG.md` 与 `docs/research/h3/2026.9.12-h3-prompt-control-reassessment.md` 为本任务研究改动。
- Execution: direct

## Resume
- 已确认 / 决定：默认 hard-single，明确 cut/多视角才允许多镜头；快捷插入始终先进入增强器且不按模式禁用；未知事实省略；年龄不从尺度词推断；最终 H3 正文避免失败概念长清单；FL2VA、R2VA、Extend 使用不同参考语义；三个增强后端共享同一能力合同。
- 已完成 / 下一步：统一控制计划、默认单镜头、尺寸/实体/人体动作保护、摄影机结构化修复、详细扩写覆盖、快捷正文、FL2VA 双图 Rewriter、R2VA 拒绝边界、Extend 续接及三套后端兼容均已实现并验证。Qwen3.6/Qwen3.8 MultiModal 路径已补充影视细节扩写的按需 16K/≤3072 输出和无正文诊断；H3 Prompt Writer 路径也按详细模式请求 2048–3072 token，并在首次结果未通过覆盖验收时复用官方 session `/refine` 最多按实际词数分阶段补写两次。下一步是使用代表性素材做真实 Prompt 输出 A/B。
- 阻塞 / 解锁条件 / 不要重复：没有阻塞；不重新调查已记录的社区来源，不启动 GPU/ComfyUI，除非静态和单元验证完成后确有必要。

## Implementation and resources
- 修改范围 / 保留行为：`src/core/prompts/h3/`、H3 prompt/scale/camera helpers、Prompt Writer/Multimodal/Qwen-VL adapters、对应 tests、Prompt Pack/Workflow contract 和 changelog。保持 preset IDs、snippet IDs、IPC 与持久化结构兼容。
- 必要步骤（不自动拆成agent）：统一意图合同；修复 scale/subject grounding；修复详细扩写；整理快捷正文；修复 Qwen-VL FL2VA 双图；统一三个后端；补回归测试；执行 focused tests、typecheck、verify。
- 文件、build/GPU/服务归属和释放：只改仓库文件；不启动 Electron、ComfyUI 或 GPU；最终 verify 会使用 build 输出，执行前复核工作区。
- 验收：相关 Vitest、`npm.cmd run typecheck`、`npm.cmd run verify`；检查 scoped diff、链接、无意外删除。

## Evidence / handoff
- 关键结论及来源/版本/证据路径：`docs/research/h3/2026.9.12-h3-prompt-control-reassessment.md`；产品合同同步到 `docs/PROMPT_PACK_DESIGN.md` 与 `docs/WORKFLOW_CONTRACT.md`。
- 实际命令、结果、对应文件状态：聚焦 H3/后端/快捷测试 13 个文件、164 项全部通过；快捷占位选择 2 项通过；`npm.cmd run typecheck` 通过；`npm.cmd run verify` 通过（177 个测试文件、1483 项测试、production build、20 组 UX 对比度）。`git diff --check` 通过，仅报告仓库既有 LF→CRLF 提示，无空白错误或删除文件。
- 2026-09-18 按需扩容补充验证：MultiModal/安装器/扫描器聚焦 3 个文件 84 项通过，关联后端聚焦 8 个文件 208 项通过；对当前已安装 `vision_llm_node.py` 的只读适配探针 1 项通过；`npm.cmd run verify` 通过（172 个单元测试文件 1461 项、6 个集成测试文件 81 项、production build、20 组 UX 对比度）。
- 2026-09-19 H3 Prompt Writer 详细扩写补充：确认已安装官方插件支持请求级 `generation_budget`，并通过同 session `/refine` 继承原始 Creative Brief、时长、画幅与媒体 manifest。应用首次详细生成保留模型，仅在结构/长度/原文覆盖验收失败时补写；真实诊断显示第一次补写仍可能以 `finish=stop` 主动停在 435/450 词，因此现在最多执行两轮，末轮依据实际词数要求保留当前时间线并净增足够的可执行细节。补写显式复用详细 system prompt，最终仍由同一 fail-closed 门槛验收。聚焦 H3 Prompt Writer/Prompt 测试 2 个文件 42 项与 typecheck 已通过；本轮完整 `npm.cmd run verify` 通过（179 个单元测试文件 1569 项、6 个集成测试文件 81 项、production build、20 组 UX 对比度）。测试期间出现仓库现有 jsdom `window.scrollTo` 未实现提示，但未造成测试失败且与 Prompt Writer 路径无关。
- 可复用检查 / 必须补的验证：单镜头 policy、FL2VA/R2VA mode contract、双图 ImageBatch、camera/scale repair、详细扩写合同及快捷项回归均有 Vitest 覆盖。
- 未运行项、限制、清理：未启动 Electron、ComfyUI 或 GPU，未进行真实 Qwen/H3 视频质量 A/B；静态测试不能证明人物结构、角色对应或成片质量改善，需要用同 seed/素材/参数对照旧新 prompt。构建产物由标准 `verify` clean/build 流程管理，无运行服务需要清理。
- 实际模型/effort；可见usage与耗时：current model / unknown。
- 版本影响 / Unreleased：预计 patch；更新现有 Unreleased 条目。
