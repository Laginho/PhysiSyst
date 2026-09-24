import * as RAPIER from '@dimforge/rapier2d-compat'
import { bodyPointToWorld, ropePath, scenePath } from '../scene'
import type { Scene, Vec2 } from '../scene'

export const TIMESTEP = 1 / 60

export interface BodyState {
  position: { x: number; y: number }
  rotation: number
  linvel: { x: number; y: number }
  angvel: number
}

export interface ContactPoint {
  aId: string
  bId: string
  point: { x: number; y: number }
  normal: { x: number; y: number }
}

export interface RopeState {
  id: string
  kind: 'rope'
  /** Tension over the last step, N. 0 while slack. */
  tension: number
  slack: boolean
}

export type ConstraintState = RopeState

export interface Simulator {
  readonly warnings: readonly string[]
  step(): void
  readStates(): Map<string, BodyState>
  readContacts(): ContactPoint[]
  /** One entry per document constraint, in document order (PHY-23). */
  readConstraints(): ConstraintState[]
  setForceMagnitude(forceId: string, magnitude: number): void
  /** Live gravity edit (T7/M2): affects integration from the next step on, no rebuild. */
  setGravity(g: number): void
  /** Live edits for an existing force binding's direction (world-frame degrees). */
  setForceDirection(forceId: string, direction: number): void
  /** Live edit for an existing force binding's anchor (body-local, origin-relative). */
  setForceAnchor(forceId: string, anchor: { x: number; y: number }): void
  setBodyMass(bodyId: string, mass: number): void
  /**
   * Structural rebuild from the document. Pass `carry` (normally the last
   * `readStates()`) to preserve per-id kinematic state across the rebuild:
   * surviving ids resume from their carried position/rotation/velocity, ids
   * absent from `carry` spawn at their document-initial state, and carried ids
   * absent from `scene` are dropped. Omit it to restart the whole world from
   * the document.
   */
  replaceScene(scene: Scene, carry?: ReadonlyMap<string, BodyState>): void
}

let initPromise: Promise<unknown> | undefined

function ensureInit(): Promise<unknown> {
  initPromise ??= RAPIER.init()
  return initPromise
}

interface ForceBinding {
  rigid: RAPIER.RigidBody
  anchorLocal: { x: number; y: number }
  directionRad: number
  magnitude: number
}

interface PointBinding {
  rigid: RAPIER.RigidBody
  anchorLocal: Vec2
}

interface RopeBinding {
  id: string
  a: PointBinding
  b: PointBinding
  via: Array<PointBinding & { radius: number }>
  /** L: the path length at the DOCUMENT poses, fixed for the world's life. */
  length: number
  tension: number
  /** Warm start: the tension the free-motion prediction missed last step (contacts, friction). */
  residual: number
  /** This step's tension minus the warm start. */
  predicted: number
  slack: boolean
}

/** Fraction of a rope's stretch pulled back per step. */
const ROPE_BETA = 0.2

interface RopeFrame {
  pa: Vec2
  pb: Vec2
  /** Unit directions from each end along its leg: the way the rope pulls that end. */
  ua: Vec2
  ub: Vec2
  length: number
}

function worldPoint(p: PointBinding): Vec2 {
  return bodyPointToWorld({ position: p.rigid.translation(), rotation: p.rigid.rotation() }, p.anchorLocal)
}

function unit(from: Vec2, to: Vec2): Vec2 {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const d = Math.hypot(dx, dy)
  return d === 0 ? { x: 0, y: 0 } : { x: dx / d, y: dy / d }
}

function ropeFrame(rope: RopeBinding): RopeFrame {
  const pa = worldPoint(rope.a)
  const pb = worldPoint(rope.b)
  const path = ropePath(
    pa,
    pb,
    rope.via.map((p) => ({ center: worldPoint(p), radius: p.radius })),
  )
  return {
    pa,
    pb,
    ua: unit(pa, path.segments[0]!.to),
    ub: unit(pb, path.segments.at(-1)!.from),
    length: path.length,
  }
}

/** Inverse effective mass of a body for a unit pull `u` at world point `p`. */
function pullInvMass(rigid: RAPIER.RigidBody, p: Vec2, u: Vec2): number {
  if (!rigid.isDynamic()) return 0
  const m = rigid.effectiveInvMass()
  const com = rigid.worldCom()
  const arm = (p.x - com.x) * u.y - (p.y - com.y) * u.x
  return u.x * u.x * m.x + u.y * u.y * m.y + rigid.effectiveWorldInvInertia() * arm * arm
}

/**
 * Velocity of world point `p` at the END of the coming step if only gravity
 * and the forces already added this step acted (no contacts, no rope yet).
 */
function freePointVelocity(rigid: RAPIER.RigidBody, p: Vec2, gravity: Vec2): Vec2 {
  if (!rigid.isDynamic()) return { x: 0, y: 0 }
  const v = rigid.linvel()
  const w = rigid.angvel()
  const m = rigid.effectiveInvMass()
  const f = rigid.userForce()
  const gs = rigid.gravityScale()
  const w1 = w + TIMESTEP * rigid.userTorque() * rigid.effectiveWorldInvInertia()
  const com = rigid.worldCom()
  return {
    x: v.x + TIMESTEP * (gs * gravity.x + f.x * m.x) - w1 * (p.y - com.y),
    y: v.y + TIMESTEP * (gs * gravity.y + f.y * m.y) + w1 * (p.x - com.x),
  }
}

function pullRate(rigid: RAPIER.RigidBody, p: Vec2, u: Vec2): number {
  if (!rigid.isDynamic()) return 0
  const v = rigid.velocityAtPoint(p)
  return u.x * v.x + u.y * v.y
}

/**
 * Per-collider friction coefficients satisfying f_a + f_b = 2*mu_k for every
 * explicit Contact pair under Rapier's Average combine rule.
 *
 * Why: ADR-0003 wants per-PAIR coefficients, but JS-binding PhysicsHooks offer
 * no solver-contact modification, so no combine rule can read a pair table
 * directly. Instead potentials f solve the linear system f_u + f_v = 2*muK_uv
 * exactly (structured incidence system; equivalent to Gaussian elimination
 * with free variables parametrized along bipartite parity):
 *   - Bipartite (even-cycle) components: solutions form a one-parameter
 *     family f_v = sign_v*t + bias_v. Non-tree edges carry no t-term, so each
 *     must satisfy its residual exactly; the parameter is then clamped into
 *     the feasible cone (all f >= 0), biased toward t=0.
 *   - Non-bipartite (odd-cycle) components: a closing edge with equal parities
 *     PINS t to a single value (multiple pins must agree); the solution is
 *     unique and accepted iff every potential stays >= 0.
 *   - Only genuinely infeasible systems (violated residual, disagreeing pins,
 *     negative forced potential) fall back whole-scene to f_body =
 *     max(muK over its contacts) with the Max combine rule, which resolves
 *     every pair to at least its own muK but can poison frictionless pairs.
 *     This degradation is reported in `warnings`.
 *
 * Undeclared physical pairs may inherit averaged friction via shared bodies'
 * declared-edge potentials — accepted residual deviation, exact for declared
 * interfaces and approximate elsewhere. Governing decision: ADR-0003,
 * "Addendum — 2026-08-23" (docs/adr/0003-friction-on-contact-pairs.md).
 *
 * muK (not muS) drives the single solver coefficient because kinetic
 * deceleration is what the acceptance suite checks numerically; static
 * holding relies on the solver + restitution 0. Scenes may set muS = muK when
 * static fidelity matters.
 */
export function assignPairFrictions(scene: Scene): {
  friction: Map<string, number>
  useMaxFallback: boolean
  warnings: string[]
} {
  const EPS = 1e-9
  const adjacency = new Map<string, Array<{ to: string; mu: number }>>()
  for (const c of scene.contacts) {
    for (const [from, to] of [
      [c.a, c.b],
      [c.b, c.a],
    ] as const) {
      if (!adjacency.has(from)) adjacency.set(from, [])
      adjacency.get(from)!.push({ to, mu: c.muK })
    }
  }

  const friction = new Map<string, number>()
  let useMaxFallback = false
  const visited = new Set<string>()

  for (const body of scene.bodies) {
    if (visited.has(body.id)) continue
    if (!adjacency.get(body.id)?.length) {
      visited.add(body.id)
      friction.set(body.id, 0)
      continue
    }
    const sign = new Map<string, number>([[body.id, 1]])
    const bias = new Map<string, number>([[body.id, 0]])
    const order = [body.id]
    let pinnedT: number | null = null
    let compBad = false
    for (let qi = 0; qi < order.length && !compBad; qi++) {
      const u = order[qi]!
      for (const { to, mu } of adjacency.get(u)!) {
        if (to === u) continue
        const childSign = -sign.get(u)!
        const childBias = 2 * mu - bias.get(u)!
        if (!sign.has(to)) {
          sign.set(to, childSign)
          bias.set(to, childBias)
          visited.add(to)
          order.push(to)
          continue
        }
        // Closing edge of a cycle: same parity means an ODD cycle whose
        // equation carries the t-term -> it PINS the parameter instead of
        // proving inconsistency. Opposite parity: exact residual check.
        const sigmaSum = sign.get(u)! + sign.get(to)!
        if (Math.abs(sigmaSum) < EPS) {
          if (Math.abs(bias.get(u)! + bias.get(to)! - 2 * mu) > EPS) compBad = true
        } else {
          const tEdge = (2 * mu - bias.get(u)! - bias.get(to)!) / sigmaSum
          if (pinnedT === null) pinnedT = tEdge
          else if (Math.abs(pinnedT - tEdge) > EPS) compBad = true
        }
      }
    }
    visited.add(body.id)

    let t: number | undefined
    if (!compBad && pinnedT !== null) {
      t = pinnedT
      for (const id of order) {
        if (sign.get(id)! * t + bias.get(id)! < -EPS) {
          compBad = true
          break
        }
      }
    } else if (!compBad) {
      let lo = Number.NEGATIVE_INFINITY
      let hi = Number.POSITIVE_INFINITY
      for (const id of order) {
        const sg = sign.get(id)!
        const b = bias.get(id)!
        if (sg > 0) lo = Math.max(lo, -b)
        else hi = Math.min(hi, b)
      }
      if (lo > hi + EPS) compBad = true
      else t = Math.min(Math.max(0, lo), hi)
    }

    if (compBad) {
      useMaxFallback = true
      break
    }
    for (const id of order) friction.set(id, Math.max(0, sign.get(id)! * t! + bias.get(id)!))
  }

  const warnings: string[] = []
  if (useMaxFallback) {
    warnings.push('contact touch-graph has inconsistent cycles; friction degraded to per-body max approximation')
    for (const body of scene.bodies) {
      const mus = (adjacency.get(body.id) ?? []).map((e) => e.mu)
      friction.set(body.id, mus.length ? Math.max(...mus) : 0)
    }
  }
  return { friction, useMaxFallback, warnings }
}

function colliderDescFor(body: Scene['bodies'][number], friction: number, useMaxFallback: boolean): RAPIER.ColliderDesc {
  let desc: RAPIER.ColliderDesc
  switch (body.shape) {
    case 'rectangle':
      desc = RAPIER.ColliderDesc.cuboid(body.width / 2, body.height / 2)
      break
    case 'circle':
      desc = RAPIER.ColliderDesc.ball(body.radius)
      break
    case 'triangle': {
      // Right triangle: local origin at the alpha corner, base along +x,
      // vertical leg at the far end. Height = base * tan(alpha).
      const h = body.base * Math.tan((body.alpha * Math.PI) / 180)
      const hull = RAPIER.ColliderDesc.convexHull(new Float32Array([0, 0, body.base, 0, body.base, h]))
      if (!hull) throw new Error(`degenerate triangle geometry for base=${body.base} alpha=${body.alpha}`)
      desc = hull
      break
    }
  }
  desc.setRestitution(0)
  desc.setFriction(friction)
  desc.setFrictionCombineRule(useMaxFallback ? RAPIER.CoefficientCombineRule.Max : RAPIER.CoefficientCombineRule.Average)
  return desc
}

class RapierSimulator implements Simulator {
  private world: RAPIER.World
  private bodies = new Map<string, RAPIER.RigidBody>()
  private colliders = new Map<string, RAPIER.Collider>()
  private forces = new Map<string, ForceBinding>()
  private ropes: RopeBinding[] = []
  private readonly _warnings: string[] = []
  private particleMode = false

  constructor(scene: Scene) {
    const built = this.buildWorld(scene)
    this.world = built.world
    this.bodies = built.bodies
    this.colliders = built.colliders
    this.forces = built.forces
    this.ropes = built.ropes
    this.particleMode = built.particleMode
    this._warnings.push(...built.warnings)
  }

  get warnings(): readonly string[] {
    return this._warnings
  }

  // Builds everything into LOCAL maps so a mid-build throw (e.g. mass<=0)
  // cannot leave half-initialized instance state behind.
  private buildWorld(scene: Scene): {
    world: RAPIER.World
    bodies: Map<string, RAPIER.RigidBody>
    colliders: Map<string, RAPIER.Collider>
    forces: Map<string, ForceBinding>
    ropes: RopeBinding[]
    warnings: string[]
    particleMode: boolean
  } {
    const world = new RAPIER.World({ x: 0, y: -scene.constants.g })
    world.timestep = TIMESTEP
    const bodies = new Map<string, RAPIER.RigidBody>()
    const colliders = new Map<string, RAPIER.Collider>()
    const forces = new Map<string, ForceBinding>()
    const ropes: RopeBinding[] = []

    // If anything below throws (e.g. mass<=0), the LOCAL candidate world is
    // freed before rethrow: no WASM leak on repeated invalid rebuilds.
    let warnings: string[] = []
    try {
      const solved = assignPairFrictions(scene)
      warnings = solved.warnings

      for (const body of scene.bodies) {
        const desc = body.fixed ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.dynamic()
        desc.setTranslation(body.position.x, body.position.y).setRotation(body.rotation)
        const rigid = world.createRigidBody(desc)
        if (!body.fixed && body.mass <= 0) {
          throw new RangeError(`body '${body.id}': mass must be positive to simulate (codec warns, simulator refuses)`)
        }
        if (scene.constants.particleMode === true) rigid.lockRotations(true, true)
        // Initial velocity (ticket 04): applied as linear velocity at world
        // build. Fixed bodies never receive one — they expose no velocity
        // input and their doc fields are ignored here.
        if (!body.fixed && (body.vx !== undefined || body.vy !== undefined)) {
          rigid.setLinvel({ x: body.vx ?? 0, y: body.vy ?? 0 }, true)
        }
        const colliderDesc = colliderDescFor(body, solved.friction.get(body.id) ?? 0, solved.useMaxFallback)
        if (!body.fixed) colliderDesc.setMass(body.mass)
        colliders.set(body.id, world.createCollider(colliderDesc, rigid))
        bodies.set(body.id, rigid)
      }

      for (const force of scene.forces) {
        const rigid = bodies.get(force.bodyId)
        if (!rigid) throw new Error(`force '${force.id}' references missing body '${force.bodyId}'`)
        if (rigid.isFixed()) continue
        forces.set(force.id, {
          rigid,
          anchorLocal: force.anchor,
          directionRad: (force.direction * Math.PI) / 180,
          magnitude: force.magnitude,
        })
      }

      // Ropes (ADR-0004): L comes from the DOCUMENT poses, never from the
      // rigid bodies — replaceScene applies any carry only after this build,
      // so a carried rebuild keeps the rope length the scene started with.
      const pulleys = new Map((scene.pulleys ?? []).map((p) => [p.id, p]))
      const point = (bodyId: string, anchorLocal: Vec2): PointBinding => {
        const rigid = bodies.get(bodyId)
        if (!rigid) throw new Error(`constraint references missing body '${bodyId}'`)
        return { rigid, anchorLocal }
      }
      for (const rope of scene.constraints ?? []) {
        const path = scenePath(scene, rope)
        if (!path) throw new Error(`rope '${rope.id}' has a dangling reference`)
        ropes.push({
          id: rope.id,
          a: point(rope.a.bodyId, rope.a.anchor),
          b: point(rope.b.bodyId, rope.b.anchor),
          via: rope.via.map((id) => {
            const pulley = pulleys.get(id)!
            return { ...point(pulley.bodyId, pulley.anchor), radius: pulley.radius }
          }),
          length: path.length,
          tension: 0,
          residual: 0,
          predicted: 0,
          slack: false,
        })
      }
    } catch (e) {
      world.free()
      throw e
    }
    return { world, bodies, colliders, forces, ropes, warnings, particleMode: scene.constants.particleMode === true }
  }

  step(): void {
    const touched = new Set<RAPIER.RigidBody>()
    for (const binding of this.forces.values()) touched.add(binding.rigid)
    for (const rope of this.ropes) {
      touched.add(rope.a.rigid)
      touched.add(rope.b.rigid)
    }
    for (const rigid of touched) rigid.resetForces(true)
    for (const binding of this.forces.values()) {
      const p = binding.rigid.translation()
      const r = binding.rigid.rotation()
      const cos = Math.cos(r)
      const sin = Math.sin(r)
      // Anchor is body-local: rotate it by the current rotation so it rides
      // the body, while the force vector stays in the WORLD frame.
      const wx = p.x + binding.anchorLocal.x * cos - binding.anchorLocal.y * sin
      const wy = p.y + binding.anchorLocal.x * sin + binding.anchorLocal.y * cos
      binding.rigid.addForceAtPoint(
        { x: binding.magnitude * Math.cos(binding.directionRad), y: binding.magnitude * Math.sin(binding.directionRad) },
        { x: wx, y: wy },
        true,
      )
    }
    for (const rope of this.ropes) this.pullRope(rope)
    this.world.step()
    for (const rope of this.ropes) this.correctRope(rope)
  }

  /**
   * Rope, before the step (ADR-0004): the tension that makes the free motion
   * end the step at exactly L — closing a slack gap in one step at most, or
   * pulling back a fraction of a stretch — plus last step's residual. Applied
   * as a force, so Rapier's contact and friction solve sees it.
   */
  private pullRope(rope: RopeBinding): void {
    const f = ropeFrame(rope)
    const k = pullInvMass(rope.a.rigid, f.pa, f.ua) + pullInvMass(rope.b.rigid, f.pb, f.ub)
    if (k === 0) {
      rope.tension = rope.residual = rope.predicted = 0
      return
    }
    const g = this.world.gravity
    const va = freePointVelocity(rope.a.rigid, f.pa, g)
    const vb = freePointVelocity(rope.b.rigid, f.pb, g)
    const lengthening = -(f.ua.x * va.x + f.ua.y * va.y + f.ub.x * vb.x + f.ub.y * vb.y)
    const c = f.length - rope.length
    const allowed = c < 0 ? -c / TIMESTEP : (-ROPE_BETA * c) / TIMESTEP
    rope.predicted = (lengthening - allowed) / (TIMESTEP * k)
    rope.tension = Math.max(0, rope.predicted + rope.residual)
    if (rope.tension === 0) return
    rope.a.rigid.addForceAtPoint({ x: rope.tension * f.ua.x, y: rope.tension * f.ua.y }, f.pa, true)
    rope.b.rigid.addForceAtPoint({ x: rope.tension * f.ub.x, y: rope.tension * f.ub.y }, f.pb, true)
  }

  /**
   * Rope, after the step: contacts made the prediction wrong by some amount,
   * so an impulse along the rope removes whatever lengthening remains beyond
   * what the slack allows. The tension it implies becomes the reading, and
   * the part the prediction missed warm-starts the next step.
   */
  private correctRope(rope: RopeBinding): void {
    const f = ropeFrame(rope)
    const k = pullInvMass(rope.a.rigid, f.pa, f.ua) + pullInvMass(rope.b.rigid, f.pb, f.ub)
    if (k === 0) {
      rope.slack = true
      return
    }
    const lengthening = -(pullRate(rope.a.rigid, f.pa, f.ua) + pullRate(rope.b.rigid, f.pb, f.ub))
    const c = f.length - rope.length
    const allowed = c < 0 ? -c / TIMESTEP : 0
    const corrected = Math.max(0, rope.tension + (lengthening - allowed) / (TIMESTEP * k))
    const impulse = (corrected - rope.tension) * TIMESTEP
    if (impulse !== 0) {
      rope.a.rigid.applyImpulseAtPoint({ x: impulse * f.ua.x, y: impulse * f.ua.y }, f.pa, true)
      rope.b.rigid.applyImpulseAtPoint({ x: impulse * f.ub.x, y: impulse * f.ub.y }, f.pb, true)
    }
    rope.tension = corrected
    rope.residual = corrected > 0 ? corrected - rope.predicted : 0
    rope.slack = corrected === 0
  }

  readConstraints(): ConstraintState[] {
    return this.ropes.map((r) => ({ id: r.id, kind: 'rope', tension: r.tension, slack: r.slack }))
  }

  readStates(): Map<string, BodyState> {
    const states = new Map<string, BodyState>()
    for (const [id, rigid] of this.bodies) {
      const p = rigid.translation()
      const v = rigid.linvel()
      states.set(id, {
        position: { x: p.x, y: p.y },
        rotation: rigid.rotation(),
        linvel: { x: v.x, y: v.y },
        angvel: rigid.angvel(),
      })
    }
    return states
  }

  /**
   * Contact points from the running solver.
   * Uses the narrow phase manifolds: solverContactPoint(0) + world normal
   * per manifold. Fixed visual length is applied by the overlay layer;
   * Rapier contact-force events are not used here (require EventQueue +
   * per-collider thresholds, no cheap magnitude signal on this seam).
   * Returns empty when no colliders are touching.
   */
  readContacts(): ContactPoint[] {
    const out: ContactPoint[] = []
    const handleToId = new Map<number, string>()
    for (const [id, col] of this.colliders) handleToId.set((col as unknown as { handle: number }).handle, id)
    const seen = new Set<string>()
    for (const [idA, colA] of this.colliders) {
      const hA = (colA as unknown as { handle: number }).handle
      try {
        this.world.narrowPhase.contactPairsWith(hA, (hB: number) => {
          const idB = handleToId.get(hB)
          if (!idB) return
          const key = idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`
          if (seen.has(key)) return
          seen.add(key)
          try {
            this.world.narrowPhase.contactPair(hA, hB, this.world.bodies, (manifold, flipped) => {
              const n = manifold.normal()
              // Rapier normal points from first to second when not flipped;
              // flip inverts it — normalize to A->B direction.
              const nx = flipped ? -n.x : n.x
              const ny = flipped ? -n.y : n.y
              for (let i = 0; i < manifold.numSolverContacts(); i++) {
                const p = manifold.solverContactPoint(i)
                if (!p) continue
                out.push({ aId: idA, bId: idB, point: { x: p.x, y: p.y }, normal: { x: nx, y: ny } })
              }
              // Fallback when solver reports none but geometric contacts exist.
              // localContactPoint is collider-local; convert to world via the owning body's pose.
              if (manifold.numSolverContacts() === 0 && manifold.numContacts() > 0) {
                const local = manifold.localContactPoint1(0)
                if (local) {
                  // When flipped, localContactPoint1 actually belongs to B.
                  const ownerId = flipped ? idB : idA
                  const rigid = this.bodies.get(ownerId)
                  if (rigid) {
                    const t = rigid.translation()
                    const r = rigid.rotation()
                    const c = Math.cos(r)
                    const s = Math.sin(r)
                    out.push({
                      aId: idA,
                      bId: idB,
                      point: { x: t.x + local.x * c - local.y * s, y: t.y + local.x * s + local.y * c },
                      normal: { x: nx, y: ny },
                    })
                  } else {
                    out.push({ aId: idA, bId: idB, point: { x: local.x, y: local.y }, normal: { x: nx, y: ny } })
                  }
                }
              }
            })
          } catch {
            // narrowPhase throws if pair vanished mid-iteration — ignore
          }
        })
      } catch {
        // vanished collider — ignore
      }
    }
    return out
  }

  // Mutations below hit the RUNNING world; callers invoke them between steps,
  // so changes take effect at frame boundaries by construction.

  setForceMagnitude(forceId: string, magnitude: number): void {
    const binding = this.forces.get(forceId)
    if (!binding) throw new Error(`unknown or non-applicable force '${forceId}'`)
    binding.magnitude = magnitude
  }

  setGravity(g: number): void {
    this.world.gravity.x = 0
    this.world.gravity.y = -g
  }

  setForceDirection(forceId: string, direction: number): void {
    const binding = this.forces.get(forceId)
    if (!binding) throw new Error(`unknown or non-applicable force '${forceId}'`)
    binding.directionRad = (direction * Math.PI) / 180
  }

  setForceAnchor(forceId: string, anchor: { x: number; y: number }): void {
    const binding = this.forces.get(forceId)
    if (!binding) throw new Error(`unknown or non-applicable force '${forceId}'`)
    binding.anchorLocal = anchor
  }

  setBodyMass(bodyId: string, mass: number): void {
    const collider = this.colliders.get(bodyId)
    if (!collider) throw new Error(`unknown body '${bodyId}'`)
    if (mass <= 0) {
      throw new RangeError(`body '${bodyId}': mass must be positive to simulate (codec warns, simulator refuses)`)
    }
    collider.setMass(mass)
  }

  replaceScene(scene: Scene, carry?: ReadonlyMap<string, BodyState>): void {
    // Transactional: build the next world BEFORE touching any live state. A
    // throw here (e.g. mass<=0) leaves the current world fully valid, so the
    // caller's error panel works and playback can resume once the doc is
    // fixed — no reboot, no double-free of an already-freed world.
    const next = this.buildWorld(scene)
    this.world.free()
    this.world = next.world
    this.bodies = next.bodies
    this.colliders = next.colliders
    this.forces = next.forces
    this.ropes = next.ropes
    this._warnings.length = 0
    this._warnings.push(...next.warnings)
    this.particleMode = next.particleMode
    if (!carry) return
    // Restore the kinematic state a structural edit should not disturb. Only
    // ids present in BOTH maps are touched: new bodies keep their doc-initial
    // state, and stale carry entries for removed bodies are ignored.
    for (const [id, rigid] of this.bodies) {
      const state = carry.get(id)
      if (!state) continue
      rigid.setTranslation({ x: state.position.x, y: state.position.y }, true)
      rigid.setRotation(state.rotation, true)
      rigid.setLinvel({ x: state.linvel.x, y: state.linvel.y }, true)
      rigid.setAngvel(state.angvel, true)
    }
    // Particle mode must survive the carry: restoring kinematics would
    // otherwise resurrect angular velocity on rotation-locked bodies.
    if (this.particleMode) {
      for (const rigid of this.bodies.values()) {
        rigid.setAngvel(0, false)
        rigid.lockRotations(true, true)
      }
    }
  }
}

export async function createSimulator(scene: Scene): Promise<Simulator> {
  await ensureInit()
  return new RapierSimulator(scene)
}
