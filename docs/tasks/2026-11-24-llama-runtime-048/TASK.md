# llama-cpp-python 0.4.8 推荐更新

日期：2026-11-24 · 类型：patch · 状态：推荐更新与仓库验证完成，运行实例未升级

- 授权：评估新版并更新推荐，不安装到生产 Python、不下载权重、不启动或重启 ComfyUI。
- 基线：软件推荐与实际选中 Python 均为 0.4.7，实际包为 0.4.7+cu130、Python 3.12.11、Torch 2.10.0+cu130。实际 Prompt Writer commit 47514b86c573167f5d0cae2b9d5184c009e332e1，MultiModal b305642e711b84fefdf5d27db6860c086b1f3015。
- 候选：JamePeng 稳定 0.4.8／20261122，源码 ef94af52be6d1d9ab22a5905eec1aec9d411de30，vendor llama.cpp cbb1c1c50bba81929387dea473873d1df87a6212。对比 0.4.7 共41个commit，官方发布6种CUDA（12.4/12.6/12.8/13.0/13.1/13.2）×5种Python ABI（3.10–3.14）的30个Windows wheel。
- cu130/cp312 wheel 为222994902字节，官方资产 SHA256 e98cd567d7a724f56af1aa37921b3e2d7949043717377c5db32a5feb4753fc64；本次只核对官方元数据，未下载验证二进制。

## 影响与兼容边界

- 修复动态温度、Adaptive-P、Mirostat优先级和重复惩罚窗口；因此相同seed可能得到不同文本，不承诺逐字重现旧输出。现有设置和调用参数保持。
- 对齐llama.cpp 1.0底层API及音视频结构；旧绑定/DLL不能混用，沿用整包wheel安装和安装后CUDA自检。扩展TTS、声音克隆及YuE2不代表本应用新增这些功能。
- Llama构造参数未增删，pyproject.toml依赖声明与0.4.7相同；Gemma4ChatHandler、Qwen35ChatHandler和MTMDChatHandler导出保留。实际两包源码没有调用已移除的defrag_thold、token_cls、GGML_PREC_DEFAULT等接口。应用原有Gemma/Qwen兼容补丁不变。
- 推荐、固定wheel日期和测试预期更新；兼容范围仍为>=0.3.34,<0.5，已通过自检的旧包不静默重装，未知ABI拒绝与旧CUDA回退不变。
- 证据层为官方资产元数据、固定源码/实际节点调用静态核对及应用测试；未验证新版wheel导入、真实CUDA、Gemma/Qwen生成或二进制回退。

## 验证

- 已读取settings-runtime harness guide。focused共5文件167项通过，覆盖30种wheel组合、旧版复用、未知ABI、安装自检及Settings低于/等于/高于推荐线的按钮状态；类型检查通过。
- 隔离快照完整单元3433项首次通过，另3项剪贴板测试因快照缺少temp目录而失败；补齐自有目录后该文件3项通过，复用其余348文件结果。集成7文件132项、干净类型构建与440组对比度检查通过。未修改无关测试以掩盖失败。
- 日志位于忽略目录temp/llama-048-*-20261124.log，快照temp/llama-048-verify-20261124。构建未清理共享dist；移除自有node_modules联接，没有创建需停止的Electron/ComfyUI服务或GPU任务。
- 官方release、compare与固定源码保留在忽略目录temp/llama-upgrade-20261124；不提交用户state、提示词、机器路径或下载内容。

## 来源

- [0.4.8 Windows CUDA13.0发行](https://github.com/JamePeng/llama-cpp-python/releases/tag/v0.4.8-cu130-win-20261122)
- [固定版本变更记录](https://github.com/JamePeng/llama-cpp-python/blob/ef94af52be6d1d9ab22a5905eec1aec9d411de30/CHANGELOG.md)
- [0.4.7→0.4.8源码比较](https://github.com/JamePeng/llama-cpp-python/compare/v0.4.7-cu130-win-20261113...v0.4.8-cu130-win-20261122)
