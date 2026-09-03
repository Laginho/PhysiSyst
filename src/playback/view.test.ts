import { describe, expect, it } from 'vitest'
import type { Scene } from '../scene'
import type { BodyState } from '../sim'
import { applyStates, carryOver } from './view'

const at = (id: string, x: number, y: number, rotation = 0): Scene['bodies'][number] => ({
  id,
  shape: 'circle',
  radius: 0.5,
  fixed: false,
  mass: 1,
  position: { x, y },
  rotation,
})

const sceneOf = (...bodies: Scene['bodies']): Scene => ({
  version: 1,
  constants: { g: 9.81 },
  bodies,
  forces: [],
  contacts: [],
})

const state = (x: number, y: number, rotation = 0): BodyState => ({
  position: { x, y },
  rotation,
  linvel: { x: 1, y: -2 },
  angvel: 0.5,
})

describe('applyStates', () => {
  it('returns the same scene reference when there are no simulated states', () => {
    const scene = sceneOf(at('a', 0, 0))
    expect(applyStates(scene, null)).toBe(scene)
  })

  it('overrides pose from the simulation and leaves everything else alone', () => {
    const scene = sceneOf(at('a', 0, 0), at('b', 3, 3, 0.2))
    const view = applyStates(scene, new Map([['a', state(1.5, 9, 0.75)]]))
    expect(view.bodies[0]).toEqual({ ...at('a', 1.5, 9, 0.75) })
    // 'b' has no simulated state (e.g. just added): document pose stands.
    expect(view.bodies[1]).toBe(scene.bodies[1])
    expect(view.constants).toBe(scene.constants)
    expect(view.contacts).toBe(scene.contacts)
    expect(view.forces).toBe(scene.forces)
  })

  it('does not mutate the document it projects', () => {
    const scene = sceneOf(at('a', 0, 0))
    applyStates(scene, new Map([['a', state(7, 7)]]))
    expect(scene.bodies[0]!.position).toEqual({ x: 0, y: 0 })
  })

  it('ignores states for ids the document no longer contains', () => {
    const view = applyStates(sceneOf(at('a', 0, 0)), new Map([['ghost', state(9, 9)]]))
    expect(view.bodies.map((b) => b.id)).toEqual(['a'])
    expect(view.bodies[0]!.position).toEqual({ x: 0, y: 0 })
  })
})

describe('carryOver', () => {
  it('keeps kinematic state for bodies the edit did not move', () => {
    const built = sceneOf(at('a', 0, 0), at('b', 3, 0))
    // Mass edit only: both poses untouched, so both keep flying.
    const next = sceneOf(at('a', 0, 0), { ...at('b', 3, 0), mass: 12 })
    const carried = carryOver(new Map([['a', state(1, 1)], ['b', state(2, 2)]]), built, next)
    expect([...carried.keys()].sort()).toEqual(['a', 'b'])
    expect(carried.get('a')).toEqual(state(1, 1))
  })

  it('drops a body the user repositioned in the document (an explicit placement wins)', () => {
    const built = sceneOf(at('a', 0, 0))
    const next = sceneOf(at('a', 5, 0))
    expect(carryOver(new Map([['a', state(1, 1)]]), built, next).size).toBe(0)
  })

  it('drops a body the user re-rotated in the document', () => {
    const built = sceneOf(at('a', 0, 0, 0))
    const next = sceneOf(at('a', 0, 0, 1.2))
    expect(carryOver(new Map([['a', state(1, 1)]]), built, next).has('a')).toBe(false)
  })

  it('drops removed ids and never invents state for new ids', () => {
    const built = sceneOf(at('a', 0, 0), at('gone', 1, 1))
    const next = sceneOf(at('a', 0, 0), at('fresh', 4, 4))
    const carried = carryOver(new Map([['a', state(1, 1)], ['gone', state(2, 2)]]), built, next)
    expect([...carried.keys()]).toEqual(['a'])
  })

  it('drops ids the world was not built with (nothing to carry from)', () => {
    const built = sceneOf(at('a', 0, 0))
    const next = sceneOf(at('a', 0, 0), at('b', 1, 1))
    const carried = carryOver(new Map([['a', state(1, 1)], ['b', state(2, 2)]]), built, next)
    expect([...carried.keys()]).toEqual(['a'])
  })

  it('returns an empty map when there is no state yet', () => {
    expect(carryOver(null, sceneOf(at('a', 0, 0)), sceneOf(at('a', 0, 0))).size).toBe(0)
  })
})
