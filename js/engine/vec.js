// Tiny math helpers — no allocation in hot paths where avoidable.
export const TAU = Math.PI * 2;
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
export const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
export const angle = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
export const sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);
// circle-vs-circle overlap
export const hit = (ax, ay, ar, bx, by, br) => dist2(ax, ay, bx, by) <= (ar + br) * (ar + br);
// approach a value toward target by a max step (frame-rate independent via dt baked by caller)
export const approach = (v, target, step) => {
  if (v < target) return Math.min(v + step, target);
  if (v > target) return Math.max(v - step, target);
  return v;
};
