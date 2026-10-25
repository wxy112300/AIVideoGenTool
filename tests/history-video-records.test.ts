// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { createTranslator } from "../src/core/i18n";
import { videoLoraRecords, videoPerformance, videoRecordStats } from "../src/renderer/pages/history/video-records";
import type { HistoryPageOptions } from "../src/renderer/pages/history/page";
import type { Draft, TaskPerformanceStats } from "../src/types";

const t = createTranslator("en-US").t;
const o = { t, escapeHtml: (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;"), formatBytes: (v: number) => `${v} B`, videoLoraPurposeLabel: vi.fn(() => "purpose") } as unknown as HistoryPageOptions;

it("keeps unknown statistics unknown and bounds decorative meters to real snapshot values", () => {
  const stats = { vramPeakBytes: 200, vramTotalBytes: 100, memoryPeakBytes: 40, memoryTotalBytes: 100, memoryAverageBytes: 30, gpuAveragePercent: null, gpuPeakPercent: null, cpuAveragePercent: 10, cpuPeakPercent: 20, gpuTemperaturePeak: 85, sampleCount: 5, gpuSampleCount: 3, durationSeconds: 1 } as TaskPerformanceStats;
  const root = document.createElement("div"); root.innerHTML = videoPerformance(stats, o);
  const rows = root.querySelectorAll(".history-record-meters > div");
  expect(rows[0]!.textContent).toContain("200 B / 100 B");
  expect(rows[0]!.querySelector<HTMLElement>("i")!.style.width).toBe("100%");
  expect(rows[2]!.textContent).not.toContain("0%");
  expect(root.querySelector("details")!.open).toBe(false);
  expect(root.querySelector(".warning")?.textContent).toBe("");
  expect(root.textContent).toContain("85°C");
  expect(root.querySelector(".history-performance-duration")?.textContent).toContain("0:01");
  expect(videoPerformance(undefined, o)).not.toContain("history-record-meters");
});

it("retains actual LoRA strength and leaves old unsaved strength blank", () => {
  const rows = [{ name: "Camera", strength: .8, purpose: "camera", filename: "camera.safetensors", modelFamily: "h3" }, { name: "Legacy", historyOnly: true }] as Draft["videoLoras"];
  const root = document.createElement("div"); root.innerHTML = videoLoraRecords(rows, o);
  const values = [...root.querySelectorAll("b")].map(e => e.textContent);
  expect(values).toEqual(["0.80", "—"]);
  expect(root.querySelector<HTMLElement>("i")!.style.width).toBe("40%");
  expect(root.querySelector("[title]")?.getAttribute("title")).toContain("camera.safetensors");
});

it("escapes snapshot values in compact statistic tiles", () => {
  const html = videoRecordStats([["Seed", '<img src=x onerror="bad()">']], o);
  const root = document.createElement("div"); root.innerHTML = html;
  expect(root.querySelector("img")).toBeNull();
  expect(root.querySelector("b")!.textContent).toContain("<img");
});
