/**
 * Metadata shipped with the app for the pinned Depth Anything V2 Small
 * adapter. The model weight remains user-managed; these small JSON files are
 * runtime metadata and must never be presented as downloadable model assets.
 */

export const DEPTH_ANYTHING_V2_SMALL_METADATA_RELATIVE_DIRECTORY =
  "assets/depth-anything-v2-small" as const;

export const DEPTH_ANYTHING_V2_SMALL_CONFIG = {
  _commit_hash: null,
  architectures: ["DepthAnythingForDepthEstimation"],
  backbone: null,
  backbone_config: {
    architectures: ["Dinov2Model"],
    hidden_size: 384,
    image_size: 518,
    model_type: "dinov2",
    num_attention_heads: 6,
    out_features: ["stage3", "stage6", "stage9", "stage12"],
    out_indices: [3, 6, 9, 12],
    patch_size: 14,
    reshape_hidden_states: false,
    torch_dtype: "float32"
  },
  fusion_hidden_size: 64,
  head_hidden_size: 32,
  head_in_index: -1,
  initializer_range: 0.02,
  model_type: "depth_anything",
  neck_hidden_sizes: [48, 96, 192, 384],
  patch_size: 14,
  reassemble_factors: [4, 2, 1, 0.5],
  reassemble_hidden_size: 384,
  torch_dtype: "float32",
  transformers_version: null,
  use_pretrained_backbone: false
} as const;

export const DEPTH_ANYTHING_V2_SMALL_PREPROCESSOR_CONFIG = {
  _valid_processor_keys: [
    "images",
    "do_resize",
    "size",
    "keep_aspect_ratio",
    "ensure_multiple_of",
    "resample",
    "do_rescale",
    "rescale_factor",
    "do_normalize",
    "image_mean",
    "image_std",
    "do_pad",
    "size_divisor",
    "return_tensors",
    "data_format",
    "input_data_format"
  ],
  do_normalize: true,
  do_pad: false,
  do_rescale: true,
  do_resize: true,
  ensure_multiple_of: 14,
  image_mean: [0.485, 0.456, 0.406],
  image_processor_type: "DPTImageProcessor",
  image_std: [0.229, 0.224, 0.225],
  keep_aspect_ratio: true,
  resample: 3,
  rescale_factor: 0.00392156862745098,
  size: {
    height: 518,
    width: 518
  },
  size_divisor: null
} as const;

export function depthAnythingBuiltinMetadataFile(filename: string): string {
  const value = filename === "config.json"
    ? DEPTH_ANYTHING_V2_SMALL_CONFIG
    : filename === "preprocessor_config.json"
      ? DEPTH_ANYTHING_V2_SMALL_PREPROCESSOR_CONFIG
      : undefined;
  if (!value) throw new Error(`未知的 Depth Anything 内置元数据文件：${filename}`);
  return `${JSON.stringify(value, null, 2)}\n`;
}
