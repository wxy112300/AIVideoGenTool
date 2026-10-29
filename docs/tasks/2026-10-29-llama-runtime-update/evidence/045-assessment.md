# JamePeng 0.4.2 → 0.4.5 推荐升级

查询日期：2026-10-29。用户授权升级软件推荐及安装固定项；不替换实际 Python 环境。

## 固定身份与资产

- 原推荐 tag `v0.4.2-cu130-win-20261003`，commit `528cf248460b49312597db98eb4f4e74a73214b8`。
- 候选 tag `v0.4.5-cu130-win-20261025`，commit `3fc39b2ebcfbee10a6f64754b333eae2fe1ccc82`；官方 compare 为 ahead、52 commits。
- [正式发布](https://github.com/JamePeng/llama-cpp-python/releases/tag/v0.4.5-cu130-win-20261025)：GitHub releases API 实际列出 cu124/cu126/cu128/cu130/cu131 的 Windows 发行，每种均有 cp310/cp311/cp312/cp313/cp314，日期均为 20261025。沿用显式 CUDA fallback 和未知 ABI 拒绝策略，不把 latest 的 cu131 下载到 cu130 环境。
- 上阶段隔离 AppApi 扫描实际选中 Python 为 `0.4.2+cu130`、CUDA 自检通过；并非用户所有实例的普查。本次没有改动其包或节点源码，未建立新的本机安装 SHA 证据。

## 与应用有关的变化

来源：[固定提交 CHANGELOG](https://github.com/JamePeng/llama-cpp-python/blob/3fc39b2ebcfbee10a6f64754b333eae2fe1ccc82/CHANGELOG.md)、[源码对比](https://github.com/JamePeng/llama-cpp-python/compare/v0.4.2-cu130-win-20261003...v0.4.5-cu130-win-20261025)。

- 0.4.3：补充多模态 embedding、扩展 batch 接口与资源生命周期保护；图像 MTP 为新增能力，不自动纳入本应用。
- 0.4.4：修复 Hybrid 前缀复用、checkpoint 恢复、缓存匹配及状态清理。普通解码也涉及其中，需安装后核对连续提示词请求。
- 0.4.5：重用跨轮媒体缓存、优化 device checkpoint，归一化 BOS/EOS 与 Qwen 视觉边界；修复 token suppression/采样掩码。上游 Qwen3.5/Gemma4E 测试显示部分复用收益，但不是本应用或用户机器性能结论，采样输出也可能变化。
- LiliCorr 推测解码与 Soprano TTS 属于新能力；本应用此次不接入，不启用 MTP，不增加模型下载。

## 接口、依赖和采用边界

- [pyproject](https://github.com/JamePeng/llama-cpp-python/blob/3fc39b2ebcfbee10a6f64754b333eae2fe1ccc82/pyproject.toml) 的运行依赖与原 tag 相同：typing-extensions>=4.8.0、numpy>=1.21.6,<=2.3.2、diskcache>=5.6.2、jinja2>=3.1.0、Pillow>=9.5.0。源码声明 Python>=3.9，Windows 预编译包实际只覆盖 3.10–3.14；不放宽安装器 ABI 范围，不触碰 PyTorch/CUDA 安装。
- 固定源码继续从 `llama_cpp.llama_chat_format` 导出 Gemma4ChatHandler、Qwen35ChatHandler、MTMDChatHandler；Llama 构造参数与现有 logits_all 补丁入口保留。新增 moe_cache_size 默认关闭，未改变应用参数。
- 保留 Prompt Writer 的 0.4.x 兼容上限与 Gemma handler 适配、MultiModal 的 Qwen MTMD 精简 logits 补丁；采用新版自身 DLL/绑定作为一个 wheel，不混装旧 native 库。
- 采用范围为 catalog 推荐与固定 wheel URL；自动节点 ensure 仍不升级已就绪旧包。用户显式更新才执行原有停服务、安装、自检、重启流程。
- 证据到 source/发布资产与应用安装/展示逻辑层。未安装 0.4.5，未验证新 wheel 导入、真实提示词输出、性能或回退；安装后应验证首次及连续图像请求、取消后重试、Gemma/Qwen 各自路径，不以此前 0.4.2 的输出替代。
