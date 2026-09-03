import * as RAPIER from '@dimforge/rapier2d-compat'
import type { Scene } from '../scene'

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

export interface Simulator {
  readonly warnings: readonly string[]
  step(): void
  readStates(): Map<string, BodyState>
  readContacts(): ContactPoint[]
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
  private readonly _warnings: string[] = []
  private particleMode = false

  constructor(scene: Scene) {
    const built = this.buildWorld(scene)
    this.world = built.world
    this.bodies = built.bodies
    this.colliders = built.colliders
    this.forces = built.forces
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
    warnings: string[]
    particleMode: boolean
  } {
    const world = new RAPIER.World({ x: 0, y: -scene.constants.g })
    world.timestep = TIMESTEP
    const bodies = new Map<string, RAPIER.RigidBody>()
    const colliders = new Map<string, RAPIER.Collider>()
    const forces = new Map<string, ForceBinding>()

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
    } catch (e) {
      world.free()
      throw e
    }
    return { world, bodies, colliders, forces, warnings, particleMode: scene.constants.particleMode === true }
  }

  step(): void {
    const touched = new Set<RAPIER.RigidBody>()
    for (const binding of this.forces.values()) {
      if (!touched.has(binding.rigid)) {
        touched.add(binding.rigid)
        binding.rigid.resetForces(true)
      }
    }
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
    this.world.step()
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
