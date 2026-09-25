import { bodyPointToWorld, type AppliedForce, type Body, type ConstraintEnd, type Contact, type Pulley, type Rope, type Scene, type Spring } from '../scene'

/**
 * Editor doc-op GUARD DOCTRINE: guards here exist only for USER-ACTIONABLE
 * STRUCTURAL violations (references, contact pairs) — they return REASON KEYS
 * (e.g. 'error.corpoInexistente') for i18n; panels render t(error). Value-level
 * validation (finiteness, positivity, soft warnings) stays the codec's job at
 * the import/export/save boundary; the UI's NumField supplies finite values by
 * construction. Do not scatter per-field runtime checks through the editor.
 * One recorded exception (PHY-27, proxy decision on criterion 3): the spring
 * inspector refuses an edit the codec would reject (k ≤ 0, x₀ ≤ 0, c < 0)
 * instead of clamping, because a clamp would change the physics silently.
 */

/**
 * Patch excluding id, DISTRIBUTIVE over the Body union so shape-specific keys
 * (width/radius/base/alpha) stay known — a plain Partial<Omit<Body,'id'>>
 * would collapse the union's key set to the intersection.
 */
type DistributivePartialOmit<T, K extends PropertyKey> = T extends unknown ? Partial<Omit<T, K>> : never
export type BodyPatch = DistributivePartialOmit<Body, 'id'>
/** bodyId is IMMUTABLE: retargeting a force is delete+add, not a patch. */
export type ForcePatch = Partial<Omit<AppliedForce, 'id' | 'bodyId'>>

type IdScope = 'bodies' | 'forces' | 'constraints' | 'pulleys'

function scopedIds(doc: Scene, scope: IdScope): string[] {
  if (scope === 'constraints') return (doc.constraints ?? []).map((c) => c.id)
  if (scope === 'pulleys') return (doc.pulleys ?? []).map((p) => p.id)
  return scope === 'bodies' ? doc.bodies.map((b) => b.id) : doc.forces.map((f) => f.id)
}

/** First non-colliding id in the given namespace: `prefix`, `prefix-2`, `prefix-3`, … */
export function freshId(doc: Scene, prefix: string, scope: IdScope = 'bodies'): string {
  const ids = new Set(scopedIds(doc, scope))
  if (!ids.has(prefix)) return prefix
  let n = 2
  while (ids.has(`${prefix}-${n}`)) n++
  return `${prefix}-${n}`
}

export interface DuplicateResult {
  doc: Scene
  /** Id of the appended clone — callers select it. */
  newId: string | null
}

/**
 * Immutable body patch, EXCLUDING id: renaming a body would dangle every
 * force/contact referencing it. The type system is the single gate (no
 * runtime guard) — all call sites are typed and the test suite carries a
 * compile-time probe so any widening fails `npm run typecheck`.
 */
export function updateBody(doc: Scene, id: string, patch: BodyPatch): Scene {
  return {
    ...doc,
    // Spread of a Partial union can't be proven to re-form the union; the
    // patch always targets one concrete body's fields at runtime.
    bodies: doc.bodies.map((b) => (b.id === id ? ({ ...b, ...patch } as Body) : b)),
  }
}

/**
 * Clones the selected body with a documented +0.5 m / +0.5 m offset and a
 * fresh id, appended LAST in the bodies array (drawn topmost). Forces and
 * contacts are not cloned — they belong to the doc-level dependents model.
 */
export function duplicateBody(doc: Scene, id: string): DuplicateResult {
  const original = doc.bodies.find((b) => b.id === id)
  if (!original) return { doc, newId: null }
  const newId = freshId(doc, original.id)
  return {
    doc: {
      ...doc,
      bodies: [
        ...doc.bodies,
        {
          ...original,
          id: newId,
          position: { x: original.position.x + 0.5, y: original.position.y + 0.5 },
        },
      ],
    },
    newId,
  }
}

/**
 * Doc-level delete for M1 (before T6's dependent management): removing a body
 * strips every force anchored to it and every contact touching it IN THE SAME
 * EDIT, so the document can never hold dangling references. PHY-23: also the
 * pulleys mounted on it, the ropes tied to it, and the ropes passing over
 * those pulleys. Absent collections stay absent.
 */
export function removeBodyAndDependents(doc: Scene, id: string): Scene {
  if (!doc.bodies.some((b) => b.id === id)) return doc
  const next: Scene = {
    ...doc,
    bodies: doc.bodies.filter((b) => b.id !== id),
    forces: doc.forces.filter((f) => f.bodyId !== id),
    contacts: doc.contacts.filter((c) => c.a !== id && c.b !== id),
  }
  const lostPulleys = new Set((doc.pulleys ?? []).filter((p) => p.bodyId === id).map((p) => p.id))
  if (doc.pulleys) next.pulleys = doc.pulleys.filter((p) => !lostPulleys.has(p.id))
  if (doc.constraints) {
    next.constraints = doc.constraints.filter(
      (c) => c.a.bodyId !== id && c.b.bodyId !== id && !(c.kind === 'rope' && c.via.some((p) => lostPulleys.has(p))),
    )
  }
  return next
}

// ---------- T6: forces, contacts, constants ----------

export interface MutationResult {
  doc: Scene
  newId: string | null
  /** Null on success; i18n reason key (e.g. 'error.corpoInexistente') when a structural guard rejected. */
  error: string | null
}

/**
 * Appends a force with a fresh id in the FORCE namespace (independent of body
 * ids). STRUCTURAL GUARD: bodyId must reference an existing body (the type
 * system can't express "existing id") — rejection returns the SAME doc ref.
 */
export function addForce(
  doc: Scene,
  spec: Omit<AppliedForce, 'id'>,
): MutationResult {
  if (!doc.bodies.some((b) => b.id === spec.bodyId)) {
    return { doc, newId: null, error: 'error.corpoInexistente' }
  }
  const newId = freshId(doc, 'f', 'forces')
  return { doc: { ...doc, forces: [...doc.forces, { ...spec, id: newId }] }, newId, error: null }
}

/**
 * Immutable force patch, EXCLUDING id (same doc-invariant as bodies; the
 * test suite carries a compile-time probe).
 */
export function updateForce(doc: Scene, id: string, patch: ForcePatch): Scene {
  if (!doc.forces.some((f) => f.id === id)) return doc
  return {
    ...doc,
    forces: doc.forces.map((f) => (f.id === id ? { ...f, ...patch } : f)),
  }
}

export function removeForce(doc: Scene, id: string): Scene {
  if (!doc.forces.some((f) => f.id === id)) return doc
  return { ...doc, forces: doc.forces.filter((f) => f.id !== id) }
}

export interface ContactAddResult {
  doc: Scene
  /** Null on success; a human-readable reason when the guard rejected. */
  error: string | null
}

/** Idealized default for a newly added pair (ADR-0002: realism is opt-in). */
export const CONTACT_DEFAULTS = { muS: 0, muK: 0 } as const

/**
 * Adds a contact pair under the same HARD rules as the codec, so the UI can
 * never build an unparseable doc: self-pairs, duplicates (same OR reversed
 * order), and dangling references are all REJECTED — rejections return the
 * SAME doc reference plus an error reason. `mu` defaults to CONTACT_DEFAULTS.
 */
export function addContact(
  doc: Scene,
  a: string,
  b: string,
  mu: Pick<Contact, 'muS' | 'muK'> = CONTACT_DEFAULTS,
): ContactAddResult {
  if (a === b) return { doc, error: 'error.parConsigoMesmo' }
  const ids = new Set(doc.bodies.map((x) => x.id))
  if (!ids.has(a) || !ids.has(b)) return { doc, error: 'error.corpoInexistente' }
  const dup = doc.contacts.some((c) => (c.a === a && c.b === b) || (c.a === b && c.b === a))
  if (dup) return { doc, error: 'error.parDuplicado' }
  return { doc: { ...doc, contacts: [...doc.contacts, { a, b, ...mu }] }, error: null }
}

/** Contacts have no id field — ordered pair (as stored) is their identity. */
function findContact(doc: Scene, a: string, b: string) {
  return doc.contacts.findIndex((c) => c.a === a && c.b === b)
}

export function updateContact(
  doc: Scene,
  a: string,
  b: string,
  patch: Partial<Pick<Contact, 'muS' | 'muK'>>,
): Scene {
  const i = findContact(doc, a, b)
  if (i < 0) return doc
  return {
    ...doc,
    contacts: doc.contacts.map((c, j) => (j === i ? { ...c, ...patch } : c)),
  }
}

export function removeContact(doc: Scene, a: string, b: string): Scene {
  const i = findContact(doc, a, b)
  if (i < 0) return doc
  return { ...doc, contacts: doc.contacts.filter((_, j) => j !== i) }
}

export function updateG(doc: Scene, g: number): Scene {
  return { ...doc, constants: { ...doc.constants, g } }
}

// ---------- PHY-27: springs ----------

/** Stiffness of a spring fresh from the palette, N/m; the student edits it in the inspector. */
export const SPRING_DEFAULT_K = 20

export type SpringPatch = Partial<Pick<Spring, 'k' | 'x0' | 'c'>>

/** x, the current anchor-to-anchor distance at the document's poses; null when an end dangles. */
function springLength(doc: Scene, a: ConstraintEnd, b: ConstraintEnd): number | null {
  const bodyA = doc.bodies.find((x) => x.id === a.bodyId)
  const bodyB = doc.bodies.find((x) => x.id === b.bodyId)
  if (!bodyA || !bodyB) return null
  const pa = bodyPointToWorld(bodyA, a.anchor)
  const pb = bodyPointToWorld(bodyB, b.anchor)
  return Math.hypot(pb.x - pa.x, pb.y - pa.y)
}

/**
 * Appends a relaxed spring (x0 = x) between two anchors. STRUCTURAL GUARDS,
 * as the codec would reject: both bodies must exist and differ, and the
 * anchors must not coincide (x0 > 0).
 */
export function addSpring(doc: Scene, a: ConstraintEnd, b: ConstraintEnd): MutationResult {
  if (a.bodyId === b.bodyId) return { doc, newId: null, error: 'error.parConsigoMesmo' }
  const x0 = springLength(doc, a, b)
  if (x0 === null) return { doc, newId: null, error: 'error.corpoInexistente' }
  if (x0 === 0) return { doc, newId: null, error: 'error.molaSemComprimento' }
  const newId = freshId(doc, 'mola', 'constraints')
  const spring: Spring = { id: newId, kind: 'spring', a, b, k: SPRING_DEFAULT_K, x0 }
  return { doc: { ...doc, constraints: [...(doc.constraints ?? []), spring] }, newId, error: null }
}

/** Patches a spring's k, x0 or c; any other constraint id, or a missing one, returns the doc unchanged. */
export function updateSpring(doc: Scene, id: string, patch: SpringPatch): Scene {
  if (!doc.constraints?.some((c) => c.id === id && c.kind === 'spring')) return doc
  return { ...doc, constraints: doc.constraints.map((c) => (c.id === id && c.kind === 'spring' ? { ...c, ...patch } : c)) }
}

/** Δx = x − x0 at the document's poses (0 when an end dangles). */
export function springDx(doc: Scene, spring: Spring): number {
  return (springLength(doc, spring.a, spring.b) ?? spring.x0) - spring.x0
}

/** The x0/Δx link: typing Δx writes x0 = x − Δx. */
export function setSpringDx(doc: Scene, id: string, dx: number): Scene {
  const spring = doc.constraints?.find((c): c is Spring => c.id === id && c.kind === 'spring')
  const x = spring && springLength(doc, spring.a, spring.b)
  if (x == null) return doc
  return updateSpring(doc, id, { x0: x - dx })
}

/** Removes one spring or rope; the bodies and pulleys it joined stay. A missing id returns the doc unchanged. */
export function removeConstraint(doc: Scene, id: string): Scene {
  if (!doc.constraints?.some((c) => c.id === id)) return doc
  return { ...doc, constraints: doc.constraints.filter((c) => c.id !== id) }
}

// ---------- PHY-28: pulleys and ropes ----------

/** Radius of a pulley fresh from the palette, m; the student edits it in the inspector. */
export const PULLEY_DEFAULT_RADIUS = 0.25

export type PulleyPatch = Partial<Pick<Pulley, 'radius' | 'mass'>>

/** Mounts a massless pulley at a body-local anchor. STRUCTURAL GUARD: the body must exist. */
export function addPulley(doc: Scene, bodyId: string, anchor: Pulley['anchor']): MutationResult {
  if (!doc.bodies.some((b) => b.id === bodyId)) return { doc, newId: null, error: 'error.corpoInexistente' }
  const newId = freshId(doc, 'polia', 'pulleys')
  const pulley: Pulley = { id: newId, bodyId, anchor, radius: PULLEY_DEFAULT_RADIUS }
  return { doc: { ...doc, pulleys: [...(doc.pulleys ?? []), pulley] }, newId, error: null }
}

export function updatePulley(doc: Scene, id: string, patch: PulleyPatch): Scene {
  if (!doc.pulleys?.some((p) => p.id === id)) return doc
  return { ...doc, pulleys: doc.pulleys.map((p) => (p.id === id ? { ...p, ...patch } : p)) }
}

/** Removes a pulley and every rope passing over it, in the same edit. */
export function removePulleyAndDependents(doc: Scene, id: string): Scene {
  if (!doc.pulleys?.some((p) => p.id === id)) return doc
  const next: Scene = { ...doc, pulleys: doc.pulleys.filter((p) => p.id !== id) }
  if (doc.constraints) next.constraints = doc.constraints.filter((c) => c.kind !== 'rope' || !c.via.includes(id))
  return next
}

/**
 * Appends a rope from `a` over `via`, in order, to `b`. STRUCTURAL GUARDS, as
 * the codec would reject: every body and pulley must exist, no pulley twice in
 * a row, and a rope with no pulley must join two different bodies.
 */
export function addRope(doc: Scene, a: ConstraintEnd, via: readonly string[], b: ConstraintEnd): MutationResult {
  const bodies = new Set(doc.bodies.map((x) => x.id))
  if (!bodies.has(a.bodyId) || !bodies.has(b.bodyId)) return { doc, newId: null, error: 'error.corpoInexistente' }
  const pulleys = new Set((doc.pulleys ?? []).map((p) => p.id))
  if (!via.every((p) => pulleys.has(p))) return { doc, newId: null, error: 'error.poliaInexistente' }
  if (via.some((p, i) => p === via[i - 1])) return { doc, newId: null, error: 'error.poliaRepetida' }
  if (via.length === 0 && a.bodyId === b.bodyId) return { doc, newId: null, error: 'error.parConsigoMesmo' }
  const newId = freshId(doc, 'corda', 'constraints')
  const rope: Rope = { id: newId, kind: 'rope', a, b, via: [...via] }
  return { doc: { ...doc, constraints: [...(doc.constraints ?? []), rope] }, newId, error: null }
}

/** Toggles particle mode (T7/M2). Structural: the world rebuilds with locked rotations. */
export function updateParticleMode(doc: Scene, enabled: boolean): Scene {
  return { ...doc, constants: { ...doc.constants, particleMode: enabled } }
}
