# M4b：首尾帧、R2V 素材与首批反馈修正

- 类型：Evidence；日期：2026-10-22；影响：minor（两个反馈项为 patch）；阶段状态见 [TASK](../TASK.md)。本批仍不代表整个 M4 完成。

## 设计与范围

- 复读原型 Create HTML/CSS/JS 与设计决定 38/39、DESIGN 6.3/6.7/7，并对照当前 frames/references/clipboard 控制器。左栏不显示滚动条是用户最新修正，优先于原型的 thin scrollbar；同步 DESIGN，未改历史原型。隐藏条而非取消滚动，不预留条宽或原有 2px 补边。
- 预设数据本来带 `data-description`/title，而公共 select 只接 `data-note`。现兼容三者，说明排在选项标题下方，长说明在 360px 宽上限内换行，浮层最大 320px；所选值仍只有选项名称。保留原生 select、键盘选择、既有 change 处理及禁用规则。
- 帧模板移至 `create/media-frames.ts`：首尾帧纵排、原始比例、单张高度 640px 上限（按比例收窄），角标与悬停/键盘/触屏可达操作条。填充帧仍不因直接点击画面误开文件选择；替换用明确按钮，拖放与粘贴继续可用。尾帧添加移至末尾，保留模型支持门槛及无首帧的 L2VA 路径。
- R2V 统一卡片：序号/标签/尺寸、类型/插入标签/删除 Slot，原比例素材与替换/清空，作用与备注。清空保留 Slot ID/作用/备注，删除才移除整位；新添加/拖放/粘贴检查总数 12、图片 9、视频 3。Motion Context 附加图的末尾粘贴保护锁定源视频；异步剪贴板结果在模式/模型/源视频改变后不写入新草稿。
- 删除已替代的旧 frame/R2V 专属样式，新增 `patterns/create-media.css`。保留正在使用的锁定源视频样式和现行媒体播放控制。图片编辑素材卡/标记/Mask、续写裁剪/latent/Continuum 呈现、右侧参数与长视频演示尚未在本批迁移。

## 验证

- 最终 focused 4 文件 / 54 项，覆盖预设既有说明、首帧替换、清空与 Slot 删除的身份区别、末尾视频拖入/图片粘贴、Motion Context 源视频保护、尺寸与样式归属。完整 verify：243 文件 / 2413 单元、6 文件 / 91 集成、类型与桌面/LAN 构建、740 对比度通过；`temp/ui-m4b/verify.log`。
- 自有真实 Electron，最终生产构建、1440×1000、focus emulation：10 个 H3 预设全部有标题下方说明；最大 320px 浮层与选中/关闭正常。截图 `temp/ui-m4b/presets.png`。
- 自制、无用户内容的两张隔离 PNG：1280×720 横图实测 552.671875×310.875，720×1280 竖图实测 360×640，均 contain、比例误差 < .005。素材栏 scrollbar-width 为 none，scrollHeight 1007 / clientHeight 852；实际 mouseWheel 后 scrollTop > 0。新要求会让可用素材宽度比原型显示滚动条时更大，这是已授权偏差；未据此声称全页像素一致。
- 实际鼠标清空尾帧/首帧、切换 R2V 模型、素材准备后清空与删除 Slot；ID/作用/备注保留与整位删除分别通过。素材用 AppApi 准备并重载（saveDraft 不负责 renderer 广播），验收操作均走真实鼠标按钮；图片解码与 root 呈现需在同一次 DOM 检查就绪，不能在重载过渡中采样。
- 最终生产 App 的 R2V：缺提示词时阻塞（操作前截图），键盘补齐带 Picture 1 标签的正文，实际加入队列得到 `036e3843-9e72-46f8-ab34-4f7f98aede4f`；随后清空素材并删除 Slot，按任务 ID 核对完整队列快照未变。未开始执行，无 ComfyUI/GPU/成片质量验证。报告 `temp/ui-m4b/report.json`，截图含 `frames.png`、`frames-scrolled.png`、`r2v.png`、`r2v-empty.png`。
- 本次 mock 截图进程在导航加载等待未完成；终止确认属于本次的纯 mock 进程后改用上述真实 App 截图，没有把该次等待当成通过证据。完整验证早期的旧尺寸文案断言失败已按新卡片同行尺寸更新，最终门禁通过。
- 收尾：自有 `temp/create-smoke-T0cGUO` 经 close-fixture helper 关闭，PID 39392/CDP 11301 已退出；停止确认命令行的 Vite PID 52868，5175/18188 无监听；纯 mock PID 3880 已退出。保留隔离证据，没有操作用户 App/媒体；此 helper 清理不是原生窗口退出生命周期验证。
