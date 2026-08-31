import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import type { AppApi, AppState, EnhanceRequest } from "../src/types";
import {
  createElectronRendererClient,
  createRendererDependencies,
  createThrowingRendererClient,
  rendererApiInventory,
  rendererApiInventoryIsComplete
} from "../src/renderer/studio-client";

describe("renderer studio client seam", () => {
  it("keeps a unique, complete four-part AppApi inventory", () => {
    const methods = Object.values(rendererApiInventory).flat();

    expect(new Set(methods).size).toBe(methods.length);
    expect(rendererApiInventory.application).toContain("enqueue");
    expect(rendererApiInventory.events).toContain("onStateChanged");
    expect(rendererApiInventory.assets).toContain("readHistoryCover");
    expect(rendererApiInventory.hostCapabilities).toContain("getDroppedFilePath");
    expect(rendererApiInventoryIsComplete).toBe(true);
  });

  it("delegates arguments, return values, rejected errors, and event cleanup", async () => {
    const state = createDefaultState();
    const getState = vi.fn(async () => state);
    const failure = new Error("fixture rejection");
    const request: EnhanceRequest = {
      prompt: "fixture prompt",
      mode: "image-to-video"
    } as EnhanceRequest;
    const enhancePrompt = vi.fn(async (_request: EnhanceRequest): Promise<string> => {
      throw failure;
    });
    const cleanup = vi.fn();
    const onStateChanged = vi.fn((_callback: (nextState: AppState) => void) => cleanup);
    const preloadApi = {
      getState,
      enhancePrompt,
      onStateChanged
    } as unknown as AppApi;

    const client = createElectronRendererClient(preloadApi);

    await expect(client.getState()).resolves.toBe(state);
    await expect(client.enhancePrompt(request)).rejects.toBe(failure);
    expect(enhancePrompt).toHaveBeenCalledWith(request);
    const returnedCleanup = client.onStateChanged(vi.fn());
    expect(returnedCleanup).toBe(cleanup);
    expect(onStateChanged).toHaveBeenCalledOnce();
  });

  it("fails loudly for unconfigured fake methods", async () => {
    const state = createDefaultState();
    const client = createThrowingRendererClient({
      getState: vi.fn(async () => state)
    });

    await expect(client.getState()).resolves.toBe(state);
    expect(() => client.readImage("fixture.png")).toThrowError(
      "Unconfigured renderer client method: readImage"
    );
  });

  it("projects application, events, assets, and host capabilities without rewrapping methods", () => {
    const getState = vi.fn(() => createDefaultState());
    const onStateChanged = vi.fn(() => vi.fn());
    const readImage = vi.fn(async () => "fixture-data-url");
    const openExternal = vi.fn(async () => true);
    const client = createThrowingRendererClient({
      getState,
      onStateChanged,
      readImage,
      openExternal
    });

    const dependencies = createRendererDependencies(client);

    expect(dependencies.application.getState).toBe(getState);
    expect(dependencies.events.onStateChanged).toBe(onStateChanged);
    expect(dependencies.assets.readImage).toBe(readImage);
    expect(dependencies.hostCapabilities.openExternal).toBe(openExternal);
  });

  it("constructs the Electron client exactly once in src/main.ts", () => {
    const mainSource = readFileSync(resolve(process.cwd(), "src/main.ts"), "utf8");

    expect(mainSource.match(/window\.studio/g)).toHaveLength(1);
    expect(mainSource).toContain(
      "const rendererClient = createElectronRendererClient(window.studio);"
    );
  });
});
