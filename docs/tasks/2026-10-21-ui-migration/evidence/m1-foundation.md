# M1 基础层与旧页面兼容

- 类型：Evidence；日期：2026-10-22；适用：当前 0.66.6 工作区；状态由 [TASK](../TASK.md) 维护。
- 影响：整体迁移为 minor；本包是主题基础层，不改业务类型、AppApi、IPC、草稿/队列/History 存储或模型能力。不需要给旧设置添加迁移字段。

## 已接入的边界

- `src/style.css` 明确声明 `legacy, reset, tokens, base, components, patterns, pages`；原 11 个文件按原顺序导入同一个 legacy 层。旧 `!important` 保持原先有效，不尝试用新的重要声明反向覆盖；后续页面包删除取代的旧规则。
- `src/styles/tokens.css` 承接批准的灰阶、深度、主题色、字体、间距、圆角和动效。`index.html` 首帧默认 azure / graphite / depth 1 / motion system；不读取或写入外观设置，持久化留给 B1。
- `legacy-tokens.css` 在 tokens 层把旧基础变量和旧语义颜色映射到新角色；不是第二套配色。旧字号/间距/圆角/页面几何暂留原值，避免提前挤压尚未迁移页面。旧选择器里的直接颜色仍随相应页面包删除，本包不声称所有控件已完成换肤。
- `base.css` 管字体、画布、选中背景及显式 reduced-motion 对旧控件的降级。不新增页面布局、控件 DOM、事件或状态字段。
- LAN 的 `00-tokens.css` / `palette.css` / web 入口及样式完全保留；desktop bridge 不进入 LAN 构建。构建和实际计算检查共同覆盖这条隔离边界。

## 对比度与原型的小幅差异

检查入口仍为 `npm.cmd run verify:ux-ui-contrast`，现在由 Node 启动隔离 Electron，加载真实 CSS import/layer，在 Chromium 中解析颜色并转换为 sRGB 像素后计算 WCAG 对比度。不是用正则把不同选择器的最后一条变量当作当前主题。

- 桌面 5 灰阶 × 3 正式深度：text-1/2/3 和旧 5 个文本角色，分别检查 4 个表面；8 种主题色的普通/hover 实心按钮白字或深色字也检查，合计 720 对。
- LAN 旧 5 个文本角色 × 4 表面，20 对；另核对 bg/panel/primary 精确保持旧配色。桌面另检查别名相等、旧背景渐变没有盖住新画布、显式 reduced-motion 触达旧元素、恢复 standard 的 token。
- 首次检查发现原型部分深/平衡档的 text-3 在 surface-3 上不足 4.5:1；生产将两档 n10 占比分别从 70% / 50% 调为 60% / 45%。晴蓝/海蓝的白字实心按钮使用从 accent 派生的深色 fill，进度/选中 accent 不变。已同步 DESIGN.md，不改原型或重新定审美方向。
- 正式 3 档深度、8 种主题色均通过；原型遗留 data-depth=3 不在产品提供范围。本检查覆盖语义角色，不等同所有旧硬编码文字/渐变背景已逐元素验收。

## 验证结果

- focused `tests/ux-ui-tokens.test.ts`：24 项通过；更新“先载入旧 token”的旧断言为 legacy 隔离与新主题入口，其他旧选择器与语义行为断言保留。
- 完整 `npm.cmd run verify`：退出 0；2387 单元 / 91 集成、干净桌面与 LAN 构建、双端 typecheck、740 对比度检查通过。日志 `temp/ui-migration-m0/m1-verify.log`。此后只改截图等待/有效 mock、检查脚本的额外兼容断言和文档；生产输入未再变化，额外断言单独执行通过，不重复整套构建。
- 截图：`temp/ui-migration-m1/current/1440x900` 18 张，与 M0 同 fixture/locale/zoom/窗口参数。检查 18 页概览及 Create/视频详情原图，页面结构保持；画布、卡片语义色、主按钮和通知已变。1120/820 图片页与 900 Queue/History/Settings 另有截图与诊断。
- 收尾矩阵 `temp/ui-migration-m1/matrix`：1120x800 的 16 页（既有 manifest 不为详情页选择该宽度）、900x800 的 18 页、820x900 的 18 页，连同 1440 的 18 页合计 70 张。三个窄屏矩阵的 52 条 documentScrollWidth/clientWidth 诊断均无整页横向溢出；人工查看 1120/820 全页概览，没有新布局破坏。不是所有页面在所有精确 CSS 断点的人工功能验收。
- Queue running mock smoke 通过：进度 42→67%、阶段与预览/遥测增量更新，暂停/取消仍可达；不是真实 GPU 运行任务。
- History album mock smoke 通过：tab 方向键/Home/End、筛选无结果→清除、布局切换、菜单导航与 Esc/焦点返回、卡片 Space/Enter、详情/版本、删除确认取消与返回。
- Settings mock smoke 通过：10 个现有 tab 的语义、窄屏单行、方向键/Home/End、应用路径与环境切换、焦点恢复与无整页横向溢出。B3 的真实“只浏览误报未保存”未在本包修复或宣告验收。
- M0 的窗口外框与 CSS viewport 差异仍保留：例如 820x900 的 document clientWidth 为 794；1120/900/820 均记录实际值，不把命名当精确 CSS 断点。820 图片页的局部选项裁切/提示拥挤与 M0 相同，不追加全局修补。

## 验证工具修复与限制

- History 初次 smoke 过早点击：renderer 先提交 DOM，再分帧挂载播放器和绑定 controller。旧 CSS 对照也发生早点击失败；`waitForDom` 现在等待四帧并复核表达式，再操作。保留首次失败日志，最终完整 smoke 通过，生产逻辑未改。
- Settings 初次 smoke 在应用路径页卡住：自动补桩的 `getAppCache` 返回 null，页面因此不断懒加载/重绘；日志页同样需有效快照。补充符合 AppCacheSnapshot/AppLogSnapshot 的空 mock 后完整 smoke 通过。未以假缓存值冒充真实磁盘扫描。
- 未使用旧 Create smoke 的“移除 disabled 再点击”分支证明提交能力。此包未改变提交语义，生产 DOM 用户旅程测试包含在 verify；本次没有新增真实 AppApi task ID、真实模型加载/播放或 GPU 输出证据。
- 合成 Settings 卡片与媒体沿用旧样例；不证明当前全部模型已在截图里展示、媒体可解码或 FastH3/MOSS 出图。新增模型的能力与待验范围仍由各自 TASK 维护。

## 收尾

本包不打包、不 bump 版本；Unreleased 记录分阶段 minor。收尾检查 scoped diff/链接/CRLF，停止自有 Vite 5175 / 旧 CSS 对照 5176，确认隔离 Electron 退出；保留原型服务 5199，不操作用户应用与 ComfyUI。
