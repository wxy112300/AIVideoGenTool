# H3 原生单次 30 秒：独立能力调查

- 类型：Task；Status: done（深入资料与源码调查交付；未实施放开上限，未做本机GPU验收）。
- Updated / Owner: 2026-10-18 / 当前 agent；Execution: direct，新增子 agent 0。
- Scope / Authority: 用户明确要求原生30s与长视频编排是两种不同模式，深入查资料并排除拼接。本轮只读源码/公开workflow与文档，不运行外部workflow、不下载权重、不改生产限制。
- Baseline: `475722c2c231da2aa8782d66e6c03d22a5913809` / 0.66.0；保留现有LAN/History/Strata等dirty工作。
- 权威：[Workflow](../../WORKFLOW_CONTRACT.md)、[Architecture](../../ARCHITECTURE_CONTRACT.md)、当前TS；本轮报告不提升运行能力或改产品契约。

## Resume

- 结论：原生单次30s有实质证据，不能一概当拼接。已取得3090作者原始JSON，展开子图、解析外部覆盖值，确认30s→736帧→单个原生SamplerCustomAdvanced→视频/音频解码→24fps封装；无时间分段/续接/视频concat。另有对应单轮8/8日志。属于公开graph与作者运行证据，不是本机运行成功。
- 已取得42s作者JSON：1008帧Ref2VA→单个H3采样器；额外KSampler属于默认bypass的SeedVR2后期，不是多段H3续接。两份JSON均已记录bytes/SHA256，原始文件只留gitignored temp。
- 现有应用的15s与362帧双限制来自catalog/共用校验，UI和主进程都执行；上游最初v0.30.0就允许更长length。放开无需先做长片DAG，但也不能只改slider。
- 推荐：独立支持现有Create的“原生长时长”档，首批验证20/25/30s与480p级别；T2V/I2V先行，R2V、FL2VA首尾帧、Turbo、768p、高分辨率二次采样分别验。保留普通15s、低显存Q3实验档与Extend各自预算。
- 完整来源、排除清单、graph审计、接入影响和有界验收方案见 [ASSESSMENT](ASSESSMENT.md)。实现仍未开始，下一步是按报告做独立原生30s实现/实测，不等待长视频模式。
- [长视频编排计划](../2026-10-18-long-video-director/PLAN.md)只消费未来可用的原生profile；两项任务没有相互前置依赖。

## Evidence / resources

- 使用仓库local-video-studio / comfy-upgrade-assessment技能；只读`harness:app -- guide create-video`成功。一次误用`guide create`返回unknown，已按真实列表纠正，没有启动应用。
- 实际工作：公开来源查阅、两份JSON解析与连接追踪、固定Core源码/本地TS核对、时间网格和RGB数组数据量计算；不是完整app graph执行或runtime性能测试。
- 本轮仅修改本任务文档、任务索引和长视频文档中的边界/链接。临时来源与审计脚本在gitignored `temp/h3-native-30s-research/`，无媒体、权重或私人prompt。
- 普通沙箱进程启动存在已知helper错误，使用已批准的只读命令；GitHub匿名API后段遇限流，未借此断言无更新，已撤回来源的当前commit写unknown。
- 无Electron/ComfyUI/GPU/端口资源，无用户state改变；2026-10-18本任务及相关长视频文档/索引共6文件的本地链接/空白检查、scoped `git diff --check`通过，临时JSON/脚本均确认被gitignore排除，无本任务意外删除。不跑build/verify或GPU，无版本/CHANGELOG变更；将来功能为minor候选。
- token usage / effort可靠统计不可得，unknown。
