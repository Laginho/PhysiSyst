export const CANVAS_ASPECT = 3 / 2
export const CANVAS_MIN_WIDTH = 600

/** Largest 3:2 box that fits inside the container, never narrower than the floor. */
export function fitCanvas(containerWidth: number, containerHeight: number): { width: number; height: number } {
  const raw = Math.max(CANVAS_MIN_WIDTH, Math.min(containerWidth, containerHeight * CANVAS_ASPECT))
  // Containers measure fractional (any browser zoom, any flex leftover). Snapping
  // to a multiple of 3 keeps BOTH axes whole at an exact 3:2, so the DPR backing
  // store lands on real device pixels instead of a blurry resample.
  const width = Math.round(raw / 3) * 3
  return { width, height: width / CANVAS_ASPECT }
}
