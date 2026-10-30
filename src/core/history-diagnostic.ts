import type { Translate } from "./i18n.js";
import { uiKeys } from "./i18n-keys.js";

// Persisted diagnostics predate localization. Recognize only our shipped
// messages; keep arbitrary backend diagnostics and paths verbatim.
const diagnosticKeys: Record<string, string> = {
  "JointAV manifest 或 payload 已缺失，无法完成安全删除。": uiKeys.historyDelete.jointAvUnsafe,
  "JointAV 文件已由用户从详情页删除。": uiKeys.historyDelete.jointAvDeleted,
  "JointAV 文件删除不完整，剩余文件需要重新检查。": uiKeys.historyDelete.jointAvPartial
};
const auxiliaryPrefix = "辅助文件删除不完整，需重新检查：";

export function historyDiagnosticForDisplay(message: string | undefined, t: Translate): string {
  if (!message) return "";
  const key = Object.hasOwn(diagnosticKeys, message) ? diagnosticKeys[message] : undefined;
  if (key) return t(key);
  if (message.startsWith(auxiliaryPrefix)) {
    return t(uiKeys.historyDelete.auxiliaryPartial, { reason: message.slice(auxiliaryPrefix.length) });
  }
  return message;
}
