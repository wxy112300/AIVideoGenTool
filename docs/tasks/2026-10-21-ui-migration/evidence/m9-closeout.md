# M9 全局收尾

- 类型：执行证据；状态：verified（UI / 构建 / 隔离 AppApi）；日期：2026-10-24。
- 范围：[迁移 TASK](../TASK.md) 的 M9；影响 minor。checkout `ae25c113b107f1ea10b4c1f39824305767387784`，版本 `0.66.6` 的未提交工作树；不代表独立 release。
- 当前基线与复现命令：[UX_UI_RENDERER_BASELINE](../../../UX_UI_RENDERER_BASELINE.md)。本地证据在忽略目录 `temp/ui-m9/`。

## 变更

移除桌面 legacy 层、旧编号样式、palette 与变量桥接。保留仍被当前页面使用的结构到 `structure.css`，归属 base.structure；base.defaults 和后续 components/patterns/pages 保持覆盖顺序。按相同条件作用域/选择器/属性去掉 443 个被后项覆盖的声明，删除 354 个当前维护入口未使用的 selector 分支，替换 127 个旧变量映射。原结构约 210 KB，保留约 153 KB；没有把仍在使用的布局直接删掉。桌面 `src/style.css`、`src/styles/` 与 shell presentation 已无 `--ux-*` 或 legacy 层引用。

LAN 的旧 token/palette 按原顺序迁入 `src/web/theme.css`，入口只改导入，不改变其独立配色。主题色、灰阶、深度、动态效果的真实来源仍为桌面 tokens/appearance。

三语删除素材区重复格式列表、错误的固定参考图数量和冗长工具说明，保留具体模型输入差异、必要后果和恢复信息。窄屏顶栏品牌左对齐，极窄时监视信息独立排布；没有改桌面高度。

截图工具新增计算样式证据、内容视口尺寸；显式指定非默认分组内的已知视口时也会拍摄，修正此前 547×800 返回零项的问题。manifest 补齐应用与路径、LoRA、外观，默认 21 个 fixture / 160 张。

## 结构清理与视觉核对

- 清理前后 70 个相同状态、24,459 个节点的身份/几何/约 35 项计算样式比较：只有 11 个旋转 loading spinner 的旋转外接框不同；其余节点身份、几何与所测样式一致。比较排除 transform/opacity，不将不同动画相位当成布局破坏。报告 `style-comparison.json`；原始 `before/`、`after/`。
- 最终默认 160 张，覆盖 1440/1120/900/820 与 1121/901/761/760；英文 547×800、繁中 547×800、中文 820×800 页面缩放 150% 各 21 张，共 223 张。目录 `baseline/`、`en-narrow/`、`tw-narrow/`、`zoom/`；PNG 内容尺寸核对与日志保存。
- 对照已批准的原型层级和当前页面布局，检查创建素材/提示词、队列、历史两类两布局、详情、设置全部分区。合成详情中部分媒体仍为 loading，不能据此证明真实播放；媒体另用物理隔离副本检查。
- 真实生产 Electron 三语 × 547 CSS px × 四主页面无文档横向溢出，导航可达；另检查 360 px 顶栏品牌与监视信息不相交。360 px 不作为桌面完整页面支持范围：英文 Create 的原有横向溢出仍存在，未扩展为手机创作适配。报告 `real-layout-report.json`。减少动态效果采用 CDP 模拟系统偏好，未替代系统级 DPI 验收。

## 真实用户路径

使用隔离 `create-smoke-m6-history`、物理媒体副本、真实 preload / AppApi 和生产构建；focus emulation 开启。AppApi 仅准备草稿/设置与读取状态，提交使用 CDP 原生鼠标/键盘；队列始终暂停。

1. Create：空提示词显示“请先填写提示词”，按钮禁用；真实键盘输入后恢复，随机 Seed 保持富文本节点；点击加入队列生成 `ace72c82-b065-4f73-a2a9-53d588242e02`，模型 `minimax_h3_fl2va`。之后编辑提示词/Seed，已入队快照不变，之前四条任务也不变。见 `create-report.json`。
2. Upscale：缺视频元数据的负例可见恢复提示且按钮禁用；切到实际有效源 `m6-video-34` / `m6-video-34-v1` 后，实际点击 RealESRGAN 1080p 入队 `b7226af1-54b5-4bd0-ad96-b0a6a37e74dc`。重开改 2160p 再取消，已入队来源/参数不变，父视频节点保留。见 `enqueue-report.json`、`frozen-task.json`。
3. 视频实际解码播放、时间前进并暂停；图片实际解码、打开 Lightbox 后 Esc 关闭，History 父导航保留。见 `media-report.json`。不涉及新媒体生成。
4. 退出隔离应用再启动：五条任务和历史/图片版本 ID 保留；draft/imageDraft/settings 严格相等。新视频任务在启动时补入现有 store 的 `normalizeH3MemoryOptions(..., "off")` 三个默认字段；仅对这一已有归一化显式处理后，队列其余字段严格相等。见 `restart-report.json`。这不是零字节迁移声明。

负例准备曾误把存在元数据的历史项当作缺源；临时移走物理副本不能触发该元数据分支，已恢复原文件并改用离线清空该隔离版本 files 的负例。图片卡探针最初用了错误 selector，改为生产 `data-open-image-history` 后通过。两者均未更改产品门槛。

## 验证与清理

- `npm.cmd run verify`：2514 单元（261 文件）、91 集成、typechecked desktop/web build、440 对比度通过；日志 `verify.log`。30 项定向测试通过。旧静态样式字符串检查改为当前导入/主题隔离检查，因此测试总数下降；没有以计数增加代替回归。
- 对比度现在为 420 桌面 + 20 LAN；移除了旧别名角色的重复检查，所以不沿用此前的 740 数字。LAN 原主题值另核对。
- 产品代码在完整 verify 前已定稿；之后只改 manifest、截图工具和文档。截图工具 `node --check`、默认/额外视口 dry-run 与实际矩阵通过；未为文档重复完整构建。
- 无下载/安装/缓存清理/用户媒体删除/GPU 生成。未改变 ComfyUI、图构造、队列服务或持久化协议；未证明真实安装、生成质量、Windows 高对比度或所有动画相位。
- 自有 Electron PID 16232 / 重启后 53304 已退出；Vite 已停，5176/10544/14025/18188 无监听。通过 harness API 清理和 JS 关闭，不作为原生窗口退出生命周期证据。
- 隔离 state 在进程退出后按原文件字节恢复；SHA-256 `F97CF191E0E8ADA4EBA5273B99EFAE36D1329D25BB9EF9C39D0639D010A439B9`，见 `restoration.json`。测试入队与负例不留在最终夹具。

M0–M9 的视觉迁移关闭；长视频编排和创作包仍遵循 TASK 的独立功能边界，UI 演示不等于真实多段执行。
