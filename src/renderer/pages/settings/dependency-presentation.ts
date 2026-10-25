import type { Settings } from "../../../types";
import { escapeHtml } from "../../shared/dom";
import { settingsText } from "./copy";
import { AETHERSCALE_NODE_ID, DLSS5_NODE_ID, KONOHAMARU_NODE_ID } from "../../../core/catalog";
import { gitInstallProgress } from "../../../core/dependency-install-progress";

export function renderDependencyInfo(text: string, infoIcon: string): string {
  return text ? `<span class="field-info settings-node-info" data-tooltip-toggle tabindex="0" aria-expanded="false" aria-label="${escapeHtml(text)}">${infoIcon}<span class="field-info-tip" role="tooltip">${escapeHtml(text)}</span></span>` : "";
}

/** The list still comes from the scan/catalog; unknown future entries stay visible. */
export function settingsNodeGroup(id: string): "video" | "upscale" | "prompt" | "general" {
  if (["flashvsr", "frame-interpolation", DLSS5_NODE_ID, AETHERSCALE_NODE_ID, KONOHAMARU_NODE_ID, "h3-latent-upscaler", "minimax-h3-learned-upscaler", "mmh3-ultimate-upscale"].includes(id)) return "upscale";
  if (["comfyui-multimodal-prompt-nodes", "comfyui-qwenvl-lora", "minimax-h3-prompt-writer"].includes(id)) return "prompt";
  if (["spectrum-minimax-h3", "h3-continuum", "local-video-studio-h3-av", "h3-motion-context", "plaguekind-h3-sla", "h3-sla-attention", "h3-memory-optimization", "h3-live-preview", "h3-sage-attention", "vram-debug"].includes(id)) return "video";
  return "general";
}

/** Active work owns a mounted log target before the first IPC line arrives. */
export function renderDependencyFeedback(locale: Settings["uiLocale"], id: string, log: string, active: boolean, showRail = true): string {
  if (!log && !active) return "";
  const title = escapeHtml(settingsText(locale, "nodes.installLog"));
  const pre = `<pre data-dependency-install-log="${escapeHtml(id)}">${escapeHtml(log)}</pre>`;
  const progress = gitInstallProgress(log);
  const rail = `<div class="settings-install-rail${progress ? " determinate" : ""}" data-dependency-install-rail="${escapeHtml(id)}" aria-hidden="true"><span${progress ? ` style="width:${progress.percent}%"` : ""}></span></div>`;
  return active
    ? `${showRail ? rail : ""}<div class="settings-install-console"><div class="settings-console-head"><span>${title}</span></div>${pre}</div>`
    : `<details class="node-log settings-completed-log"><summary>${title}</summary>${pre}</details>`;
}

/** Live output changes only the existing controls; focus and card layout stay mounted. */
export function updateDependencyGitProgress(id: string, log: string): void {
  const progress = gitInstallProgress(log);
  const button = document.querySelector<HTMLElement>(`[data-cancel-dependency-install="${CSS.escape(id)}"][data-install-active]`);
  if (button) {
    button.dataset.installPercent = progress ? String(progress.percent) : "indeterminate";
    button.style.setProperty("--dependency-progress", String(progress?.percent ?? 0));
    const label = button.querySelector<HTMLElement>(".node-running-label");
    if (label) {
      if (!label.dataset.installLabel) label.dataset.installLabel = label.textContent ?? "";
      label.textContent = progress ? `${progress.percent}%` : label.dataset.installLabel;
    }
    if (progress) button.setAttribute("title", `${progress.stage} · ${progress.percent}%`);
    else button.removeAttribute("title");
  }
  const rail = document.querySelector<HTMLElement>(`[data-dependency-install-rail="${CSS.escape(id)}"]`);
  if (rail) {
    rail.classList.toggle("determinate", Boolean(progress));
    const fill = rail.firstElementChild as HTMLElement | null;
    if (progress) fill?.style.setProperty("width", `${progress.percent}%`);
    else fill?.style.removeProperty("width");
  }
}
