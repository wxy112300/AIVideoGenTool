# H3 加速方案更新评估

- 类型：TASK；日期：2026-10-26；更新：2026-10-28；状态：complete（已授权的推荐线及 LoRA 入口替换完成，权重实跑未验）。
- 范围：初始为 RTX 5090 五方案评估；10 月 28 日追加授权 H3 GGUF 推荐线及已接入旧加速 LoRA 替换。权重仍由用户管理，不删除旧文件或改写旧执行快照。
- 执行：当前 agent 直接完成，无子 agent。

## 2026-10-28 H3 GGUF 推荐线更新

- 用户授权更新推荐版本；已将 `comfyui-gguf-h3` 从 26.09.04 更新至官方 stable 26.10.21，固定安装提交 `61843db580f8549a85b0a1ed850d550079fadfee`，策略为 recommended，不提高旧安装的硬最低线。
- 来源：[官方发布](https://github.com/molbal/ComfyUI-GGUF/releases/tag/v26-10-21)；本轮 `git ls-remote` 确认 tag 与 main 均指向上述 SHA。现有安装器仍应用 H3 专用注册名，通用 GGUF 的来源与固定提交保持不变。
- 只交付推荐/安装目标配置，未替换本机节点、下载权重或启动 ComfyUI。没有新增 schema、GPU 输出或性能证据；本机实际版本仍需用户通过设置页更新后复扫。
- Patch，已记 Unreleased；类型检查与 diff 检查通过。首轮相关回归 65 项通过，H3 安装夹具因缺少固定提交的 HEAD 模拟失败；补齐后该项单独复验通过。没有把这些检查当作实际权重验收。

## Resume

- GGUF 更新后误报已修复（patch）：H3 适配保留 `.git`，安装器识别自身 loader 补丁。本机逐项核对 54 个上游跟踪文件及适配入口后仅恢复 Git 元数据；实际扫描得到 26.10.21 / `61843db5`、`updateAvailable=false`。本轮 306 文件 / 2895 项测试、类型检查、隔离生产构建与 440 项对比度通过；详情及验证边界见 [GGUF 修复证据](evidence/gguf-revision-repair.md)。
- 本次交付：三个 LightX2V 入口原位更新，不新增重复旧版卡片。文件分别为 FL2VA 四步 v1.3、FL2VA 八步 768p v1.1、Ref2VA 四步 768p v1.0；产品 ID 保持稳定，具体权重文件决定新旧采样配方。新草稿/继续创作升级已知旧文件，通用快照归一化不改队列/History 的 filename/strength；已有 Continuum 分组保留冻结配置。来源与验收见 [新版接入证据](evidence/lightx2v-replacement.md)。
- 新版采用 Euler/Simple，FL2VA shift 6/3、Ref2VA 12/3，四/八步与文件匹配，默认强度 1。原队列保留 Euler/Beta 或 ER-SDE/Beta。Larry v4、Turbo-SLA、PDD 未发现对应的新权重，本轮保持；不新增 DMAD 等独立方案。
- 最终全量 305 文件 / 2892 项、类型检查/干净构建、440 项对比度通过；三个新版入口在真实 Electron 完成缺件恢复→实际按钮→task ID，4/8/4 步与文件快照正确、编辑草稿不改队列。仅使用明确标识的扫描占位文件，ComfyUI 始终 stopped；未下载完整新权重，生成/性能/质量未验证。上游讨论 #57 的组合退化反馈保留在详情与证据。

## 10 月 26 日评估摘要（历史基线）

- 最直接的更新缺口是 LightX2V：catalog 的 FL2V 四步 v1.2、旧八步 v1.0、Ref2V 四步 v0.1，已落后于上游 2026-10-20 文件发布；新候选为 FL2V 四步 v1.3 / 768p 八步 v1.1、Ref2V 768p 四步 v1.0 / 八步 v1.1。文件已证实存在，不等于新参数/质量已验证。
- DMAD 四步是优先新增试验候选：官方 ComfyUI 转换与 LCM/Simple 路径可复用现有核心，但只先评估 T2VA；不能直接继承当前 Turbo 的 Euler/Beta、音频 shift 或开放所有参考/续写。
- Larry v4 权重线仍是上游推荐；当前应用使用 drbaph pruned 转换版。上游 Simple 与应用 Euler/Beta 的差异需要针对转换版核对，不凭原始模型卡直接改旧任务。
- FastH3 V2 是 T2VA checkpoint，不是现有 FastH3 Omni R2V 的更新版本。Omni 已有独立接线及较新的小样验收；V2 暂列较低优先级。
- 本机离线核对发现 catalog 要求的 FL2V v1.2 文件未在所选 LoRA 根找到，已有 v1.1、旧八步、Larry v4、SLA、FL2VA PDD；缺失新候选。文件名/大小检查未代替完整权重 hash。
- 详细身份、来源、限制和下一实验见 [评估证据](evidence/assessment.md)。本轮没有生成、速度或质量结论；未改 catalog、运行环境或现有工作文件。下一阶段先固定新权重/配方身份，再选最小试验；权重仍由用户管理。

## 验证与收尾

- 最终门禁使用 `vitest run --config vite.config.ts --exclude 'dist/**' --maxWorkers=4` 覆盖全部单元及集成测试，然后独立的生产构建/对比度检查均通过；默认并发早期的无关超时不作为最终结果。
- 自有 Electron 通过既有 cleanup helper 关闭，最终 PID 44680 与早期 70272/51252、CDP 9553/6971/9242、隔离 ComfyUI 8347 均已退出/无监听。早期一次新夹具未创建 AppApi，核对唯一 userData 后仅清理其 PID，随后改用全新隔离资料库完成验收。没有接管用户 GPU 或运行其队列。
- 本地文档链接、diff 格式及意外删除检查通过。LoRA 替换为 minor，推荐线更新为 patch，均记 Unreleased；不 bump、不提交或发布。权重完整下载与实际生成仍由后续明确范围决定。
