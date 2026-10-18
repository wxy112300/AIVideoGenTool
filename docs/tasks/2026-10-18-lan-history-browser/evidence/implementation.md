# 实施与验证证据

- 类型：本任务实施证据；状态：local validation passed，实机范围见下；日期：2026-10-18。
- 当前状态：[TASK](../TASK.md)；设计与研究：[DESIGN](../DESIGN.md)、[逐屏来源](visual-references.md)。

## 实现边界

- 新网页入口为 `src/web/`，独立 Vite 构建到 `dist/web`，没有 preload/AppApi 依赖。宿主通过 `lan-browser-host` 读取 Settings 并管理受限 HTTP，不改变 ApplicationRuntime 的组合边界。
- Settings 默认关闭、端口默认 8790，开关保存即生效；多网卡 URL、复制、系统浏览器打开、失败重试和端口修改均已接入。现有 Settings 保存协调器仍负责持久化。
- 网页包含六种排序、收藏、评分上下限、最短时长、模型和包含/排除标签。分页查询固定 asset/version 顺序；整理返回列表后重算筛选并恢复锚点。只为附近视口创建图片节点，观看始终只有一个 video。
- 媒体走现有身份/文件定位及共享字节 Range 流；HTTP 不复用桌面宽 CORS 或暴露通用文件访问。缓存命中返回既有 v3 图片；miss/stale 才串行 CPU FFmpeg，复用候选时间、评分及 source revision 保存守卫，不代表不同解码器逐像素或质量完全一致。
- 写入仅收藏、半星评分与 tags，经过原串行 MetadataService。If-Match 冲突返回 409，编辑草稿保留；不变更 Prompt、路径、任务或版本身份。
- 密码/配对按用户明确指令延后；当前 UI 提醒服务未设密码。未建立通用 Headless/API、转码或创作入口。

## 自动检查

- 最新 `npm.cmd run verify`：225 个单元测试文件 / 2,098 项、6 个 integration 文件 / 88 项通过；类型检查、两个生产前端构建、Electron 编译及 20 组文本对比度通过。
- 新测试覆盖：HTTP 数据投影、筛选/固定顺序/默认版本、GET/HEAD/Range/416、路径/非浏览 API 拒绝、Origin/Host/字段白名单、半星验证、并发冲突、端口占用恢复、停止释放、缓存命中不启动 producer；手势互斥与取消恢复；Settings 复制选中 URL、打开能力、开关保存与跨 tab 保留。
- 既有 History、封面、媒体与 Settings 检查包含在完整回归中。构建保留非阻断的 renderer chunk >500kB 提示；部分既有 jsdom History 测试打印未实现 scrollTo 的环境提示，断言通过。未把静态结果当真机媒体/性能结论。

## 首轮真实 App 与独立网页（布局增量见末节）

首轮生产构建夹具位于本机 gitignored `temp/lan-smoke-cddf4c/`，上一完整夹具为 `temp/lan-smoke-Y3if5f/`。这些临时 JSON/PNG/日志/媒体不入库。

| 路线 | 证据与结果 |
| --- | --- |
| Settings 开关 | 实际点击开启，状态 running 后显示网卡地址；复制/打开控件启用。实际关闭后连接拒绝，重新开启恢复。 |
| 浏览器独立性 | 专用 Chromium 窗口无 preload，`typeof window.studio === 'undefined'`；实际加载生产 HTTP 页面与 API。 |
| 触摸与播放 | 原生 CDP touch 输入：中心暂停/继续、周围信息显隐及 inert 焦点隔离、长按 2×/松手恢复、向上滑动进入下一条；真实 H.264 解码帧推进、loop、contain 均通过。 |
| 整理与筛选 | 实际按钮点击取消收藏、保存 3.5 分和新增标签，桌面 AppApi 与磁盘状态一致；收藏筛选从 120 条变为 29 条，观看序列正确；返回后切相册成功。 |
| 布局 | 390×844 为 2 列，820×1180 为 3 列，1180×820 为 5 列，1440×900 为 6 列，均无横向溢出；另实际检查 320×700，三个工具按钮均在视口内。 |
| 缓存 | 冷缓存首屏产生可解码 JPEG；既有缓存命中不执行取帧由服务测试证明。 |
| 网络 | 本机使用两块实际 IPv4 网卡地址访问均 HTTP 200；这不证明其他物理设备/路由器/防火墙可达。 |
| 重启/退出 | 同一隔离 profile 真正进程重启后，开启选择、端口、收藏/评分/tags 与 120 项历史保留，服务自动恢复。cleanup 核对 PID/profile/空队列后经原生 CloseMainWindow 关闭，自有进程和 HTTP 监听退出。 |
| 原桌面邻接 | 实际 Create/Queue/History/Settings 在 1280×800、1440×900 均无横向溢出；原 History 视频解码与返回可达。 |

夹具使用 CPU 生成的 3 种比例短 MP4 与 120 项元数据，只修改隔离目录，不写用户原库，不启动 ComfyUI 或 GPU 生成。已查看手机墙/播放器和 iPad 布局截图，确认媒体占主导、无卡片标题行、完整显示与加载占位；测试图案不构成真实内容审美/质量评估。

## 调试负结果与限制

- 新 Vite 入口最初误加载仓库旧生成 JS，真实页面启动失败；已采用与桌面一致的 TypeScript 优先解析，之后独立启动通过。
- 隐藏 Chromium 的输入确认延迟曾把脚本滑动拖成长按，截图也曾等待超时。先记录实际 PointerEvent 时间证明原因，再改为有序连续触摸投递和 offscreen 绘制的测试窗口。最终输入仍经过浏览器事件系统和生产手势处理，没有直接调用业务 handler。focus emulation 作为测试条件明确保留。
- 一次 Settings 脚本选择了同为 data-page=create 的品牌按钮来断言 active，已改用真实 nav-button；不把该脚本错误记为产品回归。
- CUA 工具初始化失败，采用仓库 CDP；不是 Safari/Android 实机证据。仍未验证实际声音/自动开声、系统媒体按键、旋转安全区、各种历史 codec、跨物理设备网络，以及 1k/10k 元数据真实资源性能。密码/配对是延后范围。
- 所有失败夹具均已按自身 manifest 清理；最终 cleanup/restart JSON 记录于各隔离目录。无用户媒体/队列变更，未下载权重、打包、发布或提交。
- 最终复核 11 个本任务目录的 HTTP/CDP 端口，剩余监听为 0；修改文档的 124 个本地目标全部存在，`git diff --check` 通过，`guide lan-browser` 返回 ok。

## 2026-10-18 补充：iOS 安全区与两种布局密度

- 用户补充已实现：瀑布流移除比例钳制，真实宽高比直接决定卡片高度，图片 contain；相册统一 3:4 框、cover 填满无留边，按约 96px（含间距）计算列数，手机 390px 四列、320px 三列，大屏上限 12 列。切换入口保留，并修正切换后的 tooltip。
- iOS 播放器读取动态底部安全区，进度条完整 44px 触摸目标位于安全区上方再留至少 18px；横屏左右同时避让。系统 Home 条区域不处理播放点击/长按/切片。视频本体继续 contain 完整显示。
- 安全区依据 [WebKit 官方设计说明](https://webkit.org/blog/7929/designing-websites-for-iphone-x/)。真实浏览器夹具通过 CDP `Emulation.setSafeAreaInsetsOverride` 设置环境变量，没有替换生产 CSS 或直接调用业务 handler。
- 最新完整验收夹具：本机 gitignored `temp/lan-smoke-DKXv9N/`；report ok，已查看四列相册及横屏播放器截图。390×844 / bottom=34 时，进度触摸区 bottom=790、height=44；844×390 / bottom=21 / left=right=44 时，bottom=349、left=84、right=760、height=44。均在安全边界之外保留额外间距，底部触摸不切换沉浸状态。
- 实际点击两次模式切换证明：相册四列且 object-fit=cover → 瀑布流两列且 object-fit=contain → 相册恢复。320px 相册三列无横向溢出；平板/桌面相册为 8/12/12 列。端到端播放、触摸、筛选、三种整理和开关停止继续通过。
- 新测试包含超宽/超高原比例，以及 Home 条区域的点击/长按/滑动不被播放器接管。完整回归总计 2,185 项通过，生产构建与对比度通过；自有 App/browser 经原生关闭，cleanup 记录 app/browser/listener 均已退出。以上是安全区模拟，仍不代替真机 iOS/Safari 验证。

## 2026-10-18 补充：透明进度区、合并评分与 Prompt 信息窗

- 根据用户新授权增加独立只读 Prompt 接口，按 asset/version 返回身份与正文，与桌面 History 的 version LoRA 格式一致。列表仍不包含 Prompt，三种整理接口仍拒绝写入 Prompt；当前改动不开放执行图、文件路径或完整状态。
- 进度区域背景改为透明，保留原安全区/44px 触摸目标。评分星标和数字并入一个按钮，评分改为紧凑居中浮层；新增 i 按钮，按需取只读 Prompt。长文本保持换行并可滚动选择，以 textContent 渲染，空文本有提示，失败可重试；关闭会中止未完成请求，按进入前意图恢复播放。
- 服务测试证明正确版本的 LoRA 触发词、精简响应、no-store、空 Prompt、未知版本 404、跨站 403、写入方式 405；列表不含 Prompt 的原断言继续通过。
- 本机 gitignored 夹具 temp/lan-smoke-up7mlC/report.json 为 ok：进度背景 none、评分入口 1 个且数字在按钮内部、无游离分数入口；实际点击评分浮层并保存半星；i 信息窗长 Prompt 滚动、换行与包含 script 标签的字面文本均正确，未创建脚本节点。空内容、关闭后恢复播放、既有安全区/手势/两种布局/标注/停止监听继续通过。已查看 phone-rating.png、phone-prompt.png。
- 同夹具 prompt-recovery.json 为 ok：通过浏览器 Fetch 故障注入验证失败提示、实际点击重试后加载成功，以及关闭挂起的信息请求后无残留浮层或迟到正文。仅测试自有 HTTP 请求，没有直接调用业务 handler。
- 最新完整回归为 2,186 项通过；构建、类型与对比度通过。真机 iOS/Safari 验收仍未替代；资源清理以该夹具 cleanup.json 为准。
