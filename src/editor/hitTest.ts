import {
  bodyPointToWorld,
  scenePath,
  triangleHeight,
  type Body,
  type Pulley,
  type Rope,
  type Scene,
  type Spring,
  type Vec2,
} from '../scene'
import { closestPoint } from './contactSnap'

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
      const h = triangleHeight(body)
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

function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const q = closestPoint(p, a, b)
  return Math.hypot(p.x - q.x, p.y - q.y)
}

/** Axle grab radius: the drawn 3 px axle dot plus a margin (PHY-37). */
export const AXLE_HIT_RADIUS_PX = 5

/**
 * Topmost pulley whose circle holds a world point, at the poses the scene
 * holds. Over its own mount body the pulley only takes points within
 * `axleTolerance` meters of its axle, so a body the disk covers stays
 * clickable (PHY-37).
 */
export function pulleyAtPoint(scene: Scene, w: Vec2, axleTolerance: number): Pulley | null {
  const bodies = new Map(scene.bodies.map((b) => [b.id, b]))
  const pulleys = scene.pulleys ?? []
  for (let i = pulleys.length - 1; i >= 0; i--) {
    const p = pulleys[i]
    const mount = bodies.get(p.bodyId)
    if (!mount) continue
    const c = bodyPointToWorld(mount, p.anchor)
    const d = Math.hypot(w.x - c.x, w.y - c.y)
    if (d <= p.radius && (d <= axleTolerance || !pointInBody(mount, w))) return p
  }
  return null
}

/**
 * Topmost rope with a straight leg within `tolerance` meters of a world point.
 * The arcs are not tested: they lie on the pulley, which is hit first.
 */
export function ropeAtPoint(scene: Scene, w: Vec2, tolerance: number): Rope | null {
  const constraints = scene.constraints ?? []
  for (let i = constraints.length - 1; i >= 0; i--) {
    const c = constraints[i]
    if (c.kind !== 'rope') continue
    const path = scenePath(scene, c)
    if (path?.segments.some((s) => distanceToSegment(w, s.from, s.to) <= tolerance)) return c
  }
  return null
}

/**
 * Topmost spring whose anchor-to-anchor segment passes within `tolerance`
 * meters of a world point, at the poses the scene holds. Ropes are not hit.
 */
export function springAtPoint(scene: Scene, w: Vec2, tolerance: number): Spring | null {
  const bodies = new Map(scene.bodies.map((b) => [b.id, b]))
  const constraints = scene.constraints ?? []
  for (let i = constraints.length - 1; i >= 0; i--) {
    const c = constraints[i]
    if (c.kind !== 'spring') continue
    const a = bodies.get(c.a.bodyId)
    const b = bodies.get(c.b.bodyId)
    if (a && b && distanceToSegment(w, bodyPointToWorld(a, c.a.anchor), bodyPointToWorld(b, c.b.anchor)) <= tolerance) return c
  }
  return null
}
