import { bodyPointToWorld, type Body, type Scene, type Vec2 } from '../scene'

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

/** Move the proposed body to the nearest eligible spring or pulley-free rope axis. */
export function bodyOrientationSnap(doc: Scene, proposed: Body, pixelsPerMeter: number): { body: Body; guide: OrientationSnap | null } {
  let best: OrientationSnap | null = null
  let bestDistance = Infinity
  for (const constraint of doc.constraints ?? []) {
    if (constraint.kind === 'rope' && constraint.via.length > 0) continue
    const mine = constraint.a.bodyId === proposed.id ? constraint.a : constraint.b.bodyId === proposed.id ? constraint.b : null
    if (!mine) continue
    const other = mine === constraint.a ? constraint.b : constraint.a
    if (other.bodyId === proposed.id) continue
    const otherBody = doc.bodies.find(body => body.id === other.bodyId)
    if (!otherBody) continue
    const guide = snapOrientation(bodyPointToWorld(proposed, mine.anchor), bodyPointToWorld(otherBody, other.anchor), pixelsPerMeter)
    if (!guide) continue
    const distance = Math.hypot(guide.delta.x, guide.delta.y)
    if (distance < bestDistance) {
      best = guide
      bestDistance = distance
    }
  }
  return best ? {
    body: { ...proposed, position: { x: proposed.position.x + best.delta.x, y: proposed.position.y + best.delta.y } },
    guide: best,
  } : { body: proposed, guide: null }
}
