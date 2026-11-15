# 历史筛选收起后的可视窗口同步

日期：2026-11-14 · 类型：patch · 状态：修复及验证完成，原窗口反馈待复测

- 用户反馈：历史列表关闭filter后空白，继续滚动才恢复。修改范围为历史筛选开合与虚拟窗口几何同步，保留列表布局、筛选状态、封面节点及滚动位置。
- 源码漏项：筛选按钮只修改hidden；虚拟列表只处理scroll及自身宽度/布局变化。标题和筛选栏高度改变可以移动列表起点，而不改变列表宽度，原ResizeObserver直接返回；窗口只改变高度也缺少主动重算入口。
- 修复：开合后立即调用已有refreshVirtualHistory；虚拟列表同时观察标题、筛选容器尺寸，同宽位置变化只同步窗口，不执行宽度重排的锚点滚动；增加window resize调度。cleanup仍统一断开observer/events。
- 自动回归：filter-controls、virtual-gallery、timeline共18项通过。新增无scroll事件的视口修正场景；确认旧窗口释放、新可见卡片挂载，开合复用已有节点且不请求整页render。
- Chromium验证：生产History heading/filter/timeline/virtual-gallery及CSS组成独立Electron DOM fixture，1500条记录、1280×850、瀑布流/相册各测顶部/40%/95%/底部，关闭后采样未见空白帧。普通布局的旧版独立fixture也未复现用户的持续空白，因此这里证明新增同步路径与修复后的测试场景，不宣称完整用户场景已被逐帧复现。
- 完整App隔离启动未连到可测试AppApi，未用它作为验收；改用独立生产DOM fixture。所有fixture独立于用户数据、不启动ComfyUI或GPU生成，结束关闭自有Electron窗口。忽略目录temp/history-filter-20261114留诊断/帧数据，temp/history-filter-verify-20261114留全量检查日志。
- 全量隔离快照：334个单元文件3256项、7个集成文件127项、干净类型构建、440组对比度检查全部通过。首次验证启动早于快照复制完成，仅配置缺失；等待复制结束后执行上述完整检查，没有产品测试失败。自有node_modules联接已移除，主工作区dist及其他任务资源保持。
