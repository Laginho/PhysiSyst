import type { Scene } from '../scene'
import type { BodyState, ContactPoint } from '../sim/simulator'
import { localToWorld } from '../editor/handles'

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

export interface OverlayArrow {
  from: { x: number; y: number }
  vec: { x: number; y: number }
  kind: 'weight' | 'applied' | 'normal' | 'initial-velocity'
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
    out.push({ from: { x: s.position.x, y: s.position.y }, vec: { x: 0, y: -lenM }, kind: 'weight' })
  }
  return out
}

export function appliedArrows(view: Scene, pixelsPerMeter: number): OverlayArrow[] {
  const byId = new Map(view.bodies.map((b) => [b.id, b]))
  const out: OverlayArrow[] = []
  for (const f of view.forces) {
    const body = byId.get(f.bodyId)
    if (!body) continue
    const from = localToWorld(body, f.anchor.x, f.anchor.y)
    const rad = (f.direction * Math.PI) / 180
    const lenM = vectorArrowLengthPx(f.magnitude) / pixelsPerMeter
    out.push({ from, vec: { x: lenM * Math.cos(rad), y: lenM * Math.sin(rad) }, kind: 'applied' })
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
    })
  }
  return out
}

export function normalArrows(contacts: readonly ContactPoint[]): OverlayArrow[] {
  return contacts.map((c) => ({
    from: { x: c.point.x, y: c.point.y },
    vec: { x: c.normal.x * NORMAL_LEN, y: c.normal.y * NORMAL_LEN },
    kind: 'normal',
  }))
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
