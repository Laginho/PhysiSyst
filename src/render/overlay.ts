import { getCatalog, type I18nKey, type Lang } from '../i18n'
import { bodyPointToWorld, scenePath, type Scene, type Vec2 } from '../scene'
import type { BodyState, ConstraintState, ContactPoint } from '../sim/simulator'

/**
 * Pure overlay vector producers. No canvas, no engine imports — inputs are
 * plain data so tables can pin them without WASM.
 *
 * Scaling choices (documented per ruling):
 * - weight + applied: one shared bounded non-linear rule (vectorArrowLengthPx):
 *   screen length is a square-root function of magnitude, hard-clamped to
 *   [ARROW_MIN_PX, ARROW_MAX_PX] pixels. Monotonic (clamps preserve ordering:
 *   larger magnitude never draws shorter) and bounded (nothing leaves the
 *   canvas or clutters the scene). Producers convert px -> world length by
 *   dividing by the camera's pixelsPerMeter so drawArrow's world->screen pass
 *   lands exactly on the sized pixels.
 * - normals: fixed VISUAL length 0.9 m (direction-accurate, magnitude not from
 *   solver; contact-force events would need EventQueue+thresholds per collider,
 *   not cheap on this seam — fixed length is the honest fallback).
 */

export const ARROW_MIN_PX = 24
export const ARROW_MAX_PX = 120
export const ARROW_SCALE_PX = 20
export const NORMAL_LEN = 0.9

/**
 * The single sizing rule every magnitude-bearing arrow consumes.
 * Non-finite-negative inputs (NaN, negatives) fall to the floor; Infinity
 * naturally saturates at the ceiling via Math.min. sqrt keeps small-vs-mid
 * magnitudes visually distinct (1 vs 5 N) while 500 N stays on-screen.
 */
export function vectorArrowLengthPx(magnitude: number): number {
  if (Number.isNaN(magnitude) || magnitude <= 0) return ARROW_MIN_PX
  return Math.min(ARROW_MAX_PX, Math.max(ARROW_MIN_PX, ARROW_SCALE_PX * Math.sqrt(magnitude)))
}

export type ArrowKind = 'weight' | 'applied' | 'normal' | 'initial-velocity' | 'tension' | 'elastic'

export interface OverlayArrow {
  from: { x: number; y: number }
  vec: { x: number; y: number }
  kind: ArrowKind
  /** The quantity the arrow draws: arrows sharing a key share a Vector label. */
  key: string
}

export function weightArrows(scene: Scene, states: ReadonlyMap<string, BodyState> | null, pixelsPerMeter: number): OverlayArrow[] {
  if (!states || states.size === 0) return []
  const g = scene.constants.g
  const out: OverlayArrow[] = []
  for (const body of scene.bodies) {
    if (body.fixed) continue
    const s = states.get(body.id)
    if (!s) continue
    // COM approximated as the simulated position (see simulator.ts colliderDesc);
    // for triangle the true centroid is offset (2b/3,h/3) but the body origin is
    // the visual anchor contract, so the arrow rides the body visibly.
    const lenM = vectorArrowLengthPx(body.mass * g) / pixelsPerMeter
    out.push({ from: { x: s.position.x, y: s.position.y }, vec: { x: 0, y: -lenM }, kind: 'weight', key: `weight:${body.id}` })
  }
  return out
}

export function appliedArrows(view: Scene, pixelsPerMeter: number): OverlayArrow[] {
  const byId = new Map(view.bodies.map((b) => [b.id, b]))
  const out: OverlayArrow[] = []
  for (const f of view.forces) {
    const body = byId.get(f.bodyId)
    if (!body) continue
    const from = bodyPointToWorld(body, f.anchor)
    const rad = (f.direction * Math.PI) / 180
    const lenM = vectorArrowLengthPx(f.magnitude) / pixelsPerMeter
    out.push({ from, vec: { x: lenM * Math.cos(rad), y: lenM * Math.sin(rad) }, kind: 'applied', key: `applied:${f.id}` })
  }
  return out
}

export function initialVelocityArrows(view: Scene, pixelsPerMeter: number): OverlayArrow[] {
  const out: OverlayArrow[] = []
  for (const body of view.bodies) {
    if (body.fixed) continue
    const vx = body.vx ?? 0
    const vy = body.vy ?? 0
    const magnitude = Math.hypot(vx, vy)
    if (magnitude === 0) continue
    const lenM = vectorArrowLengthPx(magnitude) / pixelsPerMeter
    out.push({
      from: { x: body.position.x, y: body.position.y },
      vec: { x: (lenM * vx) / magnitude, y: (lenM * vy) / magnitude },
      kind: 'initial-velocity',
      key: `initial-velocity:${body.id}`,
    })
  }
  return out
}

export function normalArrows(contacts: readonly ContactPoint[]): OverlayArrow[] {
  return contacts.map((c) => ({
    from: { x: c.point.x, y: c.point.y },
    vec: { x: c.normal.x * NORMAL_LEN, y: c.normal.y * NORMAL_LEN },
    kind: 'normal',
    // The pair, not the point: every point of one Contact carries the same N.
    key: `normal:${c.aId < c.bId ? `${c.aId}|${c.bId}` : `${c.bId}|${c.aId}`}`,
  }))
}

/** `magnitude` along from → toward (negative points away), sized by the shared rule; null when there is no direction. */
function arrowToward(from: Vec2, toward: Vec2, magnitude: number, pixelsPerMeter: number): Vec2 | null {
  const dx = toward.x - from.x
  const dy = toward.y - from.y
  const d = Math.hypot(dx, dy)
  if (d === 0 || magnitude === 0) return null
  const lenM = (Math.sign(magnitude) * vectorArrowLengthPx(Math.abs(magnitude))) / pixelsPerMeter
  return { x: (lenM * dx) / d, y: (lenM * dy) / d }
}

/**
 * T on every dynamic body a rope pulls: at each dynamic end's anchor, toward
 * the next point of the path; on a dynamic body mounting a pulley, one arrow
 * per adjacent segment at the pulley center, along that segment away from it.
 * A slack rope (T = 0) or one with no reading draws nothing.
 */
export function tensionArrows(view: Scene, constraints: readonly ConstraintState[], pixelsPerMeter: number): OverlayArrow[] {
  const bodies = new Map(view.bodies.map((b) => [b.id, b]))
  const pulleys = new Map((view.pulleys ?? []).map((p) => [p.id, p]))
  const out: OverlayArrow[] = []
  for (const rope of view.constraints ?? []) {
    if (rope.kind !== 'rope') continue
    const state = constraints.find((c) => c.id === rope.id)
    if (state?.kind !== 'rope') continue
    const path = scenePath(view, rope)
    if (!path) continue
    // With a pulley of mass T differs per segment, and so does the label.
    const perSegment = rope.via.some((id) => (pulleys.get(id)?.mass ?? 0) > 0)
    const push = (at: Vec2, toward: Vec2, segment: number) => {
      const vec = arrowToward(at, toward, state.segments[segment] ?? state.tension, pixelsPerMeter)
      if (vec) out.push({ from: at, vec, kind: 'tension', key: perSegment ? `tension:${rope.id}#${segment}` : `tension:${rope.id}` })
    }
    const first = path.segments[0]!
    const last = path.segments.length - 1
    if (bodies.get(rope.a.bodyId)?.fixed === false) push(first.from, first.to, 0)
    rope.via.forEach((id, i) => {
      // scenePath returned a path, so every pulley and mount resolves.
      const pulley = pulleys.get(id)!
      const mount = bodies.get(pulley.bodyId)!
      if (mount.fixed) return
      const c = bodyPointToWorld(mount, pulley.anchor)
      const into = path.segments[i]!
      const outOf = path.segments[i + 1]!
      push(c, { x: c.x + into.from.x - into.to.x, y: c.y + into.from.y - into.to.y }, i)
      push(c, { x: c.x + outOf.to.x - outOf.from.x, y: c.y + outOf.to.y - outOf.from.y }, i + 1)
    })
    if (bodies.get(rope.b.bodyId)?.fixed === false) push(path.segments[last]!.to, path.segments[last]!.from, last)
  }
  return out
}

/**
 * F_el at every dynamic end of a spring, at the anchor, along its axis:
 * toward the other end while stretched, away while compressed, each sized by
 * its own end's reading. A spring with no reading, or F_el = 0 at that end,
 * draws nothing there. With mass (PHY-30) F_el differs per end, and so does
 * the label.
 */
export function elasticArrows(view: Scene, constraints: readonly ConstraintState[], pixelsPerMeter: number): OverlayArrow[] {
  const bodies = new Map(view.bodies.map((b) => [b.id, b]))
  const out: OverlayArrow[] = []
  for (const spring of view.constraints ?? []) {
    if (spring.kind !== 'spring') continue
    const state = constraints.find((c) => c.id === spring.id)
    const a = bodies.get(spring.a.bodyId)
    const b = bodies.get(spring.b.bodyId)
    if (state?.kind !== 'spring' || !a || !b) continue
    const pa = bodyPointToWorld(a, spring.a.anchor)
    const pb = bodyPointToWorld(b, spring.b.anchor)
    const perEnd = (spring.mass ?? 0) > 0
    for (const [end, body, at, other, force] of [['a', a, pa, pb, state.force.a], ['b', b, pb, pa, state.force.b]] as const) {
      if (body.fixed) continue
      const vec = arrowToward(at, other, force, pixelsPerMeter)
      if (vec) out.push({ from: at, vec, kind: 'elastic', key: perEnd ? `elastic:${spring.id}#${end}` : `elastic:${spring.id}` })
    }
  }
  return out
}

const SYMBOL_KEY: Record<ArrowKind, I18nKey> = {
  weight: 'vector.weight',
  normal: 'vector.normal',
  applied: 'vector.applied',
  tension: 'vector.tension',
  elastic: 'vector.elastic',
  'initial-velocity': 'vector.initialVelocity',
}

/** The n-th of a symbol: `,n` after a subscript already open (`F_el,2`), else `_n` (`T_2`). */
export function numberedSymbol(symbol: string, n: number): string {
  return symbol.includes('_') ? `${symbol},${n}` : `${symbol}_${n}`
}

/**
 * Vector labels, derived from the arrows on every render and never stored:
 * the kind's symbol in `lang`, numbered 1, 2, … in the order the arrows come
 * (document order) only when two or more quantities of that kind are drawn.
 * Keyed by OverlayArrow.key; `_` opens the subscript (`F_el`, `T_1`, `F_el,2`).
 */
export function vectorLabels(arrows: readonly OverlayArrow[], lang: Lang): Map<string, string> {
  const keysByKind = new Map<ArrowKind, string[]>()
  for (const a of arrows) {
    const keys = keysByKind.get(a.kind) ?? []
    if (!keys.includes(a.key)) keys.push(a.key)
    keysByKind.set(a.kind, keys)
  }
  const out = new Map<string, string>()
  for (const [kind, keys] of keysByKind) {
    const symbol: string = getCatalog(lang)[SYMBOL_KEY[kind]]
    keys.forEach((key, i) => {
      out.set(key, keys.length < 2 ? symbol : numberedSymbol(symbol, i + 1))
    })
  }
  return out
}

/**
 * Acceleration by finite difference Δv / TIMESTEP.
 * Zero while paused or when history is missing (first step).
 * Pure — caller decides what "paused" means; we just compute the difference.
 */
export function computeAcceleration(
  prev: ReadonlyMap<string, BodyState> | null,
  curr: ReadonlyMap<string, BodyState> | null,
  id: string,
  dt: number,
): { x: number; y: number } {
  if (!prev || !curr || dt <= 0) return { x: 0, y: 0 }
  const a = prev.get(id)
  const b = curr.get(id)
  if (!a || !b) return { x: 0, y: 0 }
  return { x: (b.linvel.x - a.linvel.x) / dt, y: (b.linvel.y - a.linvel.y) / dt }
}
