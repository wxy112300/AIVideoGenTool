import type { H3PromptSkill } from "./types.js";

const stylizedOverridePattern = /(?:\b(?:anime|cel[- ]shaded|cartoon|2d\s+animation|3d\s+animation|pixar|claymation|stop[- ]motion|oil\s+painting|watercolor|ink\s+wash|sketch|comic|manga|chibi|pixel\s+art|low[- ]poly|cgi|unreal\s+engine|stylized)\b|动漫|动画|二次元|卡通|水彩|油画|素描|水墨|漫画|Q版|像素风|黏土|定格动画|风格化)/iu;

const realismCuePattern = /(?:\b(?:photorealistic|photo[- ]?real|live[- ]action|real(?:istic)?\s+(?:person|human|footage|skin|video|film|camera)|natural\s+skin|real[- ]world|documentary|cinematic\s+realism|no\s+plastic)\b|写实|真实(?:感|画质|渲染|拍摄|皮肤|的人)?|真人(?:实拍)?|去塑料感|实拍|电影质感|自然皮肤)/iu;

export const stylizedAnimationCraftSkill: H3PromptSkill = {
  id: "stylized-animation-craft",
  title: "Stylized Medium & Animation Consistency Lock",
  catalogHint: "2D anime, cel-shaded illustration, cartoon, watercolor, oil painting, claymation, or non-photorealistic stylized art visible in the reference",
  priority: 80,
  sharedWithLongVideo: true,
  matches: (ctx) => {
    const text = `${ctx.sourcePrompt}\n${ctx.supplementalContext}`;
    return stylizedOverridePattern.test(text) || ctx.preset === "narrative-animation";
  },
  guidance: () => [
    "- Medium lock (prevents drifting into greasy 3D photoreal skin): explicitly sustain the requested medium's surface grammar across every frame—e.g. crisp uniform 2D cel-shaded linework with clean flat shadow planes, tactile handcrafted stop-motion clay with subtle thumbprint texture, or flowing ink-wash brushwork on textured paper.",
    "- Expressive animation timing: use readable silhouettes, clear anticipation before major moves, crisp smear/follow-through on hair and garments, and stable line/color edges without injecting live-action pores or camera grain."
  ].join("\n")
};

export const visualRealismSkill: H3PromptSkill = {
  id: "visual-realism",
  title: "Live-Action Visual Craft",
  priority: 55,
  sharedWithLongVideo: false,
  matches: (ctx) => {
    const text = `${ctx.sourcePrompt}\n${ctx.supplementalContext}`;
    if (stylizedOverridePattern.test(text) || ctx.preset === "narrative-animation") return false;
    if (/(?:\bnot\s+photorealistic\b|不要写实|非写实)/iu.test(text)) return false;
    return realismCuePattern.test(text) || (ctx.preset === "detailed-cinematic" && ctx.hasReferenceMedia);
  },
  guidance: () => [
    "- Live-action formation (use sparingly where visible, never generic '8K masterpiece' slogans): natural skin microtexture and restrained scene-lit eye catchlights on readable faces, fabric weave and folds responding to motion, accurate contact shadows and surface roughness, smooth highlight roll-off, and temporally stable light/color across frames.",
    "- Keep textures attached to moving surfaces; avoid imposing shallow bokeh or film grain unless the brief or reference style calls for it."
  ].join("\n")
};

export const styleCraftSkills: readonly H3PromptSkill[] = [
  stylizedAnimationCraftSkill,
  visualRealismSkill
];
