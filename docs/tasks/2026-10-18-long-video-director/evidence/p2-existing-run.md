# P2 已完成 group Run 的新增段入口

2026-10-26；minor 增量；任务当前状态仍由 [TASK](../TASK.md) 维护。

## 设计与实现

- 同一 Run 续接使用原始 Run Storage。MP4 只是来源预览，不能提取/重编码尾帧来替换旧状态。模型、原首帧、seed、步数、VAE、尺寸、attention、sampler/scheduler 与已有 prompt 前缀不变，只追加未来段。
- 新 `LongVideoRunSource` 从已保存的 execution/group receipt 解析，不伪造 legacy managed Sequence 或独立 JointAV；旧 managed 收据只允许一个逻辑新增段，而 group 收据允许末尾物理组包含两段，二者继续独立。
- 来源必须完整、可复用 v6 且有剩余16段容量。只读检查真实 canonical head、sealed manifest、完整 prefix 的 owner、路径、大小与SHA；主进程重新从History解析权威来源，入队检查后在首个POST前再查，最终仍由官方Run锁内守卫拒绝过期或不兼容前缀。
- 独立 extension 任务保留来源作品/版本；冻结继承profile，不采纳新的全局Settings/随机seed。确认后的布局保持来源共同段长；Draft/Queue duration 是新增秒数，最终音画校验使用整个Run的总帧/音频长度。父执行首个request从旧accepted/head开始，旧owner/hash不能改变；重放不重复已接受组。
- History Continue→现有Extend编辑器，缺未来详稿仍阻塞；旧AV检查面板不冒充这个来源。原生/旧managed/AV回退保留；其他模型的旧多段编辑键不会劫持当前原生入队。独立AV导出未实现，分组模式隐藏其旧开关并如实登记无独立AV，所需Run仍保存。

## 已通过

- 定向覆盖同Run前缀继承、全片长度而非新增长度、缺source verifier不能进入POST意图、旧owner变更拒收、真实临时manifest/head/payload检查、main enqueue拒收客户端改profile/旧head、History Continue与实际DOM按钮、全局设置不改、源seed不可随机化、普通原生回退。
- 最终运行逻辑固定状态 `VITEST_MAX_WORKERS=2 npm.cmd run verify`：284文件2673单元、6文件91集成、双端typecheck/build和440对比度通过。其后仅三语言名称/描述与Queue的分组时长/AV摘要展示调整，2文件39项、干净typechecked build及440对比度再次通过。没有放宽超时/断言。
- 新来源检查器只读上轮实际15秒Run：canonical head/manifest及3个真实raw payload大小/SHA全部通过，保留原20步/PyTorch/INT8 ConvRot VAE/seed42。
- 真实隔离Electron：History卡片→Continue→Extend，原seed/步数/VAE/尺寸继承，固定5秒共同段长，缺布局/详稿→确认/真实键盘→可用按钮。自有停止Run临时设置错误head后，实际按钮被拒且queue保持0；恢复精确原bytes后同一按钮创建一个新增5秒的extension task，source accepted3、目标4。没有从MP4生成任何新状态。
- 首次探针在History动作完成绑定前点击，零task后停止；观察已绑定按钮可正常切换，改用现有播放器ready条件后整条探针通过，未改产品等待超时。错误head仅在物理隔离、runtime停止、queue空时修改并还原；未改正式用户Run。

## 限制与后续

- **新增Extend GPU 0/1**。当前外部Unreal占用约98–99% GPU、约22GB显存，空闲物理内存约2.4GB；没有启动Comfy或抢占进程。已入队的私有任务保持waiting，自有Electron已关闭并复核退出；不证明原生退出生命周期。Create仍3/3、P0仍4/4，均不重跑。
- 待资源空闲，复用当前准备报告/任务执行 `probe-long-video-extend.mjs <fixture> finish --port <port>`，最多一个新物理组，核对reused3/generated1、旧owner/hash、20秒全片/完整音轨及派生History播放/返回。`prepare`会独占创建报告；不要盲重跑或创建第二个任务。
- 已有legacy managed来源继续旧入口，没有自动提升为group Run；独立canonical AV/Sequence登记、旧Take分支、活动采样取消修复、完整History脚本回流/文件迁移GC、Queue分页/双进度仍未完成。当前不宣称新增5秒已生成、无限续接、120秒峰值或内容质量。
- 应用0.67.0，无版本提升、提交、打包或发布；保持其他History hover、H3加速评估改动。
