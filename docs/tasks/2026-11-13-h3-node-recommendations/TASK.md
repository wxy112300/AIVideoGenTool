# H3 SLA 与 Spectrum 推荐线更新

日期：2026-11-13 · 类型：patch · 状态：推荐线已更新，运行实例未升级

- 用户授权：先核对兼容性，合适则将 PlagueKind H3 SLA Attention 与 Spectrum MiniMax H3 的项目推荐版本更新到最新；不升级本机运行实例、不下载权重。
- 基线：catalog/本机 PlagueKind 1.5.6，d58d006a4ea32c25c06499f2ff104f0852a045a6；Spectrum 0.2.29，806fe498d574a726fecb8818917f00a4b993fd77。本机核心 74eb0c4b8a1a894e7210326882a8d9a016e37ccb，v0.45.0 后六个提交，使用 grids PDD 接口。
- 候选：PlagueKind 源码 1.6.2，cfb88a01d8922ca634d4ac1e753c7ae2c3c4273e（无 GitHub Release）；Spectrum 稳定 v0.2.30，7df883bb2361b7884ad789e97effd1dc37c8963a（与 HEAD 相同）。
- 检查重点：SLA 子目录逐文件不变；包级新增媒体/H3 图片节点及替换旧放大节点不改变现用 BSA 图，MMH3 仍由独立固定包提供。Spectrum 新旧 PackedLayout 与 shifts/grids PDD 兼容、schema/依赖和应用图保持。
- 证据/CPU 回归保存在忽略目录 temp/plaguekind-upgrade-20261113。公共 API 查询遇到限流后以官方 release 页面及实际 Git refs/source 核实，不把失败当作无更新。真实服务当前离线；不将静态/CPU 校验称为 GPU 生成或性能验收。

## 采用结论

- PlagueKind 推荐改为1.6.2并固定候选SHA，最低1.3.8不变。SLA六个源文件按Git原始blob比较完全相同；隔离CPU进程用实际核心导入包，18个节点成功注册。包内删除的四个MMH3节点由应用独立固定包提供，不切换现用放大路径。外部手写工作流若依赖其他被删除的包内节点，需单独核对。
- Spectrum 推荐改为0.2.30，最低0.2.1及各特性门槛不变。节点定义逐字节不变，无新增Python依赖；PackedLayout构造与FinalLayer四参、shifts、grids接口兼容修复适用于当前核心。保留现有跟随上游的安装策略，不额外引入固定revision策略。
- 上游CPU回归102项通过：PackedLayout、PDD FinalLayer、native equivalence、SA Solver conditioning。测试使用隔离pytest目录及CPU能力探针替身，不修改生产Python环境，不调用GPU。应用catalog、执行策略、workflow及baseline四文件114项通过，主工作区typecheck通过。
- 本次没有安装节点、启动服务、修改权重或运行生成；不能据此声称GPU速度、显存、画质或新图片/放大节点已验收。
- 仓库级检查使用当前源码隔离快照：单元首次3239项通过、1项旧推荐版本断言失败；修正扫描器断言后该文件28项全部通过，复用其余333文件结果。集成127项、干净类型构建、440组对比度全部通过。构建未触碰主工作区dist；测试日志留在忽略目录temp/h3-node-recommendations-20261113。最终解除自有node_modules联接，未改生产依赖或其他任务资源。

## 官方来源

- [PlagueKind固定源码](https://github.com/PlagueKind/ComfyUI-PlagueKind-Nodes/tree/cfb88a01d8922ca634d4ac1e753c7ae2c3c4273e)
- [Spectrum v0.2.30发布](https://github.com/xmarre/ComfyUI-Spectrum-MiniMax-H3/releases/tag/v0.2.30)
