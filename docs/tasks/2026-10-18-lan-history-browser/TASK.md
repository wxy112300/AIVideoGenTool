# 局域网历史视频浏览器

- Status: implemented；本机生产构建/协议/触屏模拟验收通过，真机验收另记。
- Updated / Owner: 2026-10-18 / 当前 agent
- Scope / Authority: 用户已要求“开工”；依已确认的移动优先设计实现独立外部网页、LAN 服务、Settings 开关及有限整理；认证最后可选。
- Baseline: `6b24b9b`，`0.65.4`；开始时 `git status --short` 为空。
- Execution: direct；children=0。

## Resume

- 设置排版已按用户新要求调整：缓存管理 → 局域网浏览 → 下载代理；开关/端口左右两列，地址使用只读文本框，各网卡地址逐行显示且复制/打开与文本框同行。针对性设置检查 10 项、完整 verify 2,214 项通过；实际 App 1280×800/1440×900 的顺序、两列、同行按钮与无溢出验证通过，截图/清理见实施记录。

- 用户最新明确：封面生产是后台队列，快速滚动仅重排优先级；App 退出保留已有磁盘缓存。桌面 History 的应用级 media store 已改为非抢占队列，当前视口/预取/后台分级；离屏或切页只退订 UI，不取消查找、抽帧或保存，重复进入复用同一任务。源失效/删除、显式 dispose 才取消临时工作，v3 图片/metadata 不随退出清理。真实冷队列验收已通过：13 个接受任务在离页时仅启动 1 个，切到 Create 后全部生成/保存且无取消；重启 7 个可见项全 hit、0 解码，缓存文件未变，详情播放通过。最终 verify 为 2,213 项通过；自有夹具已正常关闭，未修改用户库。

- 0.66.0 已提交推送（475722c）。用户实测后要求继续优化：封面加载、图标开声、加载圈、倍速连续性、滑屏/返回动画、返回顶部、iOS 开关、暂停截图与精准拖动。本轮按 patch 影响登记 Unreleased，版本保持 0.66.0；新一轮提交/推送未另行执行。
- 已只读审计实际库：140 视频版本中 137 命中 v3，3 个无封面，0 个源时间/大小失配。没有证据表明每次启动全库重生成；已修复每个源定位复制全量状态、LAN 冷请求占槽/3s 重试、原生 range 改写触摸落点/焦点冻结进度等问题。实际独立浏览器 polish 与进程重启通过；140 版本审计未修改用户库。最终 verify 为 2,203 项通过，精确范围见实施记录。

- 最新补充：进度区域透明无背景；评分星标与分数合并为一个入口，在紧凑浮层完成评分；新增 i 信息窗按需只读查看 Prompt。用户已明确授权该正文读取范围；列表仍不预载 Prompt，接口不返回执行图/路径/配置，也不允许修改 Prompt。

- 最新补充：iOS 进度条完整操作目标在底部安全区之上再留 18px，Home 条区域不触发播放器手势。手机瀑布流严格原比例两列，相册填满框无留边，390px 四列、320px 三列，保留模式切换；观看视频仍完整显示。增量检查见实施证据。

- 已交付独立 `src/web/` 浏览入口与受限 HTTP 适配器，Settings → 系统提供默认关闭的开关、端口、多网卡地址、复制和本机浏览器打开；保存选择，重启恢复；关闭和正常退出 App 停止监听。ComfyUI 不参与浏览。
- 按已接受的 [DESIGN](DESIGN.md)：Grok Imagine 为主参考，手机优先、弱标题；双列/多列瀑布流和相册、完整筛选排序、单个 video 等比完整循环播放、中心暂停/周围沉浸/长按倍速/上下切换、收藏/半星评分/Tag。无创作、文件/Prompt 复制、删除、日期 Slider 和音量调节。密码/配对仍按用户指令留到可选最后阶段，不是待批准的实现门槛。
- 筛选、首选版本、封面候选/评分、Range 文件流共享纯规则；直接复用 v3 磁盘封面缓存，miss/stale 才串行 CPU FFmpeg 补图。HTTP 提供视频 DTO、facets、分页/查询快照、asset/version 媒体与三种整理写入；列表不预载 Prompt，i 信息接口按需只读返回正文，不下发 AppState/文件定位；revision 冲突不静默覆盖。
- 验收、截图与资源清理见 [实施证据](evidence/implementation.md)。完整 `verify`、实际隔离 Settings 开关、无 preload 浏览器、390×844 / iPad 横竖屏 / 1440×900、真实解码与触摸输入、整理持久化/进程重启均已验证；真机 Safari/Android、跨物理设备防火墙、实际声音与全部历史编码尚未验证。
- 原始架构与来源保留在 [调研](evidence/research.md)、[逐屏视觉参考](evidence/visual-references.md)；它们是带日期的调研证据，不覆盖本摘要的实现状态。当前没有必须由用户再决策才能使用的选项。

## Implementation and resources

- 版本影响：minor；按用户最新“增加一个版本号，提交推送，不是 Patch”指令升级至 0.66.0，更新 package/lockfile、README 与 CHANGELOG。本轮交付为源码提交推送，不打包、不创建 tag 或 GitHub Release；其他任务的 Unreleased 条目保留。
- 代码与文档由当前 agent 单独写入；children=0。仅创建本任务自有隔离 Electron/browser/HTTP/CPU FFmpeg 夹具，无用户库写入，无 ComfyUI/GPU 生成。
- 命令与资源回收方法统一在 [LAN 旅程](../../runbooks/PRODUCT_JOURNEYS.md#lan-browser)。最终本机产物/清理状态以实施证据为准。

## Evidence / handoff

- 仓库 Skill、架构/UX/本地化/验证契约已执行；原 History 与 settings-runtime guide 用于定位，新 lan-browser guide 已建立。
- 真实浏览夹具用三种比例的 CPU H.264 视频，不据此宣称真实全库质量、性能或所有编码兼容。1,000/10,000 条真实资源性能仍属后续测量。
- CUA 浏览器工具受 Windows 沙箱初始化失败影响，采用仓库已有 loopback CDP 路径与专用无 preload/offscreen 浏览器夹具；这是 Chromium 输入/解码/布局证据，不是 iPhone/iPad 实机证明。
- 一次大工具调用的自动审批超时，确认未写入后拆小重试成功；无未决审批拒绝。实际模型/effort 与 usage 未取得，unknown。
