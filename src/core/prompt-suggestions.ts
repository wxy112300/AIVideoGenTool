export interface PromptSnippet {
  id: string;
  group: string;
  label: string;
  text: string;
}

export const promptSnippets: readonly PromptSnippet[] = [
  {
    id: "continuity-reference-lock",
    group: "参考与连续性",
    label: "锁定参考图身份与构图",
    text: "Preserve the subject identity, appearance, clothing, body proportions, position, lighting, background, and important composition anchors from <Picture 1>."
  },
  {
    id: "continuity-body-gaze-lock",
    group: "参考与连续性",
    label: "锁定身体与视线朝向",
    text: "The subject's feet, hips, shoulders, head, and gaze remain oriented in the same direction unless the action explicitly changes them."
  },
  {
    id: "motion-causal-onset",
    group: "动作与反应",
    label: "自然动作起因",
    text: "The subject takes one natural breath and makes a small preparatory movement before the main action begins; the visible physical response develops continuously."
  },
  {
    id: "motion-vocal-anatomy",
    group: "动作与反应",
    label: "对白身体反应",
    text: "The lips, jaw, cheeks, throat, breathing, and chest respond naturally and visibly to the spoken performance."
  },
  {
    id: "camera-push-in",
    group: "镜头运动",
    label: "慢速推近",
    text: "The camera pushes in with small amplitude at slow speed toward the subject."
  },
  {
    id: "camera-pull-out-reveal",
    group: "镜头运动",
    label: "后退拉开并展开环境",
    text: "The camera pulls out directly backward along the same optical axis with large amplitude at slow speed, progressively revealing the environment through realistic parallax."
  },
  {
    id: "camera-pedestal-up",
    group: "镜头运动",
    label: "升降配合镜头",
    text: "The camera pedestals upward with small amplitude at slow speed while the primary camera movement continues smoothly."
  },
  {
    id: "camera-restrictions",
    group: "镜头运动",
    label: "禁止意外绕行",
    text: "The camera does not orbit, move sideways, change direction, or use a digital zoom; the viewpoint changes only through the specified physical camera path."
  },
  {
    id: "camera-pan-right",
    group: "镜头运动",
    label: "向右摇摄",
    text: "The camera pans right with small amplitude at slow speed, revealing the space beyond the subject."
  },
  {
    id: "camera-tracking",
    group: "镜头运动",
    label: "跟拍",
    text: "The camera uses a smooth tracking shot and follows the subject at a steady pace."
  },
  {
    id: "camera-static",
    group: "镜头运动",
    label: "固定镜头",
    text: "The camera holds a static shot while the subject performs the action."
  },
  {
    id: "shot-close-up",
    group: "景别构图",
    label: "切到近景",
    text: "The shot cuts to a close-up that keeps the subject's face and key expression clearly visible."
  },
  {
    id: "shot-wide",
    group: "景别构图",
    label: "展开广角",
    text: "The shot opens to a wide view that establishes the surrounding environment and spatial relationship."
  },
  {
    id: "shot-framing-progression",
    group: "景别构图",
    label: "连续景别变化",
    text: "The framing progresses continuously through a close-up, chest-up view, full-body view, and wide environmental composition; each change comes from physical camera movement rather than artificial subject shrinking."
  },
  {
    id: "motion-turn",
    group: "主体动作",
    label: "转向镜头",
    text: "The subject turns slowly toward the camera, moves naturally, and holds the final pose."
  },
  {
    id: "motion-breeze",
    group: "主体动作",
    label: "微风细节",
    text: "A light breeze moves the subject's hair and clothing with subtle, physically consistent motion."
  },
  {
    id: "sound-ambience",
    group: "声音",
    label: "环境声",
    text: "overall_soundscape: Natural ambient sound, subtle movement sounds, and quiet room tone appropriate to the scene."
  },
  {
    id: "sound-synchronized-action",
    group: "声音",
    label: "声音与画面同步",
    text: "Synchronize each diegetic sound with the visible action and environmental response that produces it."
  },
  {
    id: "sound-spatial-echo",
    group: "声音",
    label: "空间回声衰减",
    text: "The direct sound becomes quieter as the camera moves away; delayed reflections arrive from the left and then the right, becoming progressively quieter, darker, and more diffuse."
  },
  {
    id: "sound-no-music",
    group: "声音",
    label: "不要背景音乐",
    text: "non_diegetic_music: N/A"
  },
  {
    id: "dialogue-mandarin",
    group: "对白",
    label: "中文对白",
    text: "The speaker (S1) speaks Mandarin Chinese with a clear, natural voice and says exactly: <d>[Chinese] Write the exact original dialogue here.</d>"
  },
  {
    id: "dialogue-english",
    group: "对白",
    label: "英文对白与 ID",
    text: "The speaker (S1) uses a clear, natural English voice and says exactly: <d>[English] Write the exact spoken words here.</d>"
  },
  {
    id: "screen-text",
    group: "屏幕文字",
    label: "锁定画面文字",
    text: "Any visible sign, subtitle, label, or neon text reads exactly \"Write the original text here\"; preserve its original punctuation without translation."
  }
];

export function promptSnippetFor(id: string): string {
  return promptSnippets.find((snippet) => snippet.id === id)?.text ?? "";
}