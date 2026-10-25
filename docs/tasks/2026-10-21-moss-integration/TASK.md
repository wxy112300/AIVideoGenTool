# MOSS 图片模型接入

- Status: 接入与代码/UI/schema 验收完成；真实出图/速度/画质待用户权重
- Updated / Owner: 2026-10-22 / 当前任务
- Scope: 用户授权接入 RTX 4090 主力 MOSS 模型与一个社区 NSFW 版本，按能力排序图片模型卡片，调查并复用适用的 Qwen 2.1 工具。
- Execution: direct；不派生 agent。权重由用户管理，不自动下载；不修改其他任务的原型与 UI 迁移工作。
- Version impact: minor；本轮不自动提交、推送或制作安装包。

## Resume

- 基线：0.66.6 / ComfyUI 推荐 0.42.3 / comfy-kitchen 推荐 0.2.39。
- 原生 MOSS 是 T2I + JSON 布局生成；不能把 Qwen 多图编辑、Paint 指令编辑、Mask 或 RGBA 能力直接声明为已支持。社区 Ostris 参考编辑需要额外的编辑权重与插件，不属于普通 T2I checkpoint 的现成功能。
- 已选择官方 SFT INT8 ConvRot 与 PornMaster V1 INT8；固定文件身份、25/50 步 recipe、共用编码器/VAE、独立模型 ID 和三语卡片。比较范围、来源、许可与工具复用见 [选型证据](evidence/selection.md)。社区“最佳”仅是本轮适配选择，未做本机质量排名。
- 已实现 catalog / adapter / MOSS Prompt Pack 与各图片增强后端输出清理、16 对齐、能力门槛。Create/Settings 共用能力顺序；MOSS 不显示参考上传、Paint、Mask、编辑快捷项；保留旧参考可显式移除。History 继续编辑使用参考图模型（缺省 Qwen 2.1），保留项目/父版本及原始 MOSS 历史身份。
- 2026-10-22 按用户要求补查[公开评测与排行榜](evidence/benchmarks.md)：原先按编辑功能数量排序不适合表达生成质量，官方 MOSS 前移至第二张，PornMaster 随母模型分组；其他通用文生图按同一 AA 榜可比条目调整 HiDream / Z-Image Turbo / Z-Image Base / Klein / OmniGen2 顺序。MOSS 尚无同榜独立分数，论文专项成绩也不代表本应用量化配方，导航优先级不冒充总榜名次。排序追加检查：model-catalog / moss-image / create-model-options 共 20 项通过，typecheck 与 scoped diff check 通过；本轮只改排序/资料，无额外 GPU 或服务启动。
- 下一步：用户按 Settings 下载指引准备真实权重，再做固定 1MP / seed / prompt 的最小出图、History 回流与 25/50 步质量/时间/显存对照；不自动下载权重，也不把本次文件占位夹具用于推理。

## 当前证据

- Source：官方模型卡、原生模板、固定文件 LFS pointer / Civitai 元数据已核对。作者工作流下载要求登录，未读取或绕过。
- Files：真实模型目录中未发现两套扩散模型、所选编码器或 small VAE。已有大 VAE 不能仅凭名称当作已满足当前固定文件契约。
- Schema：从隔离应用 `startLocalService` 启动当前选中核心 0.42.0 / `40dcb30a96fc345f54632c56af81a4a320c2fc1e`，两个 MOSS 图与实际 `/object_info` 校验均无错误。仓库推荐核心仍为 0.42.3；MOSS 原生最低记录为 0.42.0。
- UI / task：真实 Electron Settings 卡片顺序 14 项正确；文件存在性夹具补齐后，真实 Create 缺提示词 → 输入 → 鼠标按钮入队，两模型分别产生独立 task ID，1920×1088、2 runs，队列停止。此处权重是明确标识的微型文件占位，只证明文件扫描/UI/IPC，不能证明模型加载。
- Restart / visual：隔离实例重启后两任务 ID、模型和快照保持；继续改草稿不改已排队 prompt。1440×900、1280×800、960×720 无横向溢出；移除了 CSS 导致仍显示的旧 Picture 1 占位，MOSS 能力说明完整换行。CDP focus emulation 开启。
- Checks：2026-10-22 最终 `npm.cmd run verify` 退出码 0，完整单元 2387 项、集成 91 项、build/typecheck、20 项文本对比度检查全部通过，包含 History 两例 MOSS 再编辑回退。早先目录断言与 jsdom CSS.escape 夹具问题已修正。上次最后一次 verify 因自动审批额度耗尽未执行，用户要求继续后已重新运行并通过；`git diff --check` 无错误。
- Resources：第一次隔离应用启动的 ComfyUI 已经 AppApi 停止；第二次仅 UI/重启审计，保持停止；两个自有 Electron 均已通过 fixture cleanup 关闭。没有启动用户队列或下载模型；不宣称原生窗口退出生命周期已验。

## 验收

- Settings 离线文件扫描与在线节点/schema 分开；下载指引准确，卡片按已接入能力排序。
- Create 缺输入 → 补齐 → 实际点击 → task ID；拒绝不支持的参考输入，不伪造已编辑。
- 图构建包含正确 MOSS loader、编码器、VAE、16 像素对齐、采样与 SLG；旧 Qwen / queue / History 身份保持兼容。
- Prompt 增强按 MOSS 文生图语法，不注入 Qwen 编辑指令；复用通用 Seed、尺寸、批量、版本与作品回流。
- 真实出图仅在权重已存在且 GPU/运行时归属明确时执行；缺失权重单列为未验，不把静态通过称为性能或质量通过。
