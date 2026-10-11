# Strata 安装进度验证

- 日期：2026-10-10；patch，不 bump；direct，子 agent 0，全树费用 unknown。
- 用户要求：安装时看得到进度条，沿用简洁卡片和现有取消功能。

## 实现与边界

既有 `dependency-install:log` typed 事件附带当前阶段、下载文件实际字节及百分比；不新增 IPC channel/持久化字段。250ms 采样真实 curl 输出文件，操作结束/失败停止采样。仅引擎下载显示百分比及 MB，其余步骤动态条，不估算总体完成比例。日志收起后仍可见，renderer 局部更新，不重挂设置；重试重置，取消反馈优先，终态隐藏。

## 验收

- `npm.cmd run test:all`：1765 unit + 86 integration 通过。首轮新增 coordinator 测试的默认页签/缺失事件和扫描集合夹具已修正，保持通过实际页签点击切换，不放宽断言；已有 jsdom scrollTo 警告不影响断言。
- `npm.cmd run typecheck` 通过；生产 Vite `--emptyOutDir false` 构建与 Electron tsc 通过；20项文字/表面对比度通过。运行时曾检测到用户窗口，故未执行清空 dist 的整条 `verify`，明确使用保留旧资源构建，不把它报告为 clean verify。
- 新测试证明：立即显示、折叠外展示、真实字节变化、百分比边界、阶段切换、焦点/输入/DOM 身份保留、取消覆盖/晚到事件不复活、终态停止采样；真实本地 HTTP/curl 在部分下载后取消且无后续重试。
- 隔离真实 Electron：实际鼠标点击安装，生产服务启动固定源码 Git fetch，经已有 IPC 显示“获取源码”动态条；实际点击收起日志仍显示，1280/1440/960 无溢出，填充真实高度7px且动画可见；切换页签再返回保留，实际取消后隐藏。state 严格不变，started/cancelled 日志存在。焦点模拟已记录。
- 忽略目录 fixture 报告 `temp/create-smoke-FPKJ5W/strata-progress.json` 与三尺寸截图；前轮 `create-smoke-tOXyz6` 也已清理。最终真实填充样式/可见片段复核通过，不只验证灰色轨道。

自有 fixture PID 64484/44368 及 CDP 11595/11218、Comfy fixture 47829 复核无残留。仅自有代理阻塞的源码下载被取消；未执行 GPU、权重或完整软件安装，不干预用户窗口/进行中的安装。完整引擎下载及 pip 终态在本轮未实装，百分比 UI 与阶段转换以服务/DOM 测试分层报告；既有完整安装/推理待办不变。
