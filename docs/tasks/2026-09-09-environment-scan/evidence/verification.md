# 环境扫描验证
- 类型：静态回归 + 本机服务扫描 + 同进程缓存基准
- 日期：2026-09-11
- 范围：本次扫描可靠性与提速实现；不证明真实生成、采样质量或长期失败率。

## 2026-09-11 提速执行验证

- `npm.cmd run verify`：175 个测试文件、1465 个测试通过；clean build（含 renderer/Electron typecheck）通过；20 组 UX 文字/表面对比度检查通过。
- `npm.cmd run harness:comfy -- scan-benchmark --json`：同一 Node 进程连续完成 1 次 cold miss、3 次 auto hit、1 次 force live；使用本机已配置的 ComfyUI/Python 环境，只读扫描，不安装依赖、不启动或停止服务。

| 轮次 | 总耗时 ms | validation | fingerprint ms | native 启动 | source (H3 / llama) | state | age ms (H3 / llama) |
| --- | ---: | --- | ---: | ---: | --- | --- | ---: |
| full-auto-miss | 7533 | auto | 2218 | 2 | live / live | valid / valid | 0 / 0 |
| full-auto-hit-1 | 2344 | auto | 0 | 0 | cache / cache | valid / valid | 1802 / 3191 |
| full-auto-hit-2 | 2365 | auto | 0 | 0 | cache / cache | valid / valid | 4150 / 5539 |
| full-auto-hit-3 | 2324 | auto | 0 | 0 | cache / cache | valid / valid | 6493 / 7884 |
| full-force | 6981 | live | 1937 | 2 | live / live | valid / valid | 0 / 0 |

- 三次命中轮的中位数为 2344 ms；相对该次 7533 ms cold miss 降低约 68.9%，但仍略高于 2 秒目标，剩余耗时来自 full scope 的文件、API、目录与 catalog 刷新。两套健康 family 均满足命中轮 `nativeProbeStarted=0`；force 确实重新启动两套原生探针。
- cold miss 与 force 的 `nativeProbeDurationMs` 分别为 5851/5372 ms；verifiedAt 在命中轮保持原始时间，age 按轮次递增。fingerprint 阶段已单独进入 telemetry；本机样本约 1.9–2.2 秒，说明它是后续可继续优化的独立成本，不能把本轮收益归因于 fingerprint 加速。
- 本次没有启动 Electron 做手动视觉核对；缓存/强制/失败待复检状态的 renderer fixture 与 focused tests 已覆盖，键盘焦点、真实窗口布局和连续操作仍标记为未手动验收。

### 追加复测

- 独立进程连续复测 3 组 `scan-benchmark --json`，每组均为 1 次 miss、3 次 hit、1 次 force。三组 cold full 总耗时为 7242/7065/7081 ms，中位数 7081 ms；9 次命中为 2288–2353 ms，中位数 2321 ms；3 次 force 为 7069/6966/6952 ms，中位数 6966 ms。
- cold 的 fingerprint 为 2052/1971/1926 ms，force 为 1942/1933/1909 ms；cold/force 均启动 2 次原生探针，命中均为 0 次。命中相对 cold 中位数降低约 67.2%，重复采样未出现缓存串用或 verifiedAt 漂移。
- 默认 `scan --json` 入口另测 2 次均成功；`exec` 包含 Node/npm 进程启动的墙钟约 7.8 秒，因此只作为 dependencies live 路径的量级参考，不与同进程 full round 直接比较。
- 现有 telemetry 尚未分别填充 runtime API、catalog release、model/custom-node 文件扫描的独立耗时；因此可以确定冷/强制主要等待 Python 原生探针窗口，命中后约 2.3 秒来自 full scope 的其余刷新，但不能仅凭本轮数据给这些子阶段排序。下一步若要继续优化，应先补分阶段计时再改动扫描范围。

## 2026-09-09 第一阶段检查（历史记录）
- 8 个定向测试文件，132 项通过：environment、runtime evidence、diagnostics、dependency scanner、refresh coordinator、Python probe、scan coordinator、settings selectors。
- 最终补充 diagnostics + settings accessibility + settings selectors：32 项通过（与上项存在重叠，不相加）。
- `npm.cmd run verify`：1373 项通过、2 项失败，未进入 build。两项失败为并发 DLSS5/AetherScale 归档改动与旧 catalog/installer 测试期望不符；本任务未改动这些实现或修正这些期望。
- 单独 `npm.cmd run build`（含 typecheck）通过；最终诊断补丁后再次构建通过。
- `npm.cmd run verify:ux-ui-contrast`：20 对文字/表面对比度通过。
- renderer fixture 检查未完成状态、真实已识别版本、KJ 离线源码信息、禁用安装按钮；未启动真实 Electron 做手动视觉验收。

## 本机扫描对照（第一阶段历史记录）
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
