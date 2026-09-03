import { describe, expect, it } from 'vitest'
import type { Scene } from '../scene'
import {
  addContact,
  addForce,
  duplicateBody,
  freshId,
  removeBodyAndDependents,
  removeContact,
  removeForce,
  updateBody,
  updateContact,
  updateForce,
  updateG,
  updateParticleMode,
} from './doc'

const DOC: Scene = {
  version: 1,
  constants: { g: 9.81 },
  bodies: [
    {
      id: 'a',
      shape: 'circle',
      position: { x: 0, y: 0 },
      radius: 1,
      mass: 1,
      fixed: false,
      rotation: 0,
    },
    {
      id: 'b',
      shape: 'rectangle',
      position: { x: 5, y: 5 },
      width: 2,
      height: 1,
      mass: 2,
      fixed: false,
      rotation: 0,
    },
  ],
  forces: [{ id: 'f1', bodyId: 'a', anchor: { x: 0, y: 0 }, magnitude: 10, direction: 0 }],
  contacts: [
    { a: 'a', b: 'b', muS: 0.3, muK: 0.2 },
    { a: 'b', b: 'ghost', muS: 0.3, muK: 0.2 },
  ],
}

describe('updateBody', () => {
  // Compile-time proof that id patches never reach the doc (checked by
  // `npm run typecheck`; the probe is never executed at runtime). If the
  // patch type is ever widened back, tsc flags the unused @ts-expect-error.
  function compileTimeProbe(doc: Scene) {
    // @ts-expect-error — Body ids are immutable: renaming dangles forces/contacts
    updateBody(doc, 'a', { id: 'x' })
  }

  it('rejects id patches at compile time (doc-invariant)', () => {
    void compileTimeProbe
    expect(typeof updateBody).toBe('function')
  })

  it('patches the target body immutably', () => {
    const next = updateBody(DOC, 'a', { position: { x: 9, y: 9 } })
    expect(next.bodies[0].position).toEqual({ x: 9, y: 9 })
    expect(next.bodies[1]).toBe(DOC.bodies[1])
    expect(DOC.bodies[0].position).toEqual({ x: 0, y: 0 })
    expect(next.constants).toBe(DOC.constants)
  })

  it('returns an equivalent doc when the id does not exist', () => {
    expect(updateBody(DOC, 'zz', { mass: 3 }).bodies).toEqual(DOC.bodies)
  })
})

describe('freshId', () => {
  it('returns the prefix when free', () => {
    expect(freshId(DOC, 'bloco')).toBe('bloco')
  })

  it('suffixes past existing collisions', () => {
    expect(freshId(DOC, 'a')).toBe('a-2')
  })

  it('skips explicitly taken suffixed ids too', () => {
    const doc: Scene = {
      ...DOC,
      bodies: [...DOC.bodies, { ...DOC.bodies[0], id: 'a-2' }],
    }
    expect(freshId(doc, 'a')).toBe('a-3')
  })
})

describe('duplicateBody', () => {
  it('clones with a fresh id, a documented +0.5m offset, and selects the clone', () => {
    const { doc, newId } = duplicateBody(DOC, 'b')
    expect(newId).not.toBe('b')
    const clone = doc.bodies.at(-1)!
    expect(clone.id).toBe(newId)
    expect(clone.position).toEqual({ x: 5.5, y: 5.5 })
    expect(clone).toMatchObject({ shape: 'rectangle', width: 2, mass: 2 })
    // Original untouched, clone appended last (topmost).
    expect(doc.bodies[1].id).toBe('b')
    expect(doc.bodies).toHaveLength(3)
  })

  it('fresh id avoids collisions across repeated duplication', () => {
    const first = duplicateBody(DOC, 'a')
    expect(first.newId).toBe('a-2')
    const second = duplicateBody(first.doc, 'a')
    expect(second.newId).toBe('a-3')
  })

  it('is a no-op for an unknown id', () => {
    const { doc } = duplicateBody(DOC, 'zz')
    expect(doc).toBe(DOC)
  })
})

describe('removeBodyAndDependents', () => {
  it('removes the body plus dangling forces and contacts referencing it', () => {
    const next = removeBodyAndDependents(DOC, 'a')
    expect(next.bodies.map((b) => b.id)).toEqual(['b'])
    expect(next.forces).toEqual([])
    expect(next.contacts.map((c) => [c.a, c.b])).toEqual([['b', 'ghost']])
    expect(next.constants).toBe(DOC.constants)
  })

  it('is a no-op for an unknown id', () => {
    expect(removeBodyAndDependents(DOC, 'zz').bodies).toHaveLength(2)
  })

  it('strips every contact touching the deleted body', () => {
    const next = removeBodyAndDependents(DOC, 'b')
    expect(next.contacts).toEqual([])
  })
})
// ---------- T6: forces, contacts, constants ----------

const FORCE = { bodyId: 'a', anchor: { x: 0, y: 0 }, magnitude: 5, direction: 90 }

describe('addForce / updateForce / removeForce', () => {
  it('addForce appends with a force-namespace fresh id and selects it', () => {
    const { doc, newId } = addForce(DOC, FORCE)
    expect(newId).toBe('f')
    expect(doc.forces.at(-1)).toMatchObject({ ...FORCE, id: 'f' })
    expect(doc.forces).toHaveLength(2)
    expect(DOC.forces).toHaveLength(1)
  })

  it('addForce rejects a dangling bodyId at doc-op level (same-ref + reason key)', () => {
    const res = addForce(DOC, { ...FORCE, bodyId: 'ghost' })
    expect(res.error).toBe('error.corpoInexistente')
    expect(res.newId).toBeNull()
    expect(res.doc).toBe(DOC)
  })

  it('force id ladder skips existing FORCE ids even when free among bodies', () => {
    // 'f1' exists as a force; body ids never collide with the force namespace.
    const once = addForce(DOC, FORCE)
    expect(once.newId).toBe('f')
    const twice = addForce(once.doc, FORCE)
    expect(twice.newId).toBe('f-2')
  })

  it('updateForce patches magnitude/direction/anchor immutably', () => {
    const next = updateForce(DOC, 'f1', { magnitude: 12, direction: -30 })
    expect(next.forces[0]).toMatchObject({ id: 'f1', magnitude: 12, direction: -30 })
    expect(next.forces[0].anchor).toEqual({ x: 0, y: 0 })
    expect(DOC.forces[0].magnitude).toBe(10)
  })

  it('updateForce rejects id AND bodyId patches at compile time; runtime no-op for unknown ids', () => {
    function compileTimeProbe(doc: Scene) {
      // @ts-expect-error -- force ids are immutable (same doc-invariant as bodies)
      updateForce(doc, 'f1', { id: 'fX' })
      // @ts-expect-error -- retargeting a force is delete+add, not a patch
      updateForce(doc, 'f1', { bodyId: 'b' })
    }
    void compileTimeProbe
    expect(updateForce(DOC, 'zz', { magnitude: 1 }).forces).toEqual(DOC.forces)
  })

  it('removeForce deletes exactly the targeted force', () => {
    const next = removeForce(DOC, 'f1')
    expect(next.forces).toEqual([])
    expect(removeForce(DOC, 'zz').forces).toEqual(DOC.forces)
  })
})

describe('addContact guards + edit/remove', () => {
  it('adds with documented frictionless-adjacent defaults (muS .3 / muK .25)', () => {
    const { doc, error } = addContact({ ...DOC, contacts: [] }, 'a', 'b')
    expect(error).toBeNull()
    expect(doc.contacts.at(-1)).toEqual({ a: 'a', b: 'b', muS: 0.3, muK: 0.25 })
  })

  it('rejects self-pairs, duplicates (same AND reversed order), and dangling references', () => {
    expect(addContact(DOC, 'a', 'a').error).toBe('error.parConsigoMesmo')
    expect(addContact(DOC, 'a', 'b').error).toBe('error.parDuplicado') // exact dup
    expect(addContact(DOC, 'b', 'a').error).toBe('error.parDuplicado') // reversed dup
    expect(addContact(DOC, 'a', 'ghost').error).toBe('error.corpoInexistente')
    expect(addContact(DOC, 'ghost', 'a').error).toBe('error.corpoInexistente')
    // Every rejection leaves the doc untouched (same reference).
    expect(addContact(DOC, 'a', 'a').doc).toBe(DOC)
  })

  it('updateContact patches muS/muK for the ordered pair; unknown pair no-op', () => {
    const next = updateContact(DOC, 'a', 'b', { muS: 0.6 })
    expect(next.contacts[0]).toEqual({ a: 'a', b: 'b', muS: 0.6, muK: 0.2 })
    expect(updateContact(DOC, 'b', 'a', { muS: 0.9 }).contacts[0].muS).toBe(0.3) // reversed != stored
  })

  it('removeContact matches the ordered pair exactly', () => {
    expect(removeContact(DOC, 'a', 'b').contacts).toHaveLength(1)
    expect(removeContact(DOC, 'b', 'a').contacts).toHaveLength(2) // reversed does not match
  })
})

describe('updateG', () => {
  it('replaces constants.g immutably', () => {
    const next = updateG(DOC, 3.72)
    expect(next.constants.g).toBe(3.72)
    expect(next.bodies).toBe(DOC.bodies)
    expect(DOC.constants.g).toBe(9.81)
  })

  it('preserves sibling constants fields (particleMode) — T7/M2', () => {
    const withParticles: typeof DOC = { ...DOC, constants: { g: 9.81, particleMode: true } }
    expect(updateG(withParticles, 3.72).constants.particleMode).toBe(true)
  })
})

describe('updateParticleMode', () => {
  it('toggles constants.particleMode immutably, defaulting absent to false on read', () => {
    const on = updateParticleMode(DOC, true)
    expect(on.constants.g).toBe(DOC.constants.g)
    expect(on.constants.particleMode).toBe(true)
    expect(updateParticleMode(on, false).constants.particleMode).toBe(false)
    expect(DOC.constants.particleMode).toBeUndefined()
  })
})
