import * as RAPIER from '@dimforge/rapier2d-compat'
import { bodyPointToWorld, localVertices, ropePath, scenePath, wrapAngle } from '../scene'
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
  /**
   * The path the rope was last solved on (PHY-56): its last reading of the real
   * poses, or the document poses before the first step. What the canvas draws
   * during playback.
   */
  path?: RopePath
}

export interface SpringState {
  id: string
  kind: 'spring'
  /** Δx = x − x₀, m: + stretched, − compressed. */
  dx: number
  /**
   * F_el at each end, N, + pulling the ends together: k·Δx + c·ẋ at both
   * while the spring is massless; with mass (PHY-30), the force each end got
   * over the last step, which differs while the spring accelerates.
   */
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
  /** Rebuild the whole world at its document-initial state. */
  replaceScene(scene: Scene): void
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
  /** The hidden chain of a spring with mass (PHY-30); null for the ideal spring. */
  chain: Chain | null
}

/**
 * A spring with mass: N nodes of mₛ/N on the axis, joined to each other and
 * to the ends by N + 1 springs of (N + 1)k, x₀/(N + 1) and (N + 1)c. The
 * nodes are ours, not Rapier bodies, so they never collide or show up in
 * `readStates`, and they stay on the axis: a free chain buckles when pushed.
 */
interface Chain {
  mass: number
  /** Node distances along the axis from end a, and velocities along it. */
  p: number[]
  w: number[]
  /** F_el each end got over the last step; the ideal spring's when placed. */
  force: { a: number; b: number }
}

/** Nodes in a spring's hidden chain: effective mass 0.315·mₛ at the end against the continuum's 1/3. */
const CHAIN_NODES = 8

/**
 * The chain's θ-method weight. ½ keeps every mode's energy, so the waves the
 * step cannot follow never die down; 1 (backward Euler) drains 5.5% of the
 * block's amplitude in 10 periods (m = 1, k = 40, mₛ = 0.1). At 0.55 it keeps
 * 99.4%, and the tension the ends get cancels the node ringing exactly.
 */
const CHAIN_THETA = 0.55

interface RopeBinding {
  id: string
  index: number
  a: PointBinding
  b: PointBinding
  via: Array<PointBinding & { radius: number }>
  /** L: the path length at the DOCUMENT poses, fixed for the world's life. */
  length: number
  /** The wrap direction each pulley in `via` holds (PHY-45), refreshed at every read of the real poses. */
  keep: Array<1 | -1>
  /** The unwound sweep each pulley in `via` holds (PHY-54), refreshed where `keep` is. Every rope keeps it, grips or not (PHY-55). */
  sweeps: number[]
  /** The path of the last read of the real poses (PHY-56), refreshed where `keep` is. */
  path: RopePath
  tension: number
  /** Warm start: the tension the free-motion prediction missed last step (contacts, friction). */
  residual: number
  /** The reading the contact-free model expects this step, warm start excluded. */
  predicted: number
  /** End-of-step stretch aimed at by pullPieces when this rope belongs to a group. */
  target: number
  slack: boolean
  /** The pulleys with mass on the path (PHY-25). Empty: one piece, the scalar fields above. */
  grips: Grip[]
  /** One per piece of rope between grips, in path order; empty when `grips` is. */
  pieces: Piece[]
}

/**
 * A pulley with mass on a rope's path. The rope does not slip on the disk, so
 * while the grip holds, the disk splits the rope into two pieces of fixed
 * length: the rope's arc on it is shared at a mark that turns with the disk.
 * When the rope leaves the disk the grip lets go (PHY-55).
 */
interface Grip {
  /** Index of the pulley in `via`. */
  at: number
  disk: RAPIER.RigidBody
  /**
   * The rope has left the disk (its sweep went negative, on the real poses or the step's prediction): the two
   * pieces around it became one, the pulley sits in that piece as an ideal one and pulls nothing on the disk,
   * which spins on with the ω it had. It grips again (PHY-57) when, on the real poses, the sweep is back to 0 or
   * more and the piece is not slack: the piece splits at the middle of the arc into two halves that share its
   * stretch and add up to its length. The next prediction and correction absorb the impact, the rim and the rope
   * meeting at different speeds, as when a slack rope stretches.
   */
  loose: boolean
  /** Angle from where the rope meets the disk to the mark, in the wrap direction: the arriving piece's share. */
  share: number
  /** The rope's meeting angle (`RopeArc.start`) when `share` was last brought up to date. */
  start: number
  /** The disk's angular velocity before the step, for the turn the step integrates (Rapier's own angle runs short of ω·Δt). */
  w0: number
}

interface Piece {
  /**
   * From the document poses like `RopeBinding.length`, and fixed while the grips at its ends hold. A grip that lets
   * go joins its two pieces into one of the summed length; one that grips again (when, and the impact: `Grip.loose`)
   * splits it in two, each half at its length on the path less half the stretch (PHY-57), so the pieces always add
   * up to L.
   */
  length: number
  tension: number
  residual: number
  predicted: number
  /** End-of-step stretch aimed at by pullPieces. */
  target: number
}

/** Fraction of a rope's stretch pulled back per step. */
const ROPE_BETA = 0.2

// ponytail: absolute meters assume meter-scale scenes; impacts missing the target
// by less than 1 cm keep the residual. Upgrade to a threshold relative to the predicted step displacement if needed.
const ROPE_SLIP = 0.01

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
    rope.keep,
    rope.sweeps,
  )
  // Only the bodies' real poses move the kept wrap; the predicted ones (mid and end of step) read it.
  if (!moved) {
    rope.keep = path.arcs.map((arc) => arc.direction)
    rope.sweeps = path.arcs.map((arc) => arc.sweep)
    rope.path = path
  }
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
  const v0 = pointVelocity(rigid, p)
  return { x: p.x + TIMESTEP * (v0.x + phi * (v.x - v0.x)), y: p.y + TIMESTEP * (v0.y + phi * (v.y - v0.y)) }
}

function pointVelocity(rigid: RAPIER.RigidBody, p: Vec2): Vec2 {
  return rigid.isDynamic() ? rigid.velocityAtPoint(p) : { x: 0, y: 0 }
}

/**
 * The spring's axis, length x, Δx and F_el = kΔx + c·ẋ with its ends `lead` seconds
 * ahead of where they are, each moving on at its velocity now.
 */
function springAt(s: SpringBinding, lead = 0) {
  const now = [worldPoint(s.a), worldPoint(s.b)] as const
  const v = [pointVelocity(s.a.rigid, now[0]), pointVelocity(s.b.rigid, now[1])] as const
  const [pa, pb] = now.map((p, i) => ({ x: p.x + lead * v[i]!.x, y: p.y + lead * v[i]!.y }))
  const u = unit(pa!, pb!)
  const x = Math.hypot(pb!.x - pa!.x, pb!.y - pa!.y)
  const dx = x - s.x0
  const rate = (v[1].x - v[0].x) * u.x + (v[1].y - v[0].y) * u.y
  return { now, v, u, x, dx, rate, force: s.k * dx + s.c * rate }
}

function readSpring(s: SpringBinding): SpringState {
  const { dx, force } = springAt(s)
  return { id: s.id, kind: 'spring', dx, force: s.chain?.force ?? { a: force, b: force } }
}

function dot(p: Vec2, q: Vec2): number {
  return p.x * q.x + p.y * q.y
}

/**
 * The chain on the spring's axis: end a, the nodes, end b, as distances from
 * end a now (`at`) and velocities along the axis (`v`). The nodes run `lag`
 * seconds behind the bodies (see chainLag), so the ends are taken back
 * there too, each at its velocity now.
 */
function chainAxis(s: SpringBinding, chain: Chain, lag: number) {
  const { now, v, u, x } = springAt(s)
  const va = dot(v[0], u)
  const vb = dot(v[1], u)
  return { now, u, at: [-lag * va, ...chain.p, x - lag * vb], v: [va, ...chain.w, vb] }
}

/** The tension of each of the chain's springs, + pulling its two points together. */
function chainTensions(s: SpringBinding, at: readonly number[], v: readonly number[]): number[] {
  const n = at.length - 1
  return at.slice(1).map((q, i) => n * s.k * (q - at[i]! - s.x0 / n) + n * s.c * (v[i + 1]! - v[i]!))
}

/**
 * The nodes after one θ-method step, the ends prescribed to finish it at
 * velocities `W` (a, b) along the axis: q with −κ q_{i−1} + (μ/θ²Δt² + 2κ) q_i
 * − κ q_{i+1} = rhs_i, κ = k′ + c′/θΔt, solved by the Thomas algorithm. θ > ½
 * keeps it stable for any mass and damps the modes a 60 Hz step cannot follow.
 * Returns the nodes `q` and their velocities `w`, and the F_el each end gets
 * (θ of the tension after the step, 1 − θ of the one before). All of it is
 * affine in `W`, which is what lets pushSpring put the ends in the group solve.
 */
function chainStep(s: SpringBinding, chain: Chain, at: readonly number[], v: readonly number[], g: number, W: readonly [number, number]) {
  const n = CHAIN_NODES
  const dt = TIMESTEP
  const th = CHAIN_THETA
  const k = (n + 1) * s.k
  const c = (n + 1) * s.c
  const mu = chain.mass / n
  const inertia = mu / (th * th * dt * dt)
  const kappa = k + c / (th * dt)
  const T = chainTensions(s, at, v)
  const second = (x: readonly number[], i: number) => x[i + 1]! - 2 * x[i]! + x[i - 1]!
  const q = at.map((p, j) => p + dt * v[j]!)
  q[0] = at[0]! + dt * ((1 - th) * v[0]! + th * W[0])
  q[n + 1] = at[n + 1]! + dt * ((1 - th) * v[n + 1]! + th * W[1])
  const rhs = at.map((p, i) =>
    i === 0 || i === n + 1
      ? 0
      : inertia * (p + dt * v[i]!) +
        (mu * g) / th -
        (c / (th * dt)) * second(at, i) -
        ((c * (1 - th)) / th) * second(v, i) +
        ((1 - th) / th) * (T[i]! - T[i - 1]!),
  )
  rhs[1] = rhs[1]! + kappa * q[0]!
  rhs[n] = rhs[n]! + kappa * q[n + 1]!
  const diag = inertia + 2 * kappa
  const sweep: number[] = []
  const d: number[] = []
  for (let i = 1; i <= n; i++) {
    const m = diag + kappa * (sweep[i - 2] ?? 0)
    sweep.push(-kappa / m)
    d.push((rhs[i]! + kappa * (d[i - 2] ?? 0)) / m)
  }
  for (let i = n; i >= 1; i--) q[i] = d[i - 1]! - sweep[i - 1]! * (i < n ? q[i + 1]! : 0)
  const w = q.map((p, j) => (j === 0 ? W[0] : j === n + 1 ? W[1] : (p - at[j]!) / (th * dt) - ((1 - th) / th) * v[j]!))
  const after = chainTensions(s, q, w)
  return { q, w, force: { a: th * after[0]! + (1 - th) * T[0]!, b: th * after[n]! + (1 - th) * T[n]! } }
}

/** A chain for `mass`; null for the ideal spring. */
function newChain(mass: number | undefined): Chain | null {
  return mass ? { mass, p: [], w: [], force: { a: 0, b: 0 } } : null
}

/**
 * The nodes evenly spaced between the ends where they are, moving with the
 * axis. A chain stretched evenly pulls both ends with the ideal spring's F_el.
 */
function placeChain(s: SpringBinding, chain: Chain): void {
  const { v, u, x, force } = springAt(s)
  const ua = dot(v[0], u)
  const ub = dot(v[1], u)
  const f = Array.from({ length: CHAIN_NODES }, (_, i) => (i + 1) / (CHAIN_NODES + 1))
  chain.p = f.map((t) => t * x)
  chain.w = f.map((t) => ua + t * (ub - ua))
  chain.force = { a: force, b: force }
}

/** The grips still holding the rope, in path order; a loose one is only an ideal pulley inside its piece. */
function heldGrips(rope: RopeBinding): Grip[] {
  return rope.grips.filter((g) => !g.loose)
}

/**
 * A grip whose arc on `path` has a negative sweep lets go: the two pieces around it become one, of the summed
 * length, with tension, residual, prediction and target at 0 (PHY-55). Gripping again is `regripGrips`'s.
 */
function releaseGrips(rope: RopeBinding, path: RopePath): void {
  let held = 0
  for (const grip of rope.grips) {
    if (grip.loose) continue
    if (path.arcs[grip.at]!.sweep >= 0) {
      held++
      continue
    }
    grip.loose = true
    const [before, after] = rope.pieces.splice(held, 2)
    rope.pieces.splice(held, 0, { length: before!.length + after!.length, tension: 0, residual: 0, predicted: 0, target: 0 })
  }
}

/**
 * A loose grip whose arc on `path` is back to a sweep of 0 or more, and whose piece is not slack (its length on
 * `path` is at least its own), grips again (PHY-57). The piece splits at the middle of the arc, and each half keeps
 * its length on `path` less half the stretch, so the two add up to the piece's length.
 */
function regripGrips(rope: RopeBinding, path: RopePath): void {
  let held = 0
  for (const grip of rope.grips) {
    if (!grip.loose) {
      held++
      continue
    }
    const arc = path.arcs[grip.at]!
    if (arc.sweep < 0) continue
    const stretch = pieceLengths(rope, path, gripShares(rope, path))[held]! - rope.pieces[held]!.length
    if (stretch < 0) continue
    grip.loose = false
    grip.share = arc.sweep / 2
    grip.start = arc.start
    const halves = pieceLengths(rope, path, gripShares(rope, path)).slice(held, held + 2)
    rope.pieces.splice(held, 1, ...halves.map((length) => ({ length: length - stretch / 2, tension: 0, residual: 0, predicted: 0, target: 0 })))
    held++
  }
}

/** Path-point indices where the pieces meet: end a, each held grip's pulley, end b. */
function pieceBounds(rope: RopeBinding): number[] {
  return [0, ...heldGrips(rope).map((g) => g.at + 1), rope.via.length + 1]
}

/** Each held grip's share of its arc on `path`, with the disks turned `turns` since `share` was last brought up to date. */
function gripShares(rope: RopeBinding, path: RopePath, turns?: readonly number[]): number[] {
  return heldGrips(rope).map((g, k) => {
    const arc = path.arcs[g.at]!
    return g.share + arc.direction * ((turns?.[k] ?? 0) - wrapAngle(arc.start - g.start))
  })
}

/** Each piece's length on `path`: its legs, the arcs of massless and loose pulleys inside it, and its shares of the held grips at its ends. */
function pieceLengths(rope: RopeBinding, path: RopePath, shares: readonly number[]): number[] {
  const bounds = pieceBounds(rope)
  return bounds.slice(1).map((last, k) => {
    const first = bounds[k]!
    let length = 0
    for (let i = first; i < last; i++) {
      const s = path.segments[i]!
      length += Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y)
    }
    // A loose pulley (negative sweep) adds no rope.
    for (let i = first + 1; i < last; i++) length += path.arcs[i - 1]!.radius * Math.max(0, path.arcs[i - 1]!.sweep)
    if (k > 0) length += path.arcs[first - 1]!.radius * (path.arcs[first - 1]!.sweep - shares[k - 1]!)
    if (k < shares.length) length += path.arcs[last - 1]!.radius * shares[k]!
    return length
  })
}

/**
 * Each piece's pulls at `frame`. A held grip pulls its mount at the axle and its
 * disk at the tangent point, both along the one leg of the piece: the disk
 * takes the torque, the axle the force. A loose one pulls its axle like an ideal pulley.
 */
function piecePulls(rope: RopeBinding, frame: RopeFrame): RopePull[][] {
  const s = frame.path.segments
  const bounds = pieceBounds(rope)
  const held = heldGrips(rope)
  return bounds.slice(1).map((last, k) => {
    const first = bounds[k]!
    const pulls: RopePull[] = []
    if (k === 0) pulls.push(frame.pulls[0]!)
    else {
      const u = unit(s[first]!.from, s[first]!.to)
      pulls.push({ ...frame.pulls[first]!, u }, { rigid: held[k - 1]!.disk, p: s[first]!.from, u })
    }
    pulls.push(...frame.pulls.slice(first + 1, last))
    if (k === held.length) pulls.push(frame.pulls[last]!)
    else {
      const u = unit(s[last - 1]!.to, s[last - 1]!.from)
      pulls.push({ ...frame.pulls[last]!, u }, { rigid: held[k]!.disk, p: s[last - 1]!.to, u })
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

/** x with K x = b (Gaussian elimination, partial pivoting); regularizes redundant constraints once. */
function solveLinear(K: readonly (readonly number[])[], b: readonly number[], regularized = false): number[] | null {
  const n = b.length
  const scale = Math.max(0, ...K.flat().map(Math.abs))
  const rows = K.map((row, i) => [...row, b[i]!])
  for (let c = 0; c < n; c++) {
    let pivot = c
    for (let r = c + 1; r < n; r++) if (Math.abs(rows[r]![c]!) > Math.abs(rows[pivot]![c]!)) pivot = r
    if (scale === 0 || Math.abs(rows[pivot]![c]!) < 1e-12 * scale) {
      if (scale === 0 || regularized) return null
      // ponytail: tiny compliance for redundant rows; rank-revealing solve if exact redundant tensions matter.
      return solveLinear(
        K.map((row, i) => row.map((value, j) => value + (i === j ? 1e-9 * scale : 0))),
        b,
        true,
      )
    }
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
 * whose tension would go negative goes slack; a slack piece that would stretch
 * rejoins the active set, and the tensions are solved again.
 * One piece reduces to the scalar rope's max(0, base + b/K).
 */
function tautTensions(K: readonly (readonly number[])[], b: readonly number[], base: readonly number[]): number[] {
  const rhs = b.map((bk, k) => bk + K[k]!.reduce((s, kkl, l) => s + kkl * base[l]!, 0))
  const tolerance = 1e-9 * Math.max(1, ...rhs.map(Math.abs))
  let taut = b.map((_, k) => k)
  let T = b.map(() => 0)
  // ponytail: bounded pivots for asymmetric K; a complementarity solver if cycling becomes observable.
  for (let iteration = 0; iteration < 10 * b.length * b.length; iteration++) {
    T = b.map(() => 0)
    const x = solveLinear(
      taut.map((k) => taut.map((l) => K[k]![l]!)),
      taut.map((k) => rhs[k]!),
    )
    if (!x) return T
    taut.forEach((k, i) => (T[k] = x[i]!))
    // Coupled pieces must re-solve after each removal: one slack piece can mask a taut neighbor.
    const worst = taut.reduce((k, l) => T[l]! < T[k]! ? l : k, taut[0] ?? -1)
    if (worst !== -1 && T[worst]! <= 0) {
      taut = taut.filter((k) => k !== worst)
      continue
    }
    const residuals = rhs.map((value, k) => value - K[k]!.reduce((s, kkl, l) => s + kkl * T[l]!, 0))
    let violated = -1
    for (let k = 0; k < b.length; k++) {
      if (!taut.includes(k) && residuals[k]! > (violated === -1 ? tolerance : residuals[violated]!)) violated = k
    }
    if (violated === -1) return T
    taut.push(violated)
  }
  return T.map((t) => Math.max(0, t))
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
      const hull = RAPIER.ColliderDesc.convexHull(new Float32Array(localVertices(body).flatMap((v) => [v.x, v.y])))
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
  private readonly angularLimitWarnedBodies = new Set<string>()

  constructor(scene: Scene) {
    const built = this.buildWorld(scene)
    this.world = built.world
    this.bodies = built.bodies
    this.colliders = built.colliders
    this.forces = built.forces
    this.ropes = built.ropes
    this.springs = built.springs
    this.disks = built.disks
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

      // Ropes (ADR-0004): L comes from the document poses at t = 0.
      const pulleys = new Map((scene.pulleys ?? []).map((p) => [p.id, p]))
      const point = (bodyId: string, anchorLocal: Vec2): PointBinding => {
        const rigid = bodies.get(bodyId)
        if (!rigid) throw new Error(`constraint references missing body '${bodyId}'`)
        return { rigid, anchorLocal }
      }
      // Every pulley gets the rim below; only a pulley with mass (PHY-25) goes
      // on to a disk body of its own that only spins, I = ½MR², kept on its
      // axle by the rope code. Its mass rides the mount as a collider that
      // touches nothing, so its weight and inertia enter the mount's
      // translation. Mass absent or 0 stops after the rim: the ideal pulley.
      for (const pulley of scene.pulleys ?? []) {
        // The rim (PHY-45): every pulley stops a body that reaches it instead of letting it through the disk.
        // On the mount, so it never touches the mount itself; no mass, no friction, no bounce.
        const rim = RAPIER.ColliderDesc.ball(pulley.radius)
          .setTranslation(pulley.anchor.x, pulley.anchor.y)
          .setMassProperties(0, { x: 0, y: 0 }, 0)
          .setFriction(0)
          .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
          .setRestitution(0)
          .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min)
        world.createCollider(rim, point(pulley.bodyId, pulley.anchor).rigid)
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
      for (const [index, constraint] of (scene.constraints ?? []).entries()) {
        if (constraint.kind === 'spring') {
          const spring: SpringBinding = {
            id: constraint.id,
            index,
            a: point(constraint.a.bodyId, constraint.a.anchor),
            b: point(constraint.b.bodyId, constraint.b.anchor),
            k: constraint.k,
            x0: constraint.x0,
            c: constraint.c ?? 0,
            chain: newChain(constraint.mass),
          }
          if (spring.chain) placeChain(spring, spring.chain)
          springs.push(spring)
          continue
        }
        const rope = constraint
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
          keep: path.arcs.map((arc) => arc.direction),
          sweeps: path.arcs.map((arc) => arc.sweep),
          path,
          tension: 0,
          residual: 0,
          predicted: 0,
          target: 0,
          slack: false,
          // The mark starts mid-arc: at the document poses each piece holds half of every arc it ends on.
          grips: rope.via.flatMap((id, at) => {
            const disk = disks.get(id)
            const arc = path.arcs[at]!
            return disk ? [{ at, disk, loose: false, share: arc.sweep / 2, start: arc.start, w0: disk.angvel() }] : []
          }),
          pieces: [],
        }
        if (binding.grips.length) {
          const lengths = pieceLengths(binding, path, gripShares(binding, path))
          binding.pieces = lengths.map((length) => ({ length, tension: 0, residual: 0, predicted: 0, target: 0 }))
        }
        ropes.push(binding)
      }
    } catch (e) {
      world.free()
      throw e
    }
    return { world, bodies, colliders, forces, ropes, springs, disks, warnings }
  }

  step(): void {
    const touched = new Set<RAPIER.RigidBody>()
    const shared = new Map<RAPIER.RigidBody, RopeBinding[]>()
    for (const binding of this.forces.values()) touched.add(binding.rigid)
    for (const rope of this.ropes) {
      for (const point of [rope.a, ...rope.via, rope.b]) touched.add(point.rigid)
      for (const rigid of [...[rope.a, ...rope.via, rope.b].map((p) => p.rigid), ...rope.grips.map((g) => g.disk)]) {
        if (!rigid.isDynamic()) continue
        const ropes = shared.get(rigid) ?? []
        ropes.push(rope)
        shared.set(rigid, ropes)
      }
    }
    for (const s of this.springs) touched.add(s.a.rigid).add(s.b.rigid)
    // resetForces leaves torques: an off-COM addForceAtPoint would pile its
    // torque onto the last step's (PHY-34). A disk's force moves nothing
    // (translation locked); it is cleared so it does not pile up either.
    for (const rigid of touched) {
      rigid.resetForces(true)
      rigid.resetTorques(true)
    }
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
    const rebaseChains: Array<() => void> = []
    for (const s of this.springs) rebaseChains.push(...this.pushSpring(s))
    // Connected ropes share a solve; fixed anchors do not couple their motion.
    const remaining = new Set(this.ropes)
    const groups: RopeBinding[][] = []
    for (const rope of remaining) {
      const group = [rope]
      remaining.delete(rope)
      for (const member of group) {
        for (const rigid of [...[member.a, ...member.via, member.b].map((p) => p.rigid), ...member.grips.map((g) => g.disk)]) {
          for (const neighbour of shared.get(rigid) ?? []) {
            if (remaining.delete(neighbour)) group.push(neighbour)
          }
        }
      }
      groups.push(group)
    }
    for (const group of groups) {
      if (group.length > 1 || group[0]!.grips.length) this.pullPieces(group)
      else this.pullRope(group[0]!)
    }
    // Rapier caps |ω|·Δt at π/4 on every body. A disk keeps its ω outside the world: it enters the step at 0, so the
    // solver only adds the rope torque's Δt·τ/I, and gets ω back after (PHY-50). Its Rapier angle means nothing.
    const spins = [...this.disks.values()].map((disk) => ({ disk, w: disk.angvel() }))
    for (const { disk } of spins) disk.setAngvel(0, true)
    this.world.step()
    const angularLimit = Math.PI / (4 * TIMESTEP)
    for (const [id, rigid] of this.bodies) {
      // Contacts settle slightly below the cap; PHY-51 measured 96.7% for a capped rolling circle.
      if (Math.abs(rigid.angvel()) >= 0.95 * angularLimit && !this.angularLimitWarnedBodies.has(id)) {
        this._warnings.push(`body '${id}' approaches Rapier's ω ceiling of ${angularLimit.toFixed(2)} rad/s (|ω|·Δt ≤ π/4); rolling may slip`)
        this.angularLimitWarnedBodies.add(id)
      }
    }
    for (const { disk, w } of spins) disk.setAngvel(w + disk.angvel(), true)
    for (const rebase of rebaseChains) rebase()
    for (const group of groups) {
      if (group.length > 1 || group[0]!.grips.length) this.correctPieces(group)
      else this.correctRope(group[0]!)
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
   * distance, which alone would pump energy in; the elastic term keeps its
   * (1 − φ)Δt lead, with both k and c using the end-of-step relative velocity.
   *
   * With mass (PHY-30) the spring is a θ-method chain (chainStep), and each
   * end gets its tension weighted the same way. Springs, ideal or with mass,
   * that share a dynamic body solve together: the chain's ends are prescribed
   * at the velocities the group's forces leave them (PHY-48), so a stiff or
   * damped end no longer injects energy through an explicit force. Returns
   * the chains' rebases for after the world step.
   */
  private pushSpring(s: SpringBinding): Array<() => void> {
    // Only shared dynamic bodies couple springs; fixed anchors do not.
    const group = new Set([s])
    for (const member of group) {
      for (const spring of this.springs) {
        if ([member.a, member.b].some(({ rigid }) => rigid.isDynamic() && (rigid === spring.a.rigid || rigid === spring.b.rigid))) group.add(spring)
      }
    }
    const springs = this.springs.filter((spring) => group.has(spring))
    if (s !== springs[0]) return []
    const g = this.world.gravity
    const lead = (1 - this.substepFactor()) * TIMESTEP
    // Row i: F_i − Σ_c c.d·ΔV_c = rhs_i, ΔV_c = Δt·Σ_j K(pulls_j, c.along)·F_j the
    // velocity the forces add to c.along. An ideal spring is one row on its
    // rate; a chain's dynamic end is one row on the velocities of both ends,
    // d being the end force's slope against each end's velocity (PHY-48).
    const rows: Array<{ pulls: RopePull[]; rhs: number; couple: Array<{ along: RopePull[]; d: number }> }> = []
    const settle: Array<(forces: readonly number[]) => () => void> = []
    // Read the group's free velocities before applying its spring forces.
    for (const spring of springs) {
      const chain = spring.chain
      if (!chain) {
        const { now, u, dx, rate } = springAt(spring, lead)
        const pulls = [
          { rigid: spring.a.rigid, p: now[0], u },
          { rigid: spring.b.rigid, p: now[1], u: { x: -u.x, y: -u.y } },
        ]
        const free = pulls.map(({ rigid, p }) => freePointVelocity(rigid, p, g))
        const implicit = spring.k * lead + spring.c
        rows.push({ pulls, rhs: spring.k * dx + spring.c * rate + implicit * (lengtheningRate(pulls, free) - rate), couple: [{ along: pulls, d: -implicit }] })
        continue
      }
      const { now, u, at, v } = chainAxis(spring, chain, this.chainLag())
      const ends: [RopePull, RopePull] = [
        { rigid: spring.a.rigid, p: now[0], u },
        { rigid: spring.b.rigid, p: now[1], u: { x: -u.x, y: -u.y } },
      ]
      const free: [number, number] = [dot(freePointVelocity(ends[0].rigid, now[0], g), u), dot(freePointVelocity(ends[1].rigid, now[1], g), u)]
      const run = (W: readonly [number, number]) => chainStep(spring, chain, at, v, dot(g, u), W).force
      const f0 = run(free)
      const fa = run([free[0] + 1, free[1]])
      const fb = run([free[0], free[1] + 1])
      // The ends' velocities in their pull directions are W_a and −W_b.
      const slope = (end: 'a' | 'b') => [
        { along: [ends[0]], d: fa[end] - f0[end] },
        { along: [ends[1]], d: f0[end] - fb[end] },
      ]
      if (spring.a.rigid.isDynamic()) rows.push({ pulls: [ends[0]], rhs: f0.a, couple: slope('a') })
      if (spring.b.rigid.isDynamic()) rows.push({ pulls: [ends[1]], rhs: f0.b, couple: slope('b') })
      // With the forces solved, the chain runs once more at the end velocities
      // they give (it keeps the nodes and the readout), and rebases after Rapier
      // moves end a, including acceleration and anchor rotation (PHY-42).
      settle.push((forces) => {
        const dv = ends.map((end) => TIMESTEP * rows.reduce((sum, row, i) => sum + forces[i]! * ropeInvMass(row.pulls, [end]), 0))
        const { q, w, force } = chainStep(spring, chain, at, v, dot(g, u), [free[0] + dv[0]!, free[1] - dv[1]!])
        chain.force = force
        chain.p = q.slice(1, -1)
        chain.w = w.slice(1, -1)
        return () => {
          const a = worldPoint(spring.a)
          const moved = (a.x - now[0].x) * u.x + (a.y - now[0].y) * u.y
          chain.p = chain.p.map((p) => p - moved)
        }
      })
    }
    // ponytail: regroup at each call and solve dense O(n³) per group; cache groups/use sparse solves if scene sizes demand it.
    const matrix = rows.map((a, i) => rows.map((b, j) => (i === j ? 1 : 0) - TIMESTEP * a.couple.reduce((sum, c) => sum + c.d * ropeInvMass(b.pulls, c.along), 0)))
    const forces = solveLinear(matrix, rows.map((row) => row.rhs))
    if (!forces) throw new Error('Unable to solve spring forces')
    rows.forEach((row, i) => applyPulls(row.pulls, forces[i]!, false))
    return settle.map((finish) => finish(forces))
  }

  /**
   * The chain sees the ends θΔt ahead of itself, but they must be seen
   * pushSpring's (1 − φ)Δt ahead of the bodies (with θ = 1 and no lag the block
   * loses two thirds of its amplitude in 10 periods), so it runs (θ − 1 + φ)Δt
   * behind the bodies.
   */
  private chainLag(): number {
    return (CHAIN_THETA - 1 + this.substepFactor()) * TIMESTEP
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
   * PullRope's prediction, once per piece across a connected group (PHY-41).
   * A rope without massive pulleys is one piece; all tensions solve together.
   */
  private pullPieces(ropes: readonly RopeBinding[]): void {
    const g = this.world.gravity
    const phi = this.substepFactor()
    const rows = ropes.flatMap((rope) => {
      this.placeDisks(rope)
      const frame = ropeFrame(rope)
      const free = frame.pulls.map(({ rigid, p }) => freePoint(rigid, p, freePointVelocity(rigid, p, g), phi))
      const endFrame = ropeFrame(rope, free)
      // A grip grips again only on the real poses, and lets go on them or on where the step is about to leave the rope.
      regripGrips(rope, frame.path)
      releaseGrips(rope, frame.path)
      releaseGrips(rope, endFrame.path)
      // Each held disk's free turn over the step, the same way.
      const spin = heldGrips(rope).map((grip) => {
        const { disk } = grip
        const w0 = (grip.w0 = disk.angvel())
        const w1 = w0 + TIMESTEP * disk.userTorque() * disk.effectiveWorldInvInertia()
        return TIMESTEP * (w0 + phi * (w1 - w0))
      })
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
      const pieces = rope.grips.length ? rope.pieces : [rope]
      return pieces.map((piece, k) => {
        const target = (piece.target = Math.max(0, (1 - ROPE_BETA) * (nowLengths[k]! - piece.length)))
        return {
          piece,
          pulls: pulls[k]!,
          along: along[k]!,
          toTarget: (endLengths[k]! - piece.length - target) / (phi * TIMESTEP * TIMESTEP),
          rate: (lengtheningRate(end[k]!, now[k]!.map(({ rigid, p }) => freePointVelocity(rigid, p, g))) - ropeAllowance(Math.min(target, nowLengths[k]! - piece.length))) / TIMESTEP,
        }
      })
    })
    // A prediction that pushes the end-of-step leg against the mid-step one (contact holds a body) would flip the
    // diagonal's sign. That row falls back to the legs its own pull acts along, so it stays in the matrix with a
    // positive diagonal. pullRope's scalar `k <= 0` branch does not do this: it zeroes the tension and returns (PHY-45).
    for (const row of rows) if (ropeInvMass(row.pulls, row.along) <= 0) row.along = row.pulls
    const K = rows.map((a) => rows.map((p) => ropeInvMass(p.pulls, a.along)))
    const predicted = tautTensions(
      K,
      rows.map((r) => r.rate),
      rows.map(() => 0),
    )
    const tensions = tautTensions(
      K,
      rows.map((r) => r.toTarget),
      rows.map((r) => r.piece.residual),
    )
    rows.forEach(({ piece, pulls }, k) => {
      piece.predicted = predicted[k]!
      piece.tension = tensions[k]!
      if (piece.tension > 0) applyPulls(pulls, piece.tension, false)
    })
  }

  /** correctRope, once per piece and solved together; first the shares catch up with the disks' turn. */
  private correctPieces(ropes: readonly RopeBinding[]): void {
    const phi = this.substepFactor()
    const rows = ropes.flatMap((rope) => {
      this.placeDisks(rope)
      const frame = ropeFrame(rope)
      releaseGrips(rope, frame.path)
      // The same turn pullPieces predicted, now with the ω the step ended on.
      const held = heldGrips(rope)
      const turns = held.map(({ disk, w0 }) => TIMESTEP * (w0 + phi * (disk.angvel() - w0)))
      const shares = gripShares(rope, frame.path, turns)
      held.forEach((grip, k) => {
        grip.share = shares[k]!
        grip.start = frame.path.arcs[grip.at]!.start
      })
      const now = piecePulls(rope, frame)
      const lengths = pieceLengths(rope, frame.path, shares)
      const pieces = rope.grips.length ? rope.pieces : [rope]
      return pieces.map((piece, k) => ({ piece, pulls: now[k]!, length: lengths[k]! }))
    })
    const K = rows.map((a) => rows.map((p) => ropeInvMass(p.pulls, a.pulls)))
    // ponytail: the same chord-velocity projection as correctRope, same energy drain and upgrade path.
    const b = rows.map(({ piece, pulls, length }) => {
      const v = pulls.map(({ rigid, p }) => pointVelocity(rigid, p))
      return (lengtheningRate(pulls, v) - ropeAllowance(length - piece.length)) / TIMESTEP
    })
    const corrected = tautTensions(
      K,
      b,
      rows.map((r) => r.piece.tension),
    )
    rows.forEach(({ piece, pulls, length }, k) => {
      const impulse = (corrected[k]! - piece.tension) * TIMESTEP
      if (impulse !== 0) applyPulls(pulls, impulse, true)
      piece.tension = corrected[k]!
      // A contact that cancelled the pull must not turn the missed target into stored tension.
      piece.residual = piece.tension > 0 && length - piece.length - piece.target <= ROPE_SLIP ? piece.tension - piece.predicted : 0
    })
    for (const rope of ropes) {
      if (rope.grips.length) rope.tension = Math.max(...rope.pieces.map((p) => p.tension))
      rope.slack = rope.tension === 0
    }
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
        { id: r.id, kind: 'rope', tension: r.tension, slack: r.slack, segments: this.segmentTensions(r), path: r.path },
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

  replaceScene(scene: Scene): void {
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
    this.springs = next.springs
    this.disks = next.disks
    this._warnings.length = 0
    this._warnings.push(...next.warnings)
    this.angularLimitWarnedBodies.clear()
  }
}

export async function createSimulator(scene: Scene): Promise<Simulator> {
  await ensureInit()
  return new RapierSimulator(scene)
}
