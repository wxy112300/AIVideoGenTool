import type { CatalogModelComponent, CatalogModelEntry } from "../../types.js";
import { H3_MAX_DURATION_SECONDS, H3_MAX_GENERATED_FRAMES } from "../../../h3-temporal.js";
import { H3_BASE_RESOLUTIONS, H3_CUSTOM_RESOLUTION_RANGE } from "../../../video-resolution.js";
import {
  h3Fl2vaAudioVae,
  h3Fl2vaInt8Model,
  h3Fl2vaVideoVae,
  h3Int8ConvRotVideoVae,
  h3Nvfp4TextEncoder
} from "../minimax_h3_shared.js";

export const PI_H3_MODEL_ID = "minimax_h3_pi";
export const PI_H3_WORKFLOW_FILENAME = "minimax_h3_pi_dwd_api.json";
export const PI_H3_MINIMUM_COMFY_VERSION = "0.45.0";
export const PI_H3_NODE_ID = "comfyui-piflow";
export const PI_H3_NODE_REVISION = "e0ca46f7a7dcd080d8ab1d759719e8bc046617f0";
export const PI_H3_NODE_TYPES = ["Load LakonLab Adapter", "pi-Flow Scheduler", "DWD Decode"] as const;

const adapterRevision = "4a864589b0fac3d14768f932c930c4dcf1a17b56";
export const PI_H3_ADAPTERS = {
  2: "pi_h3_2step_dwd_adapter_int8_convrot.safetensors",
  4: "pi_h3_4step_dwd_adapter_int8_convrot.safetensors"
} as const;

function adapterComponent(steps: keyof typeof PI_H3_ADAPTERS, sha256: string): CatalogModelComponent {
  const filename = PI_H3_ADAPTERS[steps];
  return {
    label: `Pi-H3 DWD · ${steps} steps`,
    expected: `loras/${filename}`,
    patterns: [new RegExp(`(?:^|/)loras/${filename.replace(".", "\\.")}$`, "i")],
    alternativeGroup: "pi-h3-dwd",
    installGuide: {
      sourceLabel: "Lakonik / pi-H3",
      downloadUrl: `https://huggingface.co/Lakonik/pi-H3/resolve/${adapterRevision}/${filename}`,
      targetSubdirectory: "loras",
      recommendedFilename: filename,
      revision: adapterRevision,
      bytes: 2_192_176_240,
      sha256,
      license: "minimax-h3-community-license-agreement"
    }
  };
}

const name = "MiniMax H3 · Pi-H3";
export const minimaxH3Pi: CatalogModelEntry = {
  definition: {
    id: PI_H3_MODEL_ID,
    family: "minimax-h3",
    variant: "fl2va",
    category: "video",
    adapterId: "minimax-h3",
    promptPackId: "h3",
    order: 95,
    inputModes: ["image"],
    capabilities: {
      supportsEndFrame: true,
      supportsLivePreview: false,
      maxDurationSeconds: H3_MAX_DURATION_SECONDS,
      maxGeneratedFrames: H3_MAX_GENERATED_FRAMES,
      resolutions: H3_BASE_RESOLUTIONS,
      customResolution: H3_CUSTOM_RESOLUTION_RANGE,
      generationSteps: [2, 4],
      defaultGenerationSteps: 4,
      maxGenerationSteps: 4
    },
    scan: {
      integrated: true,
      vram: "FL2VA INT8 · DWD",
      minimumComfyVersion: PI_H3_MINIMUM_COMFY_VERSION,
      requiredCustomNodeIds: [PI_H3_NODE_ID],
      runtimeNodeTypes: [...PI_H3_NODE_TYPES, "MiniMaxH3ImageToVideo", "MiniMaxH3SigmaShift"],
      components: [
        h3Fl2vaInt8Model, h3Nvfp4TextEncoder, h3Fl2vaVideoVae, h3Int8ConvRotVideoVae, h3Fl2vaAudioVae,
        adapterComponent(2, "ef98527409eee4eaec8183265f4ee22d265680524237fae7149dbc203e11e739"),
        adapterComponent(4, "a2fa1caae2cd4a12f85cc3eccd2a360fe9dabf430623d47deca619605e96ee6d")
      ]
    }
  },
  locales: {
    "zh-CN": { name, shortName: name, badge: "H3 · FL2VA", description: "H3 快速生成版，2 或 4 步直接生成画面，省去视频 VAE 解码。支持首尾帧和同步音频。" },
    "zh-TW": { name, shortName: name, badge: "H3 · FL2VA", description: "H3 快速生成版，2 或 4 步直接生成畫面，省去影片 VAE 解碼。支援首尾影格與同步音訊。" },
    "en-US": { name, shortName: name, badge: "H3 · FL2VA", description: "Fast H3 generation in 2 or 4 steps, skipping video VAE decoding. Supports first and last frames and synchronized audio." }
  }
};
