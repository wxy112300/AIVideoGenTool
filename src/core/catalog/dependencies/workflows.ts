import type {
  CatalogWorkflowDependencyDefinition,
  CatalogWorkflowDependencyId
} from "./types.js";

export const workflowDependencyCatalog: readonly CatalogWorkflowDependencyDefinition[] = [{
  id: "minimax_h3_i2v",
  name: "MiniMax H3 Image-to-Video 官方工作流",
  purpose: "安装到 ComfyUI 用户工作流目录，可在 ComfyUI 中打开并导出 API 格式。",
  sourceUrl: "https://raw.githubusercontent.com/Comfy-Org/workflow_templates/main/templates/video_minimax_h3_i2v.json",
  targetSegments: ["user", "default", "workflows", "video_minimax_h3_i2v.json"]
}];

export function workflowDependencyDefinition(
  id: CatalogWorkflowDependencyId
): CatalogWorkflowDependencyDefinition | undefined {
  return workflowDependencyCatalog.find((definition) => definition.id === id);
}
