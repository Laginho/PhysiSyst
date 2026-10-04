import type { Vec2 } from '../scene'

export const ORIENTATION_SNAP_TOLERANCE_PX = 10
export type Axis = 'vertical' | 'horizontal'

export interface OrientationSnap {
  axis: Axis
  through: Vec2
  delta: Vec2
}

/** Align a segment to the axis through its other end, within a screen tolerance. */
export function snapOrientation(moving: Vec2, other: Vec2, pixelsPerMeter: number): OrientationSnap | null {
  const dx = moving.x - other.x
  const dy = moving.y - other.y
  const tolerance = ORIENTATION_SNAP_TOLERANCE_PX / pixelsPerMeter
  if (Math.hypot(dx, dy) <= tolerance) return null
  if (Math.abs(dx) <= tolerance && Math.abs(dx) <= Math.abs(dy))
    return { axis: 'vertical', through: other, delta: { x: -dx, y: 0 } }
  if (Math.abs(dy) <= tolerance)
    return { axis: 'horizontal', through: other, delta: { x: 0, y: -dy } }
  return null
}
