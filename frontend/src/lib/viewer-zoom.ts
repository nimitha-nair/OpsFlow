export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 4;
export const ZOOM_STEP = 0.25;

function clamp(v: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, v));
}

/** Next zoom factor when zooming in/out, clamped to [ZOOM_MIN, ZOOM_MAX]. */
export function nextZoom(current: number, direction: "in" | "out"): number {
  const delta = direction === "in" ? ZOOM_STEP : -ZOOM_STEP;
  return clamp(Math.round((current + delta) * 100) / 100);
}
