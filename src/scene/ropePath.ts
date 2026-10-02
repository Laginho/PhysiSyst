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
  /**
   * Wrapped angle, rad. In [0, 2π) without history. With history (PHY-54) it is
   * the unwound sweep: it may pass 2π, and a negative one means the rope has come
   * loose from the pulley, which then sits as a joint on a straight leg.
   */
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
 * wrapped on it. The wrap side follows the turn the rope makes at each pulley
 * (previous node → pulley → next node): a left turn wraps counter-clockwise, a
 * right turn clockwise. With `keep` (one direction per pulley) a pulley holds
 * the given direction instead, so a swing that flips the turn's sign does not
 * flip the wrap. Never yielding is deliberate: the two wraps only have the same
 * length when the ends and the center are collinear, so any other switch jumps
 * the length.
 *
 * With `sweeps` (PHY-54), `sweeps[i]` is pulley `i`'s unwound sweep from the
 * previous reading. The new one is that plus the wrapped change, so it does not
 * jump at the 0/2π seam: it passes 2π when the rope winds on, and goes negative
 * when the rope leaves the pulley. A pulley with a negative sweep is loose: the
 * path is the straight leg between its neighbours and the pulley is a joint on
 * it, pulling nothing. A pulley whose entry is `undefined` has no history and
 * behaves as without `sweeps`.
 */
export function ropePath(
  a: Vec2,
  b: Vec2,
  pulleys: readonly PathPulley[],
  keep?: readonly (1 | -1)[],
  sweeps?: readonly (number | undefined)[],
): RopePath {
  const centers = [a, ...pulleys.map((p) => p.center), b]
  const directions = pulleys.map((p, i): 1 | -1 => {
    const prev = centers[i]!
    const next = centers[i + 2]!
    const turn = (p.center.x - prev.x) * (next.y - p.center.y) - (p.center.y - prev.y) * (next.x - p.center.x)
    return keep?.[i] ?? (turn >= 0 ? 1 : -1)
  })
  if (!sweeps?.some((sweep) => sweep !== undefined)) return build(centers, pulleys, directions)
  return release(a, b, pulleys, directions, sweeps)
}

export function wrapAngle(angle: number): number {
  return angle - 2 * Math.PI * Math.round(angle / (2 * Math.PI))
}

/**
 * The path with history: finds which pulleys the rope is on, builds it over
 * those, and puts the others on the straight legs as joints. A pulley leaves
 * the set when its unwound sweep over the set goes negative, and joins it when
 * its sweep measured over the set plus itself is not; one change per pass, and
 * the pass count is capped in case a degenerate scene makes the answer cycle.
 */
function release(
  a: Vec2,
  b: Vec2,
  pulleys: readonly PathPulley[],
  directions: readonly (1 | -1)[],
  history: readonly (number | undefined)[],
): RopePath {
  const on = pulleys.map((_, i) => history[i] === undefined || history[i]! >= 0)
  const over = (set: readonly boolean[]) => {
    const idx = pulleys.flatMap((_, i) => (set[i] ? [i] : []))
    const path = build(
      [a, ...idx.map((i) => pulleys[i]!.center), b],
      idx.map((i) => pulleys[i]!),
      idx.map((i) => directions[i]!),
    )
    // The previous sweep is the reference branch; a pulley with none reads the raw sweep.
    const sweeps = idx.map((i, k) => {
      const raw = path.arcs[k]!.sweep
      const before = history[i]
      return before === undefined ? raw : before + wrapAngle(raw - before)
    })
    return { idx, path, sweeps }
  }
  const measure = (set: readonly boolean[], i: number): number => {
    const { idx, sweeps } = over(set.map((x, j) => x || j === i))
    return sweeps[idx.indexOf(i)]!
  }
  for (let pass = 0; pass <= 2 * pulleys.length; pass++) {
    const { idx, sweeps } = over(on)
    const out = idx.find((_, k) => sweeps[k]! < 0)
    if (out !== undefined) {
      on[out] = false
      continue
    }
    const back = pulleys.findIndex((_, i) => !on[i] && measure(on, i) >= 0)
    if (back < 0) break
    on[back] = true
  }
  const { idx, path, sweeps } = over(on)
  const sweep = pulleys.map((_, i) => (on[i] ? sweeps[idx.indexOf(i)]! : measure(on, i)))

  // Each leg of the path over the engaged pulleys takes the loose ones between its ends as joints,
  // the k-th of n at t = k/(n + 1) in `via` order whatever the centers: the joint does no work, and
  // this keeps the segments collinear, the same way on, and each at least 1/(n + 1) of the leg.
  const segments: RopeSegment[] = []
  const arcs: RopeArc[] = []
  let length = 0
  for (let leg = 0; leg <= idx.length; leg++) {
    const { from, to } = path.segments[leg]!
    const first = leg === 0 ? 0 : idx[leg - 1]! + 1
    const last = leg === idx.length ? pulleys.length : idx[leg]!
    let at = from
    for (let i = first; i < last; i++) {
      const { center, radius } = pulleys[i]!
      const t = (i - first + 1) / (last - first + 1)
      const joint = { x: from.x + t * (to.x - from.x), y: from.y + t * (to.y - from.y) }
      segments.push({ from: at, to: joint })
      arcs.push({
        center,
        radius,
        start: Math.atan2(joint.y - center.y, joint.x - center.x),
        sweep: sweep[i]!,
        direction: directions[i]!,
      })
      at = joint
    }
    segments.push({ from: at, to })
    if (leg < idx.length) {
      arcs.push({ ...path.arcs[leg]!, sweep: sweep[idx[leg]!]! })
      length += path.arcs[leg]!.radius * sweep[idx[leg]!]!
    }
  }
  for (const s of segments) length += Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y)
  return { segments, arcs, length }
}

function build(centers: readonly Vec2[], pulleys: readonly PathPulley[], directions: readonly (1 | -1)[]): RopePath {
  const nodes: Node[] = centers.map((center, i) =>
    i === 0 || i === centers.length - 1 ? { center, rho: 0 } : { center, rho: directions[i - 1]! * pulleys[i - 1]!.radius },
  )

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

/** The simulated reading's path when present, otherwise the path at the document poses. */
export function currentPath(scene: Scene, rope: Rope, readings: readonly { id: string; path?: RopePath }[]): RopePath | null {
  return readings.find((reading) => reading.id === rope.id)?.path ?? scenePath(scene, rope)
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
