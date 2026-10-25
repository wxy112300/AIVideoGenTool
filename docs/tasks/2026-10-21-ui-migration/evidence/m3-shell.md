# M3 外壳与外观

- 类型：Evidence；日期：2026-10-22；状态由 [TASK](../TASK.md) 维护；影响：minor。
- 当前工作基线包含 M0–M2 与已有 FastH3/MOSS 增量；未冻结模型清单、改图或运行 GPU。

## 实现与兼容

- `components/shell.css` 承接原型的品牌/图标导航、资源行、返回顶部及外观行；删除 foundation/visual-refresh/history-stage 中已取代的专用外壳声明。通用 nav 样式仍留给尚未迁移的设置/页面；不新增 override 层。
- 使用已有导航控制器，保留队列计数、详情归属 History、未保存设置离开确认、父导航与返回路径。顶栏有独立 View Transition 名称；ResizeObserver 将实际高度同步给旧/新吸顶变量，宽度和缩放改变时重新测量。
- `shell/presentation.ts` 只对页面路由变化启用 View Transition，普通重绘、分类切换与遥测不触发。新页面在图标/控件/绑定/焦点恢复完成后结束更新；首帧整体揭示。减少动态使用淡变；原生动画不可用/失败时仍提交导航；快速切页使用 revision 防止旧回调覆盖路由。全屏中直接更新。
- `shared/ui/tween.ts` 对真实遥测数字补间，保留单位和精度；未知值直接显示占位，更新会取消旧补间，节点分离后结束，减少动态直接呈现最终值。返回顶部在隐藏时退出 Tab 顺序，减少动态不平滑滚动。
- B1：可选 `Settings.appearance`，默认 Azure/Graphite/1/system；core 单点归一化，旧文件/非法字段退回默认，store 读取兼容，不提升 schema 或改旧任务 ID。使用既有 settings:save 通道的 `appearance` 模式，服务只合并主题字段，不执行路径/模型/排队策略/扫描或清除 native dirty guard。正常保存也保留旧客户端遗漏的已存主题；LAN 配色保持独立。
- 设置保存仍经 SettingsSaveCoordinator；独立分支同步设置草稿中的外观字段，保留其余未保存内容。四组选择支持键盘方向键/Home/End，保存失败恢复原外观并显示本地化错误；三语 key/catalog 已补齐。
- 实测发现主题保存广播会引起设置页重建，紧接着点击可能落在替换的节点上；现在仅外观变化的广播直接应用根属性，保留页面节点/焦点。状态中有其他变化时仍按原规则更新，测试覆盖这条区分。

## 验证

- 最终 `npm.cmd run verify` 退出 0：242 文件 / 2406 单元、6 文件 / 91 集成、双端类型/生产构建与 740 对比度通过；日志 `temp/ui-migration-m3/verify-complete.log`。覆盖旧设置/重启、独立保存隔离、失败回退、快速切页、动画失败后导航及外观广播。随后仅更新 smoke 分类预期和文档，没有再改生产行为。
- 四宽度 70 张截图：1440×900/18、1120×800/16、900×800/18、820×900/18，`temp/ui-migration-m3/matrix`。四组 document 诊断均无整页横向溢出；人工查看宽/窄概览。后续逻辑修复未改 CSS，最终生产构建另经真实 App 与三个 smoke 验证。en-US 125% 的 Settings 与 zh-TW 图片页补充截图均无整页溢出。
- Queue running mock：42→67% 的阶段/进度/预览与遥测更新，暂停和取消可达。History mock：筛选清除、列表布局、卡片/菜单/分类键盘、详情/版本/返回与删除取消通过。Settings mock：11 类单 Tab 停靠点、方向键/Home/End、窄屏单行横向分类条、焦点返回通过；新增外观后同步原 smoke 的 End/分类数量预期。日志 `smoke-running.log`、`smoke-history.log`、`smoke-settings-final.log`。
- 最终真实 Electron：Create→Queue→History→Settings→Create，4 次真实路由动画，设置分类不增加动画计数；各页面顶栏高度 72px、顶部 0，未位移。实际鼠标更改主题/减少动态，键盘切换主题；未保存路径未提交、跨分类保留，放弃路径不撤销已存主题。`shell-real.json` / `appearance-real.png`。
- 实际缺 prompt 阻塞 → 键盘输入恢复 → 按钮入队：`a0cca835-d938-46d0-94b4-aecc1d2495f5`，H3 T2VA / 1 秒 / 480p；继续改草稿不改任务快照，`real-enqueue.json`。没有启动队列或证明实际出片。
- 真实返回顶部通过，隐藏时 tabindex=-1；遥测持续更新后同一资源节点、输入焦点及选区保留，`viewport-real.log`。
- 真实关闭/重启后，red/graphite/1/reduced 恢复到根属性，任务 ID 保留。首轮严格原样比较发现既有 store 会为新任务补三个旧 H3 memory 默认字段；核对当前 `normalizeH3MemoryOptions(task,"off")` 后，以该生产归一化结果严格比较整个任务及外观，通过。没有忽略其他字段或修改该兼容逻辑；`restart-real.json` 记录 off/false/4096 的边界。

## 资源与后续

- 仅用本轮独立夹具 `temp/create-smoke-lMZ3zp`、`temp/create-smoke-XN4fTg`；后者重启一次。用户真实草稿/设置未写入。配置 runtime 18188 未启动，没有 GPU 操作。
- 清理经现有 close-fixture helper；记录 `cleanup-initial.json`、`cleanup-before-restart.json`、`cleanup-final.json`，不将 JS 关闭声称为原生窗口生命周期专项验收。收尾复核自有 Electron/端口释放并停止静态服务 5175；既有原型/其他任务进程保留。
- 下一步 M4 Create：逐页布局、参考卡/LoRA/提示词与提交栏；M8 再统一设置行布局，保留本包 B1 行为。B6/B7 自由值与 B8 富文本仍按 M0 边界。全部生成截图/临时日志留在 temp，不提交或打包发布。
