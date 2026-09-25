import type { Body, Constraint, Rope, Scene, TriangleGeometry, Vec2 } from './types'

export interface RopeSegment {
  from: Vec2
  to: Vec2
}

/** The part of the rope wrapped on one pulley. */
export interface RopeArc {
  center: Vec2
  radius: number
  /** Angle (rad, CCW from +x) of the point where the rope meets the pulley. */
  start: number
  /** Wrapped angle, rad, in [0, 2π). */
  sweep: number
  /** +1 counter-clockwise, −1 clockwise, following the rope from `a` to `b`. */
  direction: 1 | -1
}

export interface RopePath {
  /** Straight legs in order from `a` to `b`: one more than the arcs. */
  segments: RopeSegment[]
  arcs: RopeArc[]
  length: number
}

export interface PathPulley {
  center: Vec2
  radius: number
}

interface Node {
  center: Vec2
  /** Signed radius: +r wraps counter-clockwise, −r clockwise, 0 for an end point. */
  rho: number
}

/**
 * Pure rope geometry: straight segments tangent to each pulley plus the arc
 * wrapped on it. The wrap side is not stored anywhere — it follows the turn
 * the rope makes at each pulley (previous node → pulley → next node): a left
 * turn wraps counter-clockwise, a right turn clockwise.
 */
export function ropePath(a: Vec2, b: Vec2, pulleys: readonly PathPulley[]): RopePath {
  const centers = [a, ...pulleys.map((p) => p.center), b]
  const nodes: Node[] = centers.map((center, i) => {
    if (i === 0 || i === centers.length - 1) return { center, rho: 0 }
    const prev = centers[i - 1]!
    const next = centers[i + 1]!
    const turn = (center.x - prev.x) * (next.y - center.y) - (center.y - prev.y) * (next.x - center.x)
    return { center, rho: (turn >= 0 ? 1 : -1) * pulleys[i - 1]!.radius }
  })

  const segments: RopeSegment[] = []
  for (let i = 0; i + 1 < nodes.length; i++) segments.push(tangent(nodes[i]!, nodes[i + 1]!))

  const arcs: RopeArc[] = []
  let length = 0
  for (const s of segments) length += Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y)
  for (let i = 1; i + 1 < nodes.length; i++) {
    const { center, rho } = nodes[i]!
    const direction = rho >= 0 ? 1 : -1
    const radius = Math.abs(rho)
    const inPoint = segments[i - 1]!.to
    const outPoint = segments[i]!.from
    const start = Math.atan2(inPoint.y - center.y, inPoint.x - center.x)
    const end = Math.atan2(outPoint.y - center.y, outPoint.x - center.x)
    const turned = (direction * (end - start)) % (2 * Math.PI)
    const sweep = turned < 0 ? turned + 2 * Math.PI : turned
    arcs.push({ center, radius, start, sweep, direction })
    length += radius * sweep
  }
  return { segments, arcs, length }
}

/**
 * The straight leg leaving node `p` and arriving at node `q`. With the circle
 * of signed radius ρ on the left of travel for ρ > 0 (right for ρ < 0), both
 * tangent points are C − ρ·n for the leg's left normal n, which solves
 * n·(Cq − Cp) = ρq − ρp; the forward-travel root is taken.
 */
function tangent(p: Node, q: Node): RopeSegment {
  const dx = q.center.x - p.center.x
  const dy = q.center.y - p.center.y
  const d = Math.hypot(dx, dy)
  // An end inside a pulley has no tangent: clamp to the degenerate grazing leg.
  const ratio = d === 0 ? 0 : Math.max(-1, Math.min(1, (q.rho - p.rho) / d))
  const psi = Math.atan2(dy, dx) + Math.acos(ratio)
  const nx = Math.cos(psi)
  const ny = Math.sin(psi)
  return {
    from: { x: p.center.x - p.rho * nx, y: p.center.y - p.rho * ny },
    to: { x: q.center.x - q.rho * nx, y: q.center.y - q.rho * ny },
  }
}

/** A right triangle's vertical leg: base · tan(α). */
export function triangleHeight(body: Pick<TriangleGeometry, 'base' | 'alpha'>): number {
  return body.base * Math.tan((body.alpha * Math.PI) / 180)
}

/** A body's polygon vertices in its local, origin-relative frame, in order around the edge. A circle has none. */
export function localVertices(body: Body): Vec2[] {
  switch (body.shape) {
    case 'rectangle':
      return [
        { x: -body.width / 2, y: -body.height / 2 },
        { x: body.width / 2, y: -body.height / 2 },
        { x: body.width / 2, y: body.height / 2 },
        { x: -body.width / 2, y: body.height / 2 },
      ]
    case 'triangle':
      return [
        { x: 0, y: 0 },
        { x: body.base, y: 0 },
        { x: body.base, y: triangleHeight(body) },
      ]
    case 'circle':
      return []
  }
}

/** A body-local, origin-relative point in the world, at the body's pose. */
export function bodyPointToWorld(pose: Pick<Body, 'position' | 'rotation'>, anchor: Vec2): Vec2 {
  const c = Math.cos(pose.rotation)
  const s = Math.sin(pose.rotation)
  return { x: pose.position.x + anchor.x * c - anchor.y * s, y: pose.position.y + anchor.x * s + anchor.y * c }
}

/**
 * The rope's path at the poses the scene holds — the document's for L at
 * t = 0, or a playback view's for drawing. Null when a reference dangles.
 */
export function scenePath(scene: Scene, rope: Rope): RopePath | null {
  const bodies = new Map(scene.bodies.map((b) => [b.id, b]))
  const pulleys = new Map((scene.pulleys ?? []).map((p) => [p.id, p]))
  const endPoint = (end: Rope['a']): Vec2 | null => {
    const body = bodies.get(end.bodyId)
    return body ? bodyPointToWorld(body, end.anchor) : null
  }
  const a = endPoint(rope.a)
  const b = endPoint(rope.b)
  if (!a || !b) return null
  const via: PathPulley[] = []
  for (const id of rope.via) {
    const pulley = pulleys.get(id)
    const mount = pulley && bodies.get(pulley.bodyId)
    if (!pulley || !mount) return null
    via.push({ center: bodyPointToWorld(mount, pulley.anchor), radius: pulley.radius })
  }
  return ropePath(a, b, via)
}

/** A constraint touches a body when either end is on it, or it is a rope passing over a pulley mounted on it. */
export function constraintTouchesBody(scene: Scene, constraint: Constraint, bodyId: string): boolean {
  return (
    constraint.a.bodyId === bodyId ||
    constraint.b.bodyId === bodyId ||
    (constraint.kind === 'rope' &&
      constraint.via.some((pulleyId) => (scene.pulleys ?? []).some((pulley) => pulley.id === pulleyId && pulley.bodyId === bodyId)))
  )
}
