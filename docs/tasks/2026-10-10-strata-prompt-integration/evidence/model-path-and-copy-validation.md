# Strata 模型路径与卡片修订

- 日期：2026-10-10；直接执行，无子 agent。范围：用户要求移除重复模型根目录设置、客观描述模型；不扩大到安装或推理。
- 下方原路径检查记录对应“从运行组件派生”的前一阶段；最新用户要求改为共用 ComfyUI，当前路径行为以末尾增量及 TASK 为准。
- 单一解析：Electron 运行组件扫描解析实际安装位置；管理模型目录为软件版本目录旁的稳定 `models`，手动安装为运行目录内 `models`。扫描和模型下载指引共用返回路径，renderer 不自行猜测管理目录。首次未扫描时，信息按钮触发现有扫描取得路径；刷新不会丢失指引，关闭后不会异步重新打开。
- 兼容：旧 `strataModelDirectory` 记录作为不可编辑的兼容下载位置保留；不迁移、删除或下载文件。默认模型、43127/禁止8080、软件安装事务与推理接入门槛保持不变。

## 客观文案来源

- [Qwen 官方模型说明](https://huggingface.co/Qwen/Qwen3.8-Flash-Next/raw/main/README.md)：512 个专家、约 6B 激活参数、视觉编码器，Gated DeltaNet / QSA 混合注意力。仅用于架构和输入能力介绍，不据此承诺本机速度、输出长度或运行就绪。
- [固定 revision 的 GSQ-RCO 模型说明](https://huggingface.co/ISTA-DASLab/Qwen3.8-Flash-Next-GSQ-RCO-GGUF/blob/ed59f92082b1e93c0e96d60a8b11aab089b52f09/README.md)：非均匀 GGUF 量化、多模态视觉投影。两组精确文件大小沿用 catalog，保持下载 revision 与 SHA-256 不变。
- 简中、繁中、英文说明只描述模型/量化；准备与推理状态使用现有独立状态，不混入“任选/不必/不要/扫描后”等操作指令。

## 检查与边界

- 聚焦路径/控制器/设置 UI 测试通过；`npm.cmd run verify` 通过：全部 unit/integration、类型检查及生产构建、20项文字对比度。测试为本次最终源码状态，不代表模型实跑。
- 真实 Electron 空配置 fixture：真实鼠标进入设置/提示词并点击 IQ3_XXS 下载信息按钮；无需模型根目录输入，目标自动为管理目录/models/IQ3_XXS，且与真实 `scanEnvironment` 返回一致。下载目录按钮可达，模态关闭可达；运行组件详情默认折叠。
- 实际 DOM 不含模型根目录输入框/单独面板；两张模型卡说明符合事实文案断言。1280×800、1440×900、960×800 截图/DOM 无横向溢出。后台启用 focus emulation。
- 原 promptModelId、空 queue/History 保持不变。隔离 fixture 的本任务 Electron 已通过 harness 关闭，PID/CDP/ComfyUI 测试端口复核退出；不是原生窗口退出生命周期证据。
- 本轮没有安装软件、下载权重、创建服务监听或运行 GPU。完整软件安装、pack/MTP、视觉/增强推理及速度/质量仍未验证，参见 TASK。

## 共用 ComfyUI 模型目录增量

- 最新用户授权：模型放置目录复用 ComfyUI；取消软件目录到模型根的绑定。配置或发现的所选 ComfyUI 模型根统一加 `LLM/strata`，完整扫描和 scoped rescan 使用同一解析结果。软件安装事务不变，权重与软件分离。
- 旧 Strata 目录记录不删除，只有共享根尚未配置/发现时才回退；有共享根时旧记录不覆盖新目标。没有迁移、删除或下载文件，也没有新增模型根控件。
- 更换模型根或所选 ComfyUI 后不能沿用旧 Strata 扫描证据。首次打开下载指引、异步复扫后更新、关闭不重开与已保存旧目录回退有控制器测试；离线扫描覆盖配置根/发现根/未知根和 GGUF 文件证据。
- 聚焦5文件134项通过；最终 `npm.cmd run verify` 通过195文件1724项 unit、6文件86项 integration、类型检查/生产构建及20项对比度。未据此宣称推理或性能通过。
- 真实隔离 Electron：鼠标进入现有“应用与路径”，键盘填写含空格的模型根，焦点保持；实际点击保存按钮，再点击 IQ3_XXS 模型信息按钮。下载目标为共享根/LLM/strata/IQ3_XXS，与真实 `scanEnvironment` 返回一致，打开目录/关闭按钮可达，1280×800无横向溢出。
- 经 harness 关闭后原 fixture 重启，保存值及同一目标仍一致；默认 Prompt、Strata 软件设置、queue/History 保持。一次连接早于 AppApi 初始化，待初始化后重试通过，无产品代码修改。
- 实际证据保存在忽略的 temp fixture；截图检查通过。自有 Electron 两轮 PID、CDP 与测试 ComfyUI 端口复核退出，43127/8080未监听；harness 清理不代表原生退出生命周期。未加载 GPU、安装软件或下载权重；无现有用户数据变更。
