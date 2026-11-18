import { describe, expect, it } from 'vitest'
import { assignPairRestitutions, createSimulator } from './simulator'
import type { Scene } from '../scene'
import { groundBody } from '../persistence'
import { presetById } from '../presets'

describe('assignPairRestitutions', () => {
  function solve(pairs: Array<[string, string, number | undefined]>) {
    return assignPairRestitutions({
      version: 1, constants: { g: 0 }, forces: [],
      bodies: ['a', 'b', 'c', 'd', 'isolated'].map((id) => ({
        id, shape: 'circle', radius: 0.5, mass: 1, fixed: false,
        position: { x: 0, y: 0 }, rotation: 0,
      })),
      contacts: pairs.map(([a, b, e]) => ({ a, b, e, muS: 0, muK: 0 })),
    })
  }

  it.each([
    [['a', 'b', 0.5]],
    [['a', 'b', 0.5], ['a', 'c', 1]],
    [['a', 'b', 0.5], ['b', 'c', 0.25], ['a', 'c', 0.5]],
    [['a', 'b', 0.5], ['b', 'c', 0.25], ['c', 'd', 0.5], ['d', 'a', 1]],
  ] as Array<Array<[string, string, number]>>)('solves positive pair graph %#', (...pairs) => {
    const result = solve(pairs)
    for (const [a, b, e] of pairs) {
      expect(result.factor.get(a)! * result.factor.get(b)!).toBeCloseTo(e, 9)
    }
    expect(result.factor.get('isolated')).toBe(0)
    expect(result.useMinFallback).toBe(false)
    expect(result.warnings).toEqual([])
  })

  it.each([0, undefined])('falls back when a zero pair conflicts with positive factors (%s)', (e) => {
    const result = solve([['a', 'b', 1], ['b', 'c', 1], ['a', 'c', e]])
    expect([...result.factor.values()]).toEqual([1, 1, 1, 0, 0])
    expect(result.useMinFallback).toBe(true)
    expect(result.warnings).toEqual(['contact e-graph has inconsistent constraints; restitution degraded to per-body max with Min rule'])
  })

  it('falls back for an inconsistent even cycle', () => {
    const result = solve([['a', 'b', 1], ['b', 'c', 1], ['c', 'd', 1], ['d', 'a', 0.5]])
    expect([...result.factor.values()]).toEqual([1, 1, 1, 1, 0])
    expect(result.useMinFallback).toBe(true)
    expect(result.warnings).toHaveLength(1)
  })

  it.each([[], [['a', 'b', undefined]], [['a', 'b', 0]]] as Array<Array<[string, string, number | undefined]>>)(
    'keeps bodies inelastic without positive edges %#', (...pairs) => {
      const result = solve(pairs)
      expect([...result.factor.values()]).toEqual([0, 0, 0, 0, 0])
      expect(result.useMinFallback).toBe(false)
      expect(result.warnings).toEqual([])
    },
  )
})

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

describe('probeInitial (PHY-82)', () => {
  const restingScene = (): Scene => ({
    version: 1, constants: { g: 9.81 }, forces: [], contacts: [],
    bodies: [
      groundBody(),
      { id: 'caixa', shape: 'rectangle', width: 1, height: 1, fixed: false, mass: 1, position: { x: 6, y: 0.5 }, rotation: 0 },
    ],
  })

  it('reports a unit vertical normal for a box resting on the ground before live steps', async () => {
    const scene = restingScene()
    const sim = await createSimulator(scene)
    const contacts = sim.probeInitial(scene).contacts
    expect(contacts.length).toBeGreaterThan(0)
    for (const contact of contacts) {
      expect(new Set([contact.aId, contact.bId])).toEqual(new Set(['chao', 'caixa']))
      expect(Math.hypot(contact.normal.x, contact.normal.y)).toBeCloseTo(1, 6)
      expect(Math.abs(contact.normal.y)).toBeGreaterThan(0.99)
    }
  })

  it('reports the initial taut Atwood tension within 15 percent of 23.54 N', async () => {
    const scene = presetById('atwood')!.buildScene()
    const sim = await createSimulator(scene)
    const rope = sim.probeInitial(scene).constraints.find(state => state.id === 'corda')
    expect(rope?.kind).toBe('rope')
    if (rope?.kind !== 'rope') throw new Error('missing corda reading')
    expect(Math.abs(rope.tension - 23.54)).toBeLessThanOrEqual(0.15 * 23.54)
    expect(rope.slack).toBe(false)
  })

  it('repeats twenty probes without changing the live poses, contacts or constraint readings', async () => {
    const scene = presetById('atwood')!.buildScene()
    const sim = await createSimulator(scene)
    const states = sim.readStates()
    const constraints = sim.readConstraints()
    const warnings = [...sim.warnings]
    expect(sim.readContacts()).toEqual([])
    const first = sim.probeInitial(scene)
    for (let i = 0; i < 20; i++) {
      expect(sim.probeInitial(scene)).toEqual(first)
      expect(sim.readStates()).toEqual(states)
      expect(sim.readContacts()).toEqual([])
      expect(sim.readConstraints()).toEqual(constraints)
      expect(sim.warnings).toEqual(warnings)
    }
  })

  it('ignores an invalid dynamic mass and leaves the live simulator usable', async () => {
    const scene = restingScene()
    const sim = await createSimulator(scene)
    const states = sim.readStates()
    const invalid: Scene = { ...scene, bodies: scene.bodies.map(body => body.fixed ? body : { ...body, mass: 0 }) }
    expect(sim.probeInitial(invalid)).toEqual({ contacts: [], constraints: [] })
    expect(sim.readStates()).toEqual(states)
    expect(() => sim.step()).not.toThrow()
  })

  it('supports an empty scene without touching an unrelated live scene', async () => {
    const sim = await createSimulator(restingScene())
    const states = sim.readStates()
    const empty: Scene = { version: 1, constants: { g: 0 }, bodies: [], forces: [], contacts: [] }
    expect(sim.probeInitial(empty)).toEqual({ contacts: [], constraints: [] })
    expect(sim.readStates()).toEqual(states)
  })
})
