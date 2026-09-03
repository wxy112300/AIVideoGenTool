import type { HistoryFile } from "../types.js";

const outputCollectionKeys = new Set([
  "images",
  "gifs",
  "videos",
  "audio",
  "files"
]);

const videoOutputPattern = /\.(mp4|webm|mov|m4v|mkv)$/i;

export function isVideoOutputFilename(filename: string): boolean {
  return videoOutputPattern.test(filename);
}

export function extractComfyOutputFiles(value: unknown): HistoryFile[] {
  const results: HistoryFile[] = [];
  const seen = new Set<string>();

  const add = (candidate: Record<string, unknown>) => {
    if (typeof candidate.filename !== "string" || !candidate.filename.trim()) return;
    const file: HistoryFile = {
      filename: candidate.filename,
      subfolder:
        typeof candidate.subfolder === "string" ? candidate.subfolder : "",
      type: typeof candidate.type === "string" ? candidate.type : "output",
      format: typeof candidate.format === "string" ? candidate.format : undefined
    };
    const key = `${file.type}\0${file.subfolder}\0${file.filename}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push(file);
    }
  };

  const visit = (node: unknown, collectionKey = ""): void => {
    if (Array.isArray(node)) {
      for (const item of node) {
        if (
          outputCollectionKeys.has(collectionKey) &&
          item &&
          typeof item === "object"
        ) {
          add(item as Record<string, unknown>);
        }
        visit(item, collectionKey);
      }
      return;
    }
    if (!node || typeof node !== "object") return;
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      visit(child, key);
    }
  };

  visit(value);
  return results;
}

/**
 * Serializer nodes publish their descriptor under ComfyUI's output UI
 * collection so the safetensors payload is never mistaken for a playable
 * History media file. ComfyUI flattens that UI collection onto the node output
 * in the /history response, while some API fixtures/versions retain a nested
 * `ui` object; accept both forms and commit the descriptor separately.
 */
export function extractComfyNativeAvOutputFiles(
  value: unknown,
  expectedNodeId?: string
): HistoryFile[] {
  const results: HistoryFile[] = [];
  const seen = new Set<string>();
  const add = (candidate: Record<string, unknown>) => {
    if (typeof candidate.filename !== "string" || !candidate.filename.trim()) return;
    const file: HistoryFile = {
      filename: candidate.filename,
      subfolder: typeof candidate.subfolder === "string" ? candidate.subfolder : "",
      type: typeof candidate.type === "string" ? candidate.type : "output",
      format: typeof candidate.format === "string" ? candidate.format : undefined
    };
    if (file.type !== "output" || file.format !== "safetensors" || file.subfolder !== "h3-native-av") return;
    const key = `${file.type}\0${file.subfolder}\0${file.filename}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push(file);
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) return results;
  const outputs = (value as Record<string, unknown>).outputs;
  if (!outputs || typeof outputs !== "object" || Array.isArray(outputs)) return results;
  const outputEntries = Object.entries(outputs as Record<string, unknown>)
    .filter(([nodeId]) => !expectedNodeId || nodeId === expectedNodeId);
  const addFromCollection = (collection: Record<string, unknown>) => {
    const descriptors = collection.h3_native_av;
    if (!Array.isArray(descriptors)) return;
    for (const descriptor of descriptors) {
      if (descriptor && typeof descriptor === "object" && !Array.isArray(descriptor)) {
        add(descriptor as Record<string, unknown>);
      }
    }
  };
  for (const [, nodeOutput] of outputEntries) {
    if (!nodeOutput || typeof nodeOutput !== "object" || Array.isArray(nodeOutput)) continue;
    const output = nodeOutput as Record<string, unknown>;
    addFromCollection(output);
    const ui = output.ui;
    if (ui && typeof ui === "object" && !Array.isArray(ui)) {
      addFromCollection(ui as Record<string, unknown>);
    }
  }
  return results;
}
