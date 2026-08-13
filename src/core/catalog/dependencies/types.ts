export interface CatalogCustomNodeDefinition {
  id: string;
  name: string;
  purpose: string;
  repositoryUrl: string;
  directoryName: string;
  aliases: readonly string[];
  nodeTypes?: readonly string[];
  runtimeEndpoint?: string;
  minimumVersion?: string;
  recommendedVersion?: string;
  /** Python-side runtime requirement when the node package's own version is not the constraint. */
  runtimeRequirement?: string;
  required: boolean;
}

export type CatalogWorkflowDependencyId = "minimax_h3_i2v" | "qwen36_h3_prompt_enhancer";

export interface CatalogWorkflowDependencyDefinition {
  id: CatalogWorkflowDependencyId;
  name: string;
  purpose: string;
  sourceUrl: string;
  targetSegments: readonly string[];
}
