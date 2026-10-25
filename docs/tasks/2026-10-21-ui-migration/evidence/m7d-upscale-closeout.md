# M7d：Upscale 与详情稳定性收尾

2026-10-23，minor；直接执行。M7 的视频记录、图片详情与 Lightbox 沿用 M7a–c，本批关闭剩余 Upscale 与扫描刷新事项。

## 实现与对照

- 对照 `prototypes/video-detail.html`、`app/history.css` 和 `app/video-detail.js`：620px 窗口、36px 标题图标、72px 源缩略图、104px 标签列、紧凑模型参数、估算卡、取消/入队。源码为独立 `src/styles/pages/upscale.css`，移除旧 Upscale 样式，保留公共控件。
- 实际选择 SeedVR2、SeedVR2 INT8、FlashVSR、Real-ESRGAN、H3、Konohamaru 六种模型，逐次核对底层 select 值；没有套用原型模拟参数。Konohamaru 保留五种倍率、风格、NR 数字/滑块及插帧；H3 保留真实 AV 和目标锁定。旧 DLSS5/Aether 只在旧任务恢复时保留选中身份，不重新开放。
- 输出显示真实源版本、目标尺寸、文件名与磁盘估算；缺失显存/耗时基准显示待首次基准。关键缺文件/缺组件/目标无效/AV 原因可见且阻止入队，普通说明按需展示。
- 修复遮罩高于共享下拉造成选项点击落到后方分辨率按钮的问题。4K 源不再被统一禁用，可进入已支持的 Konohamaru 原尺寸增强路径。
- 打开 Upscale 只刷新浮层；扫描不重建详情或 Lightbox。扫描结束仅更新已打开的 Upscale，恢复滚动/下拉；输入期间延后到失焦，避免打断编辑。

## 验证

忽略目录 `temp/ui-m7d/` 保留本机验证脚本、截图与报告，不纳入版本控制。

- `matrix-report.json`：zh-CN / zh-TW / en-US，1440 / 1120 / 900 / 820 / 547 五宽度，SeedVR2 / Konohamaru 共 30 状态；六模型分支另见模型截图与 `check.mjs`。取消窗口保留播放器节点，弹出选项可点击。
- `controls-report.json`：真实编辑 NR 1.7、60 FPS、Performance 2x，数字输入与滑块同步，取消恢复源按钮焦点。`zoom-150.png` / `zoom-report.json`：真实 Electron 150% 缩放，547 CSS 像素布局无内部横溢。该缩放检查使用实际生成的 dialog HTML 与源 CSS，是布局检查，不是媒体播放验证。
- `scan-report.json`：扫描未结束时进入视频/图片详情；结束后节点保持、视频继续播放、大图仍打开。`picker-scan-report.json` 的菜单打开时扫描已结束，不能作为菜单与扫描完成同时发生的实测证据；延迟完成、重开下拉/保留焦点由单元测试验证。
- `enqueue-report.json`：隔离夹具只把一份历史版本的 files 元数据临时置空，验证缺源提示/禁用；真实上一条按钮恢复可用视频，选择 Real-ESRGAN / 1080p 后点击加入队列。任务 `a2a0972d-bd32-4f1e-a02f-809eaba21f22`，源 `m6-video-34` / `m6-video-34-v1`。再改另一份窗口为 2160p，队列快照完整深比较不变。
- `restart-report.json`：退出并重启隔离 App 后，完整任务与 `frozen-task.json` 深比较一致，源版本/模型/尺寸不变，队列仍暂停、36 份视频记录保持。
- 最终 `npm.cmd run verify`（`VITEST_MAX_WORKERS=4`）：253 文件 / 2480 单元、6 文件 / 91 集成、类型检查构建和 740 对比度通过。此前默认并发曾触发外部进程相关的 5 秒超时；限制验证并发后通过，未修改断言或仓库配置。

## 边界与后续

- 仅使用自有隔离 Electron、Vite 与物理复制媒体；无 GPU 生成、无媒体删除，不据此推断模型质量或运行性能。收尾关闭自有进程并恢复原始夹具状态。
- B15 现有 AV / Motion 操作继续保留；本批不新增 managed Run 删除 API，沿用计划允许的视觉迁移边界。
- 扫描后离开 Settings 的未保存判断在验证中出现假阳性，属于 M8 的“只浏览不出现未保存”验收，尚未修复；M7 不扩大到设置页改造。
- 下一阶段 M8 Settings，保留当前 catalog/扫描提供的模型、LoRA、节点和运行时能力差异。

## 用户回归：展开 JSON 撑出卡片

2026-10-23，patch。用户截图显示原始 ComfyUI 输出快照超出文件卡片。复现发现 `details` 作为 Grid 子项沿用内容最小宽度，`pre` 的百分比上限不能阻止父项撑开；图片详情同样受影响。给详情记录的 `details` 设置 `min-width: 0`，并将其直接子 `pre` 限制在可用宽度内，保留格式与内部滚动。

- 自有隔离 Electron，视频与图片详情真实点击展开/收起；仅在 DOM 填充 37,812 字符的长行 JSON 以覆盖大工作流，不写入保存快照。
- 修复前页面宽度膨胀至 4492 / 4819px；修复后 1440 / 1280 / 820 三宽度下页面均不超过视口，代码区保持卡片内边距。横向及纵向滚动均可用，字符数保持，折叠正常。
- `temp/ui-m7d/json-before.json`、`json-after.json` 与 `json-video-after.png` / `json-image-after.png` 保存测量和截图。
- `json-verify.log`：完整 verify 2480 单元 + 91 集成、类型检查构建和 740 对比度通过（验证并发 4）。未修改提交链路，无 GPU 或媒体操作；验证窗口退出后恢复原始夹具状态。

## 用户回归：AV 展开与文件类型/大小

2026-10-23，patch。AV `dl` 被通用记录样式的更高优先级选择器覆盖，落入 80px 标签列；改为专属选择器下的横向字段组并允许换行。文件类型不再用冗长的 Continuum 技术角色作标签，只显示短类型；完整角色仍在悬停信息中，长标签使用正常尾部省略。

文件大小恢复原先只枚举 `version.files` 与旧 joint AV 两个引用，漏掉统一 AV owner/aliases、Continuum pointer/receipt。新增纯函数 `historyVersionOutputFiles`，让 renderer 文件列表与启动大小恢复共用同一引用集合；补读每份实际引用，路径去重后 stat，身份和快照保持。图片文件与 asset 汇总引用也覆盖。不存在/不可读且没有已保存大小的文件继续未知，不编造大小；旧记录在更新后启动时补读。

- `history-services.test.ts` 新回归用真实临时文件核对 owner、alias、pointer manifest/root、receipt manifest/payload 的实际字节数，并断言缺文件不伪造大小、原 files 不改写。
- `temp/ui-m7d/files-report.json`：隔离 App 的 1440 / 1280 / 820 窗口内真实展开 AV；四字段各高 20px，展开 facts 总高 30px，页面无横溢。真实临时 owner 4096B、alias 2048B、manifest 25B，经启动补读显示 4.0KB / 2.0KB / 25B。manifest 类型为 JSON，完整技术角色可悬停。三张 `files-*.png` 已目视核对。
- 临时 safetensors 文件仅为大小/排版夹具，不是真实可执行 latent；没有入队或运行 GPU。沿用已验证的提交链路，本批不改变入队资格。
- `files-verify.log`：完整 verify 2481 单元 + 91 集成、类型检查构建和 740 对比度通过，并发 4。验证窗口关闭后恢复原始夹具状态；不删除用户媒体。

## 2026-10-24：提示词、Slot 1、放大闪动与翻页图标

Patch。按用户四项反馈复现并修复，未开始 M8。

- 图片提示词 article 漏掉 `history-record`，导致 padding 0、block、标题 17px；恢复共用卡片后为 16px 横向内边距、grid、标题 13px。1440 / 1280 / 820 三宽度检查及截图通过，标题与复制动作同排。
- 删除 Slot 1 旧分支执行清空并留下同一个空 Slot；现与其他 Slot 一致，真正移除、顺序重编号、下一个参考提升为 base，同时重映射全部提示词版本的图片编号。清空素材保留 Slot 的操作不变。新增旅程测试覆盖多 Slot 删除首项、提示词编号、删除最后一项恢复添加；真实历史继续编辑后删除唯一 Slot 也通过。
- 浮层旧 `innerHTML` 路径没有预先 prime；连接后焦点/布局读取先采样旧材质，再异步增强，造成整批按钮过渡。现共用 inert template 准备控件与图标后再连接，浮层在绑定焦点前同步增强。相同源的缩略 video 在选项刷新中保留，避免重复加载画面。
- Lucide 默认扫描已有 `svg[data-lucide]` 时再次替换已有 SVG；现仅将未渲染 i 标为本次 pending 并渲染，保留已有 SVG 身份。主树、分阶段播放器、全屏详情替换均在连接前完成图标。版本指示块原缓存 key 跨作品共享，现包含 asset ID；同一作品内选版本仍保留动画。

证据在忽略目录 `temp/ui-m7d/`：

- `regress-before.json`：六条放大操作中，五条触发 29–41 个 border/shadow transition；翻页出现 56 个未渲染 i 占位、8 次 SVG 直接移除和一次错误的版本分段动画。
- `regress-after.json`：同一路径主页面 icon、播放器、同源缩略 video 保持；尺寸/倍率按钮批量边框过渡消失，菜单只剩实际指针经过的控件正常 hover。翻页未渲染占位 0、额外 SVG 移除 0、版本误动画 0。没有关闭全局动画或正常 hover。
- `regress-image-*-after.png` / `regress-slot-after.png`：三宽度提示词卡、唯一 Slot 删除后空状态；视频截图与观察报告同时保留。单元测试另覆盖自定义元素同步读取布局时图标/材质已准备好、SVG 重复渲染身份不变、缩略 video 同源复用/异源替换。
- `regress-submit-report.json`：真实菜单选择 Real-ESRGAN / 1080p 并点击入队，任务 `f419a321-dc33-44bd-b3b1-29c69bc36903`，源版本 `m6-video-0-v1`；再打开另一份窗口改为 2160p、取消，队列快照深比较不变。Queue / Settings 邻页无未渲染图标或横向溢出，队列保持暂停。
- 最终 `regress-verify-final.log`：2484 单元、91 集成、类型检查构建及 740 对比度通过（验证并发 4）。自有隔离窗口退出后恢复原始夹具；没有 GPU 生成或用户媒体删除。不据有限点击矩阵宣称任意环境都不会出现重绘。
