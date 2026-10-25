# M8c：节点与运行时卡

2026-10-24，minor，direct。延续 M8，用户要求继续下一步；本批覆盖节点与依赖，整个设置页尚未收尾。

## 接入与保留

- 参考 `prototypes/settings.html`、`prototypes/app/settings.css/js` 的 item-top / purpose / item-foot、运行时区、分组双列、安装队列与控制台。节点仍来自当前扫描/catalog；运行时三张卡独立，节点按稳定 ID 分四组，未知新增节点进入通用组，不丢弃、不写死节点总数。总计包含 Strata，修复缺 Strata 时仍显示全部安装的歧义。
- 标题右侧状态、用途一行省略并可查看完整内容，版本/动作在底部。Release 保留本机/推荐/最新，未知推荐/最新显示“—”；rolling/pinned 保留现有简洁版本语义，不编造 Git 版本或最新值。一般运行说明收进可键盘访问的信息浮层；缺 runtime、load error、重复目录和不兼容等实际问题保持可见。
- 更多菜单保留来源、位置、重扫和卸载；H3 运行时重新验证收入菜单。菜单 Escape 收起并恢复触发器焦点。Strata 目录/端口在卡内展开，字段 ID 和保存语义不变；H3 和 llama 保持实际 Python/包/运行时证据。
- 真实阶段快照驱动等待/处理中/复检；安装日志事件继续原位更新已挂载的 pre，不为每行日志重新渲染页面。活动卡片在首行日志前就提供控制台；结束后日志折叠。Custom node/llama 无真实百分比时使用不确定进度；Strata 继续使用实际 stage/percent/bytes 事件，不添加假百分比或假耗时。
- 单项取消沿用原入口；等待按钮常态显示位置，悬停/焦点显示移除操作，accessible name 始终是取消动作。新增等待项原子移除方法，只同步清空 waiting 数组与对应 batch/log；不把等待 ID 交给 active cancel，也不影响以后新增任务。批次重启/复检和独立 runtime 的原约束保持。
- 安装指示、按钮光效与高级设置展开遵守减少动画。补齐此前只有安装分支才会用到的 `clock-3` / `wrench` 图标；没有更换全局按钮扫描策略。

## 检查

忽略目录 `temp/ui-m8c/` 保存脚本、报告与截图。

- `focused.log`：相关卡片、Strata、队列与控制器回归。新增覆盖等待项移除不碰 active/后来追加任务、真实 DOM 按钮路由、Escape 焦点、活动空日志目标、完成日志折叠、未来节点保留、版本提示色及安装专用图标。
- `verify-complete.log`：256 单元文件 / 2495 项，6 集成文件 / 91 项，typechecked build 和 740 对比度检查通过。
- `check-final.log` / `report.json`：隔离的真实 Electron/AppApi，offline scan 后 21 节点 + 3 runtime 可达。中文 1440/1280/1120/820/547，繁中与英文 1440/820/547；卡片/页面不溢出、图标完整、只浏览不误报修改。原生鼠标/键盘打开高级设置、编辑后丢弃、展开菜单及 Escape 返回；完整 queue/draft 与原夹具相同，36 视频 / 10 图片，队列暂停。背景窗口启用 focus emulation。
- `states-report.json` / `state-*.png`：使用生产 renderer 与最终样式的合成状态夹具检查 working/completed/failed/finalizing/Strata download，运行中控制台与结束折叠、进度是否有来源、窄屏与 150% 静态布局、减少动画。该层不是真实安装或下载证明；夹具日志明确标注 fixture。样式加载与待转换图标也有断言。
- `restart-report.json`：最终生产构建重启、设置与保存结果严格相同，queue/draft 与原基线严格相同；实际 Settings 节点区仍可达且无未保存误报。生产截图 `production.png`。
- 测试没有安装/更新真实节点、下载权重、清缓存、删除媒体或执行 GPU 生成。安装服务未改；已有安装事务集成测试通过，真实网络安装/取消/重启整条链路本批未新跑。

## 资源与下一批

自有 Electron 4156 / 12864 / 5076、CDP 2749 / 4690 / 5452、Vite 5176 的清理记录在 `cleanup-*.json`；ComfyUI 18188 未启动。原隔离 state 从 `temp/ui-m7d/state-before.json` 恢复，SHA256 相同。此为 harness 清理，不新增原生退出生命周期证据。

继续模型/LoRA 分组卡片、来源/位置窗口、B17 维护窗口、日志与保存字段名摘要；最后统一对照剩余 ComfyUI 诊断布局与各状态。B19 的独立运行时不能假装成与 custom node 完全相同的队列能力，实际不支持的等待/进度不会补成演示功能。
