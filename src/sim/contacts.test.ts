import { describe, expect, it } from 'vitest'
import { createSimulator } from './simulator'
import type { Scene } from '../scene'

describe('readContacts', () => {
  it('reports a resting contact with direction-accurate normal and point', async () => {
    const scene: Scene = {
      version: 1,
      constants: { g: 9.81 },
      bodies: [
        { id: 'ground', shape: 'rectangle', width: 20, height: 1, fixed: true, mass: 0, position: { x: 0, y: -0.5 }, rotation: 0 },
        { id: 'box', shape: 'rectangle', width: 1, height: 1, fixed: false, mass: 1, position: { x: 0, y: 0.5 }, rotation: 0 },
      ],
      forces: [],
      contacts: [],
    }
    const sim = await createSimulator(scene)
    for (let i = 0; i < 120; i++) sim.step()
    const contacts = sim.readContacts()
    // At least one manifold resting
    expect(contacts.length).toBeGreaterThan(0)
    const c = contacts[0]!
    // Body ids are the pair, order may be either
    expect(new Set([c.aId, c.bId])).toEqual(new Set(['ground', 'box']))
    // Normal points roughly up (from ground to box) — y positive, x near 0
    expect(c.normal.y).toBeCloseTo(1, 1)
    expect(Math.abs(c.normal.x)).toBeLessThan(0.1)
    // Point on the interface y≈0
    expect(c.point.y).toBeCloseTo(0, 1)
  })

  it('empty when bodies separated', async () => {
    const scene: Scene = {
      version: 1,
      constants: { g: 0 },
      bodies: [
        { id: 'a', shape: 'circle', radius: 0.5, fixed: false, mass: 1, position: { x: 0, y: 0 }, rotation: 0 },
        { id: 'b', shape: 'circle', radius: 0.5, fixed: false, mass: 1, position: { x: 10, y: 0 }, rotation: 0 },
      ],
      forces: [],
      contacts: [],
    }
    const sim = await createSimulator(scene)
    sim.step()
    expect(sim.readContacts()).toEqual([])
  })
})
