/**
 * Live-vs-structural routing (T7/M2): decides whether a document edit can be
 * absorbed by the RUNNING world or needs a carried structural rebuild.
 *
 * LIVE — value edits on existing records the engine can mutate in place:
 * force magnitude/direction/anchor, and constants.g via `setGravity`.
 * STRUCTURAL — everything else: record membership, body geometry/pose/mass/
 * fixed, contact changes (mu drives the GLOBAL friction-potential solve and
 * the warnings set per ADR-0003, not a local collider field), particleMode
 * (changes rigid-body construction). Structural edits rebuild at the frame
 * boundary with carry-over, which is provably trajectory-transparent.
 *
 * React-free and pure: `routeDocChange` reads two documents; `applyLiveOps`
 * is the single place that maps ops onto the Simulator seam.
 */
import type { Body, Scene } from '../scene'
import type { Simulator } from '../sim'

export type LiveOp =
  | { t: 'gravity'; g: number }
  | { t: 'forceMagnitude'; id: string; v: number }
  | { t: 'forceDirection'; id: string; v: number }
  | { t: 'forceAnchor'; id: string; anchor: { x: number; y: number } }

export type DocRoute =
  | { kind: 'live'; ops: LiveOp[] }
  | { kind: 'structural'; reason: string }

function sameBody(a: Body, b: Body): boolean {
  if (
    a.shape !== b.shape ||
    a.fixed !== b.fixed ||
    a.mass !== b.mass ||
    a.position.x !== b.position.x ||
    a.position.y !== b.position.y ||
    a.rotation !== b.rotation ||
    // Initial velocity (ticket 04) is applied at world build only, so an edit
    // to it must route structural (rebuild); absent-vs-absent stays live.
    a.vx !== b.vx ||
    a.vy !== b.vy
  ) {
    return false
  }
  // Shapes are equal here; compare the variant-specific geometry numbers.
  const geometry = (x: Body): number[] =>
    x.shape === 'rectangle' ? [x.width, x.height] : x.shape === 'circle' ? [x.radius] : [x.base, x.alpha]
  const ga = geometry(a)
  return ga.every((v, i) => v === geometry(b)[i])
}

export function routeDocChange(prev: Scene, next: Scene): DocRoute {
  if (next.version !== prev.version) {
    return { kind: 'structural', reason: `version ${prev.version} -> ${next.version}` }
  }

  // Bodies: membership or geometry/state -> structural. The simulator has no
  // live setters for these by design (mass/geometry change collision shapes).
  const prevBodies = new Map(prev.bodies.map((b) => [b.id, b]))
  for (const body of next.bodies) {
    const before = prevBodies.get(body.id)
    if (!before) return { kind: 'structural', reason: `body '${body.id}' added` }
    if (!sameBody(before, body)) return { kind: 'structural', reason: `body '${body.id}' geometry/state changed` }
  }
  if (next.bodies.length !== prev.bodies.length) {
    const nextIds = new Set(next.bodies.map((b) => b.id))
    for (const body of prev.bodies) {
      if (!nextIds.has(body.id)) return { kind: 'structural', reason: `body '${body.id}' removed` }
    }
  }

  // Forces: membership/retarget -> structural; value diffs -> live ops.
  const prevForces = new Map(prev.forces.map((f) => [f.id, f]))
  for (const force of next.forces) {
    const before = prevForces.get(force.id)
    if (!before) return { kind: 'structural', reason: `force '${force.id}' added` }
    if (before.bodyId !== force.bodyId) return { kind: 'structural', reason: `force '${force.id}' retargeted` }
  }
  if (next.forces.length !== prev.forces.length) {
    return { kind: 'structural', reason: 'force removed' }
  }

  // Contacts: keyed by the ordered pair. mu edits ride structural (global
  // potential solve + warnings refresh); documented exception per ADR-0003.
  if (prev.contacts.length !== next.contacts.length) {
    return { kind: 'structural', reason: 'contact membership changed' }
  }
  const prevContacts = new Map(prev.contacts.map((c) => [`${c.a}|${c.b}`, c]))
  for (const contact of next.contacts) {
    const before = prevContacts.get(`${contact.a}|${contact.b}`)
    if (!before || before.muS !== contact.muS || before.muK !== contact.muK) {
      return { kind: 'structural', reason: 'contact pair/friction changed (global friction solve)' }
    }
  }

  if (!!prev.constants.particleMode !== !!next.constants.particleMode) {
    return { kind: 'structural', reason: 'particleMode toggled' }
  }

  const ops: LiveOp[] = []
  if (prev.constants.g !== next.constants.g) ops.push({ t: 'gravity', g: next.constants.g })
  for (const force of next.forces) {
    const before = prevForces.get(force.id)!
    // Forces bound to FIXED bodies are ignored by the engine entirely, so
    // emitting an op would throw at the seam for a behaviourally null change;
    // skip them and doc/world stay in parity.
    const target = prevBodies.get(force.bodyId)
    if (target?.fixed) continue
    if (before.magnitude !== force.magnitude) ops.push({ t: 'forceMagnitude', id: force.id, v: force.magnitude })
    if (before.direction !== force.direction) ops.push({ t: 'forceDirection', id: force.id, v: force.direction })
    if (before.anchor.x !== force.anchor.x || before.anchor.y !== force.anchor.y) {
      ops.push({ t: 'forceAnchor', id: force.id, anchor: { x: force.anchor.x, y: force.anchor.y } })
    }
  }
  return { kind: 'live', ops }
}

/** Applies classified live ops to the running world. Order: g first, then forces in doc order. */
export function applyLiveOps(sim: Simulator, ops: readonly LiveOp[]): void {
  for (const op of ops) {
    switch (op.t) {
      case 'gravity':
        sim.setGravity(op.g)
        break
      case 'forceMagnitude':
        sim.setForceMagnitude(op.id, op.v)
        break
      case 'forceDirection':
        sim.setForceDirection(op.id, op.v)
        break
      case 'forceAnchor':
        sim.setForceAnchor(op.id, op.anchor)
        break
    }
  }
}
