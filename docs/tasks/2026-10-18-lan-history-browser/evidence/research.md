# LAN 视频浏览：调研依据

- 类型：research/evidence；状态：本轮调查快照。
- 日期：2026-10-18；范围：架构可复用性、媒体浏览 UX、开源播放器和浏览器限制。
- 权威与后续：[TASK](../TASK.md) 保存当前状态；[DESIGN](../DESIGN.md) 是建议方案。网页及上游状态变化需重新核验。
- 方法：代码阅读、History harness guide、公开官方文档/项目源码页面。没有运行浏览器原型、服务、真实 LAN 或手机实测。
- 后续需求修订（2026-10-18）：用户接受以设备按键控制音量，删除网页音量调节范围；确定 Settings 开关、LAN URL、复制地址和本机浏览器打开入口。下文音量资料保留为研究依据，不再是待实现能力。
- 最新补充：确认跟 App 生命周期、移动端取消日期 Slider、采用首次数字配对方向。实际查看的官方截图及采用规则见 [视觉参考](visual-references.md)，不再仅以产品名称描述设计方向。
- 后续优先级修订：密码/配对留最后且可能取消；下文配对资料仅为可选候选，不作为核心浏览与 LAN 开发的前置要求。
- 新增用户指定的 GrokImage/Grok Imagine 视觉主参考；实际查看 xAI 官方项目/画布/搜索演示的 3 张 poster，已记录采用与排除规则。没有登录或操作 Grok，不从静态图片推断手机手势和信息显隐行为。

## 1. 仓库证据（6b24b9b / 0.65.4）

| 问题 | 直接证据 | 判断 |
| --- | --- | --- |
| 已是 HTTP 前后端分离吗？ | [架构契约](../../../ARCHITECTURE_CONTRACT.md)、[preload](../../../../electron/preload.cts)、[renderer client](../../../../src/renderer/studio-client.ts)、[runtime](../../../../electron/application-runtime.ts) | typed IPC + 内嵌服务分层；不是现成 headless/API 产品 |
| 完整视频 Filter 是什么？ | [history-filter.ts](../../../../src/core/history-filter.ts) | 收藏、半星上下限、最小时长、模型、标签包含/排除；六种排序，稳定 ID tie-break |
| 日期是否等于创建日期？ | 同上 `historySortTimestamp`；[timeline.ts](../../../../src/renderer/pages/history/timeline.ts) | 使用 updatedAt 优先；当前日期分组用执行环境本地时区，只在时间排序生成时间轴项 |
| 手机列数可以原样复用吗？ | [helpers.ts](../../../../src/renderer/pages/history/helpers.ts)、[layout-controller.ts](../../../../src/renderer/pages/history/layout-controller.ts) | 桌面 masonry 在 <=480px 返回一列；需要网页自己的响应式策略 |
| 三种整理写入存在吗？ | [metadata service](../../../../electron/services/history-metadata-service.ts)、[类型](../../../../src/types.ts) | 存在，评分 0.5–5 或 null；标签规范化；返回完整 AppState，不能原样外发 |
| 可以直接用媒体协议当公网 API 吗？ | [media service](../../../../electron/services/media-read-service.ts)、[protocol/IPC](../../../../electron/media-ipc.ts) | studio-media 有 History ID/版本定位及 Range，但同时包含 draft/queue/reference 分支和宽 CORS；需收窄 |
| 封面是否已经缓存、能否复用？ | [query service](../../../../electron/services/history-query-service.ts)、[thumbnail producers](../../../../src/renderer/pages/history/thumbnail-producers.ts)、[resource store](../../../../src/renderer/pages/history/media-resource-store.ts)、[paths](../../../../electron/services/studio-paths.ts) | 已有磁盘缓存 `history-covers/v3`；lookup hit 直接读盘，miss 才由 renderer video/Canvas 生产，经 IPC 主进程保存图与源 metadata。LAN 可直接复用有效缓存，只需受权 HTTP 出图；缺失/失效再补生产，不能说整个封面能力需要重做 |
| 默认视频版本如何选？ | helpers 中 `preferredVersion` / `currentHistoryVersion`；[batch helper](../../../../src/core/history-batch.ts) | 播放默认与复制最高分辨率文件不是同一策略，须沿用指定版本身份 |
| 存储能否多进程直接共用？ | [repository port](../../../../electron/ports/state-repository.ts)、[store](../../../../electron/store.ts) | 当前边界为一个应用持有串行更新；新增独立进程需要另设计跨进程一致性，不能假定已支持 |
| 当前播放器依赖 | [package.json](../../../../package.json)、[page.ts](../../../../src/renderer/pages/history/page.ts) | 已安装 media-chrome 4.19.2，值得先验证复用，不能据此推断定制手势已支持 |

## 2. 产品和视觉参考

用户指定的 TikTok/小红书作为交互意图：媒体优先、双列发现、逐条观看、轻信息、手势。本轮进一步实际查看官方截图并记录 [逐屏比较](visual-references.md)；截图不能证明手势/阈值，具体项目尺寸和动作以设计提议与后续真机验证为准，不复制品牌资产。

[Immich 官方功能页](https://immich.app/features) 包含时间线、相册、收藏、标签等媒体库模式；[搜索说明](https://docs.immich.app/features/searching/) 提供标签、时间、媒体类型、评分等组合筛选的参考。采用“同一资产库上的浏览与整理”思路；不为本功能引入它的整套部署、数据库或 AI 搜索。

设计推断：列表复用现有视觉语言，观看页采用黑底、局部渐变和少量信息；通过 Filter 控制结果集而非算法推荐。尺寸、响应式区间、手势时间均为项目建议，未获得真机可用性证据。

## 3. 播放器候选（当日上游核验）

| 候选 | 官方依据 | 本次取舍 |
| --- | --- | --- |
| 原生 video + 现有 Media Chrome | [控件位置](https://www.media-chrome.org/docs/en/position-controls)、[controller 源文档](https://github.com/muxinc/media-chrome/blob/main/docs/src/pages/docs/en/components/media-controller.md) | 控件可按 slot 定制，允许关闭内置 gestures；优先做现有依赖小样验证，再由项目统一处理切片/长按，不渲染音量调节控件 |
| ArtPlayer | [官方选项](https://github.artplayer.org/document/en/start/option.html#fastforward)、[MIT 许可](https://github.com/zhw2590582/ArtPlayer/blob/master/LICENSE) | 文档明确支持移动手势和长按快进，适合参考与候选对比；不证明与本项目上下切片及 iOS 行为均无冲突 |
| Plyr | [官方仓库](https://github.com/sampotts/plyr) | 当日 README 已标记 deprecated、仅安全更新并建议新项目用 Video.js 10；不作为新增默认依赖 |
| Video.js 10 | [官方首页](https://videojs.org/) | 当前新一代候选，官方描述 UI 与媒体渲染分离；若现有方案验证失败再评估，不能把迁移成本当成零 |

没有安装或升级任何播放器包，没有测 bundle、触控延迟或内存。实现前需核对锁定版本源码、许可、维护状态与实际设备行为；上游网页“latest”不代表仓库已安装版本。

## 4. 浏览器能力与设计后果

| 资料 | 已核实事实 / 适用边界 | 设计后果 |
| --- | --- | --- |
| [WebKit: New video policies](https://webkit.org/blog/6784/new-video-policies-for-ios/) | 官方说明 muted/无音轨、可见性、用户手势与 playsinline 的关系；2016 年基础政策文档，不是当前全部浏览器行为矩阵 | 调用 play 检查 Promise；自动播放失败给可见播放入口；开声由用户明确操作；保留真机验收 |
| [MDN volume](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/volume)、[Apple archived iOS considerations](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/Using_HTML5_Audio_Video/Device-SpecificConsiderations/Device-SpecificConsiderations.html) | MDN 当前标为非 Baseline；Apple 2012 文档记载 iOS 不允许 JS 设置元素音量。旧文档中 autoplay、倍速等描述不能整体套用到现代系统 | iOS 音量视为能力风险，降级为设备音量键/静音；不保证网页可调系统音量，不显示虚假进度 |
| [W3C Pointer Events](https://www.w3.org/TR/pointerevents/) | touch-action 决定默认平移；pointer capture 可保持区域拖动接收事件 | 区域提前声明；全手势用一个仲裁器；取消/失焦清理；不能识别后才临时抢回滚动 |
| [MDN Range](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Range_requests) | 字节范围与 Accept-Ranges / 206 / Content-Range 是媒体随机访问基础 | 从服务器按字节流出，验证 seek/HEAD/416，不把整段视频读成 base64 |
| [MDN canPlayType](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/canPlayType) | 返回的是对指定类型的支持可能性，不是某个文件已成功解码 | 结合实际播放错误与样本测试；文件扩展名/静态判断不能证明 iPhone 可播 |
| [MDN Secure Contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts) | HTTP localhost 的可信例外不能推导任意 LAN IP 同样可信 | 核心网页流程按普通 LAN HTTP 能力实现；PWA/Service Worker 等另验 HTTPS |

## 5. 未知与失效条件

数字配对依据：[OWASP Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) 的失败尝试限制/节流，以及 [Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) 的独立会话、失效与 cookie 管理。六位/5 分钟/一次使用是本项目建议值，不是上述文档对本场景的规定；临时码校验成功后应换成随机会话，不把短码长期用作每个视频请求的密钥。

- 未扫描用户真实历史库的编码/码率/尺寸、媒体缺失率和缓存命中率，不声称所有旧视频跨浏览器兼容。
- 未测 iOS/iPadOS 当前机型的低电量模式、开声后连续切片或长按倍速。桌面设备模拟不能关闭这些未知项；元素音量已退出实现范围。
- 未测试 PC 休眠、Wi-Fi 客户端隔离、Windows 防火墙及多网卡地址可达性。
- 未对现有持久化链路做大量移动端标注压力测试；若整份 JSON 写入/广播成为瓶颈，需以证据决定优化，不能直接新增第二个数据库并复制元数据。
- 文档与设计以本次 revision 为基线；History 类型、默认版本、筛选/时间语义或相关服务变化后须重新核对。未来性能/安全/可用性结论须关联实际实现与真机证据。
