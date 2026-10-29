# llama-cpp-python 更新卡状态

日期：2026-10-29 · 类型：patch · 状态：完成

## Resume

- 用户截图为本机 0.3.46、软件推荐 0.4.2、最新未获取，卡片仍显示重新安装。原卡仅按 installed/ready 分支，latest 固定传空。
- 卡片现在独立比较本机与固定推荐版本，旧版本展示更新操作及既有更新按钮样式；同版/更新本机仍可显式重装。任务运行保护保留，并提供对应禁用原因。运行就绪与需要更新是不同判断，不修改 ready 执行资格。
- 扫描查询实际安装来源 JamePeng/llama-cpp-python 的稳定 GitHub Release；支持 `v0.4.5-cu131-win-20261025` 此类 tag，优先 API、失败后官方 latest redirect，不拿 PyPI/Registry 或源码 HEAD 代替该 wheel 版本。复用既有六小时成功缓存、代理隔离和手动刷新失效；runtime-only 扫描保留旧 latest。
- 用户追加授权将推荐升级到最新；推荐与显式安装目标现固定 0.4.5 / 20261025，latest 仍只作上游发布观察。本次不安装/升级本机包、不下载权重、不重启用户 ComfyUI。资产、依赖与源码评估见[证据](evidence/045-assessment.md)。
- [上游发布](https://github.com/JamePeng/llama-cpp-python/releases/tag/v0.4.5-cu131-win-20261025) 已只读核对。发布版本不等于所有 Python/CUDA 组合都可安装，不将 latest 自动作为安装目标。

## 验证

- 最终 0.4.5 推荐线：121 项 focused 通过；隔离副本全量 2804 项 unit、104 项 integration、干净 typechecked build、440 项 contrast 均通过，日志 `temp/llama-045-focused.log`、`temp/llama-045-verify.log`。最终 10 个受影响源码/测试文件与验证副本 hash 一致。
- 最终真实扫描与卡片：`temp/llama-update-ui-PxgaVb/report.json`，本机仍为 0.4.2+cu130、ready=true，推荐/最新均为 0.4.5，1440×900 和 1280×800 显示需要更新、更新按钮可用且无溢出。截图已人工查看。仅扫描/展示，未点击真实安装；自有 PID/端口退出，runtime 保持 stopped，依赖 junction 已移除。以下旧验证保留其原推荐线范围。
- 首批 68 项 focused 与 typecheck 通过。覆盖生产卡片 + controller 实际点击至安装端口、无 latest 仍可更新、版本 build suffix、同版/更高版本不误报更新、运行中禁用、API/重定向/失败/预览/错误仓库过滤。
- 安装器既有显式操作会重装固定 wheel；节点安装器的 ensure(forceReinstall=false) 仍保留已就绪的旧包，不将自动安装节点变成隐式升级。
- 全量单元检查：298 文件 / 2802 项通过；集成检查 103 项通过，资料库 1200 记录用例的 afterEach 清理遇到 10 秒超时，单独复验该文件 13 项通过，未修改超时或断言。最终干净 typechecked build 和 440 项对比度检查通过。日志位于忽略的 `temp/llama-update-20261029-verify.log`、`temp/llama-update-20261029-final.log`。
- 真实版本读取与隔离 Electron：`temp/llama-update-ui-1RoTZ5/report.json`。同一来源的 live Release 及 AppApi 完整扫描均返回 latest=0.4.5。测试所选 Python 为 0.4.2+cu130、ready=true，与推荐同版，实际卡片保留重新安装，按钮可用；1440×900、1280×800 无溢出。旧 0.3.46/0.3.46+cu130 的更新入口由受控生产卡片/controller 点击测试覆盖，不将测试所选实例当作用户当前配置的所有 Python 环境。
- 未点击真实安装、未下载或重装包、未启动用户 ComfyUI；独立 userData/资料库/空队列及端口，runtime=stopped。自有进程与端口退出，临时 node_modules junction 移除，主 dist 保留。Docker 配置未修改。
