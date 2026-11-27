import type { H3PromptSkill } from "./types.js";

const stylizedOverridePattern = /(?:\b(?:anime|cel[- ]shaded|cartoon|2d\s+animation|3d\s+animation|pixar|claymation|stop[- ]motion|oil\s+painting|watercolor|ink\s+wash|sketch|comic|manga|chibi|pixel\s+art|low[- ]poly|cgi|unreal\s+engine|stylized)\b|动漫|动画|二次元|卡通|水彩|油画|素描|水墨|漫画|Q版|像素风|黏土|定格动画|风格化)/iu;

const realismCuePattern = /(?:\b(?:photorealistic|photo[- ]?real|live[- ]action|real(?:istic)?\s+(?:person|human|footage|skin|video|film|camera)|natural\s+skin|real[- ]world|documentary|cinematic\s+realism|no\s+plastic|unretouched|skin\s+pores|peach\s+fuzz|vellus\s+hair|subsurface\s+scattering|lip\s+lines|iris\s+fibers|corneal\s+catchlights|fabric\s+weave|textile\s+weave|micro[- ]?topography|35mm|85mm|100mm\s+macro)\b|写实|真实(?:感|画质|渲染|拍摄|皮肤|的人)?|真人(?:实拍)?|去塑料感|实拍|电影质感|自然皮肤|毛孔|绒毛|次表面散射|唇纹|水润|虹膜|泪膜|布料纹理|织物纹理|经纬纹理|微距画质|35mm|85mm|100mm)/iu;

const macroSkinCuePattern = /(?:\b(?:skin|pores?|peach\s+fuzz|vellus|subsurface|face|cheek|jawline|portrait|close[- ]?up|macro|thigh|belly|hand|palm|finger|foot|sole|tiny|giant(?:ess)?|body)\b|皮肤|肌肤|毛孔|绒毛|次表面|脸|脸颊|特写|近景|微距|大腿|腹部|手掌|手指|脚|小人|巨人)/iu;

const macroLipsEyesCuePattern = /(?:\b(?:lips?|mouth|tongue|teeth|eye(?:s|lash|lid)?|iris|pupil|gaze|blink|tear\s+film|waterline|close[- ]?up|macro|portrait)\b|嘴唇|唇|唇纹|嘴|口腔|舌|眼|瞳孔|虹膜|睫毛|泪膜|特写|微距|人像)/iu;

const tactileFabricCuePattern = /(?:\b(?:fabric|textile|cloth(?:ing|es)?|weave|denim|jeans|cotton|linen|wool|knit|sweater|shirt|skirt|dress|coat|jacket|sock|shoe|pocket|waistband|seam|fiber|thread)\b|布料|织物|衣料|衣服|牛仔|棉|麻|毛衣|针织|裙|外套|袜|鞋|口袋|裤腰|缝线|纤维|毛羽)/iu;

const opticalLensCuePattern = /(?:\b(?:35mm|50mm|85mm|100mm|105mm|macro\s+lens|prime\s+lens|probe\s+lens|bokeh|shallow\s+depth|anamorphic|35mm\s+film|smartphone\s+1x|documentary)\b|35mm|50mm|85mm|100mm|微距镜头|定焦|探针镜头|散景|浅景深|纪实)/iu;

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
    "- Expressive animation timing: use readable silhouettes, clear anticipation before major moves, crisp smear/follow-through on hair and garments, and clean uniform linework and flat or painterly shading across every frame."
  ].join("\n")
};

/**
 * Community- & DP-grounded MiniMax H3 photorealistic & macro surface craft skill.
 * Injects ONLY the matching physical micro-phenomena (skin/SSS, macro lips & eyes,
 * tactile fabric weave, focal optics) so Qwen3.8-Flash-Next stays lean while beating
 * waxy/airbrushed AI smoothing on macro human shots.
 */
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
  guidance: (ctx) => {
    const text = `${ctx.sourcePrompt}\n${ctx.supplementalContext}`;
    const lines: string[] = [
      "- Physical micro-phenomena over empty buzzwords (WRONG → RIGHT): WRONG: '8K, hyperrealistic, masterpiece, flawless porcelain skin' (causes smooth waxy AI smoothing). | RIGHT: describe concrete light and surface physics—soft directional practical/window light, gradual specular roll-off, gentle shadow-side bounce fill, grounded contact shadows, organic ungraded color, and fine surface texture that stays attached to moving subjects across frames."
    ];

    if (ctx.inspectAll || macroSkinCuePattern.test(text)) {
      lines.push(
        "- Unretouched skin micro-topography & subsurface scattering (visible/macro skin only): describe fine visible skin pores, delicate vellus hair (peach fuzz) catching soft side/rim light, subtle natural sebum sheen on nose/cheek/skin curves, slight organic skin-tone variation and micro-creases, and warm subsurface scattering glowing softly along lit skin edges (ears, nostrils, lips, fingertips, skin folds)."
      );
    }
    if (ctx.inspectAll || macroLipsEyesCuePattern.test(text)) {
      lines.push(
        "- Macro lips, moisture & eye realism (close-up/macro faces only): for lips, describe natural fine vertical lip lines, organic pinkish-red undertones, and subtle moist specular sheen along the lower lip boundary (never flat painted matte blocks). For eyes, describe intricate multi-toned iris fiber detail, moist lower-eyelid waterline, thin wet tear film, individual eyelashes, and crisp scene-matched window/key catchlights. Keep extreme-macro facial movement subtle (gentle blink, slight lip parting, quiet breath) so high-frequency pores and lip lines stay temporally locked."
      );
    }
    if (ctx.inspectAll || tactileFabricCuePattern.test(text)) {
      lines.push(
        "- Tactile fabric weave & physical materiality: render visible clothing as real woven threads—interlocking cotton/denim/linen/knit warp-and-weft weave, fine stray micro-fibers catching edge light, stitched seams, natural cloth tension folds responding to motion, and material-accurate surface roughness."
      );
    }
    if (ctx.inspectAll || opticalLensCuePattern.test(text)) {
      lines.push(
        "- Optical lens discipline: match focal optics to the framing goal—35mm for environmental intimacy with natural perspective, 85mm for portrait compression and smooth background separation, 100mm macro for extreme skin/lip/eye topography with shallow optical falloff, or wide-angle close-focus macro when a tiny foreground subject needs deep readable background scale context."
      );
    }
    return lines.join("\n");
  }
};

export const styleCraftSkills: readonly H3PromptSkill[] = [
  stylizedAnimationCraftSkill,
  visualRealismSkill
];
