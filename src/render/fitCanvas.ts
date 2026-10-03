export const CANVAS_ASPECT = 3 / 2
export const CANVAS_MIN_WIDTH = 600

/** Automatic 3:2 fit keeps its 600px floor; a user preference may shrink it to 402px. */
export function fitCanvas(containerWidth: number, containerHeight: number, userWidth: number | null = null): { width: number; height: number } {
  const raw = Math.max(CANVAS_MIN_WIDTH, Math.min(containerWidth, containerHeight * CANVAS_ASPECT))
  // Containers measure fractional (any browser zoom, any flex leftover). Snapping
  // to a multiple of 3 keeps BOTH axes whole at an exact 3:2, so the DPR backing
  // store lands on real device pixels instead of a blurry resample.
  const auto = Math.round(raw / 3) * 3
  const width = userWidth === null ? auto : Math.round(Math.max(402, Math.min(userWidth, auto)) / 3) * 3
  return { width, height: width / CANVAS_ASPECT }
}
