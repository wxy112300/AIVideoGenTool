export interface PromptSnippet {
  id: string;
  group: string;
  label: string;
  text: string;
}

export const promptSnippets: readonly PromptSnippet[] = [
  {
    id: "camera-push-in",
    group: "镜头运动",
    label: "慢速推近",
    text: "The camera pushes in with small amplitude at slow speed toward the subject."
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
    id: "sound-no-music",
    group: "声音",
    label: "不要背景音乐",
    text: "non_diegetic_music: N/A"
  },
  {
    id: "dialogue-mandarin",
    group: "对白",
    label: "中文对白",
    text: "The speaker (S1) speaks Mandarin Chinese with a clear, natural voice and says exactly: <d>[Chinese] 在这里填写准确对白。</d>"
  }
];

export function promptSnippetFor(id: string): string {
  return promptSnippets.find((snippet) => snippet.id === id)?.text ?? "";
}