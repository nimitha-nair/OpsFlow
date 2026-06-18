export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 3;
export const ZOOM_STEP = 0.25;

/** Discrete zoom presets exposed in the viewer (50%–300%), per product spec. */
export const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3] as const;

function clamp(v: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, v));
}

/** Clamp an arbitrary zoom factor into the supported range. */
export function clampZoom(v: number): number {
  return clamp(Math.round(v * 100) / 100);
}

/**
 * Snap to the next/previous discrete preset relative to the current zoom. Used by
 * the +/- buttons so they step through the spec's 50/75/100/125/150/200/300 levels.
 */
export function snapZoom(current: number, direction: "in" | "out"): number {
  const eps = 1e-6;
  if (direction === "in") {
    const next = ZOOM_PRESETS.find((p) => p > current + eps);
    return next ?? ZOOM_PRESETS[ZOOM_PRESETS.length - 1]!;
  }
  const prev = [...ZOOM_PRESETS].reverse().find((p) => p < current - eps);
  return prev ?? ZOOM_PRESETS[0]!;
}

/** Continuous zoom (mouse-wheel): nudge by a fine delta, clamped. */
export function nudgeZoom(current: number, delta: number): number {
  return clampZoom(current + delta);
}

/** Legacy fixed-step zoom (kept for callers that want uniform steps). */
export function nextZoom(current: number, direction: "in" | "out"): number {
  const delta = direction === "in" ? ZOOM_STEP : -ZOOM_STEP;
  return clampZoom(current + delta);
}
