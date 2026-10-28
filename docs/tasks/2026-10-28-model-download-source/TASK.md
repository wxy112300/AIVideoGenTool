# 模型下载地址选择

日期：2026-10-28 · 类型：patch · 状态：完成

## Resume

- 将设置中的镜像布尔开关替换为“模型下载地址”下拉框；官方 Hugging Face、hf-mirror.com、hf-mirror.net、hf-api.gitee.com、自定义 HTTPS 站点。
- `Settings.modelDownloadSource` 与 `modelDownloadCustomUrl` 为可选新增字段。缺失 source 时按旧 `hfMirrorEnabled` 解析；保存后同步旧 flag。未修改的旧表单不因补字段产生脏状态。
- 仍作用于现有 Settings 模型下载链接，不扩展到第三方 runtime 的内部下载。保留 repo/revision/path/query/hash；GitHub 等其他来源不改。文件专用源保留官方模型介绍页，自定义 URL 只接受无凭据、路径和查询参数的 HTTPS origin。
- 选项说明在展开菜单内；只选自定义时显示输入，不重建整个设置页。
- 用户反馈后，选项副标题改为各站点的简短背景与定位，不再展示链接改写规则；未添加缺乏依据的热度排名或速度保证。简繁英同步。

## 候选依据与边界

- [HF-Mirror.com](https://hf-mirror.com/) 支持网页与相同文件路径。
- [HF-Mirror.net FAQ](https://hf-mirror.net/en/faq.html) 明确文件级代理，不代理模型介绍页。
- [模型下载说明](https://www.moark.com/docs/products/models/download) 和 [Qualcomm launcher](https://github.com/qualcomm/qai-appbuilder/blob/main/tools/launcher/README.md) 使用 Gitee HF API endpoint。
- 实测以上三个镜像 `/gpt2/resolve/main/config.json` 返回 200、665 字节、model_type=gpt2，SHA256 均为 `0daed7749b4f02b8f76240d5444551d7b08712dab4d0adb8239c56ba823bb7b4`。只验证公开小文件兼容，不推断全部权重覆盖、Range、大文件速度或长期可用性；未下载模型权重。
- AI FastHub 本机探针遇到跳转后 TLS 主机名验证失败，未列预设；未关闭 TLS 校验或发送认证凭据。

## 验证

- 首批 URL、表单、设置服务及相邻渲染检查 55 项通过；新增服务保存迁移/自定义地址拒绝用例纳入最终全量回归。typecheck 通过。
- 全量 gate 在 `temp/adaptive-prompt-20261028/` 完整隔离副本执行；日志 `temp/download-source-final-verify.log`。先前另一个快照归档停滞时，在 build 前停止本次误提前启动的验证命令，主 dist 未被清理；改为等待完整副本、断言 cwd 后执行。
- 最终全量 gate：298 文件 / 2792 单元测试、7 文件 / 104 集成测试通过，typechecked build 和 440 对比度检查通过。
- 站点简介调整后，20 项相关检查与 typecheck 通过。按用户后续要求将全部当前改动归入 0.67.2，package/lockfile/README/CHANGELOG 对齐；最终版本隔离干净构建与 440 对比度检查通过（`temp/version-0.67.2-build.log`）。仅提交推送，不打包、不创建 GitHub Release。
- 真实 Electron 最终报告：`temp/download-ui-M4VP1U/report.json`。鼠标打开五个选项、旧 true 偏好恢复且无虚假脏状态、自定义输入显隐、点击保存拒绝无效 HTTP/路径地址、有效地址保存并规范化、切回官方同步 false、选择 Gitee 后保存/reload 仍为 Gitee 均通过。1440×900、1280×800 截图已检查。
- 前期负向 UI 探针将不存在的安装入口作为夹具，自动识别改写该入口后保存触发额外环境扫描，下一次保存仍 busy 而超出测试 30 秒等待；有一次初始断言误将自动识别入口的脏状态归因于下载源。最终使用实际已识别的安装入口，并等待保存完整结束，连续点选/保存全部通过。未据此修改通用保存流程。
- 所有测试采用独立 userData、资料库和空队列，ComfyUI URL 使用独立空闲端口，runtime 保持 stopped；未启动或重启用户 ComfyUI，未进行实际模型下载。自有窗口/进程/端口已关闭，主 dist 保留；隔离快照和日志保留在忽略目录，临时依赖 junction 已移除。
