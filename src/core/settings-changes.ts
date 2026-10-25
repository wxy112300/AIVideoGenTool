import type { Settings } from "../types.js";
import { structurallyEqual } from "./structural-equal.js";

/** Appearance saves immediately and is not part of the pending form transaction. */
export function settingsChangedKeys(saved: Settings, draft: Settings | null): (keyof Settings)[] {
  if (!draft) return [];
  const keys = new Set([...Object.keys(saved), ...Object.keys(draft)] as (keyof Settings)[]);
  return [...keys].filter(key => key !== "appearance" && !structurallyEqual(saved[key], draft[key]));
}
