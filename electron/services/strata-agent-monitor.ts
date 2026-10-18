/** Read-only monitoring: never cancels a task, reloads a model, or adopts a listener. */
export class AgentRuntimeMonitor {
  private failures = 0;
  constructor(private readonly request: typeof fetch = fetch) {}
  reset() { this.failures = 0; }
  async read(port: number, token: string) {
    try {
      const get = async (route: string) => {
        const response = await this.request(`http://127.0.0.1:${port}${route}`, {
          redirect: "error", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(3000)
        });
        if (!response.ok) throw new Error("status-http");
        return response.json();
      };
      const [health, status] = await Promise.all([get("/health"), get("/status")]);
      if (health.service !== "strata" || health.status !== "ok" || health.api_key !== true || typeof health.loaded !== "boolean") throw new Error("status-identity");
      this.failures = 0;
      const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
      return { connection: "online" as const, loaded: health.loaded, busy: status.busy === true,
        elapsedSeconds: number(status.elapsed_s), generatedTokens: number(status.generated),
        promptTokens: number(status.prompt_tokens), queued: number(status.queued), failures: 0 };
    } catch {
      this.failures++;
      return { connection: this.failures >= 3 ? "unreachable" as const : "checking" as const, failures: this.failures };
    }
  }
}
