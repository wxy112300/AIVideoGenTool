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

## 2026-10-18 补充：用户实测后的缓存与播放器优化

- 只读盘点当前用户库：129 视频资产、140 版本；137 版本命中 v3 磁盘缓存，3 个缺少 JPEG/metadata，0 个源大小或 mtime 变化造成失效。此证据不支持“每次启动全库重新生成”，但也不能证明用户其他机器的缓存情况。没有改动用户状态/媒体或重建缓存。
- 定位并修复：`resolveHistoryFile` 只取 Settings，LAN 按 ID 只复制目标资产；此前每张封面定位都会复制完整 AppState，当前约 2.8 MB 快照在该机实测约 13.5ms/次（单次环境基线，不当作所有设备性能）。v3 key/mtime/size/sourceRevision 与删除防复活保护保持。冷封面生成后台去重，HTTP 立即释放后重试；命中项不等待 FFmpeg。列表 4 个并发短请求，Blob 有界复用，卸载回收 object URL，ETag 复验；无全库预生成。
- 播放器改为纯声音图标、加载/缓冲圈；进场/返回与纵向滑屏动画，画面跟随拖动，reduced-motion 跳过位移；缓冲中仍可继续切片。列表返回顶部、iOS 布尔开关、暂停标记 2 秒淡出/空白处隐藏。进度条独立 44px 命中层避免原生 thumb 的短轨道覆盖映射，合并解码 seek 后精确提交，焦点停在 slider 也更新；进度行仍透明并保留安全区。
- 实际触摸验收最初捕获 74% 指针落点被原生 range 覆盖为 75.1%，已通过独立命中层修正。一次脚本在 200ms 淡出过程中断言 opacity=0，改为等待真实淡出完成；没有放宽产品要求。
- 最终隔离夹具 `temp/lan-smoke-dYB0ZJ/`：基础 report.json 为 ok，手机双列瀑布流/四列相册、320px 三列、iPad 横竖屏和桌面、原有筛选/Prompt/三种整理与服务开关通过。安全区 bottom=34 时进度完整 44px 目标 bottom=792（额外 18px）；横屏 bottom=21/left=right=44 时 bottom=351/left=82/right=762，均安全。
- 最终构建的 `polish.json` 为 ok：Fetch 暂停真实媒体请求时加载圈可见，声音为无文本 SVG；长按 2× 在 0.6574s 推进 1.314846s，松开连续至 1.750519s 并恢复 1×，没有 seeking/loadstart/emptied 事件，最大解码帧间隔约 100.3ms（12fps CPU H.264 样本）。进度显示 740/1000，12 秒视频最终 8.879999s，暂停拖动保持暂停、播放拖动恢复播放；滑动时舞台 transform=-210px，实际 Animation 运行后切片，返回动画、顶部按钮和 51px iOS 开关实际点击通过。补测纯观看 Escape 返回后再开视频，信息/返回入口可见、舞台 transform=none，防止前次沉浸/拖动状态残留。
- 两张封面暖读合计约 14.5ms（loopback，不代表物理 LAN）；文件大小/mtime 不变。实际桌面 History 7 次 lookup 全部 hit、sourceVideoLoads=0。`restart.json` 验证正常关闭后的新 PID，同 profile 自动开服务、整理持久化、HTTP 封面直接 200；原缓存/metadata 未重写，桌面重启 7 次 lookup 全部 hit，sourceVideoLoads=0。
- 已查看 loading/scrub/swipe/switch/paused-clean 五张实际截图。`cleanup.json` 为 browser/app/native/listenerClosed 全 true；无 ComfyUI/GPU 占用。真机 iOS/Safari、Android、实际音频与跨物理设备网络仍需验证，未声称已解决所有硬件解码卡顿。
- 最终完整 `npm.cmd run verify` 通过：229 单元文件/2,115 项 + 6 集成文件/88 项，总计 2,203；typecheck、双入口生产构建及 20 项对比度通过，日志在 gitignored `temp/lan-polish-verify.log`。该数字为当时工作区整体，包含其他任务同期检查；Strata 相关改动未由本任务编辑或回滚。原有 chunk 大小警告非阻断。
- API 设计参考：[MDN currentTime](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/currentTime)、[MDN fastSeek](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/fastSeek)；精确释放使用 currentTime，长按仅切 playbackRate，不以不精确 seek 模拟倍速。

## 2026-10-18 补充：封面后台队列与退出持久缓存

- 用户明确修复方向：生成封面是后台队列任务，快速滚动最多调整顺序，不能让预览后精修/保存被卡片卸载打断；App 退出仍保留已经落盘的缓存。本轮为 patch，Unreleased 登记，保持 0.66.0。
- 桌面 media store 本来由应用级 History coordinator 持有，现将其 lookup/图片生产/视频生产/保存调度器改为非抢占（通用 scheduler 其他消费者仍保留原默认行为）。增加 background 等级；最后 UI consumer 离开只降级、不取消，当前视口变化原地升/降等待优先级，在途任务始终复用。图片/视频生产仍分别限制 3/1 并发，保存 1；完成后回收无引用 Blob 并限制结果 LRU，未把整个库主动入队。
- 仅 source/reference 变动、显式 invalidate 和 dispose 中止旧任务；校验 revision、stale 重读与删除防复活逻辑保留。退出释放临时队列/解码器/内存 URL，不删除 v3 JPEG/PNG 或 metadata；不要求 App 退出后继续运行后台进程。LAN 既有宿主 CPU 补图也不因网页卡片销毁而中止。
- 单元回归覆盖非抢占执行、已接受离屏任务不丢、等待队列重新排序、预览后离开仍保存、重入在途 lookup 去重、App dispose 中止迟到结果、source stale 重新校验；原保存失效/删除保护与缓存命中不解码继续通过。focused 6 文件最初 41 项通过，最后增加 source stale 竞态检查纳入完整 verify。
- `temp/lan-smoke-cover-queue-LnwVTt/cover-queue.json` 为 ok：新隔离 profile、18 个合成视频记录、空缓存。实际进入 History 后快速滚动至底并点 Create；离页时 lookup=13、sourceVideoLoads=1、seeks=1（已有预览，尚未保存）。保持 Create 页面时，全部 13 项完成：sourceVideoLoads=13、coverSaves=13、sourceDecodes=13、seeks=65、cancelledRequests=0、临时 URL 创建/回收均 26、剩余 Blob/URL=0。回到列表 6 次 hit，不增加源解码。
- 同 profile 经 helper 正常原生关闭后重启，7 次 lookup 全 hit、sourceVideoLoads=0；此前封面与 metadata 的大小/mtime 完全相同。详情通过可见播放器入口真实解码（10 帧、paused=false），不调用生成队列或 ComfyUI。最终 cleanup.json 为 browser/app/native/listenerClosed 全 true。
- 调试限制：Chromium Fetch 不拦截 studio-media 自定义协议，最终改为真实冷生产计数与“离页时尚未完成”的严格断言，不替换生产 handler。两次详情 smoke 在 autoplay 尚未稳定时点击了正在转为播放的按钮，导致自身暂停；改为等待媒体 ready 与状态稳定后才决定是否点击，真实播放随后通过。失败夹具 oBbfNn/bPYcBw/qWbX2h/q2lmDm 均各自正常清理。
- 最终 `npm.cmd run verify` 通过：229 单元文件/2,125 项 + 6 集成文件/88 项，共 2,213；生产构建、类型和 20 项对比度通过，日志 `temp/history-cover-queue-verify.log`。总数包含共享工作区其他任务当时的检查；其代码未由本任务修改或回滚。未修改用户库、下载权重、打包、提交或推送。

## 2026-10-18 补充：局域网设置位置与两列排版

- 根据用户要求，将 LAN 分区放在缓存管理之后、下载代理之前，开关/端口复用现有 settings-grid two；端口提示随右列，状态和失败重试独立显示。地址不再是 select，改为每网卡一个只读文本框，同行复制对应 URL、通过原 AppApi 在本机打开浏览器。轮询不变时不重建文本框；未更改服务配置或 IPC。
- focused：`tests/lan-browser-settings.test.ts` + `tests/settings-form.test.ts` 共 10 项通过；包含多网卡第二行真实复制对应字段、只读输入、打开 AppApi 与保存开关。
- 完整 `verify` 通过：229 单元文件/2,126 项 + 6 集成文件/88 项，共 2,214；类型、生产构建、20 项对比度通过，日志 `temp/lan-settings-layout-verify.log`。总数仍包含其他任务同一工作区的检查，本任务未改其代码。
- 实际隔离夹具 `temp/lan-smoke-BvDW60/report.json` 为 ok：1280×800/1440×900 两种尺寸均断言 cache→LAN→proxy、开关与端口左右两列且顶端对齐、全部 URL 为 readonly text input、复制/打开与输入同行、无横向溢出。地址输入可用宽度分别约 685/845px；两张实际截图 settings-lan-1280.png/settings-lan-1440.png 已查看。
- 相同夹具继续通过服务开关、独立网页筛选、相册/瀑布流、播放/Prompt/三种整理与停止监听。最终 cleanup.json 为 browser/app/native/listenerClosed 全 true；未访问用户库或启动 ComfyUI/GPU。该轮为 patch Unreleased，未另行递增版本、提交推送或打包。
