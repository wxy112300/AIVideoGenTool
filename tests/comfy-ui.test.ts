import { describe, expect, it } from "vitest";
import {
  executedPreviewDataUrl,
  historyFailure,
  historyEntryClientId,
  historyEntryHasUnfinishedBatch
} from "../electron/services/comfy-ui.js";

describe("ComfyUI result preview", () => {
  it("fetches an image emitted by a PreviewImage node", async () => {
    const calls: string[] = [];
    const fetcher = (async (input: string | URL | Request) => {
      calls.push(String(input));
      return new Response(new Uint8Array([137, 80, 78, 71]), {
        headers: { "content-type": "image/png" }
      });
    }) as typeof fetch;

    const preview = await executedPreviewDataUrl(
      "http://127.0.0.1:8188/",
      {
        output: {
          images: [
            {
              filename: "preview.png",
              subfolder: "studio",
              type: "temp"
            }
          ]
        }
      },
      fetcher
    );

    expect(preview).toBe("data:image/png;base64,iVBORw==");
    expect(calls[0]).toContain("/view?");
    expect(calls[0]).toContain("filename=preview.png");
    expect(calls[0]).toContain("subfolder=studio");
  });
});

describe("ComfyUI meta-batch history", () => {
  it("links requeued prompts by client id", () => {
    expect(
      historyEntryClientId({ prompt: [-1, "prompt-id", {}, { client_id: "client-1" }] })
    ).toBe("client-1");
    expect(historyEntryClientId({ prompt: [] })).toBe("");
  });

  it("does not treat an unfinished VHS batch as final output", () => {
    expect(
      historyEntryHasUnfinishedBatch({
        outputs: { "6": { unfinished_batch: [true] } }
      })
    ).toBe(true);
    expect(
      historyEntryHasUnfinishedBatch({
        outputs: { "6": { gifs: [{ filename: "done.mp4" }] } }
      })
    ).toBe(false);
  });

  it("preserves CUDA OOM details from failed ComfyUI history", () => {
    expect(
      historyFailure({
        status: {
          status_str: "error",
          messages: [
            [
              "execution_error",
              {
                exception_type: "torch.OutOfMemoryError",
                exception_message: "CUDA out of memory"
              }
            ]
          ]
        }
      })
    ).toBe("torch.OutOfMemoryError: CUDA out of memory");
  });
});
