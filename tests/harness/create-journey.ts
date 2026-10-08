import { vi } from "vitest";
import path from "node:path";
import { createDefaultState } from "../../src/core/defaults";
import { createTranslator } from "../../src/core/i18n";
import { createCreateWorkspaceCoordinator, type CreateWorkspaceCoordinatorDependencies } from "../../src/renderer/pages/create/coordinator";
import { loadPromptPacks } from "../../src/renderer/prompt-packs";
import { queueTaskFromDraft, extensionTaskFromDraft } from "../../src/core/queue-task-factory";
import type { AppState, Draft, EnvironmentScanResult, VideoExtensionSourceInspection } from "../../src/types";
import type { RendererCleanup, RendererContext } from "../../src/renderer/contracts";

// Real page -> coordinator -> controllers -> snapshot factory. Only external ports
// are fixtures; this is NOT Electron IPC, filesystem preflight, or GPU evidence.
export async function createJourney(initial: Partial<Draft> = {}) {
  await loadPromptPacks();
  let state = createDefaultState();
  state.draft = { ...state.draft, workflowPath: path.resolve("workflows/minimax_h3_i2v_api.json"), spectrumModeUserSet: true, ...initial };
  let mode: ReturnType<CreateWorkspaceCoordinatorDependencies["getCreationMode"]> = state.draft.inputMode === "video" ? "video-extension" : "image-to-video";
  let cleanups: RendererCleanup[] = [];
  let disposed = false;
  let scheduled = false;
  let busy = false;
  const root = document.createElement("main");
  document.body.append(root);
  const t = createTranslator("zh-CN").t;
  let inspection: VideoExtensionSourceInspection = { route: "bootstrap", status: "missing", reason: "Fixture: paired AV missing" };
  const scan = {
    modelProfiles: ["minimax_h3_fl2va", "minimax_h3_ref2va", "minimax_h3_continuum"].map(id => ({
      id, name: id, category: "video", available: true, integrated: true, components: [], missingCustomNodeIds: [], missingCustomNodeNames: []
    })),
    customNodes: [{ id: "h3-motion-context", installed: true, loaded: false }, { id: "h3-continuum", installed: true, loaded: false }, { id: "local-video-studio-h3-av", installed: true, loaded: false }],
    comfyCompatibility: {}, items: [], attentionAcceleration: {}
  } as unknown as EnvironmentScanResult;
  const enqueue = vi.fn(async (draft: Draft) => {
    const task = draft.inputMode === "video" ? extensionTaskFromDraft(draft, state) : queueTaskFromDraft(draft, state);
    const next = structuredClone(state);
    next.queue.push(task);
    return next;
  });
  const application = {
    saveDraft: vi.fn(async () => undefined), saveImageDraft: vi.fn(async () => undefined),
    enqueue, enqueueExtension: enqueue,
    inspectVideoExtensionSource: vi.fn(async () => structuredClone(inspection)),
    getBundledWorkflow: vi.fn(async (modelId: string, inputMode: string) => ({
      path: path.resolve("workflows", modelId === "minimax_h3_continuum" ? "minimax_h3_continuum_v38_extend_api.json" : modelId === "minimax_h3_ref2va" ? inputMode === "video" ? "minimax_h3_r2v_extend_api.json" : "minimax_h3_r2v_api.json" : "minimax_h3_i2v_api.json"),
      supportsEndImage: modelId === "minimax_h3_fl2va", supportsVideoExtension: true
    })),
    inspectWorkflow: vi.fn(async () => ({ supportsEndImage: true, supportsVideoExtension: true }))
  };
  const hostCapabilities = { pickImage: vi.fn(async () => "fixture.png"), pickH3NativeAv: vi.fn(async () => "fixture.safetensors") };
  const enhancePrompt = vi.fn(async () => "The subject slowly turns toward the camera, with natural motion and steady framing.");
  const requestRender = () => {
    if (scheduled || disposed) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; if (!disposed) render(); });
  };
  const context = {
    root, t, application, hostCapabilities, enhancePrompt,
    assets: { readImage: vi.fn(async () => null) }, events: {},
    getState: () => state, getRoute: () => ({ page: "create", creationMode: mode, historyKind: "video" }),
    requestRender, notify: vi.fn(), navigate: vi.fn(), reportUserAction: vi.fn()
  } as unknown as RendererContext;
  const dependencies: CreateWorkspaceCoordinatorDependencies = {
    context, getState: () => state, getPage: () => "create", getCreationMode: () => mode, setCreationMode: value => { mode = value; },
    getEnvironmentScan: () => scan, getPerformanceMetrics: () => null, bundledWorkflows: {},
    workflowCapabilities: { [state.draft.workflowPath]: { supportsEndImage: true, supportsVideoExtension: true } },
    bundledWorkflowKey: (id, input) => `${id}:${input}`, setRendererState: next => { state = next; },
    addPageCleanup: cleanup => cleanups.push(cleanup), render: requestRender,
    getEnqueueBusy: () => busy, setEnqueueBusy: value => { busy = value; }, requestClearDraftConfirmation: vi.fn(),
    promptRuntimeControlIcon: () => "play", promptRuntimeControlTitle: () => "Prompt",
    promptRuntimeView: () => ({ left: { intent: "none", label: "Prompt", action: "none" }, right: { intent: "none", label: "Prompt", action: "none" } }),
    promptOperationBelongsTo: () => false, getPromptStarting: () => false, getPromptReleasing: () => false,
    getPromptRuntimeLoaded: () => false, getPromptProgress: () => null, setPromptEnhancing: vi.fn(), setPromptRuntimeLoaded: vi.fn(), togglePromptModel: vi.fn()
  };
  const coordinator = createCreateWorkspaceCoordinator(dependencies);
  function render() {
    cleanups.reverse().forEach(cleanup => cleanup()); cleanups = [];
    root.innerHTML = coordinator.renderPage();
    coordinator.bind();
  }
  function element<T extends HTMLElement = HTMLButtonElement>(selector: string): T {
    const value = root.querySelector<T>(selector);
    if (!value) throw new Error(`Missing actual UI control: ${selector}`);
    return value;
  }
  function input(selector: string, value: string, event = "input") {
    const control = element<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(selector);
    if (control.disabled) throw new Error(`Disabled UI control: ${selector}`);
    if (control instanceof HTMLSelectElement && !Array.from(control.options).some(option => option.value === value && !option.disabled)) throw new Error(`Unavailable option ${value}`);
    control.value = value;
    control.dispatchEvent(new Event(event, { bubbles: true }));
  }
  render();
  return {
    root, element, input, render, coordinator, application, enhancePrompt, hostCapabilities, scan, context,
    state: () => state,
    setInspection: (value: VideoExtensionSourceInspection) => { inspection = value; },
    dispose: () => { disposed = true; cleanups.reverse().forEach(cleanup => cleanup()); root.remove(); }
  };
}
