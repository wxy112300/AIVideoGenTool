import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { AgentRuntimeMonitor } from "../electron/services/strata-agent-monitor.js";

const disposers: Array<() => Promise<void>> = [];
afterEach(async () => { for (const dispose of disposers.splice(0)) await dispose(); });
describe("Agent read-only transport monitoring (no model or CLI)", () => {
  it("distinguishes a busy slow task, transient connection failure, sustained outage and recovery without replaying requests", async () => {
    let fail = false, loaded = true;
    const routes: string[] = [];
    const server = createServer((req, res) => {
      routes.push(`${req.method} ${req.url}`);
      if (req.headers.authorization !== "Bearer fixture-private") { res.writeHead(401).end(); return; }
      if (fail) { res.writeHead(503).end(); return; }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(req.url === "/health" ? { service: "strata", status: "ok", loaded, api_key: true }
        : { busy: true, elapsed_s: 142, generated: 12000, prompt_tokens: 80000, last_answer: "private conversation" }));
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    disposers.push(() => new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }));
    const port = (server.address() as { port: number }).port, monitor = new AgentRuntimeMonitor();
    const read = () => monitor.read(port, "fixture-private");
    expect(await read()).toMatchObject({ connection: "online", loaded: true, busy: true, elapsedSeconds: 142, generatedTokens: 12000 });
    fail = true;
    expect(await read()).toMatchObject({ connection: "checking", failures: 1 });
    expect(await read()).toMatchObject({ connection: "checking", failures: 2 });
    expect(await read()).toMatchObject({ connection: "unreachable", failures: 3 });
    fail = false; loaded = false;
    const result = await read();
    expect(result).toMatchObject({ connection: "online", loaded: false, failures: 0 });
    expect(JSON.stringify(result)).not.toMatch(/private conversation|fixture-private/);
    expect(routes.every(route => route === "GET /health" || route === "GET /status")).toBe(true);
  });
});
