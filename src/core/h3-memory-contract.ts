export interface H3MemoryRuntimeContractOptions {
  precisionMode: "Auto" | "Preserve native" | "Force quant";
  chunkRows: number;
}

function inputSpecFor(node: unknown, inputName: string): unknown {
  if (!node || typeof node !== "object" || Array.isArray(node)) return undefined;
  const input = (node as { input?: unknown }).input;
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  for (const groupName of ["required", "optional", "hidden"] as const) {
    const group = (input as Record<string, unknown>)[groupName];
    if (!group || typeof group !== "object" || Array.isArray(group)) continue;
    const spec = (group as Record<string, unknown>)[inputName];
    if (spec !== undefined) return spec;
  }
  return undefined;
}

function comboOptionsFromSpec(spec: unknown): string[] {
  if (Array.isArray(spec)) {
    if (Array.isArray(spec[0])) {
      return spec[0].filter((value): value is string => typeof value === "string");
    }
    const config = spec[1];
    if (config && typeof config === "object" && !Array.isArray(config)) {
      for (const key of ["options", "choices", "values"] as const) {
        const values = (config as Record<string, unknown>)[key];
        if (Array.isArray(values)) {
          return values.filter((value): value is string => typeof value === "string");
        }
      }
    }
  }
  if (spec && typeof spec === "object" && !Array.isArray(spec)) {
    for (const key of ["options", "choices", "values"] as const) {
      const values = (spec as Record<string, unknown>)[key];
      if (Array.isArray(values)) {
        return values.filter((value): value is string => typeof value === "string");
      }
    }
  }
  return [];
}

function acceptsModel(spec: unknown): boolean {
  if (spec === "MODEL") return true;
  if (Array.isArray(spec)) return spec[0] === "MODEL";
  if (!spec || typeof spec !== "object") return false;
  const type = (spec as Record<string, unknown>).type;
  return type === "MODEL";
}

function acceptsInteger(spec: unknown, value: number): boolean {
  if (Array.isArray(spec) && Array.isArray(spec[0])) {
    return spec[0].some((candidate) => candidate === value);
  }
  const kind = Array.isArray(spec) ? spec[0] : undefined;
  const config = Array.isArray(spec) && spec[1] && typeof spec[1] === "object" && !Array.isArray(spec[1])
    ? spec[1] as Record<string, unknown>
    : spec && typeof spec === "object" && !Array.isArray(spec)
      ? spec as Record<string, unknown>
      : undefined;
  if (kind !== "INT" && config?.type !== "INT") return false;
  const minimum = typeof config?.min === "number" ? config.min : undefined;
  const maximum = typeof config?.max === "number" ? config.max : undefined;
  const step = typeof config?.step === "number" ? config.step : undefined;
  const anchor = typeof config?.default === "number" ? config.default : minimum;
  if (minimum !== undefined && value < minimum) return false;
  if (maximum !== undefined && value > maximum) return false;
  if (step && anchor !== undefined && Math.abs((value - anchor) / step - Math.round((value - anchor) / step)) > 1e-9) {
    return false;
  }
  return true;
}

export function h3MemoryOptimizationInputNames(
  objectInfo: unknown
): Set<string> | null {
  if (!objectInfo || typeof objectInfo !== "object" || Array.isArray(objectInfo)) return null;
  const node = (objectInfo as Record<string, unknown>).H3MemoryOptimization;
  if (!node || typeof node !== "object" || Array.isArray(node)) return null;
  const input = (node as { input?: unknown }).input;
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const names = new Set<string>();
  for (const groupName of ["required", "optional", "hidden"] as const) {
    const group = (input as Record<string, unknown>)[groupName];
    if (!group || typeof group !== "object" || Array.isArray(group)) continue;
    for (const name of Object.keys(group as Record<string, unknown>)) names.add(name);
  }
  return names;
}

export function h3MemoryOptimizationRuntimeIssues(
  objectInfo: unknown,
  options: H3MemoryRuntimeContractOptions
): string[] {
  if (!objectInfo || typeof objectInfo !== "object" || Array.isArray(objectInfo)) {
    return ["/object_info 响应无效"];
  }
  const node = (objectInfo as Record<string, unknown>).H3MemoryOptimization;
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    return ["未注册 H3MemoryOptimization"];
  }
  const issues: string[] = [];
  const model = inputSpecFor(node, "model");
  if (model === undefined) issues.push("缺少 model input");
  else if (!acceptsModel(model)) issues.push("model 不接受 MODEL");
  const mlp = inputSpecFor(node, "mlp_memory");
  if (!comboOptionsFromSpec(mlp).includes("auto")) issues.push("mlp_memory 缺少 auto");
  const chunkRows = inputSpecFor(node, "chunk_rows");
  if (chunkRows === undefined || !acceptsInteger(chunkRows, options.chunkRows)) {
    issues.push(`chunk_rows 不接受 ${options.chunkRows}`);
  }
  const precision = inputSpecFor(node, "precision_mode");
  if (!comboOptionsFromSpec(precision).includes(options.precisionMode)) {
    issues.push(`precision_mode 缺少 ${options.precisionMode}`);
  }
  const streaming = inputSpecFor(node, "qkv_streaming_mode");
  if (!comboOptionsFromSpec(streaming).includes("Auto")) {
    issues.push("qkv_streaming_mode 缺少 Auto");
  }
  const limiter = (objectInfo as Record<string, unknown>).H3AIMDOResidencyLimiter;
  if (!limiter || typeof limiter !== "object" || Array.isArray(limiter)) {
    issues.push("未注册 H3AIMDOResidencyLimiter");
  } else {
    const limiterModel = inputSpecFor(limiter, "model");
    if (limiterModel === undefined) issues.push("H3AIMDOResidencyLimiter 缺少 model input");
    else if (!acceptsModel(limiterModel)) issues.push("H3AIMDOResidencyLimiter model 不接受 MODEL");
    const residency = inputSpecFor(limiter, "residency");
    if (!comboOptionsFromSpec(residency).includes("2 blocks")) {
      issues.push("H3AIMDOResidencyLimiter residency 缺少 2 blocks");
    }
  }
  return issues;
}
