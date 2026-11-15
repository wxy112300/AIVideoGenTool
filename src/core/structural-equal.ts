function jsonScalar(value: unknown): unknown {
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  if (typeof value === "function" || typeof value === "symbol") return undefined;
  return value;
}

/** Equality for JSON-shaped application state, without sorting/copying whole trees. */
export function structurallyEqual(left: unknown, right: unknown): boolean {
  left = jsonScalar(left); right = jsonScalar(right);
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    for (let index = 0; index < left.length; index++) {
      const a = jsonScalar(left[index]), b = jsonScalar(right[index]);
      if (!structurallyEqual(a === undefined ? null : a, b === undefined ? null : b)) return false;
    }
    return true;
  }
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>;
  const keys = Object.keys(a).filter(key => jsonScalar(a[key]) !== undefined);
  if (keys.length !== Object.keys(b).filter(key => jsonScalar(b[key]) !== undefined).length) return false;
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(b, key) || !structurallyEqual(a[key], b[key])) return false;
  }
  return true;
}
