# 受管理软件更新与磁盘清理

日期：2026-10-19。用户授权修复永久保留旧软件和多安装指针，并检查其他节点；patch，不递增版本、不提交／推送／发布。

## 审计与实现

| 路径 | 原问题 | 当前处理 |
| --- | --- | --- |
| Strata | 每版独立安装、重装永久备份、失败暂存与坏包保留 | 固定 `strata/runtime`，失败仅事务内恢复；成功清理受信旧版本／备份／暂存／软件下载缓存；坏包删除 |
| 独立启动器 | 非空路径永久优先，主应用升级后仍指旧版 | managed 路径归一为自动发现，与主应用共用解析；同版本旧目录也生成迁移更新计划，手动目录不迁移 |
| 自动 pack | 记住旧版本 pack 时显式报错阻止恢复 | 受管理派生目录中的失效选择可重新发现；手动 pack 仍严格报错。同 revision 仅软件位置改变时，全部源文件／产物／配置校验后原地重定位，不复制 pack |
| 普通 Git／内置节点 | 替换后永久留下 `node-backups` | 全依赖验证成功后清理事务旧软件；失败恢复原节点。历史副本需名称与官方 origin 对应，未知归属不删除 |
| DLSS5 SR／NR、AetherScale | runtime／carrier 备份成功后不清理 | 复扫成功后清理本次副本及 manifest 可识别的历史软件，保留未登记文件 |
| Konohamaru | 替换 addon、旧 RenoDX、video2dlssnr 副本常驻 | 复检成功后清理替换的软件；保留失败恢复能力，不生成永久软件备份 |
| Claude／CloudCLI／SDK | 共享 npm 安装前复制整套旧包与入口，安装归档和构建缓存保留 | 不再复制旧包；收尾清理 tgz、私有 npm 内容缓存／构建头文件；按历史安装计划清理旧软件副本，保留日志 |
| llama-cpp-python | 未发现此类整树备份 | 现有 pip upgrade／force-reinstall／no-cache-dir 原环境替换，保持不变 |
| ComfyUI SQLite／CC Switch 备份 | 不属于可重新下载的软件 | 不在清理范围，保留用户数据库、provider、配置、会话及恢复数据 |

## 数据与失败边界

- 不删除共享模型、History／媒体、独立 Agent／GUI 数据或手动安装。节点内的本地模型、媒体和配置迁入替换副本；同名且内容不同则停止并报告，原文件不变。
- Git 中未修改的跟踪资源属于下载软件，可正常替换；被用户修改的跟踪配置不作为可丢弃的默认文件。源码／兼容层重新安装，不永久保存本地源码修改。
- 清理验证词法与真实路径包含关系，拒绝根目录、越界、链接目标；迁移也拒绝目标中间目录链接。不按 `backup` 字样扫描整台电脑。
- 清理失败写明具体位置，保留已验证的新安装，不因旧文件锁占用再销毁新版本。未知归属／数据冲突需人工核对，不能承诺任何同名历史目录都已删除。
- 网络中断只保留同一受信软件资产的可续传半包和日志；不是每次重新留下整个安装目录。共享 npm 失败可能部分生效，重新检测后重试标准安装，不声称全环境自动回滚。

## 验证与真实环境范围

- 隔离真实文件系统安装事务：重复更新不积累、旧版本／备份／下载清理、失败／取消恢复、未知目录保留、模型／配置迁移、跟踪默认资源与用户修改区分、路径越界／源和目标链接保护。
- 控制器 mock：同版本旧目录仍生成迁移计划；固定目录同版本不重复安装；不启动 GPU／GUI／Claude。
- 独立 `prepare.mjs` 编译和 WinForms `-Smoke` 通过：Q4 三模式、720×540／1000×720 主控件、设置和日志折叠正常，不启动服务。
- 真实旧偏好只读检查：已从旧引擎固定路径转为 managed-auto，实际解析本机已安装 0.1.45，失效 pack 选择清空；偏好文件 SHA-256 前后相同。真实安装尚未迁到固定目录，迁移与旧文件回收在下一次用户确认的软件更新／重装完成后执行。
- 最终完整 `npm.cmd run verify` 结果由同一 TASK Resume 记录；忽略目录 `temp/software-update-final-verify.log` 仅作本机日志，不提交。
- 未执行网络软件更新、下载权重或 GPU 推理；不把合成下载／子进程夹具称为真实上游安装成功。43127／43128 无监听；没有本轮遗留的服务。

## 后续：接入设置缓存按钮与官方版本复核

用户随后授权将历史残留清理接入设置的原缓存按钮，并要求有新版才提高Strata推荐线。

- 2026-10-19只读复核官方 [latest API](https://api.github.com/repos/Niko1221/Strata/releases/latest)、[main API](https://api.github.com/repos/Niko1221/Strata/commits/main) 与[发布页](https://github.com/Niko1221/Strata/releases/tag/v0.1.45)：stable仍为0.1.45，2026-10-17T06:53:17Z发布，main/tag均477ac13cbe8e582c20484871ce459d20d82df09d；NVIDIA包165243142bytes，SHA-256 a1d4cafb8319c253f3010ff118dbd5ed07c232056b939ac7735819559f3b859e。均与catalog一致，没有新候选或资产替换，不虚增版本、不下载安装。
- 沿用 `cache:get`／`cache:clear`／`cache:progress` 和原缓存面板，统计中加入旧软件；不加新按钮、通用删除IPC或持久化字段。独立 `managed-software-cache` 只发现管理根与所选ComfyUI，使用原catalog/安装路径/Agent软件计划识别来源，包括退休节点维护身份。
- 保留当前受管理安装；固定runtime尚未创建时保留当前有效版本目录。清理不复制旧配置到当前软件，不删除有效pack、共享权重或用户文件；旧副本含用户数据则报告并保留。解析记录及路径在删除前重新核对，拒绝陈旧快照和链接，Git探针关闭fsmonitor/hook/可选写锁及外部diff，只读本地源码、无网络/大权重哈希。
- 安装注册器与软件维护互斥；跨进程GPU租约新增禁止handoff模式，只为清理使用，不改变原生成默认交接。已加载模型/Agent拒绝清理，不请求卸载或中断，浏览器缓存仍能处理。旧软件删除和保护原因进入原日志/结果，三语言面板展示部分失败。
- 最终完整 `npm.cmd run verify` 退出0：234文件2228单元、6文件91集成，类型／干净renderer+web+Electron构建／20对比度通过；独立 `prepare.mjs` 通过。新增回归覆盖统一统计与重复清理、当前版本/未知目录/模型/配置/链接保护、receipt变化、安装互斥及不交接活跃Agent；未加载GPU。
- 隔离真实Electron原按钮：刷新→实际鼠标点击“清理缓存”→进度完成→文件断言，统计522B→261B；预期旧版本和过期临时目录消失，当前0.1.45、共享GGUF及夹具中含GGUF的旧备份保持，原面板明确显示保护原因。1280／960宽无横溢出，截图人工复核，settings/drafts/queue/History严格不变，无模型/任务请求。初次CDP尚未就绪与错误标签selector的夹具失败已修正重跑，不作为产品失败；最终成功报告在忽略的 `temp/create-smoke-8MiPbo/software-cache-ui.json`，截图同目录。清理helper完成，自有PID39436及7035/6800监听退出；非原生退出生命周期证据。
- 本轮只删除隔离测试垃圾；未运行用户真实缓存清理、未修改真实软件安装/偏好/模型/Claude/CC Switch/Codex，未提交推送或发布。其他电脑拉取本轮代码后可在“设置→应用与路径→缓存管理”直接清理旧软件；同版Strata更新/重装继续支持固定目录迁移，不需要等待新上游版本。

## 内置词表误判修复与真实残留清理

2026-10-19后续用户授权：修复指定三个真实暂存目录的缓存误判；代码验证完成后重新只读检查，确认闲置和归属后可清理。patch，不升级Strata、不下载模型、不递增应用版本、不提交／推送／打包／发布。上一节“未清理真实目录”仅指此前一轮。

### 来源与局部修复

- 三个目录均为官方 `Niko1221/Strata.git` 的源码 checkout：MwRoER／UE6RN2 为 `fb58e0dbc8399662c0e47c76578c6e878b14f6cf`，QgVKhT 为 `296b59d2f73c8f04a805df29c2fa97655adace78`，均对应已有catalog基线。没有stage marker，沿用现有官方origin归属回退，不另建标记体系。
- 官方 `tools/draft_vocab.py` 开头说明它保存 MTP 草稿头可提议的词汇行子集；源码 `src/core/mtp.cpp`／`src/program/generate.cpp` 消费该子集。`data/draft_vocab.bin` 及 `_en`／`_fr`／`_cyrillic` 均受Git跟踪；同类 `expert-profile.bin`、`expert-profile-coder.bin`、`expert-profile-sycl.bin` 也是内置数据，不是主模型权重。实际三个目录的这些文件均未修改。
- 原因是清理器在Git跟踪资源判断前统一拒绝 `.bin`。现在只在现有Strata候选、官方origin、Git未修改文件集合三者成立时，放行上述七个精确相对路径。没有放开任意 `.bin` 或同名文件；普通 expert-profile 也不再无条件放行。其他内置控制向量沿用既有路径规则。
- 当前安装、共享模型／pack、用户配置／会话／媒体、未知目录保护与原安装互斥／禁止handoff租约保持。模型目录内的同名词表、未跟踪或修改过的内置资产仍阻止整份副本删除；源码链接仍拒绝。

### 验证

- 先加入真实Git目录夹具：新正向用例准确复现原 `data/draft_vocab.bin` 报错；修复后15项目录回归通过。覆盖四种词表和三种profile、修改过的资产、无跟踪记录、非官方origin、仅stage marker、同名越位、真正 `.bin`／GGUF权重、配置／会话、未知暂存及链接目标保护。
- `npx.cmd vitest run --config vite.config.ts tests/managed-software-cache.test.ts tests/cache-service.test.ts tests/software-update-cleanup.test.ts tests/installation-cancellation.test.ts`：4文件31项通过。
- `npx.cmd vitest run --config vite.config.ts tests/strata-agent.test.ts -t "cache maintenance"`：1项通过，确认持有模型的Agent未收到handoff，租约仍由原owner持有。最初带管道的筛选被Windows命令层误解释，改为单测试名后通过。
- `npm.cmd run typecheck` 双端通过；`tsc -p tsconfig.electron.json --outDir temp/strata-cache-fix-runtime` 隔离编译通过，未清理／覆盖共享dist。编辑器无新增诊断。
- 本轮只改服务内部资产判定与回归，不改共享状态／IPC／renderer／运行策略，按 `CHANGE_VERIFICATION` focused层验证，未重跑全量verify或原按钮UI／GPU；此前完整verify和隔离按钮证据不冒充本轮实测。实际删除调用编译后的生产清理模块，不是UI按钮证据。初次Vite临时SSR探针因导出解析失败而中止，未删除文件，随后改用隔离编译产物。

### 指定真实目录清理结果

代码验证后再次只读递归检查完整目录：均无链接、Git已跟踪源码未修改，额外未跟踪文件仅 `engine.zip`。进程清单对三个目标的引用数均为0，未发现Strata／Python进程；其他Electron实例不处理。用真实设置通过生产发现逻辑复核当前版本及模型／输出保护，然后在原 `withCleanup` 维护互斥、禁止handoff资源租约与进程空闲检查内逐一 `clear`，删除前仍复检identity及内容。

| 指定暂存目录 | 文件数 | 清理前逻辑字节数 | 结果 |
| --- | --- | --- | --- |
| `.install-MwRoER` | 2448 | 109400408 | 已删除，无残留 |
| `.install-QgVKhT` | 3203 | 192375766 | 已删除，无残留 |
| `.install-UE6RN2` | 2448 | 77578584 | 已删除，无残留 |

合计8099文件、379354758bytes（约362MiB，逻辑大小，不等同磁盘分配量）。未删除Strata根目录或其他兄弟目录；其他同级目录名称前后相同。当前 `v0.1.45-477ac13c` 仍在，应用状态文件与当前安装收据SHA-256前后相同；模型／输出均不在删除范围。未停止任何其他任务进程，未发模型交接或下载请求，清理租约释放后无owner记录。本轮只确认上述三个目标无残留，不声明整台电脑不存在其他旧软件。

## 节点缓存误判修复

2026-10-19后续授权：解决节点备份中的演示MP4与两处DLSS5旧解包ASAR清理误判。patch，不增加按钮／版本／持久化字段，不提交／推送／打包／发布；本轮只对隔离副本执行删除。

### 证据与边界

- `ComfyUI-DLSS-Frame-Interpolation-1788978321846` 的origin为catalog中维护的Konohamaru官方仓库，`Assets/120fps-Upscaled-interpolated.mp4` 为Git跟踪且未修改的演示视频。原代码在检查Git资源前就按MP4拒绝；现在允许官方来源中未修改的跟踪媒体，仍拒绝新增／修改的媒体及模型／数据库。
- 两份 `ComfyUI-DLSS5-1788451662856`／`1788453387934` 均来自HECer官方仓库，UUID暂存目录各只剩 `extracted/resources/app.asar`，无链接／归档／manifest。只读用现有ASAR解析库确认内部 `package.json` 为 `vapourkit-gui`／`2.0.0-nightly.2026-08-31`；大小均40483535bytes，SHA-256均 `1100a865277c20c648dc1fd6b3992a6ce31cc8c495a2453440ee2c5bc0b3cdf1`。旧安装脚本固定该nightly，既有DLSS5审计也记录它是错误的桌面分发包。摘要来自本机两份已核对的相同残留，并非上游独立公布的单文件摘要；本轮没有重新下载归档。
- 将该退休文件身份记入既有DLSS5 catalog，不进入可安装artifact列表。只有维护目录／官方origin、严格UUID暂存前缀、精确相对路径、普通非链接文件、大小及完整hash全部通过时才放行；内容改变、位置不符、来源未知、额外用户数据或链接仍保留整份备份。不放开任意ASAR，也不按ASAR内部包名直接授权删除。
- 删除沿用原路径真实包含关系检查，再调用既有 `removeDirectoryTreeWithoutAsar`；其他调用方的默认删除行为不变。实际Electron验证发现普通fs.lstat统计会打开并缓存ASAR，导致后续unlink出现EBUSY；缓存统计和退休ASAR校验改用original-fs，避免自锁，不切换全局process.noAsar，不强制关闭其他程序。
- 错误处理保持逐目录：当前目录检查失败就保留，记录原因并继续后续目录；不在含疑似用户数据的备份内做破坏性部分删除。最后真实只读复检还发现插帧备份内 `bin/runtime/host/ReShade.ini` 被修改，因此即使演示视频放行，该份备份仍应保留并报告配置保护，不能承诺三个目录都能无条件回收。

### 验证与收尾

- 先用真实Git目录回归分别复现官方视频和退休ASAR的原报错，再修复。相关命令：`npx.cmd vitest run --config vite.config.ts tests/managed-software-cache.test.ts tests/cache-service.test.ts tests/software-update-cleanup.test.ts tests/dlss5-runtime.test.ts tests/installation-cancellation.test.ts`，最终实现上5文件57项通过；补充真实修改配置案例后仅重跑managed缓存文件，25项通过，相关用例合计58项。覆盖原Strata保护、媒体修改／新增、ASAR同大小修改／来源／位置／用户文件／链接、根目录／越界保护、首目录报错后后续目录仍被删除、DLSS5安装事务与维护互斥。
- `npm.cmd run typecheck` 双端通过；`tsc -p tsconfig.electron.json --outDir temp/dlss-cache-fix-runtime` 隔离编译通过；编辑器无新增诊断。改动属于局部文件清理，不改共享状态／IPC／UI／模型运行策略，按focused分级，不重复完整verify、原按钮UI或GPU推理；既有按钮证据不冒充本轮点击实测。
- 自有无窗口Electron43.2.0服务探针使用独立userData／LOCALAPPDATA／ComfyUI根，实际缓存服务和session，复制真实旧ASAR作为正向资产，并构造用户媒体与同大小修改ASAR。最初捕获EBUSY，修复原生统计后同一探针退出0：合格视频／ASAR备份删除，两个保护项保留，错误后继续，统计81075784→40537824bytes。Node测试替换catalog摘要使用小夹具；真实Electron检查使用生产catalog摘要，未mock ASAR字节或删除函数。探针仅隔离文件操作层，维护锁由相邻回归验证，不证明实际按钮UI。
- 真实三个备份始终未删除，最后复检两份ASAR摘要相同、原视频仍在。未操作正式settings／队列／History／模型／当前runtime，未发网络请求或停止其他任务的进程。仅移除本轮生成的隔离副本和编译目录；无自有探针进程或监听残留。

### 后续内置元数据与配置保护

- 用户随后报告ReShade.ini和另两份DLSS5备份内config.json。插帧备份ReShade为Git跟踪文件，NRStyle从2改为1、NRIntensity从1.2000改为1.0000、NRLocalStructure从1.3000改为1.0000。catalog虽说明上游可生成／修复该文件，但不能据此辨别修改是临时输出还是用户偏好；不按参数形状授权删除，继续整份保留，错误明确“配置已修改或来源未确认／未清理整个备份”。
- 两份 `ComfyUI-DLSS5-1788459456897`／`1788460122667` 均为官方HECer来源，未跟踪的 `assets/depth-anything-v2-small` 各只含950字节config.json与775字节preprocessor_config.json，没有权重。适配层 `applyDlss5DepthAnythingAdapter` 正是通过既有 `depthAnythingBuiltinMetadataFile` 写入这两个JSON；只读导入当前TypeScript模块逐字节比对，四文件全部相等。
- 清理判定直接复用该纯生成函数与相对目录常量，仅对已确认官方DLSS5备份、精确目录及两个精确文件名放行完全相同的字节。修改／未知JSON、错位、未知origin、真实safetensors及原链接保护保持；不按JSON扩展名普遍放行，不增加根据本机观察得到的摘要来源表。
- 新增6个真实Git目录用例，修复前内置JSON正向用例复现原误判，其余5个保护用例通过；修复后缓存相关3文件43项通过，覆盖原Strata、媒体／ASAR、维护路径与首错后继续。双端typecheck通过。局部文件判定分级，不重复完整verify、Electron／原按钮UI或GPU验收；本轮没有修改／删除任何真实备份、正式配置或模型，没有下载、启动服务或占用端口。
