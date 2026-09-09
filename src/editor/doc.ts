import type { AppliedForce, Body, Contact, Scene } from '../scene'

/**
 * Editor doc-op GUARD DOCTRINE: guards here exist only for USER-ACTIONABLE
 * STRUCTURAL violations (references, contact pairs) — they return REASON KEYS
 * (e.g. 'error.corpoInexistente') for i18n; panels render t(error). Value-level
 * validation (finiteness, positivity, soft warnings) stays the codec's job at
 * the import/export/save boundary; the UI's NumField supplies finite values by
 * construction. Do not scatter per-field runtime checks through the editor.
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

type IdScope = 'bodies' | 'forces'

function scopedIds(doc: Scene, scope: IdScope): string[] {
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
 * EDIT, so the document can never hold dangling references.
 */
export function removeBodyAndDependents(doc: Scene, id: string): Scene {
  if (!doc.bodies.some((b) => b.id === id)) return doc
  return {
    ...doc,
    bodies: doc.bodies.filter((b) => b.id !== id),
    forces: doc.forces.filter((f) => f.bodyId !== id),
    contacts: doc.contacts.filter((c) => c.a !== id && c.b !== id),
  }
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

/** Toggles particle mode (T7/M2). Structural: the world rebuilds with locked rotations. */
export function updateParticleMode(doc: Scene, enabled: boolean): Scene {
  return { ...doc, constants: { ...doc.constants, particleMode: enabled } }
}
