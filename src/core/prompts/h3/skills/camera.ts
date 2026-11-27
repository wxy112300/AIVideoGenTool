import { extractH3CameraIntent } from "../../../h3-camera-intent.js";
import type { H3PromptSkill } from "./types.js";

const thresholdEntryPattern = /(?:\b(?:fly|flies|flying|glide|glides|gliding|dive|dives|diving|enter|enters|entering|go|goes|going|push|pushes|pushing|pass|passes|passing|slip|slips|slipping|travel|travels|traveling|move|moves|moving|zoom|zooms|zooming)\s+(?:in|into|inside|through|down(?:\s+into)?)\s+(?:[a-z0-9'’-]+\s+){0,4}(?:mouth|throat|gullet|esophagus|jaw|lips|teeth|nostril|ear|eye|pupil|underwear|waistband|pocket|sleeve|shoe|boot|bag|bottle|cup|mug|hole|burrow|tunnel|cave|pipe|tube|vent|keyhole|doorway|crack|gap|opening|cavity)\b|\b(?:inside|into)\s+(?:(?:the|a|an|her|his|their)\s+)?(?:open\s+)?(?:mouth|throat|esophagus|oral\s+cavity)\b|(?:镜头|相机|视角|机位|画面)[^。！？；;\n]{0,25}(?:飞进|飞入|钻进|钻入|进入|穿进|穿入|深入|滑进|滑入|探进|探入|推进|推入)[^。！？；;\n]{0,20}(?:嘴|口中|口腔|喉咙|嗓子|咽喉|口袋|袖口|袖子|鞋|洞|隧道|管道|缝隙|瓶口|杯口|门洞|开口|内部)|(?:飞进|飞入|钻进|钻入|穿入)(?:她的|他的|人的|张开的)?(?:嘴|口中|口腔|喉咙|嗓子|口袋|袖口|鞋里|洞口|隧道|瓶口))/iu;

export const cameraThresholdEntrySkill: H3PromptSkill = {
  id: "camera-threshold-entry",
  title: "Camera Threshold Entry & Interior Transition (Anti-Recursion / Anti-Glitch)",
  catalogHint: "camera flying or gliding through an opening (mouth, throat, doorway, tunnel, pocket, shoe, bottle) into an interior, or orbiting inside to look back out",
  priority: 95,
  sharedWithLongVideo: true,
  matches: (ctx) => thresholdEntryPattern.test(`${ctx.sourcePrompt}\n${ctx.supplementalContext}`),
  guidance: () => [
    "- Prevent H3 from hallucinating a second opening/mouth in the deep back interior by enforcing strict 3D threshold geometry:",
    "  1. Pre-entry & crossing: establish the single opening already wide before entry, then state clearly that its outer rim landmarks (lips and teeth / doorframe / pocket rim) sweep outward past all four borders of the frame and pass completely behind the lens while the deep back interior ahead stays enclosed and dim.",
    "  2. One-way deeper entry: if the camera keeps moving deeper inward, stop naming exterior threshold landmarks ('mouth', 'lips', 'teeth', 'doorway', 'outside') altogether—describe only continuous enclosed curved interior walls, surface microtexture, and diffused light spilling from behind the lens fading smoothly into shadowed depth ahead.",
    "  3. Inside-looking-out 180° reverse orbit (ONLY when the user asks to rotate inside and see the outside from within): NEVER reveal outside light or an opening in front of the camera while still facing inward toward the back wall. Instead, explicitly stage a continuous horizontal ~180° semicircle orbit around the subject inside the enclosed cavity that visibly turns the camera's facing direction away from the dark closed back wall back toward the entry side; ONLY AFTER completing that ~180° turnaround, frame the backlit subject against that SAME single original opening (silhouetted rim/teeth/doorframe and bright diffused outside light).",
    "- Keep motion and exposure smooth through tight spaces: use a calm, continuous camera glide and smooth directional light falloff in purely positive visual prose (never write negative meta-phrases like 'no jitter', 'no distortion', or 'no second mouth')."
  ].join("\n"),
  example: "Example (clean entry + 180° inside-looking-out reverse orbit): Starting outside, the camera glides smoothly forward through the wide open entrance as the parted outer rim sweeps rapidly past all four borders behind the lens. Inside the enclosed dimly lit passage, the camera orbits continuously in a smooth 180-degree horizontal semicircle around the foreground subject, turning completely away from the dark closed rear interior until the lens faces back toward the original entry side—now framing the backlit subject in silhouette against the single original opening and the bright diffused daylight beyond."
};

export const cameraPrecisionSkill: H3PromptSkill = {
  id: "camera-precision",
  title: "Camera Angle Lock, Exact Rotation & Device Disambiguation",
  catalogHint: "exact rotation degree (e.g. 180° orbit), strict viewpoint/angle lock, or a visible physical camera device distinct from the lens",
  priority: 85,
  sharedWithLongVideo: true,
  matches: (ctx) => {
    const intent = extractH3CameraIntent(ctx.sourcePrompt, ctx.supplementalContext);
    return intent.rotationDegrees.length > 0 || intent.hasPhysicalCamera || intent.angleKinds.length > 0;
  },
  guidance: (ctx) => {
    const intent = extractH3CameraIntent(ctx.sourcePrompt, ctx.supplementalContext);
    const lines: string[] = [];
    if (intent.rotationDegrees.length) {
      lines.push(`- Exact camera sweep: preserve the requested rotation (${intent.rotationDegrees.join("°, ")}°) accurately and settle cleanly at that exact endpoint—e.g. a 180° semicircle stops on the opposite side, never continuing into a 360° full lap.`);
    }
    if (intent.angleKinds.length) {
      lines.push(`- Angle lock: maintain the requested viewpoint height/angle (${intent.angleKinds.join(", ")}) consistently unless a change is explicitly requested.`);
    }
    if (intent.hasPhysicalCamera) {
      lines.push("- Device vs viewpoint: keep the visible physical camera prop/device distinct from the invisible image-forming viewpoint framing the scene.");
    }
    if (!lines.length) {
      lines.push(
        "- Exact camera sweep & angle lock: preserve any requested orbit degree (e.g. a 180° semicircle stops cleanly on the opposite side, never continuing into a 360° full lap) and keep viewpoint height/angle steady unless a deliberate shift is called for.",
        "- Device vs viewpoint: keep any visible physical camera prop/device distinct from the invisible image-forming viewpoint framing the scene."
      );
    }
    return lines.join("\n");
  }
};

export const cameraCraftSkills: readonly H3PromptSkill[] = [
  cameraThresholdEntrySkill,
  cameraPrecisionSkill
];
