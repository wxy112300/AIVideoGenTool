export interface H3PromptTemplate {
  text: string;
  shotCount: number;
}

export function createH3PromptTemplate(
  currentPrompt: string,
  durationSeconds: number
): H3PromptTemplate {
  const shotCount = durationSeconds > 10 ? 3 : durationSeconds > 5 ? 2 : 1;
  const current = currentPrompt.trim();
  const text = [
    `整体画面：${current || "描述主体、环境、视觉风格、光线与需要保留的画面元素。"}`,
    ...Array.from({ length: shotCount }, (_, index) =>
      `SHOT ${index + 1}：${index === 0 ? "描述开场动作、构图和镜头运动。" : "描述接下来的动作、景别变化和自然转场。"}`
    ),
    "Audio：描述对白、环境声、音效和音乐；不需要的声音请明确写出。"
  ].join("\n");

  return { text, shotCount };
}
