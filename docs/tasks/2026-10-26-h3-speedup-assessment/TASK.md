# H3 加速方案更新评估

- 类型：TASK；日期：2026-10-26；状态：assessed（本轮只读评估完成，候选未实施）。
- 范围：用户提供的 RTX 5090 五方案比较，核对当前应用、所选实例与上游；不下载权重、不升级实例、不改变默认策略。
- 执行：当前 agent 直接完成，无子 agent。

## 2026-10-28 H3 GGUF 推荐线更新

- 用户授权更新推荐版本；已将 `comfyui-gguf-h3` 从 26.09.04 更新至官方 stable 26.10.21，固定安装提交 `61843db580f8549a85b0a1ed850d550079fadfee`，策略为 recommended，不提高旧安装的硬最低线。
- 来源：[官方发布](https://github.com/molbal/ComfyUI-GGUF/releases/tag/v26-10-21)；本轮 `git ls-remote` 确认 tag 与 main 均指向上述 SHA。现有安装器仍应用 H3 专用注册名，通用 GGUF 的来源与固定提交保持不变。
- 只交付推荐/安装目标配置，未替换本机节点、下载权重或启动 ComfyUI。没有新增 schema、GPU 输出或性能证据；本机实际版本仍需用户通过设置页更新后复扫。
- Patch，已记 Unreleased；类型检查与 diff 检查通过。首轮相关回归 65 项通过，H3 安装夹具因缺少固定提交的 HEAD 模拟失败；补齐后该项单独复验通过。没有把这些检查当作实际权重验收。

## Resume

- 最直接的更新缺口是 LightX2V：catalog 的 FL2V 四步 v1.2、旧八步 v1.0、Ref2V 四步 v0.1，已落后于上游 2026-10-20 文件发布；新候选为 FL2V 四步 v1.3 / 768p 八步 v1.1、Ref2V 768p 四步 v1.0 / 八步 v1.1。文件已证实存在，不等于新参数/质量已验证。
- DMAD 四步是优先新增试验候选：官方 ComfyUI 转换与 LCM/Simple 路径可复用现有核心，但只先评估 T2VA；不能直接继承当前 Turbo 的 Euler/Beta、音频 shift 或开放所有参考/续写。
- Larry v4 权重线仍是上游推荐；当前应用使用 drbaph pruned 转换版。上游 Simple 与应用 Euler/Beta 的差异需要针对转换版核对，不凭原始模型卡直接改旧任务。
- FastH3 V2 是 T2VA checkpoint，不是现有 FastH3 Omni R2V 的更新版本。Omni 已有独立接线及较新的小样验收；V2 暂列较低优先级。
- 本机离线核对发现 catalog 要求的 FL2V v1.2 文件未在所选 LoRA 根找到，已有 v1.1、旧八步、Larry v4、SLA、FL2VA PDD；缺失新候选。文件名/大小检查未代替完整权重 hash。
- 详细身份、来源、限制和下一实验见 [评估证据](evidence/assessment.md)。本轮没有生成、速度或质量结论；未改 catalog、运行环境或现有工作文件。下一阶段先固定新权重/配方身份，再选最小试验；权重仍由用户管理。

## 验证与收尾

- 文档检查：本任务两个文件的本地链接、格式、命令与事实一致性；只读评估不运行 verify/build/GPU。
- 未启动或停止任何 Electron/ComfyUI、未操作队列；公开元数据请求均结束。
- 影响分类：研究文档，无产品版本影响，不 bump、不写产品变更日志。
