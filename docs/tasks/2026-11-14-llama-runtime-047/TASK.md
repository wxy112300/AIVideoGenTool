# llama-cpp-python 0.4.7 推荐更新

日期：2026-11-14 · 类型：patch · 状态：推荐更新与仓库验证完成，运行实例未升级

- 授权：核对新版影响并更新软件推荐/固定安装项；不替换本机Python包，不启动服务或下载模型。
- 基线：软件推荐JamePeng 0.4.5 / 20261025，源码3fc39b2ebcfbee10a6f64754b333eae2fe1ccc82。本机选中Python 3.12.11、llama-cpp-python 0.4.5+cu130、torch 2.10.0+cu130，仅查distribution元数据，不将旧版运行情况当作新版验收。
- 采用：稳定0.4.7 / 20261113，Windows tags均指向c7c7055661f87c21602d81b386747c2321f6cca5；vendored llama.cpp固定2a4daf0e08d6a9b6993ee0d4a9a3cfc35a6f405c。官方API核实cu124/cu126/cu128/cu130/cu131/cu132各cp310–cp314，共30个Windows wheel；保留旧CUDA回退，cu132改用精确匹配，未知ABI拒绝逻辑不变。

## 影响与边界

- 0.4.6修复多模态音视频ABI、上下文按单序列容量检查及采样器清理；0.4.7修复绑定/原生context与音频参数ABI，增加可选额外GGUF shards、MTP device states等。新版绑定必须与同版DLL作为整套wheel安装，不能复用旧DLL。
- pyproject.toml与0.4.5完全相同。Llama已有构造参数没有删除，新增model_shards与moe_cache_cpu_share；本机实际Prompt Writer/MultiModal三个Llama调用参数通过AST核对。单序列默认n_seq_max=1保留，MoE缓存及新增share默认关闭，不改变现有上下文预算。
- llama_chat_format仍导出Gemma4ChatHandler、Qwen35ChatHandler、MTMDChatHandler；现有Gemma handler和Qwen专属logits_all补丁保持。MTP、TTS、RPC及额外shards不自动接入；上游性能结果不外推为本应用收益。
- 实际节点身份：Prompt Writer 47514b86c573167f5d0cae2b9d5184c009e332e1、MultiModal b305642e711b84fefdf5d27db6860c086b1f3015，保留受管理源码补丁。Prompt Writer的动态llama_options也已追踪；其中旧flash_attn关键字在两版均通过kwargs接收，实际flash_attn_type默认AUTO不变。clip_model_path兼容别名保留，不借推荐升级改变现有attention策略。
- 仅修改共享推荐常量、固定wheel日期与cu132选择。依赖兼容范围仍为>=0.3.34,<0.5，节点ensure继续复用已通过自检的旧运行库，用户显式更新才走原有安装/自检/重启流程。
- 临时证据在忽略目录temp/llama-047-20261114：官方release元数据、完整资产名/大小/digest、固定候选源码、实际调用源hash与source-audit.json。未保存用户草稿/提示词/原始state或机器路径到仓库。

## 验证

- 设置运行环境harness guide已读取。focused：llama-cpp-python、multimodal-prompt-logits、dependency-scanner共59项通过，涵盖已发布30种wheel组合、旧CUDA回退、未知ABI、旧就绪包不自动重装、显式安装与CUDA自检逻辑。
- 当前证据到source/发行资产和应用逻辑，不含新wheel导入、真实CUDA、Gemma/Qwen生成或回退验收。安装后应分别核对首次/连续图像请求、取消后重试与输出；不因建议升级静默替换本机环境。
- 完整单元首次3242项通过，4项设置测试仍断言旧推荐线；更新断言并增加等于/高于0.4.7分支后，该文件43项通过，复用其余333文件结果。集成127项、干净类型构建、440组对比度检查通过；日志保留于忽略目录temp/llama-047-verify-20261114。
- 隔离快照构建未触碰主工作区dist。完成后移除自有node_modules联接；未改生产Python依赖、启动ComfyUI、占用GPU或生成任务，不存在需要停止的自有运行服务。

## 来源

- [正式Windows cu130发布](https://github.com/JamePeng/llama-cpp-python/releases/tag/v0.4.7-cu130-win-20261113)
- [固定源码变更记录](https://github.com/JamePeng/llama-cpp-python/blob/c7c7055661f87c21602d81b386747c2321f6cca5/CHANGELOG.md)
- [0.4.5到0.4.7源码比较](https://github.com/JamePeng/llama-cpp-python/compare/v0.4.5-cu130-win-20261025...v0.4.7-cu130-win-20261113)
