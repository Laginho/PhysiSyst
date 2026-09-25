import { describe, expect, it } from 'vitest'
import type { Scene } from '../scene'
import {
  addContact,
  addForce,
  addSpring,
  duplicateBody,
  freshId,
  removeBodyAndDependents,
  removeConstraint,
  removeContact,
  removeForce,
  setSpringDx,
  springDx,
  updateBody,
  updateContact,
  updateForce,
  updateG,
  updateParticleMode,
  updateSpring,
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

describe('PHY-23: removeBodyAndDependents with pulleys and ropes', () => {
  // Two ceilings, each carrying a pulley; rope r1 hangs a–b over p1, rope r2
  // hangs b–c over p2.
  const block = (id: string, x: number) =>
    ({ id, shape: 'rectangle', width: 0.4, height: 0.4, mass: 1, fixed: false, position: { x, y: 0 }, rotation: 0 }) as const
  const ceiling = (id: string, x: number) =>
    ({ id, shape: 'rectangle', width: 2, height: 0.5, mass: 0, fixed: true, position: { x, y: 5 }, rotation: 0 }) as const
  const end = (bodyId: string) => ({ bodyId, anchor: { x: 0, y: 0.2 } })
  const ROPED: Scene = {
    version: 1,
    constants: { g: 9.81 },
    bodies: [ceiling('c1', 0), ceiling('c2', 10), block('a', -0.25), block('b', 0.25), block('c', 10.25)],
    forces: [],
    contacts: [],
    pulleys: [
      { id: 'p1', bodyId: 'c1', anchor: { x: 0, y: -0.75 }, radius: 0.25 },
      { id: 'p2', bodyId: 'c2', anchor: { x: 0, y: -0.75 }, radius: 0.25 },
    ],
    constraints: [
      { id: 'r1', kind: 'rope', a: end('a'), b: end('b'), via: ['p1'] },
      { id: 'r2', kind: 'rope', a: end('b'), b: end('c'), via: ['p2'] },
    ],
  }

  it('removing a rope end body removes every rope tied to it and keeps the pulleys', () => {
    const next = removeBodyAndDependents(ROPED, 'b')
    expect(next.constraints).toEqual([])
    expect(next.pulleys!.map((p) => p.id)).toEqual(['p1', 'p2'])
  })

  it('removing a rope end body keeps ropes that do not touch it', () => {
    const next = removeBodyAndDependents(ROPED, 'a')
    expect(next.constraints!.map((c) => c.id)).toEqual(['r2'])
  })

  it('removing a pulley mount removes its pulleys and every rope passing over them', () => {
    const next = removeBodyAndDependents(ROPED, 'c1')
    expect(next.pulleys!.map((p) => p.id)).toEqual(['p2'])
    expect(next.constraints!.map((c) => c.id)).toEqual(['r2'])
    expect(next.bodies.map((b) => b.id)).toEqual(['c2', 'a', 'b', 'c'])
  })

  it('a document without the collections gains none on removal', () => {
    const next = removeBodyAndDependents(DOC, 'a')
    expect(next).not.toHaveProperty('pulleys')
    expect(next).not.toHaveProperty('constraints')
  })

  // PHY-26: springs s1 (c1–a) and s2 (b–c) beside the two ropes.
  const SPRUNG: Scene = {
    ...ROPED,
    constraints: [
      ...ROPED.constraints!,
      { id: 's1', kind: 'spring', a: end('c1'), b: end('a'), k: 40, x0: 1 },
      { id: 's2', kind: 'spring', a: end('b'), b: end('c'), k: 40, x0: 1, c: 0.5 },
    ],
  }

  it.each([
    ['a', ['r2', 's2']],
    ['c1', ['r2', 's2']],
    ['c', ['r1', 's1']],
    ['b', ['s1']],
  ])('removing %s removes the springs tied to it and keeps the rest', (id, left) => {
    expect(removeBodyAndDependents(SPRUNG, id).constraints!.map((c) => c.id)).toEqual(left)
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
  it('adds with the idealized default (muS = muK = 0) when no mu is given (ADR-0002)', () => {
    const { doc, error } = addContact({ ...DOC, contacts: [] }, 'a', 'b')
    expect(error).toBeNull()
    expect(doc.contacts.at(-1)).toEqual({ a: 'a', b: 'b', muS: 0, muK: 0 })
  })

  it('accepts an optional mu override instead of the default', () => {
    const { doc, error } = addContact({ ...DOC, contacts: [] }, 'a', 'b', { muS: 0.6, muK: 0.4 })
    expect(error).toBeNull()
    expect(doc.contacts.at(-1)).toEqual({ a: 'a', b: 'b', muS: 0.6, muK: 0.4 })
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

// ---------- PHY-27: springs ----------

describe('addSpring', () => {
  // a sits at (0,0); b's anchor (-2,-5) lands at world (3,0): 3 m apart.
  const A = { bodyId: 'a', anchor: { x: 0, y: 0 } }
  const B = { bodyId: 'b', anchor: { x: -2, y: -5 } }
  const spring = (doc: Scene, id: string) => {
    const found = doc.constraints?.find((c) => c.id === id)
    if (found?.kind !== 'spring') throw new Error(`no spring ${id}`)
    return found
  }

  it('adds exactly one relaxed spring: x0 is the current anchor distance, no damping', () => {
    const { doc, newId, error } = addSpring(DOC, A, B)
    expect(error).toBeNull()
    expect(newId).toBe('mola')
    expect(doc.constraints).toHaveLength(1)
    const s = spring(doc, 'mola')
    expect(s).toMatchObject({ kind: 'spring', a: A, b: B })
    expect(s.x0).toBeCloseTo(3, 12)
    expect(s.k).toBeGreaterThan(0)
    expect(s).not.toHaveProperty('c')
    expect(DOC).not.toHaveProperty('constraints')
  })

  it('measures x0 between the anchors in the world, through each body rotation', () => {
    // Rotated +90°, b's anchor (-5, 3) lands at (5,5) + (-3,-5) = (2, 0).
    const turned = updateBody(DOC, 'b', { rotation: Math.PI / 2 })
    const s = spring(addSpring(turned, A, { bodyId: 'b', anchor: { x: -5, y: 3 } }).doc, 'mola')
    expect(s.x0).toBeCloseTo(2, 12)
  })

  it('gives a second spring a fresh id in the constraint namespace', () => {
    const once = addSpring(DOC, A, B).doc
    expect(addSpring(once, B, A).newId).toBe('mola-2')
  })

  it('rejects a spring from a body to itself, a missing body, or with coincident anchors (same doc ref + reason key)', () => {
    expect(addSpring(DOC, A, { bodyId: 'a', anchor: { x: 1, y: 0 } })).toEqual({ doc: DOC, newId: null, error: 'error.parConsigoMesmo' })
    expect(addSpring(DOC, A, { bodyId: 'ghost', anchor: { x: 0, y: 0 } })).toEqual({ doc: DOC, newId: null, error: 'error.corpoInexistente' })
    // b's anchor (-5,-5) lands exactly on a's center: x0 = 0 is not a spring.
    expect(addSpring(DOC, A, { bodyId: 'b', anchor: { x: -5, y: -5 } })).toEqual({ doc: DOC, newId: null, error: 'error.molaSemComprimento' })
  })
})

describe('spring editing: k, c, x0 and the x0/Δx link', () => {
  const SPRUNG = addSpring(DOC, { bodyId: 'a', anchor: { x: 0, y: 0 } }, { bodyId: 'b', anchor: { x: -2, y: -5 } }).doc
  const theSpring = (doc: Scene) => {
    const s = doc.constraints![0]
    if (s.kind !== 'spring') throw new Error('not a spring')
    return s
  }

  it('updateSpring patches k, c and x0 immutably; unknown id is a no-op', () => {
    const next = updateSpring(SPRUNG, 'mola', { k: 80, c: 0.4, x0: 2.5 })
    expect(theSpring(next)).toMatchObject({ k: 80, c: 0.4, x0: 2.5 })
    expect(theSpring(SPRUNG).x0).toBeCloseTo(3, 12)
    expect(updateSpring(SPRUNG, 'zz', { k: 1 })).toBe(SPRUNG)
  })

  it('a relaxed spring has Δx = 0', () => {
    expect(springDx(SPRUNG, theSpring(SPRUNG))).toBeCloseTo(0, 12)
  })

  it('setSpringDx writes x0 = x − Δx', () => {
    const next = setSpringDx(SPRUNG, 'mola', -0.1)
    expect(theSpring(next).x0).toBeCloseTo(3.1, 12)
    expect(springDx(next, theSpring(next))).toBeCloseTo(-0.1, 12)
  })

  it('moving a linked body keeps x0 and changes Δx', () => {
    const moved = updateBody(SPRUNG, 'b', { position: { x: 6, y: 5 } })
    expect(theSpring(moved).x0).toBeCloseTo(3, 12)
    expect(springDx(moved, theSpring(moved))).toBeCloseTo(1, 12)
  })

  it('removeConstraint removes only that constraint', () => {
    const two = addSpring(SPRUNG, { bodyId: 'b', anchor: { x: 0, y: 0 } }, { bodyId: 'a', anchor: { x: 0, y: 0 } }).doc
    const next = removeConstraint(two, 'mola')
    expect(next.constraints!.map((c) => c.id)).toEqual(['mola-2'])
    expect(next.bodies).toBe(two.bodies)
    expect(removeConstraint(two, 'zz')).toBe(two)
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
