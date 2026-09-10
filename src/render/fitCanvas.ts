export const CANVAS_ASPECT = 3 / 2
export const CANVAS_MIN_WIDTH = 600

/** Largest 3:2 box that fits inside the container, never narrower than the floor. */
export function fitCanvas(containerWidth: number, containerHeight: number): { width: number; height: number } {
  const width = Math.max(CANVAS_MIN_WIDTH, Math.min(containerWidth, containerHeight * CANVAS_ASPECT))
  return { width, height: width / CANVAS_ASPECT }
}
