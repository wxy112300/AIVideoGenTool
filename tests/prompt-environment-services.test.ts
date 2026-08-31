import { describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../src/core/defaults";
import type {
  AppState,
  EnhanceRequest,
  EnvironmentScanResult,
  Settings
} from "../src/types";
import type { StateRepository } from "../electron/ports/state-repository";
import type { AppLogger } from "../src/infrastructure/app-logger";
import { EnvironmentQueryService } from "../electron/services/environment-query-service";
import { PromptApplicationService } from "../electron/services/prompt-application-service";
import { PromptRuntimeManager } from "../electron/services/prompt-runtime-manager";
import {
  RuntimeAdminService,
  type RuntimeAdminServiceDependencies
} from "../electron/services/runtime-admin-service";
import { ComfyRuntimeStateController } from "../src/infrastructure/comfy-runtime-state";

interface TestRepository extends StateRepository {
  snapshot(): AppState;
}

function createRepository(initial = createDefaultState()): TestRepository {
  let current = structuredClone(initial);
  return {
    load: vi.fn(async () => structuredClone(current)),
    get: () => current,
    getSettings: () => current.settings,
    update: async (mutator) => {
      const next = structuredClone(current);
      mutator(next);
      current = next;
      return current;
    },
    snapshot: () => current
  };
}

function createLogger(): AppLogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn()
  } as unknown as AppLogger;
}

function createPromptRuntimeManager(): PromptRuntimeManager {
  return new PromptRuntimeManager({
    phase: "ready",
    ownership: "external",
    endpoint: "http://127.0.0.1:8188",
    message: "ComfyUI 已连接并可用。",
    updatedAt: new Date().toISOString(),
    operationId: 0
  });
}

function createPromptService(
  repository: TestRepository,
  isQueueBusy = () => false
): PromptApplicationService {
  return new PromptApplicationService({
    store: repository,
    logger: createLogger(),
    promptRuntimeManager: createPromptRuntimeManager(),
    isQueueBusy,
    sendProgress: vi.fn(),
    errorMeta: () => ({})
  });
}

function createScanResult(): EnvironmentScanResult {
  return {
    scannedAt: "2026-08-31T00:00:00.000Z",
    userHome: "",
    comfyRoot: "",
    comfyUrl: "http://127.0.0.1:8188",
    comfyInstallDirectory: "",
    comfySourceDirectory: "",
    comfyInstallType: "",
    comfyInstallations: [],
    pythonRuntimes: [],
    gpus: [],
    modelDirectory: "",
    outputDirectory: "",
    llamaServer: {} as EnvironmentScanResult["llamaServer"],
    llamaCppPython: {} as EnvironmentScanResult["llamaCppPython"],
    comfyCompatibility: {
      version: "",
      revision: "",
      h3MinimumVersion: "",
      h3MinimumRevision: "",
      h3RecommendedVersion: "",
      h3CoreSupported: false,
      coreNodes: [],
      promptCoreSupported: false,
      promptCoreNodes: [],
      checkedFrom: "source",
      updateMode: "unsupported",
      updateHint: ""
    },
    attentionAcceleration: {} as EnvironmentScanResult["attentionAcceleration"],
    items: [],
    modelProfiles: [],
    customNodes: [],
    issues: []
  };
}

function createAdmin(
  repository: TestRepository,
  overrides: Partial<RuntimeAdminServiceDependencies> = {}
): RuntimeAdminService {
  const runtimeState = new ComfyRuntimeStateController();
  return new RuntimeAdminService({
    store: repository,
    logger: createLogger(),
    runtimeState,
    isGenerationBusy: () => false,
    isQueueWorkerRunning: () => false,
    isPromptControllerActive: () => false,
    isPromptBusy: () => false,
    getQueueWorker: () => null,
    abortQueue: vi.fn(),
    abortPrompt: vi.fn(),
    interruptComfy: vi.fn(async () => undefined),
    sendState: vi.fn(),
    waitForWorker: vi.fn(async () => true),
    errorMeta: () => ({}),
    ...overrides
  });
}

describe("PromptApplicationService", () => {
  it("preserves the queue gate before starting a prompt model", async () => {
    const repository = createRepository();
    const service = createPromptService(repository, () => true);

    await expect(service.start()).resolves.toEqual({
      ok: false,
      message: "当前有视频任务正在运行，暂不能启动提示词模型。"
    });
    expect(service.runningWorker).toBeNull();
  });

  it("rejects an empty enhancement before opening a runtime operation", async () => {
    const repository = createRepository();
    const service = createPromptService(repository);
    const request = { prompt: " ", modelId: "minimax_h3_fl2va" } as EnhanceRequest;

    await expect(service.enhance(request)).rejects.toThrow("请先输入需要扩写的提示词");
    expect(service.isPromptBusy()).toBe(false);
  });

  it("keeps prompt model release blocked by active queue work", async () => {
    const repository = createRepository();
    const service = createPromptService(repository, () => true);

    await expect(service.releaseForUser()).resolves.toEqual({
      ok: false,
      message: "当前有视频任务正在运行，暂不能释放提示词模型。"
    });
  });
});

describe("EnvironmentQueryService", () => {
  it("normalizes scan scope and keeps connection testing in the query boundary", async () => {
    const repository = createRepository();
    const settings = repository.getSettings();
    const scan = vi.fn(async (_settings: Settings, _scope: "full" | "runtime" | "dependencies") =>
      createScanResult()
    );
    const testComfyUi = vi.fn(async () => "连接成功");
    const service = new EnvironmentQueryService({
      logger: createLogger(),
      errorMeta: () => ({}),
      scanEnvironment: scan,
      testComfyUi
    });

    await expect(service.testConnection("comfy", settings)).resolves.toEqual({
      ok: true,
      message: "连接成功"
    });
    await service.scan(settings, "runtime");
    await service.scan(settings, "invalid-scope");

    expect(testComfyUi).toHaveBeenCalledWith(settings);
    expect(scan.mock.calls.map(([, scope]) => scope)).toEqual(["runtime", "full"]);
  });
});

describe("RuntimeAdminService", () => {
  it("rejects attention installation while generation or prompt work is active", async () => {
    const repository = createRepository();
    const installAttentionAcceleration = vi.fn(async () => ({
      ok: true,
      message: "installed"
    }));
    const service = createAdmin(repository, {
      isGenerationBusy: () => true,
      installAttentionAcceleration
    });

    await expect(service.installAttentionAcceleration(repository.getSettings())).resolves.toEqual({
      ok: false,
      message: "当前有生成或提示词任务正在运行，停止任务后才能升级 H3 运行环境。"
    });
    expect(installAttentionAcceleration).not.toHaveBeenCalled();
  });

  it("preserves database repair protection and dependency progress callbacks", async () => {
    const initial = createDefaultState();
    initial.queueRunning = true;
    const repository = createRepository(initial);
    const repairEnvironmentIssue = vi.fn(async () => ({ ok: true, message: "repaired" }));
    const installCustomNode = vi.fn(async (
      _nodeId: string,
      _settings: Settings,
      onLog?: (message: string) => void
    ) => {
      onLog?.("安装进度");
      return { ok: true, message: "installed" };
    });
    const service = createAdmin(repository, {
      repairEnvironmentIssue,
      installCustomNode
    });

    await expect(service.repair("comfy-database", repository.getSettings())).resolves.toEqual({
      ok: false,
      message: "当前仍有队列或提示词任务占用 ComfyUI，请先完成或取消任务后再修复数据库。"
    });
    expect(repairEnvironmentIssue).not.toHaveBeenCalled();

    const onProgress = vi.fn();
    await expect(
      service.installCustomNode("example-node", repository.getSettings(), "repair", onProgress)
    ).resolves.toEqual({ ok: true, message: "installed" });
    expect(onProgress).toHaveBeenCalledWith("安装进度");
  });
});
