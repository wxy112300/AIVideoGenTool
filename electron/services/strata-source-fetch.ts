import { setTimeout as delay } from "node:timers/promises";
import { createNativeTranslator } from "../ui-translator.js";
import type { Translate } from "../../src/core/i18n.js";
import { uiKeys } from "../../src/core/i18n-keys.js";
import { checkInstallationCancelled, installationSignal } from "./installation-cancellation.js";

/** Git transport only: retain the pinned commit check at the caller, never retry arbitrary exit 128. */
export async function fetchStrataSource(directory: string, args: string[],
  run: (executable: string, args: string[], cwd: string, timeoutMs?: number) => Promise<string>,
  log: (message: string) => void, t: Translate = createNativeTranslator(undefined).t,
  wait: (ms: number, signal?: AbortSignal) => Promise<void> = (ms, signal) => delay(ms, undefined, { signal })) {
  const deadline = Date.now() + 600_000;
  for (let attempt = 1; attempt <= 3; attempt++) {
    checkInstallationCancelled();
    try {
      // Per invocation: do not change the user's global Git/proxy/TLS configuration.
      await run("git.exe", ["-c", "http.version=HTTP/1.1", "fetch", ...args], directory, Math.max(1, deadline - Date.now()));
      checkInstallationCancelled();
      return;
    } catch (error) {
      checkInstallationCancelled();
      const failure = error as { message?: string; stdout?: string; stderr?: string };
      const detail = [failure?.stdout, failure?.stderr, failure?.message].filter(value => typeof value === "string").join("\n");
      const permanent = /authentication failed|could not read (?:username|password)|repository .+not found|certificate (?:problem|verify failed)|SSL certificate|couldn't find remote ref|not our ref|dubious ownership/iu.test(detail);
      const transient = /early EOF|unexpected disconnect|(?:connection|stream).*(?:reset|closed|CANCEL)|HTTP\/2|curl (?:18|28|52|55|56|92)\b|failed to connect|could not resolve host|(?:requested URL returned error|HTTP\S*)[: ]+(?:408|429|500|502|503|504)\b/iu.test(detail);
      if (permanent || !transient || attempt === 3 || Date.now() >= deadline) throw error;
      log(t(uiKeys.strataRuntime.sourceRetrying, { attempt: attempt + 1 }));
      await wait(attempt * 1000, installationSignal());
      checkInstallationCancelled();
      if (Date.now() >= deadline) throw error;
    }
  }
}
