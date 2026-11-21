import type { Draft, H3ReferenceSlot, H3TimedGuide } from "../types.js";
import { h3FrameCountForSeconds } from "./h3-temporal.js";
import { isMiniMaxH3R2vModel } from "./h3-reference.js";

type GuideGraph = Record<string, { class_type?: string; inputs?: Record<string, unknown> }>;

export function h3TimedGuideSource(graph: unknown, reference = false) {
  if (!graph || typeof graph !== "object" || Array.isArray(graph)) return undefined;
  const entries = Object.entries(graph as GuideGraph);
  const sourceType = reference ? "MiniMaxH3ReferenceToVideo" : "MiniMaxH3ImageToVideo";
  const sources = entries.filter(([, node]) => node?.class_type === sourceType && node.inputs?.vae);
  return sources.length === 1 ? sources[0] : undefined;
}

export function attachH3TimedGuides(
  graph: GuideGraph,
  guides: readonly ({ filename: string; frame: number } | { picture: number; frame: number })[],
  reference = false
): void {
  const source = h3TimedGuideSource(graph, reference);
  if (!source) throw new Error("Expected a single MiniMax H3 conditioning node for keyframes.");
  const [sourceId, node] = source;
  const inputs = node.inputs!;
  const consumers = Object.values(graph).filter(other => other !== node).flatMap(other =>
    Object.entries(other.inputs ?? {}).filter(([, value]) =>
      Array.isArray(value) && String(value[0]) === sourceId && value[1] === 0
    ).map(([name]) => ({ inputs: other.inputs!, name }))
  );
  if (!reference) {
    delete inputs.first_frame;
    delete inputs.last_frame;
  }
  let nextId = Math.max(0, ...Object.keys(graph).map(id => Number(id) || 0)) + 1;
  let conditioning: [string, number] = [sourceId, 0];
  for (const guide of guides) {
    let image: unknown;
    if ("picture" in guide) {
      image = inputs[`ref_images.ref_image_${guide.picture - 1}`];
      if (!Array.isArray(image)) throw new Error(`Missing keyframe input for Picture ${guide.picture}.`);
    } else {
      const imageId = String(nextId++);
      graph[imageId] = { class_type: "LoadImage", inputs: { image: guide.filename } };
      image = [imageId, 0];
    }
    if (!reference && guide.frame === 0) {
      inputs.first_frame = image;
      continue;
    }
    const guideId = String(nextId++);
    graph[guideId] = {
      class_type: "MiniMaxH3AddGuide",
      inputs: { positive: conditioning, latent: [sourceId, 1], vae: inputs.vae, image, frame_idx: guide.frame }
    };
    conditioning = [guideId, 0];
  }
  for (const consumer of consumers) consumer.inputs[consumer.name] = conditioning;
}

export function supportsH3ReferenceGuides(draft: Pick<Draft, "modelId" | "inputMode">): boolean {
  return draft.inputMode === "image" && isMiniMaxH3R2vModel(draft.modelId);
}

export function h3ReferenceTimedGuides(
  draft: Pick<Draft, "modelId" | "inputMode" | "h3ReferenceGuidesEnabled" | "h3ReferenceSlots">
): H3TimedGuide[] {
  if (!supportsH3ReferenceGuides(draft) || !draft.h3ReferenceGuidesEnabled) return [];
  return draft.h3ReferenceSlots.filter(slot => slot.mediaType === "image").flatMap((slot, index) =>
    slot.mediaPath && slot.guideSeconds !== undefined
      ? [{ picture: index + 1, mediaPath: slot.mediaPath, seconds: slot.guideSeconds }]
      : []
  );
}

export function restoreH3ReferenceGuideDraft(
  slots: readonly H3ReferenceSlot[],
  guides?: readonly H3TimedGuide[]
): Pick<Draft, "h3ReferenceGuidesEnabled" | "h3ReferenceSlots"> {
  const times = guides && new Map(guides.map(guide => [guide.picture, guide.seconds]));
  let picture = 0;
  return {
    h3ReferenceGuidesEnabled: times !== undefined,
    h3ReferenceSlots: slots.map(slot => {
      if (!times || slot.mediaType !== "image") return { ...slot };
      const seconds = times.get(++picture);
      return { ...slot, guideSeconds: typeof seconds === "number" ? seconds : undefined };
    })
  };
}

export function supportsH3TimedGuides(draft: Pick<Draft, "modelId" | "inputMode">): boolean {
  return draft.inputMode === "image" && draft.modelId === "minimax_h3_fl2va";
}

export function activeH3TimedGuides(draft: Pick<Draft, "modelId" | "inputMode" | "h3GuideEditor">) {
  return supportsH3TimedGuides(draft) && draft.h3GuideEditor?.active ? draft.h3GuideEditor : undefined;
}

export function resolveH3TimedGuides(slots: readonly H3TimedGuide[], duration: number, frameCount = h3FrameCountForSeconds(duration)) {
  return slots.filter(slot => slot.mediaPath).map(slot => ({
    ...slot,
    frame: slot.seconds === "end" ? frameCount - 1 : slot.seconds === null ? -1 : Math.round(slot.seconds * 24)
  })).sort((left, right) => left.frame - right.frame);
}

export function restoreH3GuideEditor(slots: H3TimedGuide[]): NonNullable<Draft["h3GuideEditor"]> {
  return { active: true, nextPicture: Math.max(0, ...slots.map(slot => slot.picture)) + 1, slots: slots.map(slot => ({ ...slot })) };
}

type GuideEditor = NonNullable<Draft["h3GuideEditor"]>;

export function orderedH3GuideSlots(slots: readonly H3TimedGuide[]): H3TimedGuide[] {
  const time = (seconds: H3TimedGuide["seconds"]) =>
    typeof seconds === "number" ? seconds : seconds === "end" ? Infinity : Number.MAX_VALUE;
  return [...slots].sort((left, right) => time(left.seconds) - time(right.seconds) || left.picture - right.picture);
}

export function h3GuideBoundarySlots(slots: readonly H3TimedGuide[]) {
  const ordered = orderedH3GuideSlots(slots);
  const timed = ordered.filter(slot => slot.seconds !== null);
  const candidates = timed.length ? timed : ordered;
  const first = candidates[0];
  return {
    start: first?.seconds === "end" ? undefined : first,
    end: candidates.length > 1 || first?.seconds === "end" ? candidates.at(-1) : undefined
  };
}

function updateGuideBoundaries(editor: GuideEditor, edits: Partial<Pick<Draft, "startImagePath" | "endImagePath">>): GuideEditor {
  const slots = editor.slots.map(slot => ({ ...slot }));
  const { start, end } = h3GuideBoundarySlots(slots);
  let nextPicture = editor.nextPicture;
  if (edits.startImagePath !== undefined) {
    if (start) start.mediaPath = edits.startImagePath;
    else if (edits.startImagePath) slots.push({ picture: nextPicture++, mediaPath: edits.startImagePath, seconds: 0 });
  }
  if (edits.endImagePath !== undefined) {
    if (end) end.mediaPath = edits.endImagePath;
    else if (edits.endImagePath) slots.push({ picture: nextPicture++, mediaPath: edits.endImagePath, seconds: "end" });
  }
  return { ...editor, slots, nextPicture };
}

/** The frame fields are the native workflow's projection of the shared editor. */
export function applyH3GuideFramePatch(draft: Draft, patch: Partial<Draft>): Partial<Draft> {
  const editor = draft.h3GuideEditor;
  if (!editor || "h3GuideEditor" in patch || !supportsH3TimedGuides(draft) ||
    (patch.modelId && patch.modelId !== draft.modelId) || (patch.inputMode && patch.inputMode !== draft.inputMode) ||
    (patch.startImagePath === undefined && patch.endImagePath === undefined)) return patch;
  return { ...patch, h3GuideEditor: updateGuideBoundaries(editor, patch) };
}

export function normalizeH3GuideDraft(draft: Draft, previousSlots?: readonly H3TimedGuide[]): Partial<Draft> {
  const editor = draft.h3GuideEditor;
  if (!editor || !supportsH3TimedGuides(draft)) return {};
  if (editor.sharedFrames && previousSlots === undefined) return {};
  // Older inactive drafts could have separately edited native frame fields.
  let merged = editor;
  if (!editor.sharedFrames && !editor.active) {
    const { start, end } = h3GuideBoundarySlots(editor.slots);
    merged = updateGuideBoundaries(editor, {
      startImagePath: draft.startImagePath || undefined, endImagePath: draft.endImagePath || undefined
    });
    for (const [old, path] of [[start, draft.startImagePath], [end, draft.endImagePath]] as const) {
      if (path && old?.mediaPath && old.mediaPath !== path && !merged.slots.some(slot => slot.mediaPath === old.mediaPath)) {
        merged.slots.push({ picture: merged.nextPicture++, mediaPath: old.mediaPath, seconds: null });
      }
    }
  }
  const ordered = orderedH3GuideSlots(merged.slots);
  const numbers = new Map(ordered.map((slot, index) => [slot.picture, index + 1]));
  const removed = new Set(previousSlots?.filter(slot => !numbers.has(slot.picture)).map(slot => slot.picture));
  const remap = (text: string) => text.replace(/<Picture (\d+)>/gu, (tag, number: string) => {
    const previous = Number(number);
    const picture = numbers.get(previous);
    if (picture !== undefined) return `<Picture ${picture}>`;
    return removed.has(previous) ? "the removed image reference" : tag;
  });
  const slots = ordered.map((slot, index) => ({ ...slot, picture: index + 1 }));
  const { start, end } = h3GuideBoundarySlots(slots);
  const startImagePath = start?.mediaPath ?? "";
  const endImagePath = end?.mediaPath ?? "";
  const changed = removed.size || ordered.some((slot, index) => slot.picture !== index + 1);
  const script = changed && draft.longVideoScript ? structuredClone(draft.longVideoScript) : undefined;
  if (script) {
    script.revision++;
    for (const page of [script.brief, ...script.segments, ...script.archived]) {
      page.outline = remap(page.outline);
      for (const version of page.versions) version.text = remap(version.text);
    }
    if (script.pageBuffers) {
      for (const id of Object.keys(script.pageBuffers)) script.pageBuffers[id] = remap(script.pageBuffers[id]!);
    }
    if (script.wholeBuffer) script.wholeBuffer.raw = remap(script.wholeBuffer.raw);
  }
  return {
    h3GuideEditor: { ...merged, sharedFrames: true, slots, nextPicture: slots.length + 1 },
    startImagePath, endImagePath,
    ...(startImagePath !== draft.startImagePath ? { sourceWidth: 0, sourceHeight: 0 } : {}),
    ...(endImagePath !== draft.endImagePath ? { endImageWidth: 0, endImageHeight: 0 } : {}),
    ...(changed ? { promptVersions: draft.promptVersions.map(version => ({ ...version, text: remap(version.text) })) } : {}),
    ...(script ? { longVideoScript: script } : {})
  };
}

export function h3TimedGuideIssue(slots: readonly H3TimedGuide[], duration: number, frameCount = h3FrameCountForSeconds(duration)) {
  const guides = resolveH3TimedGuides(slots, duration, frameCount);
  if (!guides.length) return "missing";
  if (guides.some(guide => !Number.isFinite(guide.frame) || guide.frame < 0 || guide.frame >= frameCount ||
    (typeof guide.seconds === "number" && guide.seconds < 0))) return "time";
  if (guides.some((guide, index) => index > 0 && guide.frame === guides[index - 1]?.frame)) return "duplicate";
  return undefined;
}

export function missingH3GuideReference(prompt: string, slots: readonly H3TimedGuide[]) {
  const pictures = new Set(slots.filter(slot => slot.mediaPath).map(slot => slot.picture));
  return [...prompt.matchAll(/<Picture (\d+)>/gu)].find(match => !pictures.has(Number(match[1])))?.[1];
}

export function h3GuideSamplingPrompt(prompt: string, slots: readonly H3TimedGuide[]) {
  return prompt.replace(/<Picture (\d+)>/gu, (tag, picture: string) => {
    const guide = slots.find(slot => slot.picture === Number(picture));
    if (!guide || guide.seconds === null) return tag;
    if (guide.seconds === "end") return "the final keyframe";
    return guide.seconds === 0 ? "the opening keyframe" : `the keyframe at ${guide.seconds}s`;
  });
}
