import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../src/core/defaults.js";
import type { StateRepository } from "../electron/ports/state-repository.js";
import type { HistoryQueryService } from "../electron/services/history-query-service.js";
import { ImageDocumentService } from "../electron/services/image-document-service.js";
import { MediaReadService } from "../electron/services/media-read-service.js";
import { nativeHistoryFileSystem } from "../electron/services/native-history-file-system.js";

const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "media-document-services-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true })
    )
  );
});

function repository(initial = createDefaultState()): StateRepository {
  const state = structuredClone(initial);
  return {
    load: async () => structuredClone(state),
    get: () => structuredClone(state),
    getSettings: () => structuredClone(state.settings),
    update: async (mutator) => {
      mutator(state);
      return structuredClone(state);
    }
  };
}

function mediaQuery(overrides: Partial<HistoryQueryService> = {}): HistoryQueryService {
  return {
    coverPathFromDigest: vi.fn(),
    resolveHistoryFile: vi.fn(async () => null),
    resolveHistorySourcePath: vi.fn(async (sourcePath: string) => sourcePath),
    ...overrides
  } as unknown as HistoryQueryService;
}

function arrayBuffer(values: number[]): ArrayBuffer {
  const buffer = new ArrayBuffer(values.length);
  new Uint8Array(buffer).set(values);
  return buffer;
}

describe("MediaReadService", () => {
  it("keeps image data URLs and ranged studio-media responses stable", async () => {
    const root = await temporaryRoot();
    const source = path.join(root, "source.mp4");
    await fs.writeFile(source, "abcdef");
    const state = createDefaultState();
    state.draft.sourceVideoPath = source;
    const query = mediaQuery();
    const service = new MediaReadService({
      store: repository(state),
      historyQuery: query
    });

    const image = await new MediaReadService({
      store: repository(),
      historyQuery: query,
      readFile: async () => new Uint8Array([0xff, 0xd8])
    }).readImage("picture.jpg");
    expect(image).toBe("data:image/jpeg;base64,/9g=");

    const response = await service.handleProtocolRequest({
      url: "studio-media://draft/video",
      method: "GET",
      headers: new Headers({ range: "bytes=1-3" })
    });
    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Type")).toBe("video/mp4");
    expect(response.headers.get("Content-Range")).toBe("bytes 1-3/6");
    await expect(response.text()).resolves.toBe("bcd");

    const head = await service.handleProtocolRequest({
      url: "studio-media://draft/video",
      method: "HEAD",
      headers: new Headers({ range: "bytes=1-3" })
    });
    expect(head.status).toBe(206);
    expect(head.headers.get("Content-Length")).toBe("3");
    await expect(head.text()).resolves.toBe("");

    const invalidRange = await service.handleProtocolRequest({
      url: "studio-media://draft/video",
      method: "GET",
      headers: new Headers({ range: "bytes=invalid" })
    });
    expect(invalidRange.status).toBe(416);
    expect(invalidRange.headers.get("Content-Range")).toBe("bytes */6");
  });

  it("resolves cover cache files and preserves not-found errors", async () => {
    const root = await temporaryRoot();
    const cover = path.join(root, "cover.jpg");
    await fs.writeFile(cover, "cover");
    const query = mediaQuery({
      coverPathFromDigest: vi.fn(() => cover)
    });
    const service = new MediaReadService({
      store: repository(),
      historyQuery: query
    });

    const coverResponse = await service.handleProtocolRequest({
      url: `studio-media://cover/${"a".repeat(64)}.jpg`,
      method: "GET",
      headers: new Headers()
    });
    expect(coverResponse.status).toBe(200);
    await expect(coverResponse.text()).resolves.toBe("cover");

    const missing = await service.handleProtocolRequest({
      url: "studio-media://draft/video",
      method: "GET",
      headers: new Headers()
    });
    expect(missing.status).toBe(404);
  });
});

describe("ImageDocumentService", () => {
  it("persists markup, mask, and crop revisions with the existing formats", async () => {
    const root = await temporaryRoot();
    const source = path.join(root, "source.png");
    await fs.writeFile(source, "source");
    const service = new ImageDocumentService({
      paths: {
        imageGuidesDirectory: path.join(root, "guides"),
        imageMasksDirectory: path.join(root, "masks"),
        imageCropsDirectory: path.join(root, "crops")
      },
      fileSystem: nativeHistoryFileSystem,
      randomId: vi.fn()
        .mockReturnValueOnce("markup-document")
        .mockReturnValueOnce("markup-image")
        .mockReturnValueOnce("mask-document")
        .mockReturnValueOnce("mask-image")
        .mockReturnValueOnce("crop-document")
        .mockReturnValueOnce("crop-image"),
      now: () => "2026-08-31T00:00:00.000Z"
    });

    const markup = await service.saveMarkup({
      pictureId: "picture-1",
      sourcePath: source,
      document: "{\"objects\":[]}",
      renderedPng: arrayBuffer([1, 2]),
      summary: "  guide  ",
      objectCount: 2,
      previousRevision: 2
    });
    expect(markup).toMatchObject({
      revision: 3,
      summary: "guide",
      objectCount: 2,
      updatedAt: "2026-08-31T00:00:00.000Z"
    });
    await expect(fs.readFile(markup.documentPath, "utf8")).resolves.toBe("{\"objects\":[]}");
    await expect(service.readMarkup(markup.documentPath)).resolves.toBe("{\"objects\":[]}");
    await expect(service.readMarkup(path.join(root, "outside.fabric.json"))).resolves.toBeNull();

    const mask = await service.saveMask({
      pictureId: "picture-1",
      sourcePath: source,
      document: "{\"mask\":true}",
      maskPng: arrayBuffer([3]),
      regionCount: 4
    });
    expect(mask.revision).toBe(1);
    await expect(fs.readFile(mask.maskPath)).resolves.toEqual(Buffer.from([3]));

    const crop = await service.saveCrop({
      pictureId: "picture-1",
      sourcePath: source,
      crop: { x: 2, y: 3, width: 4, height: 5, sourceWidth: 20, sourceHeight: 30 },
      croppedPng: arrayBuffer([4, 5]),
      previousRevision: 1
    });
    expect(crop).toMatchObject({
      x: 2,
      y: 3,
      width: 4,
      height: 5,
      sourceWidth: 20,
      sourceHeight: 30,
      revision: 2
    });
    await expect(fs.readFile(crop!.documentPath, "utf8")).resolves.toContain("\"sourceWidth\": 20");
    await expect(service.saveCrop({
      pictureId: "picture-1",
      sourcePath: source,
      crop: { x: 19, y: 0, width: 2, height: 1, sourceWidth: 20, sourceHeight: 30 },
      croppedPng: arrayBuffer([6])
    })).rejects.toThrow("裁剪区域超出原图范围");
  });
});
