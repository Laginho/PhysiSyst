export interface Camera {
  centerX: number
  centerY: number
  pixelsPerMeter: number
}

/** World meters visible across the canvas width, at any canvas size. */
export const VIEW_WIDTH_METERS = 15

/** Keeps the same world region on screen regardless of canvas size. */
export function pixelsPerMeterForWidth(width: number): number {
  return width / VIEW_WIDTH_METERS
}

export interface ScreenTransform {
  camera: Camera
  width: number
  height: number
}

export function makeTransform(camera: Camera, width: number, height: number): ScreenTransform {
  return { camera, width, height }
}

/** World (y-up, meters) -> screen (y-down, CSS px). */
export function worldToScreen(t: ScreenTransform, wx: number, wy: number): { x: number; y: number } {
  const { centerX, centerY, pixelsPerMeter } = t.camera
  return {
    x: t.width / 2 + (wx - centerX) * pixelsPerMeter,
    y: t.height / 2 - (wy - centerY) * pixelsPerMeter,
  }
}

/** Screen (y-down, CSS px) -> world (y-up, meters). Exact inverse of worldToScreen. */
export function screenToWorld(t: ScreenTransform, sx: number, sy: number): { x: number; y: number } {
  const { centerX, centerY, pixelsPerMeter } = t.camera
  return {
    x: centerX + (sx - t.width / 2) / pixelsPerMeter,
    y: centerY - (sy - t.height / 2) / pixelsPerMeter,
  }
}
