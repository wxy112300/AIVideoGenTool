import { afterEach, expect, it, vi } from "vitest";
import { createNativeTranslator } from "../electron/ui-translator.js";
import { QueueEnqueueService, type QueueEnqueueServiceDependencies } from "../electron/queue-enqueue.js";
import { submitImageTask } from "../electron/services/comfy-ui.js";
import { imageModelUnavailableReason } from "../src/core/image-workflow.js";
import { createDefaultState } from "../src/core/defaults.js";
import type { ImageGenerationQueueTask } from "../src/types.js";

afterEach(() => vi.unstubAllGlobals());
it.each([
  ["en-US", "H3 Image has been removed", "No image workflow adapter"],
  ["zh-TW", "H3 圖片功能已移除", "沒有"]
] as const)("keeps %s retired images readable while blocking enqueue and execution", async (uiLocale, retired, unknown) => {
  const state = createDefaultState(); state.settings.uiLocale = uiLocale;
  const before = structuredClone(state), update = vi.fn(), sendState = vi.fn(), request = vi.fn();
  vi.stubGlobal("fetch", request);
  const service = new QueueEnqueueService({
    store: { getSettings: () => state.settings, update }, sendState, logger: {}
  } as unknown as QueueEnqueueServiceDependencies);
  const modelId = "minimax-h3-image-i2i";
  await expect(service.enqueueImage({ ...state.imageDraft, modelId })).rejects.toThrow(retired);
  await expect(submitImageTask({ modelId } as ImageGenerationQueueTask,
    { id: "old-run", index: 0, seed: 42, status: "waiting" }, state.settings, new AbortController().signal)).rejects.toThrow(retired);
  const message = imageModelUnavailableReason("custom/故乡-model", createNativeTranslator(uiLocale));
  expect(message).toContain(unknown); expect(message).toContain("custom/故乡-model");
  expect(update).not.toHaveBeenCalled(); expect(sendState).not.toHaveBeenCalled(); expect(request).not.toHaveBeenCalled();
  expect(state).toEqual(before);
});
