# 环境扫描验证
- 类型：静态回归 + 本机服务扫描
- 日期：2026-09-09
- 范围：本次扫描修复；不证明真实生成、采样质量或长期失败率。

## 检查
- 8 个定向测试文件，132 项通过：environment、runtime evidence、diagnostics、dependency scanner、refresh coordinator、Python probe、scan coordinator、settings selectors。
- 最终补充 diagnostics + settings accessibility + settings selectors：32 项通过（与上项存在重叠，不相加）。
- `npm.cmd run verify`：1373 项通过、2 项失败，未进入 build。两项失败为并发 DLSS5/AetherScale 归档改动与旧 catalog/installer 测试期望不符；本任务未改动这些实现或修正这些期望。
- 单独 `npm.cmd run build`（含 typecheck）通过；最终诊断补丁后再次构建通过。
- `npm.cmd run verify:ux-ui-contrast`：20 对文字/表面对比度通过。
- renderer fixture 检查未完成状态、真实已识别版本、KJ 离线源码信息、禁用安装按钮；未启动真实 Electron 做手动视觉验收。

## 本机扫描对照
使用项目 harness 的 settings loader 和 scan action，不写用户设置、不启动/停止 ComfyUI、不安装依赖。旧扫描入口来自 Git `1723e15` 的 environment.ts，通过 Node 去类型后与同一次构建的其余依赖一起运行；这是扫描编排/探针对照，不是两个完整发布版本的比较。

| 顺序 | 入口 | 耗时 ms | object_info 请求数 | H3 |
| --- | --- | --- | --- | --- |
| 1 | 旧扫描入口 | 11515 | 4 | ready |
| 2 | 新扫描入口（同时发两个 full 请求） | 5724 | 2 | complete / ready |
| 3 | 旧扫描入口 | 5763 | 4 | ready |
| 4 | 新扫描入口（同时发两个 full 请求） | 5822 | 2 | complete / ready |
| 5 | 项目 harness scan action | 5385 | 未单列 | ok |

- 四次扫描均识别同一 Python 3.12.11、44 个模型 profile、22 个节点；KJ 源码兼容，服务离线以 source 检查核心。
- 两次新扫描中的重复调用返回同一 Promise，确认只执行一轮；节点 API 两次请求对应两个候选 endpoint，每个候选只请求一次。
- 新 H3 探针耗时 4048/4127 ms。旧版第一次包含网络和系统冷缓存影响，不能将 11515→5724 宣称稳定加速比例；热扫描约 5.8 秒，单轮热扫描没有显著变化。可确认的性能收益是重复调用合并、节点 API 请求减半和独立发现阶段重叠执行。
- 原始对照摘要保留在忽略目录 `temp/environment-scan-benchmark.json`；临时 baseline 模块已删除。

## 限制与清理
- 超时与输出污染依靠确定性 runner 回归测试，未人为挂起真实 GPU 或破坏 Python。
- 在线 schema、多个实例优先级使用 mock 测试；本机服务离线，未做真实在线注册/生成。
- 未创建或终止 ComfyUI/Electron 服务；扫描子进程均已结束。
- 测试期间存在另一独立任务的 catalog、installer、locale 改动，已保留；完整仓库 gate 需由该任务同步测试后重跑。
