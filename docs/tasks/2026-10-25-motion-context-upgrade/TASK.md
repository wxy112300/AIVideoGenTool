# Motion Context 推荐线升级

状态：完成；影响：patch。

用户要求检查最新版本内容与依赖，将应用推荐线升级，再自行测试更新按钮。仅修改推荐元数据和相关合同；不代用户安装节点或运行新版 GPU 生成。

## Resume

2026-10-25 官方最新稳定版 v0.7.1，tag peeled SHA / 当前上游 HEAD 为 `518c083d11d80fa5920222ad89889924ee4401c9`。本机来源为官方仓库、版本 0.6.2、SHA `5335715abe54c1a9bfbe3494da29aae3e8635ce3`，读取时工作树干净。两者范围已对比，源码和原始日志仅在忽略目录 `temp/motion-context-upgrade/`。

依赖仍为 ComfyUI >=0.34.0、Python >=3.10，已有 torch / safetensors 和 ComfyUI 内部模块；没有新增 requirements 或 pyproject dependencies。四个基础节点保留；Load 可选 stock_format=false、folder=output 保留旧调用；Save 的 result 路径保持，新增 ui.latents 可见文件输出。v0.7 引入实验性 Join Match / Refine Blend / Sigmas Tail，应用图不自动接入；音频建议改成 18，但本次保留应用显式 24 和 context_length=22，避免把推荐升级变成采样策略修改。

官方 `_mock_harness.py` 的八项检查、`_node_smoke_test.py` 均通过，无真实 ComfyUI 或 GPU；证据为静态/mock，不声称生成兼容通过。catalog 已调整至 0.7.1，最低 0.3.1 回退保留。现有通用安装器更新模式拉取官方仓库，审计时 HEAD 与候选 tag 相同；本次不改安装事务。

## 验收与交付边界

- `focused.log`：catalog、扫描与现有工作流 106 项通过；`verify.log`：2577 单元、91 集成、typechecked build、440 对比度全部通过。
- `layout-smoke.log` / `node-smoke.log`：上游假 Comfy/NumPy mock，通过布局、显式 audio_context_length=24、保存/读取、固定 slot、ui.latents 与 input/output 路径边界检查。这不是 GPU 或真实生成验收。
- `ui-report.json` / `update-button.png`：最终生产 Electron 经真实设置入口，当前 v0.6.2 标记落后，推荐/最新 v0.7.1，“更新”按钮可用、operation=update、无多余 box-shadow；未点击安装。应用 output extractor 不将新增 latents 列表误当视频；Motion Context 仍通过既有显式路径与 tensor header 检查续写数据。
- `cleanup.json`：自有 PID 54212 / CDP 9011 已退出，空队列、Prompt 空闲、ComfyUI 停止，18188 未启动。交付前本机节点仍为原 SHA 5335715，工作树干净。更新按钮的安装事务、重启后的实际节点 schema 和真实 H3 续写由用户后续测试，尚无新版运行成功或画质收益结论。

来源：[v0.7.1 发布](https://github.com/NikoDemon80/ComfyUI-H3-Motion-Context/releases/tag/v0.7.1)、[依赖声明](https://github.com/NikoDemon80/ComfyUI-H3-Motion-Context/blob/v0.7.1/pyproject.toml)、[变更日志](https://github.com/NikoDemon80/ComfyUI-H3-Motion-Context/blob/v0.7.1/CHANGELOG.md)。
