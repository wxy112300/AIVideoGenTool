---
name: comfy-upgrade-assessment
description: 评估 Local Video Studio 的 ComfyUI 核心、已用节点、模型和 LoRA 上游升级，比较实际安装与候选源码，并用现有 Harness 分层验证兼容性和收益。用于版本盘点、升级收益评估及已授权升级后的验收；不因评估请求自动安装或下载权重。
---

# 用 Harness 评估升级收益

从包含 `scripts/app-harness.mjs` 的仓库根执行。交付应回答：**什么变了、当前实际缺什么、应用能否用到、值得先验证什么、证据到哪一层**。版本与安装事实始终从当前 catalog、源码和选中实例读取，不把历史报告变成实时清单。

## 先固定范围与基线

- 读 `git status --short`、目标 diff、[升级路线](../../../docs/development/WORKFLOW.md#upgrade)。多阶段任务只使用一张 TASK，沿用已有同主题状态；一次只读盘点不强制补跑 GPU。
- 区分用户要“评估”还是“实际升级”；在既有授权内继续，不为常规可逆动作重复审批。评估请求允许查资料、只读探针和报告，不自动改变运行实例、生产推荐线或权重。
- 读 [依赖约定](../../../docs/DEPENDENCIES_AND_SETUP.md) 和受影响的 [工作流契约](../../../docs/WORKFLOW_CONTRACT.md)。运行产品验证时使用 [local-video-studio](../local-video-studio/SKILL.md) 与 [应用 runbook](../../../docs/AGENT_ELECTRON_API_RUNBOOK.md)。

```powershell
npm.cmd run harness:app -- list
npm.cmd run harness:app -- guide settings-runtime
npm.cmd run harness:app -- guide <受影响旅程>
```

## 盘点真正的执行集合

1. 从 `src/core/catalog/dependencies/` 取节点 repo、推荐线、最低线、installRevision、retired 与 feature-specific nodeTypes；从 `src/core/catalog/models/` 和 `catalog/loras/definitions.ts` 取模型/LoRA 来源与兼容组合。不要手工维护第二份 catalog，也不要把生成的同目录 `.js` 或旧 `dist` 当作最新 `.ts`。
2. 扫描 `workflows/*.json` 的 `class_type`，再核对 builder 动态插入的 loader、attention、cache、preview、LoRA、serializer/receipt 节点。区分核心节点、第三方包、内置包、已退休条目、安装但未被生产图引用的额外包。额外包仍可能影响导入/启动，不等同于应被卸载。
3. 读取应用选中的 **core / data / Python / model roots**。Desktop 的安装目录、内部 core 和 Documents data 可以不同；通过现有 `comfy-discovery` / scan helper 解析，不按一台机器的路径写 Skill。记录 core 版本与完整 SHA；逐包读取 origin、HEAD、版本文件和 dirty 状态。没有 `.git` 写“来源/commit 未证实”，不能用空 status 宣称 clean。
4. 核对 catalog 来源和本机 origin。fork 可以版本号相同而实现不同；节点显示版本还可能是 Registry 发布号、源码 pyproject 版本或 GitHub tag。内置包按本仓库版本/内容检查。记录应用兼容补丁，不能用强制 pull/reset 覆盖。
5. 只提取必要诊断字段，原始 state、路径、日志、媒体与下载内容留忽略的 `temp/`，不要提交用户提示词/草稿或机器路径。

## 比较上游，避免“latest”误判

- 在线刷新官方 GitHub release/tag/commit、模型发布者的模型卡与文件元数据；保存查询日期、URL、固定目标 SHA。搜索缓存只用于发现，HEAD 与 stable release 分开。网络失败、限流、分页截断写 unknown，不写“没有更新”。
- 有 release 时筛掉 prerelease、Standalone 或仅名为 `models` 的资产发布；无 release 时查看 tags、pyproject、Registry 与 HEAD。**没有 GitHub Release 不等于没有更新**。
- 比较两个范围：catalog 推荐/固定 revision → 候选，以及本机实际 SHA → 候选。本机可能已经含有 tag 之后的修复，不能重复计入收益。compare 返回 diverged/404 或 commits 截断时核对祖先/分页，不按 ahead 数直接推断兼容。
- 先用脚本批量取元数据，再精读与生产节点有关的差异：注册名、INPUT_TYPES/define_schema、required/optional、enum、DynamicCombo/Autogrow dotted keys、输出类型、API endpoint、取消/cleanup、缓存/采样身份、requirements 和 DLL/wheel。上游 README/CI 是来源证据，不能当成本机生成成功。
- 核心新引入的 attention/Linear wrappers、节点治理或启动策略，检查所选发行包是否启用、显式设置是否优先、包 digest 是否包含本地补丁；默认未启用的机制不误报为必然阻断，开发分支能力不混入 stable 结论。
- 模型/LoRA 固定 repo+revision+文件名+bytes+LFS SHA-256；仓库新 commit 可能只改模型卡。核对实际权重 hash 才能判断同名文件是否被替换；本机 hash 不可得则明确保留未知。不要将新量化、VAE 或蒸馏 LoRA 当作同一模型的无条件替代。
- 使用 [评估记录字段](references/assessment-record.md) 写逐项清单、风险、必要改动、下一实验与 adopt/defer/reject 建议。候选推荐不改变 Settings 的更新判定；上游最新与应用推荐保持分离。

## 用 Harness 验证能到哪一层

按改动从 [验证矩阵](references/validation-matrix.md) 选择最小有判别力的实验。一次只改变一个变量，先兼容与输出，再比较性能/质量。

| 层级 | 证据 | 能作出的结论 |
| --- | --- | --- |
| source | 官方 release、commit、模型卡、源码 diff | 上游声称/实现了什么 |
| files | 正确 data/Python 中的文件、包、版本、hash | 文件就绪，不能证明加载 |
| schema / graph | 实际 `/object_info` 与应用编译 API graph | 注册/接口匹配，不能证明推理 |
| UI / task | 缺输入→补齐→真实按钮→task ID | 用户能提交，不能证明产出 |
| runtime / History | 实际计算、文件解码/播放、task/version lineage | 对该组合生成成功 |
| benefit | 同参数 A/B、测量和人工质量比较 | 对该样本/机器有收益 |

`harness:comfy -- scan` 当前只返回 Prompt Writer 摘要；不能拿它声称全节点已扫描或就绪。完整结果用真实 AppApi 的 `harness:app -- scan`，服务层诊断按当前实现取所需字段并标注层级。服务离线对只读评估写“未运行”；已授权且资源归属确定的真实验收应从应用 `start-comfy` 启动，不因尚未启动就跳过。

```powershell
npm.cmd run harness:app -- inspect --port <自有CDP端口>
npm.cmd run harness:app -- start-comfy --port <自有CDP端口> --timeout 180000
npm.cmd run harness:app -- scan --port <自有CDP端口> --timeout 180000
npm.cmd run harness:app -- enqueue-ui --port <自有CDP端口>
npm.cmd run harness:app -- start-queue --port <自有CDP端口>
npm.cmd run harness:app -- wait-task --task <返回ID> --port <自有CDP端口> --timeout 600000
```

仅在**本次隔离队列**准备好、用户路径真实可提交后执行后四步。`start-queue` 会处理全部 eligible waiting，不能拿用户队列做试验。超时先 inspect，禁止重复提交造成叠加。remote connection-only；一个重 GPU 阶段；不终止别人进程来腾资源。

## 获得升级优势与收口

- A/B 固定 core/node/权重身份、输入 hash、prompt、seed、尺寸/帧数/FPS、steps、sampler/scheduler、precision、VAE、attention、cache/offload。冷启动/加载/编译和暖采样分开；帧数/时长/音轨读实际输出。预定样本、显存与时间预算，保留失败案例，按结果扩展而不是循环碰运气。
- 只有改变的层得到证据后才建议采用：不需要权重/graph 改动的修复、需要应用接线的能力、需要新权重的能力分开排序。速度提升不能替代身份、语义、音画或细节质量验收。
- 实际实施时先记录旧 core/node/Python 包/兼容补丁与备份位置，按安装器事务、重启与复扫处理；数据库迁移与模型目录单独核对。未真实验证恢复旧状态，不声称回退已验证。
- 保留普通无 LoRA 路径、旧持久化 ID、旧队列/History；新策略按 workflow family/任务快照限定。旧源码的关键节点、参数或采样契约变化时先补 adapter/验证，不能仅提高最低版本来掩盖断路。
- 按 [CHANGE_VERIFICATION](../../../docs/CHANGE_VERIFICATION.md) 做对应检查。只改 Skill/报告走文档和 Skill 校验；代码升级走 focused/verify，runtime 策略再补静态 graph 与真实最小生成。资源收尾复用应用 runbook，报告实际 cleanup。
- TASK 只留当前结论和下一步，来源与结果放同目录 evidence。Unreleased 记录此次已交付行为，patch/minor/major 与实际发布分开；不因研究候选先改 catalog 或 bump。

用户可用 `$comfy-upgrade-assessment` 发起下一次评估。只有用户要求持续监测/定期执行时才安排自动化，Skill 本身不创建定时任务。
