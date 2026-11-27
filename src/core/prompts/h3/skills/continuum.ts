import type { H3PromptSkill } from "./types.js";

/**
 * Dedicated Continuum, Multi-Chunk Long-Video & Extend continuity skill.
 * Triggers strictly in Long-Video decomposition, multi-chunk Continuum, and Extend modes—
 * never bloating ordinary single-clip T2VA/I2VA/FL2VA/R2V prompts.
 */
export const continuumContinuitySkill: H3PromptSkill = {
  id: "continuum-continuity",
  title: "Continuum, Multi-Chunk & Extension Continuity",
  priority: 96,
  sharedWithLongVideo: true,
  matches: (ctx) => Boolean(ctx.isLongVideo || ctx.isExtension || ctx.isNativeContinuum),
  guidance: (ctx) => {
    const opener = ctx.previousChunk && ctx.previousChunk > 0
      ? `Continuation of Chunk ${ctx.previousChunk}.`
      : "Continuation of the preceding segment.";
    const lines: string[] = [
      "- Continuum 22-frame latent tail & boundary physics (WRONG → RIGHT): consecutive chunks inherit 22 frames of audio-video latent state (or locked source boundary). WRONG: treating a chunk boundary as a cut, resetting back to the opening image, or replaying actions that already finished. | RIGHT: pick up directly from the outgoing pose, hand/prop grip, screen direction, camera velocity, lighting, and ongoing sound, advancing immediately into the next physical increment.",
      `- Local time axis & inheritable handoff (${ctx.durationSeconds.toFixed(1)}s): author every action beat and timestamp strictly on the NEW visible 0.00–${ctx.durationSeconds.toFixed(2)}s window (never accumulated film timestamps). End every non-final chunk on a clear, concrete physical state (outgoing pose, prop holder, motion direction, sound) so the following chunk inherits it cleanly without jumping.`
    ];

    if (ctx.inspectAll || ctx.isNativeContinuum || ctx.isLongVideo) {
      lines.push(
        `- Native Continuum chunk format: write only the current chunk body in T2VA field shape (integrated_multimodal_description:, overall_soundscape:, non_diegetic_music:) with zero <Picture 1>, <Video 1>, or alignment line—any attached boundary frame is visual inspection evidence only. Begin continuous Chunk 2+ right after [Shot 1] with '${opener}'. Never emit [Chunk N] routing headers, earlier chunk bodies, or a new global preamble.`
      );
    }
    if (ctx.inspectAll || (ctx.isExtension && !ctx.isNativeContinuum)) {
      lines.push(
        "- Extend boundary routing: in Motion Context R2V, treat <Video 1> as the locked source video carrying outgoing motion and audio (the extracted boundary image is inspection-only and must not become <Picture N>). In FL2VA/I2VA boundary continuation, treat <Picture 1> as both the exact final source frame and the exact 0.00s opening frame, keeping the official alignment line at the very top."
      );
    }
    if (ctx.inspectAll || ctx.isLongVideo) {
      lines.push(
        "- Multi-chunk story allocation & pacing: assign each user-specified event ONCE in causal order across chunks without duplicating beats across chunk edges; honor locked pages and user-edited directions; keep each chunk physically performable (1–2 clear causal beats for 4–6s; 2–3 for 7–15s) with realistic A→B travel speed across consecutive chunks."
      );
    }
    return lines.join("\n");
  },
  example: (ctx) => (ctx.isLongVideo
    ? undefined
    : "Example (seamless Continuum handoff without replay): [Shot 1] Continuation of Chunk 1. Her right fingers remain wrapped around the brass handle as she finishes pulling the drawer fully open, the camera continuing its slow rightward track to follow her gaze down into the compartment; she releases the handle, reaches in smoothly, and lifts the single silver key clear of the felt lining.")
};

export const continuumCraftSkills: readonly H3PromptSkill[] = [
  continuumContinuitySkill
];
