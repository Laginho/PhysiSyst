import * as RAPIER from '@dimforge/rapier2d-compat'
import { bodyPointToWorld, ropePath, scenePath } from '../scene'
import type { RopePath, Scene, Vec2 } from '../scene'
import { TIMESTEP } from './timestep'

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
  /** Tension over the last step, N; the largest segment's when they differ. 0 while slack. */
  tension: number
  slack: boolean
  /**
   * T per straight leg, in path order from `a` (PHY-25). All equal to
   * `tension` unless a pulley on the path has mass.
   */
  segments: number[]
}

export interface SpringState {
  id: string
  kind: 'spring'
  /** Δx = x − x₀, m: + stretched, − compressed. */
  dx: number
  /** F_el at each end, N: k·Δx + c·ẋ, + pulling the ends together. Equal while the spring is massless. */
  force: { a: number; b: number }
}

export type ConstraintState = RopeState | SpringState

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
   * the document. With `carry`, pulleys with mass that survive keep their
   * spin from the live world (PHY-25).
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

interface SpringBinding {
  id: string
  /** Position in the document's constraints, for the readout's order. */
  index: number
  a: PointBinding
  b: PointBinding
  k: number
  x0: number
  c: number
}

interface RopeBinding {
  id: string
  index: number
  a: PointBinding
  b: PointBinding
  via: Array<PointBinding & { radius: number }>
  /** L: the path length at the DOCUMENT poses, fixed for the world's life. */
  length: number
  tension: number
  /** Warm start: the tension the free-motion prediction missed last step (contacts, friction). */
  residual: number
  /** The reading the contact-free model expects this step, warm start excluded. */
  predicted: number
  slack: boolean
  /** The pulleys with mass on the path (PHY-25). Empty: one piece, the scalar fields above. */
  grips: Grip[]
  /** One per piece of rope between grips, in path order; empty when `grips` is. */
  pieces: Piece[]
}

/**
 * A pulley with mass on a rope's path. The rope does not slip on the disk, so
 * the disk splits the rope into two pieces, each of fixed length: the rope's
 * arc on it is shared at a mark that turns with the disk.
 */
interface Grip {
  /** Index of the pulley in `via`. */
  at: number
  disk: RAPIER.RigidBody
  /** Angle from where the rope meets the disk to the mark, in the wrap direction: the arriving piece's share. */
  share: number
  /** The rope's meeting angle (`RopeArc.start`) and the disk's rotation when `share` was last brought up to date. */
  start: number
  rotation: number
}

interface Piece {
  /** Fixed for the world's life, from the document poses like `RopeBinding.length`. */
  length: number
  tension: number
  residual: number
  predicted: number
}

/** Fraction of a rope's stretch pulled back per step. */
const ROPE_BETA = 0.2

/**
 * The lengthening rate a rope `c` past its length L may have: a slack rope
 * may close its gap in one step, a stretched one must pull back a fraction.
 * Prediction and correction share it — a correction that aimed at zero would
 * undo the pull-back, and the warm start would then cancel the next one.
 */
function ropeAllowance(c: number): number {
  return c < 0 ? -c / TIMESTEP : (-ROPE_BETA * c) / TIMESTEP
}

/** A point the rope pulls: an end, or a pulley's axle. */
interface RopePull {
  rigid: RAPIER.RigidBody
  p: Vec2
  /**
   * The way the rope pulls it per unit tension: the leg's unit direction for
   * an end, the sum of both legs' for a pulley. Also −∂(path length)/∂p.
   */
  u: Vec2
}

interface RopeFrame {
  /** In path order: end a, each pulley in `via`, end b. */
  pulls: RopePull[]
  length: number
  path: RopePath
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

/** The rope at its bodies' poses, or with each point `moved` there (path order). */
function ropeFrame(rope: RopeBinding, moved?: Vec2[]): RopeFrame {
  const points = [rope.a, ...rope.via, rope.b]
  const at = moved ?? points.map(worldPoint)
  const path = ropePath(
    at[0]!,
    at.at(-1)!,
    rope.via.map((p, i) => ({ center: at[i + 1]!, radius: p.radius })),
  )
  const s = path.segments
  const pulls = points.map((point, i): RopePull => {
    // An end is pulled along its one leg; a pulley back along the leg that
    // arrives and forward along the leg that leaves.
    const back = i > 0 ? unit(s[i - 1]!.to, s[i - 1]!.from) : { x: 0, y: 0 }
    const ahead = i < s.length ? unit(s[i]!.from, s[i]!.to) : { x: 0, y: 0 }
    return { rigid: point.rigid, p: at[i]!, u: { x: back.x + ahead.x, y: back.y + ahead.y } }
  })
  return { pulls, length: path.length, path }
}

/**
 * The rope's inverse effective mass, K: Σ over bodies of J M⁻¹ J′ᵀ, with the
 * pulls on one body summed first — a movable pulley and an end can share it.
 * J is the pull applied (`pulls`); J′ the rope's length gradient it acts
 * against (`along`), the pull itself unless given. The two may be different
 * pieces of one rope (PHY-25): then K couples them through shared bodies.
 */
function ropeInvMass(pulls: readonly RopePull[], along: readonly RopePull[] = pulls): number {
  const jacobians = new Map<RAPIER.RigidBody, { x: number; y: number; w: number; x2: number; y2: number; w2: number }>()
  const jacobian = (rigid: RAPIER.RigidBody) => {
    const j = jacobians.get(rigid) ?? { x: 0, y: 0, w: 0, x2: 0, y2: 0, w2: 0 }
    jacobians.set(rigid, j)
    return j
  }
  for (const { rigid, p, u } of pulls) {
    if (!rigid.isDynamic()) continue
    const com = rigid.worldCom()
    const j = jacobian(rigid)
    j.x += u.x
    j.y += u.y
    j.w += (p.x - com.x) * u.y - (p.y - com.y) * u.x
  }
  for (const { rigid, p, u: g } of along) {
    if (!rigid.isDynamic()) continue
    const com = rigid.worldCom()
    const j = jacobian(rigid)
    j.x2 += g.x
    j.y2 += g.y
    j.w2 += (p.x - com.x) * g.y - (p.y - com.y) * g.x
  }
  let k = 0
  for (const [rigid, j] of jacobians) {
    const m = rigid.effectiveInvMass()
    k += j.x * j.x2 * m.x + j.y * j.y2 * m.y + rigid.effectiveWorldInvInertia() * j.w * j.w2
  }
  return k
}

/** A tension (as a force) or a tension impulse along every dynamic pull. */
function applyPulls(pulls: readonly RopePull[], amount: number, impulse: boolean): void {
  for (const { rigid, p, u } of pulls) {
    if (!rigid.isDynamic()) continue
    const f = { x: amount * u.x, y: amount * u.y }
    if (impulse) rigid.applyImpulseAtPoint(f, p, true)
    else rigid.addForceAtPoint(f, p, true)
  }
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

/**
 * Where `p` ends the coming step under that free motion. Rapier splits the
 * step into n substeps: a constant acceleration moves a body φ = (n + 1)/2n
 * of the Euler distance Δt²·a, while the velocity still gains Δt·a in full.
 */
function freePoint(rigid: RAPIER.RigidBody, p: Vec2, v: Vec2, phi: number): Vec2 {
  const v0 = rigid.isDynamic() ? rigid.velocityAtPoint(p) : { x: 0, y: 0 }
  return { x: p.x + TIMESTEP * (v0.x + phi * (v.x - v0.x)), y: p.y + TIMESTEP * (v0.y + phi * (v.y - v0.y)) }
}

function pointVelocity(rigid: RAPIER.RigidBody, p: Vec2): Vec2 {
  return rigid.isDynamic() ? rigid.velocityAtPoint(p) : { x: 0, y: 0 }
}

/**
 * The spring's axis, Δx and F_el = kΔx + c·ẋ with its ends `lead` seconds
 * ahead of where they are, each moving on at its velocity now.
 */
function springAt(s: SpringBinding, lead = 0) {
  const now = [worldPoint(s.a), worldPoint(s.b)] as const
  const v = [pointVelocity(s.a.rigid, now[0]), pointVelocity(s.b.rigid, now[1])] as const
  const [pa, pb] = now.map((p, i) => ({ x: p.x + lead * v[i]!.x, y: p.y + lead * v[i]!.y }))
  const u = unit(pa!, pb!)
  const dx = Math.hypot(pb!.x - pa!.x, pb!.y - pa!.y) - s.x0
  const rate = (v[1].x - v[0].x) * u.x + (v[1].y - v[0].y) * u.y
  return { now, u, dx, force: s.k * dx + s.c * rate }
}

function readSpring(s: SpringBinding): SpringState {
  const { dx, force } = springAt(s)
  return { id: s.id, kind: 'spring', dx, force: { a: force, b: force } }
}

function wrapAngle(a: number): number {
  return a - 2 * Math.PI * Math.round(a / (2 * Math.PI))
}

/** Path-point indices where the pieces meet: end a, each grip's pulley, end b. */
function pieceBounds(rope: RopeBinding): number[] {
  return [0, ...rope.grips.map((g) => g.at + 1), rope.via.length + 1]
}

/** Each grip's share of its arc on `path`, with the disks turned `spin` beyond their rotation now. */
function gripShares(rope: RopeBinding, path: RopePath, spin?: readonly number[]): number[] {
  return rope.grips.map((g, k) => {
    const arc = path.arcs[g.at]!
    const turned = wrapAngle(g.disk.rotation() - g.rotation) + (spin?.[k] ?? 0)
    return g.share + arc.direction * (turned - wrapAngle(arc.start - g.start))
  })
}

/** Each piece's length on `path`: its legs, the arcs of massless pulleys inside it, and its shares of the grips at its ends. */
function pieceLengths(rope: RopeBinding, path: RopePath, shares: readonly number[]): number[] {
  const bounds = pieceBounds(rope)
  return bounds.slice(1).map((last, k) => {
    const first = bounds[k]!
    let length = 0
    for (let i = first; i < last; i++) {
      const s = path.segments[i]!
      length += Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y)
    }
    for (let i = first + 1; i < last; i++) length += path.arcs[i - 1]!.radius * path.arcs[i - 1]!.sweep
    if (k > 0) length += path.arcs[first - 1]!.radius * (path.arcs[first - 1]!.sweep - shares[k - 1]!)
    if (k < rope.grips.length) length += path.arcs[last - 1]!.radius * shares[k]!
    return length
  })
}

/**
 * Each piece's pulls at `frame`. A grip pulls its mount at the axle and its
 * disk at the tangent point, both along the one leg of the piece: the disk
 * takes the torque, the axle the force.
 */
function piecePulls(rope: RopeBinding, frame: RopeFrame): RopePull[][] {
  const s = frame.path.segments
  const bounds = pieceBounds(rope)
  return bounds.slice(1).map((last, k) => {
    const first = bounds[k]!
    const pulls: RopePull[] = []
    if (k === 0) pulls.push(frame.pulls[0]!)
    else {
      const u = unit(s[first]!.from, s[first]!.to)
      pulls.push({ ...frame.pulls[first]!, u }, { rigid: rope.grips[k - 1]!.disk, p: s[first]!.from, u })
    }
    pulls.push(...frame.pulls.slice(first + 1, last))
    if (k === rope.grips.length) pulls.push(frame.pulls[last]!)
    else {
      const u = unit(s[last - 1]!.to, s[last - 1]!.from)
      pulls.push({ ...frame.pulls[last]!, u }, { rigid: rope.grips[k]!.disk, p: s[last - 1]!.to, u })
    }
    return pulls
  })
}

/** The rate the rope lengthens at along `along`, its points moving at `v`. */
function lengtheningRate(along: readonly RopePull[], v: readonly Vec2[]): number {
  let rate = 0
  along.forEach(({ u }, i) => (rate -= u.x * v[i]!.x + u.y * v[i]!.y))
  return rate
}

/** x with K x = b (Gaussian elimination, partial pivoting); null when K is singular. */
function solveLinear(K: readonly (readonly number[])[], b: readonly number[]): number[] | null {
  const n = b.length
  const rows = K.map((row, i) => [...row, b[i]!])
  for (let c = 0; c < n; c++) {
    let pivot = c
    for (let r = c + 1; r < n; r++) if (Math.abs(rows[r]![c]!) > Math.abs(rows[pivot]![c]!)) pivot = r
    if (Math.abs(rows[pivot]![c]!) < 1e-12) return null
    ;[rows[c], rows[pivot]] = [rows[pivot]!, rows[c]!]
    const top = rows[c]!
    for (let r = c + 1; r < n; r++) {
      const row = rows[r]!
      const f = row[c]! / top[c]!
      for (let j = c; j <= n; j++) row[j] = row[j]! - f * top[j]!
    }
  }
  const x = new Array<number>(n).fill(0)
  for (let r = n - 1; r >= 0; r--) {
    const row = rows[r]!
    let s = row[n]!
    for (let j = r + 1; j < n; j++) s -= row[j]! * x[j]!
    x[r] = s / row[r]!
  }
  return x
}

/**
 * Piece tensions T ≥ 0 with K(T − base) = b on the pieces left taut: a piece
 * whose tension would go negative goes slack and the rest are solved again.
 * One piece reduces to the scalar rope's max(0, base + b/K).
 */
function tautTensions(K: readonly (readonly number[])[], b: readonly number[], base: readonly number[]): number[] {
  const rhs = b.map((bk, k) => bk + K[k]!.reduce((s, kkl, l) => s + kkl * base[l]!, 0))
  let taut = b.map((_, k) => k)
  for (;;) {
    const x = solveLinear(
      taut.map((k) => taut.map((l) => K[k]![l]!)),
      taut.map((k) => rhs[k]!),
    )
    const T = b.map(() => 0)
    if (!x) return T
    taut.forEach((k, i) => (T[k] = x[i]!))
    const still = taut.filter((k) => T[k]! > 0)
    if (still.length === taut.length) return T
    taut = still
  }
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
  private springs: SpringBinding[] = []
  /** The disks of pulleys with mass, by pulley id (PHY-25). */
  private disks = new Map<string, RAPIER.RigidBody>()
  private readonly _warnings: string[] = []
  private particleMode = false

  constructor(scene: Scene) {
    const built = this.buildWorld(scene)
    this.world = built.world
    this.bodies = built.bodies
    this.colliders = built.colliders
    this.forces = built.forces
    this.ropes = built.ropes
    this.springs = built.springs
    this.disks = built.disks
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
    springs: SpringBinding[]
    disks: Map<string, RAPIER.RigidBody>
    warnings: string[]
    particleMode: boolean
  } {
    const world = new RAPIER.World({ x: 0, y: -scene.constants.g })
    world.timestep = TIMESTEP
    const bodies = new Map<string, RAPIER.RigidBody>()
    const colliders = new Map<string, RAPIER.Collider>()
    const forces = new Map<string, ForceBinding>()
    const ropes: RopeBinding[] = []
    const springs: SpringBinding[] = []
    const disks = new Map<string, RAPIER.RigidBody>()

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
      // A pulley with mass (PHY-25) is a disk body of its own that only
      // spins, I = ½MR², kept on its axle by the rope code; its mass rides the
      // mount as a collider that touches nothing, so its weight and inertia
      // enter the mount's translation. Mass 0 builds nothing: the ideal pulley.
      for (const pulley of scene.pulleys ?? []) {
        if (!pulley.mass) continue
        const mount = point(pulley.bodyId, pulley.anchor)
        const axle = worldPoint(mount)
        const disk = world.createRigidBody(
          RAPIER.RigidBodyDesc.dynamic().setTranslation(axle.x, axle.y).lockTranslations().setGravityScale(0),
        )
        world.createCollider(RAPIER.ColliderDesc.ball(pulley.radius).setMass(pulley.mass).setCollisionGroups(0), disk)
        if (mount.rigid.isDynamic()) {
          const weight = RAPIER.ColliderDesc.ball(pulley.radius)
            .setTranslation(pulley.anchor.x, pulley.anchor.y)
            .setMassProperties(pulley.mass, { x: 0, y: 0 }, 0)
            .setCollisionGroups(0)
          world.createCollider(weight, mount.rigid)
        }
        disks.set(pulley.id, disk)
      }
      for (const [index, rope] of (scene.constraints ?? []).entries()) {
        if (rope.kind === 'spring') {
          springs.push({
            id: rope.id,
            index,
            a: point(rope.a.bodyId, rope.a.anchor),
            b: point(rope.b.bodyId, rope.b.anchor),
            k: rope.k,
            x0: rope.x0,
            c: rope.c ?? 0,
          })
          continue
        }
        const path = scenePath(scene, rope)
        if (!path) throw new Error(`rope '${rope.id}' has a dangling reference`)
        const binding: RopeBinding = {
          id: rope.id,
          index,
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
          // The mark starts mid-arc: at the document poses each piece holds half of every arc it ends on.
          grips: rope.via.flatMap((id, at) => {
            const disk = disks.get(id)
            const arc = path.arcs[at]!
            return disk ? [{ at, disk, share: arc.sweep / 2, start: arc.start, rotation: disk.rotation() }] : []
          }),
          pieces: [],
        }
        if (binding.grips.length) {
          const lengths = pieceLengths(binding, path, gripShares(binding, path))
          binding.pieces = lengths.map((length) => ({ length, tension: 0, residual: 0, predicted: 0 }))
        }
        ropes.push(binding)
      }
    } catch (e) {
      world.free()
      throw e
    }
    return { world, bodies, colliders, forces, ropes, springs, disks, warnings, particleMode: scene.constants.particleMode === true }
  }

  step(): void {
    const touched = new Set<RAPIER.RigidBody>()
    for (const binding of this.forces.values()) touched.add(binding.rigid)
    for (const rope of this.ropes) {
      for (const point of [rope.a, ...rope.via, rope.b]) touched.add(point.rigid)
    }
    for (const s of this.springs) touched.add(s.a.rigid).add(s.b.rigid)
    for (const rigid of touched) rigid.resetForces(true)
    // resetForces leaves torques, and a disk is driven by nothing else. The
    // bodies still keep theirs across steps until PHY-34. A disk's force moves
    // nothing (translation locked); it is cleared so it does not pile up.
    for (const disk of this.disks.values()) {
      disk.resetForces(true)
      disk.resetTorques(true)
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
    for (const s of this.springs) this.pushSpring(s)
    for (const rope of this.ropes) {
      if (rope.grips.length) this.pullPieces(rope)
      else this.pullRope(rope)
    }
    this.world.step()
    for (const rope of this.ropes) {
      if (rope.grips.length) this.correctPieces(rope)
      else this.correctRope(rope)
    }
  }

  /**
   * Rope, before the step (ADR-0004): the tension that makes the free motion
   * end the step at exactly L — closing a slack gap in one step at most, or
   * pulling back a fraction of a stretch — plus last step's residual. Applied
   * as a force, so Rapier's contact and friction solve sees it.
   */
  private pullRope(rope: RopeBinding): void {
    const now = ropeFrame(rope)
    const g = this.world.gravity
    const phi = this.substepFactor()
    const v = now.pulls.map(({ rigid, p }) => freePointVelocity(rigid, p, g))
    const free = now.pulls.map(({ rigid, p }, i) => freePoint(rigid, p, v[i]!, phi))
    // The rope where the free step leaves it, and halfway there. Legs turn
    // while the step runs: a pull along the old legs misses the centripetal
    // part of a swing, one along the end legs does work against it and
    // drains its energy. Along the mid-step legs it is square to the chord
    // each end travels, and does neither.
    const end = ropeFrame(rope, free)
    const mid = ropeFrame(
      rope,
      free.map((q, i) => ({ x: (q.x + now.pulls[i]!.p.x) / 2, y: (q.y + now.pulls[i]!.p.y) / 2 })),
    )
    const pulls = now.pulls.map((pull, i) => ({ ...pull, u: mid.pulls[i]!.u }))
    const k = ropeInvMass(
      pulls,
      now.pulls.map((pull, i) => ({ ...pull, u: end.pulls[i]!.u })),
    )
    if (k <= 0) {
      rope.tension = rope.residual = rope.predicted = 0
      return
    }
    // Where the step should leave the rope: taut at L if it was slack (the
    // pull is zero if the free step stays short of L), a fraction of any
    // stretch pulled back otherwise.
    const c = now.length - rope.length
    const target = Math.max(0, (1 - ROPE_BETA) * c)
    const toTarget = (end.length - rope.length - target) / (phi * TIMESTEP * TIMESTEP * k)
    // The reading the correction will make in a step with no contacts: the
    // step ends with the ends moving along a chord, and the correction turns
    // them back onto the rope. It is the rate form of the same pull.
    const lengthening = lengtheningRate(end.pulls, v)
    rope.predicted = (lengthening - ropeAllowance(target)) / (TIMESTEP * k)
    rope.tension = Math.max(0, toTarget + rope.residual)
    if (rope.tension > 0) applyPulls(pulls, rope.tension, false)
  }

  /**
   * Rope, after the step: contacts made the prediction wrong by some amount,
   * so an impulse along the rope removes whatever lengthening remains beyond
   * what the slack allows. The tension it implies becomes the reading, and
   * the part the prediction missed warm-starts the next step. The jerk that
   * pulls a slack rope taut is in the prediction, so it never warm-starts.
   */
  private correctRope(rope: RopeBinding): void {
    const f = ropeFrame(rope)
    const k = ropeInvMass(f.pulls)
    if (k === 0) {
      rope.slack = true
      return
    }
    let lengthening = 0
    for (const { rigid, p, u } of f.pulls) {
      if (!rigid.isDynamic()) continue
      const v = rigid.velocityAtPoint(p)
      lengthening -= u.x * v.x + u.y * v.y
    }
    // ponytail: projecting the chord velocity back onto the rope drains a fast
    // swing (~4% of a 1 m loop's energy per turn at v₀² = 6gL); a RATTLE-style
    // position-and-velocity projection if energy readouts ever need it.
    const corrected = Math.max(0, rope.tension + (lengthening - ropeAllowance(f.length - rope.length)) / (TIMESTEP * k))
    const impulse = (corrected - rope.tension) * TIMESTEP
    if (impulse !== 0) applyPulls(f.pulls, impulse, true)
    rope.tension = corrected
    rope.residual = corrected > 0 ? corrected - rope.predicted : 0
    rope.slack = corrected === 0
  }

  /**
   * Spring (PHY-26), before the step and before the ropes, so their
   * prediction sees it: F_el along the axis at both ends. Rapier's spring
   * joint loses ~30% of the amplitude in 5 periods, so the force is ours.
   * A constant force over Rapier's substeps moves a body φ of the Euler
   * distance, which alone would pump energy in; taking the force (1 − φ)Δt
   * ahead makes the step area-preserving for a linear spring.
   */
  private pushSpring(s: SpringBinding): void {
    const { now, u, force } = springAt(s, (1 - this.substepFactor()) * TIMESTEP)
    if (s.a.rigid.isDynamic()) s.a.rigid.addForceAtPoint({ x: force * u.x, y: force * u.y }, now[0], true)
    if (s.b.rigid.isDynamic()) s.b.rigid.addForceAtPoint({ x: -force * u.x, y: -force * u.y }, now[1], true)
  }

  private substepFactor(): number {
    const n = this.world.numSolverIterations
    return (n + 1) / (2 * n)
  }

  /** Disks only spin: each is moved onto its axle before the rope reads it. */
  private placeDisks(rope: RopeBinding): void {
    for (const { at, disk } of rope.grips) disk.setTranslation(worldPoint(rope.via[at]!), true)
  }

  /**
   * A rope over pulleys with mass (PHY-25): pullRope's prediction, once per
   * piece. The pieces couple through the disks they share and any body two
   * of them pull, so K is a matrix and the tensions solve together.
   */
  private pullPieces(rope: RopeBinding): void {
    this.placeDisks(rope)
    const g = this.world.gravity
    const phi = this.substepFactor()
    const frame = ropeFrame(rope)
    const free = frame.pulls.map(({ rigid, p }) => freePoint(rigid, p, freePointVelocity(rigid, p, g), phi))
    // Each disk's free turn over the step, the same way.
    const spin = rope.grips.map(({ disk }) => {
      const w0 = disk.angvel()
      const w1 = w0 + TIMESTEP * disk.userTorque() * disk.effectiveWorldInvInertia()
      return TIMESTEP * (w0 + phi * (w1 - w0))
    })
    const endFrame = ropeFrame(rope, free)
    const midFrame = ropeFrame(
      rope,
      free.map((q, i) => ({ x: (q.x + frame.pulls[i]!.p.x) / 2, y: (q.y + frame.pulls[i]!.p.y) / 2 })),
    )
    const now = piecePulls(rope, frame)
    const mid = piecePulls(rope, midFrame)
    const end = piecePulls(rope, endFrame)
    const nowLengths = pieceLengths(rope, frame.path, gripShares(rope, frame.path))
    const endLengths = pieceLengths(rope, endFrame.path, gripShares(rope, endFrame.path, spin))
    // J along the mid-step legs, J′ along the end-step ones, both at today's points.
    const pulls = now.map((piece, l) => piece.map((pull, i) => ({ ...pull, u: mid[l]![i]!.u })))
    const along = now.map((piece, k) => piece.map((pull, i) => ({ ...pull, u: end[k]![i]!.u })))
    const K = along.map((a) => pulls.map((p) => ropeInvMass(p, a)))
    const target = rope.pieces.map((piece, k) => Math.max(0, (1 - ROPE_BETA) * (nowLengths[k]! - piece.length)))
    const toTarget = rope.pieces.map(
      (piece, k) => (endLengths[k]! - piece.length - target[k]!) / (phi * TIMESTEP * TIMESTEP),
    )
    const rates = now.map((piece, k) =>
      lengtheningRate(
        end[k]!,
        piece.map(({ rigid, p }) => freePointVelocity(rigid, p, g)),
      ),
    )
    const predicted = solveLinear(
      K,
      rates.map((rate, k) => (rate - ropeAllowance(target[k]!)) / TIMESTEP),
    )
    const tensions = tautTensions(
      K,
      toTarget,
      rope.pieces.map((p) => p.residual),
    )
    rope.pieces.forEach((piece, k) => {
      piece.predicted = predicted?.[k] ?? 0
      piece.tension = tensions[k]!
      if (piece.tension > 0) applyPulls(pulls[k]!, piece.tension, false)
    })
  }

  /** correctRope, once per piece and solved together; first the shares catch up with the disks' turn. */
  private correctPieces(rope: RopeBinding): void {
    this.placeDisks(rope)
    const frame = ropeFrame(rope)
    const shares = gripShares(rope, frame.path)
    rope.grips.forEach((grip, k) => {
      grip.share = shares[k]!
      grip.start = frame.path.arcs[grip.at]!.start
      grip.rotation = grip.disk.rotation()
    })
    const now = piecePulls(rope, frame)
    const lengths = pieceLengths(rope, frame.path, shares)
    const K = now.map((a) => now.map((p) => ropeInvMass(p, a)))
    // ponytail: the same chord-velocity projection as correctRope, same energy drain and upgrade path.
    const b = now.map((piece, k) => {
      const v = piece.map(({ rigid, p }) => (rigid.isDynamic() ? rigid.velocityAtPoint(p) : { x: 0, y: 0 }))
      return (lengtheningRate(piece, v) - ropeAllowance(lengths[k]! - rope.pieces[k]!.length)) / TIMESTEP
    })
    const corrected = tautTensions(
      K,
      b,
      rope.pieces.map((p) => p.tension),
    )
    rope.pieces.forEach((piece, k) => {
      const impulse = (corrected[k]! - piece.tension) * TIMESTEP
      if (impulse !== 0) applyPulls(now[k]!, impulse, true)
      piece.tension = corrected[k]!
      piece.residual = piece.tension > 0 ? piece.tension - piece.predicted : 0
    })
    rope.tension = Math.max(...corrected)
    rope.slack = rope.tension === 0
  }

  /**
   * After a carried rebuild the bodies sit where the run left them, not at
   * the document poses: set each grip's share so the pieces before it hold
   * their length again, as a rope that never slipped would.
   */
  private regrip(rope: RopeBinding): void {
    this.placeDisks(rope)
    const { path } = ropeFrame(rope)
    rope.grips.forEach((grip, k) => {
      grip.share = 0
      grip.start = path.arcs[grip.at]!.start
      grip.rotation = grip.disk.rotation()
      const length = pieceLengths(rope, path, gripShares(rope, path))[k]!
      grip.share = (rope.pieces[k]!.length - length) / path.arcs[grip.at]!.radius
    })
  }

  /** T per leg: each piece's tension on every leg it spans. */
  private segmentTensions(rope: RopeBinding): number[] {
    if (!rope.grips.length) return [...rope.via.map(() => rope.tension), rope.tension]
    const bounds = pieceBounds(rope)
    return rope.pieces.flatMap((piece, k) => Array.from({ length: bounds[k + 1]! - bounds[k]! }, () => piece.tension))
  }

  readConstraints(): ConstraintState[] {
    const read: Array<[number, ConstraintState]> = [
      ...this.ropes.map((r): [number, ConstraintState] => [
        r.index,
        { id: r.id, kind: 'rope', tension: r.tension, slack: r.slack, segments: this.segmentTensions(r) },
      ]),
      ...this.springs.map((s): [number, ConstraintState] => [s.index, readSpring(s)]),
    ]
    return read.sort(([i], [j]) => i - j).map(([, state]) => state)
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
    // The disks are not bodies of the document, so `carry` cannot hold them:
    // a carried rebuild takes each surviving pulley's spin from the live world.
    const spins = new Map([...this.disks].map(([id, disk]) => [id, disk.angvel()]))
    this.world.free()
    this.world = next.world
    this.bodies = next.bodies
    this.colliders = next.colliders
    this.forces = next.forces
    this.ropes = next.ropes
    this.springs = next.springs
    this.disks = next.disks
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
    for (const [id, disk] of this.disks) {
      const spin = spins.get(id)
      if (spin !== undefined) disk.setAngvel(spin, true)
    }
    for (const rope of this.ropes) if (rope.grips.length) this.regrip(rope)
  }
}

export async function createSimulator(scene: Scene): Promise<Simulator> {
  await ensureInit()
  return new RapierSimulator(scene)
}
