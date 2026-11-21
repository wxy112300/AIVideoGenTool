import type { H3TimedGuide } from "../../types.js";
import { h3TimedGuideIssue, resolveH3TimedGuides } from "../h3-timed-guides.js";
import { projectLongVideoFrames, type LongVideoLayout } from "./layout.js";

function guideSlotsOnTimeline(slots: readonly H3TimedGuide[], layout: LongVideoLayout): H3TimedGuide[] {
  return slots.map(slot => slot.seconds === layout.requestedSeconds ? { ...slot, seconds: "end" } : slot);
}

export function longVideoGuideIssue(slots: readonly H3TimedGuide[], layout: LongVideoLayout) {
  return h3TimedGuideIssue(guideSlotsOnTimeline(slots, layout), layout.requestedSeconds, layout.targetFrames);
}

export function longVideoGuideCues(slots: readonly H3TimedGuide[], layout: LongVideoLayout) {
  const { groups } = projectLongVideoFrames(layout);
  return resolveH3TimedGuides(guideSlotsOnTimeline(slots, layout), layout.requestedSeconds, layout.targetFrames).map(guide => {
    const group = groups.find(item => item.startFrame <= guide.frame && guide.frame < item.endFrame);
    return { ...guide, segment: group?.logicalChunk, localSeconds: group ? (guide.frame - group.startFrame) / 24 : undefined };
  });
}

export function longVideoGuideSamplingPrompt(prompt: string, cues: ReturnType<typeof longVideoGuideCues>, segment: number) {
  return prompt.replace(/<Picture (\d+)>/gu, (tag, picture: string) => {
    const cue = cues.find(item => item.picture === Number(picture));
    if (!cue) return tag;
    if (cue.frame === 0) return "the opening keyframe";
    if (cue.segment === segment && cue.localSeconds !== undefined) return `the keyframe at ${Number(cue.localSeconds.toFixed(3))}s`;
    return cue.segment !== undefined && cue.segment < segment ? "the earlier keyframe" : "the later keyframe";
  });
}
