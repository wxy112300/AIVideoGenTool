const smallerScalePattern = /(?:\b(?:tiny|miniature|miniaturized|miniaturised|diminutive|shrunken|shrunk|shrink(?:s|ing)?|small[- ]scale|small[- ]sized|micro[- ]scale|pocket[- ]sized|scale(?:d)?\s+down|reduced\s+in\s+size|downsized)\b|缩小化?|变小|微小|微型|迷你|小人|等比例缩小|缩至|缩成)/iu;
const smallerSubjectPattern = /\b(?:small|little)\s+(?:person|people|human|girl|boy|woman|man|adult|child|character|subject)\b/iu;
const smallerSubjectScalePattern = /(?:\b(?:tiny|miniature|miniaturized|miniaturised|diminutive|shrunken|shrunk|shrink(?:s|ing)?|small[- ]scale|small[- ]sized|micro[- ]scale|pocket[- ]sized|scale(?:d)?\s+down|reduced\s+in\s+size|downsized)\b(?:[\t ,;:]+(?:a|an|the|real|living|full[- ]grown|adult|young|female|male)){0,5}[\t ,;:]+\b(?:person|people|human|girl|boy|woman|man|lady|gentleman|female|male|adult|child|teen(?:ager)?|character|subject)\b|\b(?:person|people|human|girl|boy|woman|man|lady|gentleman|female|male|adult|child|teen(?:ager)?|character|subject)\b[^.!?\n]{0,18}\b(?:shrink(?:s|ing)?|shrunken|shrunk|scale(?:d)?\s+down|reduced\s+in\s+size|downsized|缩小|变小|微小)\b|(?:缩小化?|变小|微小|微型|迷你|小人|等比例缩小|缩至|缩成)(?:的|的一个)?(?:真人|人类|人物|角色|女孩|女孩子|姑娘|男孩|男孩子|女人|男人|女士|男士|成人|少女|女性|男性|人))/iu;
const largerScalePattern = /(?:\b(?:giant|gigantic|huge|massive|colossal|oversized|enlarged|enlarge|grown|grow(?:s|ing)?|scale(?:d)?\s+up)\b|巨大化?|巨型|巨大|放大|变大|巨人|等比例放大|增大)/iu;
const largerSubjectScalePattern = /(?:\b(?:giant|gigantic|huge|massive|colossal|oversized|enlarged|enlarge|grown|grow(?:s|ing)?|scale(?:d)?\s+up)\b(?:[\t ,;:]+(?:a|an|the|real|living|full[- ]grown|adult|young|female|male)){0,5}[\t ,;:]+\b(?:person|people|human|girl|boy|woman|man|lady|gentleman|female|male|adult|child|teen(?:ager)?|character|subject)\b|\b(?:person|people|human|girl|boy|woman|man|lady|gentleman|female|male|adult|child|teen(?:ager)?|character|subject)\b[^.!?\n]{0,18}\b(?:giant|gigantic|huge|massive|colossal|oversized|enlarged|enlarge|grown|grow(?:s|ing)?|scale(?:d)?\s+up|巨大化?|巨型|巨大|放大|变大|巨人|等比例放大|增大)\b|(?:巨大化?|巨型|巨大|放大|变大|巨人|等比例放大|增大)(?:的|的一个)?(?:真人|人类|人物|角色|女孩|女孩子|姑娘|男孩|男孩子|女人|男人|女士|男士|成人|少女|女性|男性|人))/iu;
const scaleRelationPattern = /(?:\b(?:scale|scaling|relative\s+(?:size|scale)|physical\s+size|world[- ]scale|same\s+proportions?|proportional(?:ly)?|height\s+ratio)\b|比例|尺度|大小关系|相对于|等比例|世界尺度|物理尺寸)/iu;
const numericScalePattern = /(?:\b\d+(?:\.\d+)?\s*(?:cm|mm|m|ft|feet|inches?|inch)\s*(?:tall|high)?\b|\b\d+\s*[:/]\s*\d+(?:\s*scale)?\b|\d+(?:\.\d+)?\s*(?:厘米|毫米|米)高?)/iu;
const humanSubjectPattern = /(?:\b(?:person|people|human(?:s)?|girl|boy|woman|man|lady|gentleman|female|male|adult|child|teen(?:ager)?|character|subject|figure)\b|人类|人物|角色|主体|女孩|女孩子|姑娘|男孩|男孩子|女人|男人|女士|男士|成人|成年|少女|女性|男性|小孩|婴儿|人)/iu;
const humanIdentityPattern = /(?:\b(?:person|people|human(?:s)?|girl|boy|woman|man|lady|gentleman|female|male|adult|child|teen(?:ager)?)\b|人类|人物|女孩|女孩子|姑娘|男孩|男孩子|女人|男人|女士|男士|成人|成年|少女|女性|男性|小孩|婴儿|真人|人)/iu;
const antiToyPattern = /(?:\b(?:not|never|without|no)\s+(?:a\s+)?(?:toy|doll|figur(?:e|ine)|model|plastic)|\b(?:real|living|flesh[- ]and[- ]blood)\s+(?:human|person)|不要(?:玩具|娃娃|人偶|手办|塑料)|不是(?:玩具|娃娃|人偶|手办|小孩|婴儿)|非(?:玩具|娃娃|人偶)|保持真人|真实的人)/iu;
const explicitMorphologyPattern = /(?:\b(?:chibi|big[- ]headed|oversized\s+head|exaggerated\s+proportions?|doll[- ]like|vinyl\s+toy|toy\s+figure|figurine|diorama)\b|Q版|大头娃娃|夸张比例|卡通化)/iu;
const explicitAntiToyPattern = /(?:\b(?:not|never|without|no)\s+(?:a\s+)?(?:toy|doll|figur(?:e|ine)|model|plastic)|不要(?:玩具|娃娃|人偶|手办|塑料)|不是(?:玩具|娃娃|人偶|手办)|非(?:玩具|娃娃|人偶))/iu;
function hasMatch(pattern, value) {
    pattern.lastIndex = 0;
    return pattern.test(value);
}
function matchedTerms(pattern, value) {
    const flags = `${pattern.flags.replace("g", "")}g`;
    return Array.from(value.matchAll(new RegExp(pattern.source, flags)))
        .map((match) => match[0]?.trim() ?? "")
        .filter(Boolean);
}
function combinedScaleText(sourcePrompt, supplementalText) {
    return [sourcePrompt, supplementalText].map((value) => value.trim()).filter(Boolean).join("\n");
}
export function extractH3ScaleIntent(sourcePrompt, supplementalText = "") {
    const text = combinedScaleText(sourcePrompt, supplementalText);
    const hasSmallerScale = hasMatch(smallerSubjectScalePattern, text) || hasMatch(smallerSubjectPattern, text);
    const hasLargerScale = hasMatch(largerSubjectScalePattern, text);
    const hasRelation = hasMatch(scaleRelationPattern, text) || hasMatch(numericScalePattern, text);
    const humanSubject = hasMatch(humanSubjectPattern, text);
    const humanIdentity = hasMatch(humanIdentityPattern, text);
    const antiToy = hasMatch(antiToyPattern, text);
    const detected = humanSubject && (hasSmallerScale || hasLargerScale || hasRelation);
    const morphologyChangeRequested = hasMatch(explicitMorphologyPattern, text) && !hasMatch(explicitAntiToyPattern, text);
    const direction = hasSmallerScale && hasLargerScale
        ? "relative"
        : hasSmallerScale
            ? "smaller"
            : hasLargerScale
                ? "larger"
                : "relative";
    const terms = [
        ...matchedTerms(smallerScalePattern, text),
        ...matchedTerms(smallerSubjectPattern, text),
        ...matchedTerms(largerScalePattern, text),
        ...matchedTerms(scaleRelationPattern, text),
        ...matchedTerms(numericScalePattern, text),
        ...(antiToy ? matchedTerms(antiToyPattern, text) : [])
    ].filter((term, index, all) => all.indexOf(term) === index);
    return { detected, direction, humanSubject, humanIdentity, morphologyChangeRequested, terms };
}
export function h3ScalePreservationContract() {
    return "Scale-semantics rule: when a size adjective or shrink/grow request refers to a subject, interpret it as one uniform change in physical world scale unless the user explicitly requests a body-shape transformation. Never infer a toy, doll, figure, child, baby, or local anatomy change from smallness; preserve the source identity, age, facial and body proportions, joints, posture, gait, behavior, and natural materials.";
}
function modeScaleRule(mode) {
    switch (mode) {
        case "I2VA":
            return "For I2VA, lock this relation in the Picture 1 opening frame and keep it stable as the action develops.";
        case "FL2VA":
            return "For FL2VA, keep the same relation at both keyframes and describe a continuous path without accidental scale drift.";
        case "L2VA":
            return "For L2VA, preserve this relation while the action converges on the exact Picture 1 final frame.";
        case "R2V":
            return "For R2V, assign identity, age, and anatomy to the character reference and use the environment or height reference only as the scale anchor.";
        case "T2VA":
        default:
            return "For T2VA, establish the relation in the opening beat and make it legible against a full-size environmental anchor.";
    }
}
export function h3ScalePreservationInstruction(sourcePrompt, mode, supplementalText = "") {
    const intent = extractH3ScaleIntent(sourcePrompt, supplementalText);
    if (!intent.detected)
        return "";
    const explicitChangeRule = intent.morphologyChangeRequested
        ? "The request also contains an explicit stylized or body-proportion change; preserve that explicit change, and apply the uniform-scale lock only to the separate size relationship."
        : "Do not introduce any body-proportion or style change that the user did not explicitly request.";
    const direction = intent.direction === "smaller"
        ? "smaller than the full-size surrounding world"
        : intent.direction === "larger"
            ? "larger than the surrounding world"
            : "at the explicitly requested relative scale";
    const mechanicsRule = intent.humanIdentity
        ? "Keep the identified human living and flesh-and-blood with natural skin, hair, clothing, contact, weight, and motion, not manufactured or plastic."
        : "Keep the subject's original material, anatomy, contact, weight, and motion natural rather than turning it into a manufactured or stylized object.";
    return [
        "Scale semantics lock (high priority):",
        `When size words describe a human/character, rewrite them as the same source/reference identity and age made ${direction} by one uniform world-space factor relative to the full-size environment. Preserve facial maturity, face shape, head-to-body and limb-length ratios, joints, hands, feet, posture, gait, expressions, voice, clothing, materials, and age-appropriate behavior; never infer a child, baby, toy, doll, figure, plastic model, local body deformation, or scale drift.`,
        `${mechanicsRule} Shorter or longer travel distance is not shorter or longer limbs; move the camera or lens closer instead of enlarging the head. Preserve supplied height/ratio anchors; otherwise use visible environmental anchors without inventing numbers.`,
        modeScaleRule(mode),
        explicitChangeRule,
        "Encode the lock as natural H3 timeline prose, not a detached negative list."
    ].join("\n");
}
function scaleOutputAlreadyLocked(promptText) {
    return /(?:scale continuity|uniform(?:ly)?\s+(?:world[- ]scale|scaled|reduced|enlarged)|world[- ]space\s+scale|(?:preserve|maintain|keep|unchanged|consistent|same)[^.!?\n]{0,100}(?:head[- ]to[- ]body\s+ratio|limb[- ]length|body proportions?|source age|age-appropriate))/iu.test(promptText);
}
function scaleOutputLock(intent, promptText) {
    const direction = intent.direction === "smaller"
        ? "physically smaller than the full-size surrounding environment"
        : intent.direction === "larger"
            ? "physically larger than the surrounding environment"
            : "at the requested physical scale relative to the environment";
    if (/[\p{Script=Han}]/u.test(promptText)) {
        const materialRule = intent.humanIdentity
            ? "角色仍应是具有自然皮肤、头发、衣物和运动表现的真人，而不是玩具、娃娃或塑料人偶。"
            : "主体保持原有自然材质和运动表现，不得变成玩具、娃娃、塑料模型或其他人工制品。";
        return `尺度连续性：同一个主体保持原始身份和年龄，仅相对于完整尺寸的环境以统一的整体物理尺度${intent.direction === "smaller" ? "缩小" : intent.direction === "larger" ? "放大" : "变化"}。保留脸部成熟度、头身比、四肢长度比例、关节位置、手脚、姿态、步态、动作、表情和年龄相符的行为，不得局部改变身体比例、出现年龄退化或在镜头之间漂移；${materialRule}`;
    }
    const subjectDescription = intent.humanIdentity ? "the same source-age human" : "the same source subject";
    const materialRule = intent.humanIdentity
        ? "Keep the subject living and flesh-and-blood with natural skin, hair, clothing and motion, not a manufactured figure."
        : "Keep the subject's original material and motion natural, not manufactured or stylized.";
    return `Scale continuity: ${subjectDescription} remains ${direction} through one uniform world-space change only. Preserve identity, source age and age-appropriate behavior, facial maturity, head-to-body ratio, limb-length ratios, joint placement, hands, feet, posture, gait, gestures and expressions; do not locally resize body parts, regress the age, or let the scale drift. ${materialRule}`;
}
export function ensureH3ScalePreservationInOutput(promptText, mode, sourcePrompt, supplementalText = "") {
    if (!promptText.trim())
        return promptText;
    const intent = extractH3ScaleIntent(sourcePrompt, supplementalText);
    if (!intent.detected || !intent.humanSubject || intent.morphologyChangeRequested || scaleOutputAlreadyLocked(promptText)) {
        return promptText;
    }
    const lock = scaleOutputLock(intent, promptText);
    const sectionName = mode === "R2V" ? "detailed_description" : "integrated_multimodal_description";
    const sectionPattern = new RegExp(`^[*# \\t]*${sectionName}[ \\t]*:`, "imu");
    if (sectionPattern.test(promptText)) {
        return promptText.replace(sectionPattern, (header) => `${header}\n${lock}`);
    }
    return `${lock}\n${promptText}`;
}
