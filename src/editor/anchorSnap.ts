import { bodyPointToWorld, type Body, type Vec2 } from '../scene'
import type { ScreenTransform } from '../render/transform'
import { worldToLocal } from './hitTest'

export const ANCHOR_SNAP_TOLERANCE_PX = 10

/**
 * Snap candidates in the body's local, origin-relative frame: center of mass,
 * face midpoints and vertices. A circle has no faces or vertices.
 */
function candidates(body: Body): Vec2[] {
  switch (body.shape) {
    case 'rectangle': {
      const w = body.width / 2
      const h = body.height / 2
      return [
        { x: 0, y: 0 },
        { x: w, y: 0 }, { x: -w, y: 0 }, { x: 0, y: h }, { x: 0, y: -h },
        { x: w, y: h }, { x: -w, y: h }, { x: w, y: -h }, { x: -w, y: -h },
      ]
    }
    case 'circle':
      return [{ x: 0, y: 0 }]
    case 'triangle': {
      const b = body.base
      const h = b * Math.tan((body.alpha * Math.PI) / 180)
      return [
        { x: (2 * b) / 3, y: h / 3 },
        { x: b / 2, y: 0 }, { x: b, y: h / 2 }, { x: b / 2, y: h / 2 },
        { x: 0, y: 0 }, { x: b, y: 0 }, { x: b, y: h },
      ]
    }
  }
}

/**
 * Anchor snap: the body-local anchor for a clicked or dragged world point —
 * the nearest candidate within the screen tolerance, else the point itself.
 */
export function anchorSnap(body: Body, world: Vec2, transform: ScreenTransform): Vec2 {
  let best: Vec2 | null = null
  let bestDistance = ANCHOR_SNAP_TOLERANCE_PX / transform.camera.pixelsPerMeter
  for (const local of candidates(body)) {
    const at = bodyPointToWorld(body, local)
    const distance = Math.hypot(at.x - world.x, at.y - world.y)
    if (distance <= bestDistance) {
      best = local
      bestDistance = distance
    }
  }
  return best ?? worldToLocal(body, world)
}
