import { describe, expect, it } from "vitest";
import { localEndpoint } from "../electron/services/local-service-process";

describe("local service endpoint policy", () => {
  it("accepts loopback HTTP endpoints and applies the service default port", () => {
    expect(localEndpoint("http://localhost", 8188)).toEqual({
      host: "127.0.0.1",
      port: 8188
    });
    expect(localEndpoint("http://127.0.0.1:8288", 8188)).toEqual({
      host: "127.0.0.1",
      port: 8288
    });
  });

  it("rejects remote, HTTPS and invalid port endpoints for local process control", () => {
    expect(localEndpoint("https://localhost:8188", 8188)).toBeNull();
    expect(localEndpoint("http://192.168.1.10:8188", 8188)).toBeNull();
    expect(localEndpoint("http://localhost:99999", 8188)).toBeNull();
  });
});
