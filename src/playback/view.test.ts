import { describe, expect, it } from 'vitest'
import type { Scene } from '../scene'
import type { BodyState } from '../sim'
import { applyStates } from './view'

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
