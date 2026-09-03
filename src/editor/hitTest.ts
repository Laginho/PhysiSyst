import type { Body, Vec2 } from '../scene'

/** World point -> body-LOCAL frame: inverse of translate(position)·rotate(rotation). */
function toLocal(body: Body, w: Vec2): Vec2 {
  const dx = w.x - body.position.x
  const dy = w.y - body.position.y
  const c = Math.cos(body.rotation)
  const s = Math.sin(body.rotation)
  return { x: c * dx + s * dy, y: -s * dx + c * dy }
}

/** Public inverse-transform for editor math (resize/α handle drag). */
export function worldToLocal(body: Body, w: Vec2): Vec2 {
  return toLocal(body, w)
}

export function pointInBody(body: Body, w: Vec2): boolean {
  const p = toLocal(body, w)
  switch (body.shape) {
    case 'rectangle':
      return Math.abs(p.x) <= body.width / 2 && Math.abs(p.y) <= body.height / 2
    case 'circle':
      return p.x * p.x + p.y * p.y <= body.radius * body.radius
    case 'triangle': {
      // Right triangle with vertices (0,0),(base,0),(base,h): inside the base
      // leg, inside the vertical leg at x=base, and BELOW the hypotenuse
      // y = (h/base)·x running from the α-corner at the origin.
      const h = body.base * Math.tan((body.alpha * Math.PI) / 180)
      return p.x >= 0 && p.x <= body.base && p.y >= 0 && p.y <= (h / body.base) * p.x
    }
  }
}

/**
 * Topmost body under a world point. Render order draws later array entries on
 * top, so hit-testing scans the array BACKWARD — topmost wins.
 */
export function bodyAtPoint(bodies: Body[], w: Vec2): Body | null {
  for (let i = bodies.length - 1; i >= 0; i--) {
    if (pointInBody(bodies[i], w)) return bodies[i]
  }
  return null
}
