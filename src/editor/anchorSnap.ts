import { bodyPointToWorld, localVertices, type Body, type Vec2 } from '../scene'
import type { ScreenTransform } from '../render/transform'
import { nearestWithin } from './handles'
import { worldToLocal } from './hitTest'

export const ANCHOR_SNAP_TOLERANCE_PX = 10

/**
 * Snap candidates in the body's local, origin-relative frame: center of mass,
 * face midpoints and vertices. A circle has no faces or vertices.
 */
function candidates(body: Body): Vec2[] {
  const vertices = localVertices(body)
  if (vertices.length === 0) return [{ x: 0, y: 0 }]
  const n = vertices.length
  const center = {
    x: vertices.reduce((sum, v) => sum + v.x, 0) / n,
    y: vertices.reduce((sum, v) => sum + v.y, 0) / n,
  }
  const midpoints = vertices.map((a, i) => {
    const b = vertices[(i + 1) % n]!
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  })
  return [center, ...midpoints, ...vertices]
}

/**
 * Anchor snap: the body-local anchor for a clicked or dragged world point —
 * the nearest candidate within the screen tolerance, else the point itself.
 */
export function anchorSnap(body: Body, world: Vec2, transform: ScreenTransform): Vec2 {
  const best = nearestWithin(
    candidates(body),
    (local) => {
      const at = bodyPointToWorld(body, local)
      return Math.hypot(at.x - world.x, at.y - world.y)
    },
    ANCHOR_SNAP_TOLERANCE_PX / transform.camera.pixelsPerMeter,
  )
  return best ?? worldToLocal(body, world)
}
