# 升级评估记录字段

类型：Skill 参考；状态：current；日期：2026-10-10。用于本次 TASK 的 evidence，不维护版本清单。入口：[SKILL](../SKILL.md)。

## 报告内容

- **范围/时间**：用户目标、查询时间、应用 Git/dirty 基线、评估或实际实施、允许使用的实例/资源。
- **库存**：catalog 项、生产图实际使用、可选特性、retired、额外已安装；每项一个结果，遗漏/无法查询显式标注。
- **身份**：catalog 推荐/minimum/installRevision/installRevisionPolicy（固定安装目标与硬运行要求分开）、本机 origin/version/full SHA/local patches、候选 stable tag/full SHA、HEAD/full SHA/date。版本号、commit、Registry/Release 不互相冒充。
- **变化**：官方链接/PR，影响的实际 node ID、schema/endpoint/requirements、权重 bytes/hash/license、工作流与输入条件。只改文档和实际行为分开。
- **收益与成本**：应用当前是否已有、自动生效或需要接线/权重；适用模型和硬件；上游结果与本机结果；内存/时间/画质/运维成本。
- **兼容与恢复**：缺失输入/枚举、旧队列/History/Run contract、补丁漂移、Python ABI/DLL、数据库迁移、备份/回退已验证或未验证。
- **存储升级**：区分Native AV wrapper、Run Storage schema和sampling contract；记录真实manifest版本/hash/resume_safe。旧v5保留只读，不改label成为v6；新Run需要实际前缀复用证据。
- **验收**：命令、结果、固定版本/文件状态，source/files/schema/graph/UI/runtime/benefit 分层；失败、未运行、解锁条件、清理。
- **决定**：优先验证/候选采用/保持/延期/拒绝，各自理由与最小下一实验；不要将“候选”写成“已完成升级”。

适合使用如下表格，复杂项在表后展开：

| 组件/旅程 | catalog / 本机实际 | 候选身份与来源 | 与当前的差异 | 应用获益方式 | 风险/下一验证 | 证据层/决定 |
| --- | --- | --- | --- | --- | --- | --- |

## 可重复的对照记录

记录每个 case 的素材 hash、模型/LoRA hash 与强度/叠加顺序、prompt/seed、workflow hash、core/node/Python/Torch/CUDA/后端身份，以及实际 task/version/output。敏感正文和机器路径保留在忽略目录；提交报告使用脱敏定位和 hash。

分别记录：冷加载秒、编译秒、暖采样秒、VAE 秒、封装秒、总时长、VRAM 峰值、host RAM/shared GPU、输出尺寸/实际帧数/音轨与失败率。没有遥测就写 unknown，不从文件大小推断峰值显存。

质量维度按目标选择：指令保真、主体身份、参考图对应、文字正确性、alpha/Mask 外保持、细节/色彩；视频另看运动、时间一致性、边界接缝、音画同步。少量 case 支撑试点，不自动推广为全模型结论。

源码/权重/环境、补丁、参数、数据或测量方法变化时标记旧证据失效范围；相同失败条件复用负结果。
