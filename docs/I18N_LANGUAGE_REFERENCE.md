# UI Language Reference

This document is the human-reviewable language reference for Local Video Studio.
It defines the meaning and approved wording of user-visible UI strings before they
are added to the runtime translation catalog. It is not loaded by the application.

## Scope and locales

| Locale ID | Language | Role |
| --- | --- | --- |
| `zh-CN` | Simplified Chinese | Current default UI locale |
| `en-US` | English (US) | Initial alternative UI locale |

UI locale controls application chrome, controls, state, and messages. It does not
translate a user's prompt, quoted dialogue, or visible text intended for a
generation model. Those continue to follow the prompt-language setting and the
workflow's prompt-preservation rules.

## How to maintain this reference

1. Give each UI concept a stable, dot-separated key; do not use an English or
   Chinese sentence as a key.
2. Add or review both locale values here before adding the same key to the runtime
   catalog in `src/core/i18n.ts` (or its future catalog files).
3. Keep placeholders identical in every locale. Placeholders use `{name}` syntax,
   such as `{count}` and `{path}`.
4. Use concise action verbs for buttons and sentence case for English labels.
   Do not translate model names, file extensions, workflow names, or literal paths.
5. A changed meaning requires a new key. Wording-only corrections can update the
   existing key in this document and its runtime catalog together.

## Initial glossary

| Key | `zh-CN` | `en-US` | Notes |
| --- | --- | --- | --- |
| `nav.create` | 创建 | Create | Primary creation workspace |
| `nav.queue` | 队列 | Queue | Generation task queue |
| `nav.history` | 历史记录 | History | Generated media history |
| `nav.settings` | 设置 | Settings | Application settings |
| `action.start` | 开始生成 | Start generation | Starts a new queued task |
| `action.cancel` | 取消 | Cancel | Cancels the current operation or task |
| `action.delete` | 删除 | Delete | Use only with a confirmation dialog |
| `action.save` | 保存 | Save | Persists the current settings or edit |
| `action.retry` | 重试 | Retry | Repeats a failed operation |
| `action.clear` | 清除 | Clear | Removes current input without deleting history |
| `action.browse` | 浏览 | Browse | Opens a file or folder picker |
| `action.openContainingFolder` | 打开所在文件夹 | Open containing folder | File-system action |
| `task.status.waiting` | 等待中 | Waiting | Queued but not yet running |
| `task.status.running` | 生成中 | Generating | Active generation or processing stage |
| `task.status.completed` | 已完成 | Completed | Finished successfully |
| `task.status.failed` | 失败 | Failed | Finished with an error |
| `task.status.cancelled` | 已取消 | Cancelled | Stopped by the user or shutdown flow |
| `empty.queue` | 暂无任务 | No tasks yet | Queue empty state |
| `empty.history` | 暂无生成记录 | No generations yet | History empty state |
| `message.loading` | 正在加载… | Loading… | Transient loading state |
| `message.unavailable` | 当前不可用 | Currently unavailable | Explain the unavailable dependency nearby |
| `message.error` | 操作失败 | Operation failed | Pair with a concise cause or recovery action |
| `confirm.delete.title` | 删除此项目？ | Delete this item? | Confirmation dialog title |
| `confirm.delete.body` | 此操作无法撤销。 | This action cannot be undone. | Use only when deletion is irreversible |
| `settings.uiLanguage` | 界面语言 | Interface language | Separate from prompt language |
| `settings.promptLanguage` | 提示词语言 | Prompt language | Controls prompt-assistance behavior, not UI chrome |

## Runtime catalog shape

The runtime catalog should keep the same keys and store one mapping per locale.
This shape is compatible with the existing `TranslationCatalogs` type:

```ts
const catalogs = {
  "zh-CN": {
    "nav.create": "创建",
    "task.status.running": "生成中",
    "queue.pendingCount": "待处理：{count}"
  },
  "en-US": {
    "nav.create": "Create",
    "task.status.running": "Generating",
    "queue.pendingCount": "Pending: {count}"
  }
};
```

Before implementing a screen, extend the glossary with its strings and make the
catalog complete for those keys in both locales. Missing translations may fall back
to the default locale temporarily, but must not be presented as a completed
localization of that screen.
