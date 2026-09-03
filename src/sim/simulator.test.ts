import { describe, expect, it } from 'vitest'
import { createSimulator, TIMESTEP } from './index'
import { assignPairFrictions } from './simulator'
import type { Scene } from '../scene'

function fallingRectScene(): Scene {
  return {
    version: 1,
    constants: { g: 9.81 },
    bodies: [
      {
        id: 'rock',
        shape: 'rectangle',
        width: 0.5,
        height: 0.5,
        fixed: false,
        mass: 2,
        position: { x: 0, y: 10 },
        rotation: 0,
      },
    ],
    forces: [],
    contacts: [],
  }
}

describe('minimal seam', () => {
  it('free-fall matches h(t) closed form within O(dt) integrator tolerance', async () => {
    const sim = await createSimulator(fallingRectScene())
    const steps = 60
    for (let i = 0; i < steps; i++) sim.step()
    const t = steps * TIMESTEP

    const rock = sim.readStates().get('rock')!
    const hClosedForm = 10 - 0.5 * 9.81 * t * t
    // Rapier integrates semi-implicit Euler: position lags the exact
    // parabola by ~0.5*g*t*dt (~8cm after 1s). Bound = 2cm slack + 2% of fall.
    expect(Math.abs(rock.position.y - hClosedForm)).toBeLessThanOrEqual(0.02 + 0.02 * Math.abs(hClosedForm - 10))
    expect(Math.abs(rock.linvel.y - -9.81 * t)).toBeLessThanOrEqual(0.01 * 9.81 * t)
  })

  it('is deterministic: identical scenes stepped identically give identical states', async () => {
    const a = await createSimulator(fallingRectScene())
    const b = await createSimulator(fallingRectScene())
    for (let i = 0; i < 240; i++) {
      a.step()
      b.step()
    }
    expect(a.readStates()).toStrictEqual(b.readStates())
  })
})

function pushedBlockScene(): Scene {
  return {
    version: 1,
    constants: { g: 9.81 },
    bodies: [
      { id: 'floor', shape: 'rectangle', width: 100, height: 1, fixed: true, mass: 1000, position: { x: 0, y: -0.5 }, rotation: 0 },
      { id: 'cart', shape: 'rectangle', width: 1, height: 1, fixed: false, mass: 2, position: { x: 0, y: 0.5 }, rotation: 0 },
    ],
    forces: [{ id: 'push', bodyId: 'cart', anchor: { x: 0, y: 0 }, magnitude: 12, direction: 0 }],
    contacts: [],
  }
}

describe('applied forces (M2)', () => {
  it('horizontal push on frictionless floor gives a = F/m', async () => {
    const sim = await createSimulator(pushedBlockScene())
    const steps = 60
    for (let i = 0; i < steps; i++) sim.step()
    const cart = sim.readStates().get('cart')!
    // frictionless-by-default until the M3 contact mapping lands
    expect(Math.abs(cart.linvel.x - 6)).toBeLessThanOrEqual(0.02 * 6)
  })

  it('circle slides down a frictionless triangle incline with a = g*sin(alpha)', async () => {
    const alpha = (30 * Math.PI) / 180
    const sim = await createSimulator({
      version: 1,
      constants: { g: 9.81 },
      bodies: [
        { id: 'hill', shape: 'triangle', base: 40, alpha: 30, fixed: true, mass: 500, position: { x: -4, y: -2 }, rotation: 0 },
        { id: 'ball', shape: 'circle', radius: 0.3, fixed: false, mass: 1, position: { x: 13.1701, y: 8.2598 }, rotation: 0 },
      ],
      forces: [],
      contacts: [],
    })
    const speedAt = (): number => sim.readStates().get('ball')!.linvel.x ** 2 + sim.readStates().get('ball')!.linvel.y ** 2
    for (let i = 0; i < 30; i++) sim.step()
    const v1 = Math.sqrt(speedAt())
    for (let i = 0; i < 90; i++) sim.step()
    const v2 = Math.sqrt(speedAt())
    const expectedDv = 9.81 * Math.sin(alpha) * (90 * TIMESTEP)
    expect(Math.abs(v2 - v1 - expectedDv)).toBeLessThanOrEqual(0.03 * expectedDv)
    expect(Math.abs(sim.readStates().get('ball')!.angvel)).toBeLessThan(1e-4)
  })

  it('force keeps its world-frame direction while the body rotates under it', async () => {
    const sim = await createSimulator({
      version: 1,
      constants: { g: 0 },
      bodies: [
        { id: 'vane', shape: 'rectangle', width: 1, height: 1, fixed: false, mass: 1, position: { x: 0, y: 0 }, rotation: 0 },
      ],
      forces: [{ id: 'lift', bodyId: 'vane', anchor: { x: 0.5, y: 0 }, magnitude: 10, direction: 90 }],
      contacts: [],
    })
    for (let i = 0; i < 20; i++) sim.step()
    const vane = sim.readStates().get('vane')!
    expect(vane.rotation).toBeGreaterThan(0.2)
    expect(Math.abs(vane.linvel.x)).toBeLessThanOrEqual(0.05)
    const t = 20 * TIMESTEP
    expect(Math.abs(vane.linvel.y - 10 * t)).toBeLessThanOrEqual(0.03 * 10 * t)
  })
})

function slideScene(): Scene {
  return {
    version: 1,
    constants: { g: 9.81 },
    bodies: [
      { id: 'floor', shape: 'rectangle', width: 200, height: 1, fixed: true, mass: 1000, position: { x: 0, y: -0.5 }, rotation: 0 },
      { id: 'block', shape: 'rectangle', width: 1, height: 1, fixed: false, mass: 2, position: { x: 0, y: 0.5 }, rotation: 0 },
    ],
    forces: [{ id: 'launch', bodyId: 'block', anchor: { x: 0, y: 0 }, magnitude: 100, direction: 0 }],
    contacts: [{ a: 'floor', b: 'block', muS: 0.5, muK: 0.3 }],
  }
}

describe('contact friction mapping (M3)', () => {
  it('sliding block decelerates at muK*g then stops and stays stopped', async () => {
    const sim = await createSimulator(slideScene())
    for (let i = 0; i < 12; i++) sim.step()
    sim.setForceMagnitude('launch', 0)
    const vxAt = (): number => sim.readStates().get('block')!.linvel.x
    // 12 launch ticks give v ~= 9.4 m/s; the block then needs ~3.2 s to stop,
    // so the 60-tick window below sits entirely inside the kinetic regime.
    for (let i = 0; i < 48; i++) sim.step()
    const vStart = vxAt()
    for (let i = 0; i < 60; i++) sim.step()
    const dv = vxAt() - vStart
    const expectedDv = -0.3 * 9.81 * (60 * TIMESTEP)
    expect(vStart).toBeGreaterThan(1)
    expect(Math.abs(dv - expectedDv)).toBeLessThanOrEqual(0.04 * Math.abs(expectedDv))
    for (let i = 0; i < 480; i++) sim.step()
    let maxDrift = 0
    for (let i = 0; i < 60; i++) {
      sim.step()
      maxDrift = Math.max(maxDrift, Math.abs(vxAt()))
    }
    expect(maxDrift).toBeLessThan(1e-3)
  })

  it('holds distinct pair coefficients simultaneously: frictionless sled-ground + sticky crate-sled', async () => {
    const sim = await createSimulator({
      version: 1,
      constants: { g: 9.81 },
      bodies: [
        { id: 'ground', shape: 'rectangle', width: 200, height: 1, fixed: true, mass: 1000, position: { x: 0, y: -0.5 }, rotation: 0 },
        { id: 'sled', shape: 'rectangle', width: 2, height: 0.5, fixed: false, mass: 10, position: { x: 0, y: 0.25 }, rotation: 0 },
        { id: 'crate', shape: 'rectangle', width: 1, height: 1, fixed: false, mass: 10, position: { x: 0, y: 1 }, rotation: 0 },
      ],
      forces: [{ id: 'pull', bodyId: 'sled', anchor: { x: 0, y: 0 }, magnitude: 1, direction: 0 }],
      contacts: [
        { a: 'ground', b: 'sled', muS: 0, muK: 0 },
        { a: 'sled', b: 'crate', muS: 0.3, muK: 0.3 },
      ],
    })
    for (let i = 0; i < 30; i++) sim.step()
    // Poisoned Max mapping would freeze the sled entirely (<0.01); correct
    // mapping gives a = F/(m_sled+m_crate) = 0.05 m/s^2 with the crate stuck.
    for (let i = 0; i < 60; i++) sim.step()
    const sledVx = sim.readStates().get('sled')!.linvel.x
    const crateVx = sim.readStates().get('crate')!.linvel.x
    expect(sledVx).toBeGreaterThan(0.01)
    expect(Math.abs(sledVx - 0.05 * (90 * TIMESTEP))).toBeLessThanOrEqual(0.04 * sledVx)
    expect(Math.abs(crateVx - sledVx)).toBeLessThanOrEqual(0.02 * sledVx)
  })

  it('drags a stacked block along: chain topology with differing pair mus', async () => {
    const sim = await createSimulator({
      version: 1,
      constants: { g: 9.81 },
      bodies: [
        { id: 'floor', shape: 'rectangle', width: 200, height: 1, fixed: true, mass: 1000, position: { x: 0, y: -0.5 }, rotation: 0 },
        { id: 'lower', shape: 'rectangle', width: 2, height: 1, fixed: false, mass: 8, position: { x: 0, y: 0.5 }, rotation: 0 },
        { id: 'upper', shape: 'rectangle', width: 1, height: 1, fixed: false, mass: 2, position: { x: 0, y: 1.5 }, rotation: 0 },
      ],
      forces: [{ id: 'nudge', bodyId: 'upper', anchor: { x: 0, y: 0 }, magnitude: 0.8, direction: 0 }],
      contacts: [
        { a: 'floor', b: 'lower', muS: 0, muK: 0 },
        { a: 'lower', b: 'upper', muS: 0.4, muK: 0.4 },
      ],
    })
    for (let i = 0; i < 30; i++) sim.step()
    // Stacked pair moves together at a = F/(m_lower+m_upper) = 0.08 m/s^2.
    for (let i = 0; i < 60; i++) sim.step()
    const lowerVx = sim.readStates().get('lower')!.linvel.x
    const upperVx = sim.readStates().get('upper')!.linvel.x
    expect(lowerVx).toBeGreaterThan(0.01)
    expect(Math.abs(lowerVx - 0.08 * (90 * TIMESTEP))).toBeLessThanOrEqual(0.06 * lowerVx)
    expect(Math.abs(upperVx - lowerVx)).toBeLessThanOrEqual(0.02 * lowerVx)
  })
})

describe('mid-run mutations (M3)', () => {
  it('doubling force magnitude mid-run bends trajectory vs control', async () => {
    const base = (): Scene => ({
      version: 1,
      constants: { g: 9.81 },
      bodies: [
        { id: 'floor', shape: 'rectangle', width: 100, height: 1, fixed: true, mass: 1000, position: { x: 0, y: -0.5 }, rotation: 0 },
        { id: 'cart', shape: 'rectangle', width: 1, height: 1, fixed: false, mass: 2, position: { x: 0, y: 0.5 }, rotation: 0 },
      ],
      forces: [{ id: 'push', bodyId: 'cart', anchor: { x: 0, y: 0 }, magnitude: 6, direction: 0 }],
      contacts: [],
    })
    const a = await createSimulator(base())
    const b = await createSimulator(base())
    for (let i = 0; i < 60; i++) {
      a.step()
      b.step()
    }
    a.setForceMagnitude('push', 12)
    for (let i = 0; i < 60; i++) {
      a.step()
      b.step()
    }
    const va = a.readStates().get('cart')!.linvel.x
    const vb = b.readStates().get('cart')!.linvel.x
    expect(Math.abs(va - 9)).toBeLessThanOrEqual(0.03 * 9)
    expect(Math.abs(vb - 6)).toBeLessThanOrEqual(0.03 * 6)
  })

  it('halving mass mid-run doubles acceleration vs control', async () => {
    const base = (): Scene => ({
      version: 1,
      constants: { g: 9.81 },
      bodies: [
        { id: 'floor', shape: 'rectangle', width: 100, height: 1, fixed: true, mass: 1000, position: { x: 0, y: -0.5 }, rotation: 0 },
        { id: 'cart', shape: 'rectangle', width: 1, height: 1, fixed: false, mass: 4, position: { x: 0, y: 0.5 }, rotation: 0 },
      ],
      forces: [{ id: 'push', bodyId: 'cart', anchor: { x: 0, y: 0 }, magnitude: 8, direction: 0 }],
      contacts: [],
    })
    const a = await createSimulator(base())
    const b = await createSimulator(base())
    for (let i = 0; i < 60; i++) {
      a.step()
      b.step()
    }
    a.setBodyMass('cart', 2)
    for (let i = 0; i < 60; i++) {
      a.step()
      b.step()
    }
    const va = a.readStates().get('cart')!.linvel.x
    const vb = b.readStates().get('cart')!.linvel.x
    expect(Math.abs(va - 6)).toBeLessThanOrEqual(0.04 * 6)
    expect(Math.abs(vb - 4)).toBeLessThanOrEqual(0.03 * 4)
  })

  it('setBodyMass refuses non-positive mass (sim-level hard rule)', async () => {
    const sim = await createSimulator(pushedBlockScene())
    expect(() => sim.setBodyMass('cart', 0)).toThrow(RangeError)
  })
})

describe('friction potential solver (M3 fix)', () => {
  function solveScene(bodies: string[], contacts: Array<[string, string, number]>): ReturnType<typeof assignPairFrictions> {
    return assignPairFrictions({
      version: 1,
      constants: { g: 9.81 },
      bodies: bodies.map((id) => ({ id, shape: 'circle' as const, radius: 0.3, fixed: false, mass: 1, position: { x: 0, y: 0 }, rotation: 0 })),
      forces: [],
      contacts: contacts.map(([a, b, muK]) => ({ a, b, muS: muK, muK })),
    })
  }

  function expectMap(actual: Map<string, number>, expected: Record<string, number>): void {
    expect([...actual.keys()].sort()).toEqual(Object.keys(expected).sort())
    for (const [k, v] of actual) expect(v).toBeCloseTo(expected[k]!, 12)
  }

  it("READ's odd triangle is solvable exactly without fallback", () => {
    const r = solveScene(['a', 'b', 'c'], [['a', 'b', 0.3], ['b', 'c', 0.4], ['c', 'a', 0.5]])
    expect(r.useMaxFallback).toBe(false)
    expectMap(r.friction, { a: 0.4, b: 0.2, c: 0.6 })
  })

  it('odd cycle whose unique solution needs a negative potential falls back', () => {
    const r = solveScene(['a', 'b', 'c'], [['a', 'b', 0.3], ['b', 'c', 0.4], ['c', 'a', 0.05]])
    expect(r.useMaxFallback).toBe(true)
  })

  it('consistent even cycle solves with clamped free parameter', () => {
    const r = solveScene(['a', 'b', 'c', 'd'], [['a', 'b', 0.5], ['b', 'c', 0.5], ['c', 'd', 0.5], ['d', 'a', 0.5]])
    expect(r.useMaxFallback).toBe(false)
    expectMap(r.friction, { a: 0, b: 1, c: 0, d: 1 })
  })

  it('even cycle with disagreeing alternating sum falls back', () => {
    const r = solveScene(['a', 'b', 'c', 'd'], [['a', 'b', 0.5], ['b', 'c', 0.5], ['c', 'd', 0.5], ['d', 'a', 0.7]])
    expect(r.useMaxFallback).toBe(true)
  })

  it('two odd cycles pinning different parameters fall back', () => {
    const r = solveScene(['v0', 'v1', 'v2', 'v3'], [
      ['v0', 'v1', 0.5],
      ['v1', 'v2', 0.5],
      ['v2', 'v0', 0.5],
      ['v2', 'v3', 0.5],
      ['v1', 'v3', 0.75],
      ['v3', 'v0', 0.5],
    ])
    expect(r.useMaxFallback).toBe(true)
  })

  it('disconnected components solve independently', () => {
    const r = solveScene(['p', 'q', 'r', 's'], [['p', 'q', 0], ['r', 's', 0.4]])
    expect(r.useMaxFallback).toBe(false)
    expectMap(r.friction, { p: 0, q: 0, r: 0, s: 0.8 })
  })

  it('bodies without declared contacts get zero friction', () => {
    const r = solveScene(['solo', 'pairA', 'pairB'], [])
    expect(r.useMaxFallback).toBe(false)
    expectMap(r.friction, { solo: 0, pairA: 0, pairB: 0 })
  })

  it('pins ADR-0003 addendum: undeclared pair inherits leak via shared body potentials', () => {
    // base's declared edges (wall .5, top .5) give f_base=1 at the minimal
    // t, so an undeclared physical ground-base touch averages to .5 instead
    // of staying frictionless. Declared interfaces stay exact; elsewhere
    // approximate. Governing decision: ADR-0003 "Addendum — 2026-08-23".
    const r = solveScene(['wall', 'base', 'top', 'ground'], [
      ['wall', 'base', 0.5],
      ['base', 'top', 0.5],
    ])
    expect(r.useMaxFallback).toBe(false)
    expectMap(r.friction, { wall: 0, base: 1, top: 0, ground: 0 })
  })
})

describe('structural rebuild (M3)', () => {
  it('replaceScene rebuilds from the scene document: removed body gone, remaining body restarts cleanly', async () => {
    const twoBalls = (): Scene => ({
      version: 1,
      constants: { g: 9.81 },
      bodies: [
        { id: 'a', shape: 'circle', radius: 0.3, fixed: false, mass: 1, position: { x: -5, y: 10 }, rotation: 0 },
        { id: 'b', shape: 'circle', radius: 0.3, fixed: false, mass: 1, position: { x: 5, y: 10 }, rotation: 0 },
      ],
      forces: [],
      contacts: [],
    })
    const oneBall = (): Scene => ({ ...twoBalls(), bodies: [twoBalls().bodies[0]!] })
    const sim = await createSimulator(twoBalls())
    for (let i = 0; i < 30; i++) sim.step()
    sim.replaceScene(oneBall())
    expect(sim.readStates().has('b')).toBe(false)
    // The rebuilt world starts from the document (which carries no velocity
    // state), so ball 'a' must match a fresh single-ball sim stepped for the
    // same number of post-rebuild ticks - not the pre-rebuild trajectory.
    const control = await createSimulator(oneBall())
    for (let i = 0; i < 30; i++) {
      sim.step()
      control.step()
    }
    expect(sim.readStates().get('a')).toStrictEqual(control.readStates().get('a'))
  })

  it('replaceScene recomputes warnings fresh instead of accumulating stale entries', async () => {
    const infeasibleCycle = (): Scene => ({
      version: 1,
      constants: { g: 9.81 },
      bodies: ['a', 'b', 'c'].map((id) => ({ id, shape: 'circle' as const, radius: 0.3, fixed: false, mass: 1, position: { x: 0, y: 0 }, rotation: 0 })),
      forces: [],
      contacts: [
        { a: 'a', b: 'b', muS: 0.3, muK: 0.3 },
        { a: 'b', b: 'c', muS: 0.4, muK: 0.4 },
        { a: 'c', b: 'a', muS: 0.05, muK: 0.05 },
      ],
    })
    const clean = (): Scene => ({
      version: 1,
      constants: { g: 9.81 },
      bodies: [{ id: 'solo', shape: 'circle', radius: 0.3, fixed: false, mass: 1, position: { x: 0, y: 5 }, rotation: 0 }],
      forces: [],
      contacts: [],
    })
    const sim = await createSimulator(infeasibleCycle())
    expect(sim.warnings.length).toBeGreaterThan(0)
    sim.replaceScene(clean())
    expect(sim.warnings).toEqual([])
  })
})

describe('structural rebuild with kinematic carry-over (T7/M1 policy)', () => {
  const ball = (id: string, x: number): Scene['bodies'][number] => ({
    id,
    shape: 'circle',
    radius: 0.3,
    fixed: false,
    mass: 1,
    position: { x, y: 10 },
    rotation: 0,
  })
  const sceneOf = (...bodies: Scene['bodies']): Scene => ({
    version: 1,
    constants: { g: 9.81 },
    bodies,
    forces: [],
    contacts: [],
  })

  it('carries surviving ids, spawns new ids at doc-initial state, drops removed ids', async () => {
    const sim = await createSimulator(sceneOf(ball('a', -5), ball('b', 5)))
    for (let i = 0; i < 30; i++) sim.step()
    const before = sim.readStates()
    const carriedA = before.get('a')!
    expect(carriedA.linvel.y).toBeLessThan(-1)

    // 'b' removed, 'c' added: a structural edit that must not disturb 'a'.
    sim.replaceScene(sceneOf(ball('a', -5), ball('c', 8)), before)

    const after = sim.readStates()
    expect(after.has('b')).toBe(false)
    expect(after.get('a')).toStrictEqual(carriedA)
    expect(after.get('c')).toStrictEqual({
      position: { x: 8, y: 10 },
      rotation: 0,
      linvel: { x: 0, y: 0 },
      angvel: 0,
    })
  })

  it('a carried rebuild is transparent: the trajectory continues as if nothing happened', async () => {
    const scene = () => sceneOf(ball('a', -5), ball('b', 5))
    const sim = await createSimulator(scene())
    const control = await createSimulator(scene())
    for (let i = 0; i < 30; i++) {
      sim.step()
      control.step()
    }
    sim.replaceScene(scene(), sim.readStates())
    for (let i = 0; i < 30; i++) {
      sim.step()
      control.step()
    }
    expect(sim.readStates()).toStrictEqual(control.readStates())
  })

  it('ignores carry entries for ids absent from the new document', async () => {
    const sim = await createSimulator(sceneOf(ball('a', -5), ball('ghost', 5)))
    for (let i = 0; i < 10; i++) sim.step()
    const stale = sim.readStates()
    expect(() => sim.replaceScene(sceneOf(ball('a', -5)), stale)).not.toThrow()
    expect([...sim.readStates().keys()]).toEqual(['a'])
  })

  it('carries fixed bodies without choking on their absent velocity state', async () => {
    const withFloor = (): Scene => ({
      ...sceneOf(ball('a', 0)),
      bodies: [
        { id: 'floor', shape: 'rectangle', width: 20, height: 1, fixed: true, mass: 0, position: { x: 0, y: -0.5 }, rotation: 0 },
        ball('a', 0),
      ],
    })
    const sim = await createSimulator(withFloor())
    for (let i = 0; i < 20; i++) sim.step()
    const before = sim.readStates()
    sim.replaceScene(withFloor(), before)
    expect(sim.readStates().get('floor')).toStrictEqual(before.get('floor'))
    expect(sim.readStates().get('a')).toStrictEqual(before.get('a'))
  })

  it('without a carry map the rebuild still restarts from the document (default unchanged)', async () => {
    const sim = await createSimulator(sceneOf(ball('a', -5)))
    for (let i = 0; i < 30; i++) sim.step()
    sim.replaceScene(sceneOf(ball('a', -5)))
    expect(sim.readStates().get('a')).toStrictEqual({
      position: { x: -5, y: 10 },
      rotation: 0,
      linvel: { x: 0, y: 0 },
      angvel: 0,
    })
  })

  it('a FAILED rebuild is transactional: the running world survives and correcting the mass recovers without a reboot', async () => {
    const broken = (): Scene => ({ ...sceneOf({ ...ball('a', -5), mass: -2 }) })
    const fixed = (): Scene => sceneOf(ball('a', -5))
    const sim = await createSimulator(fixed())
    for (let i = 0; i < 30; i++) sim.step()
    const healthy = sim.readStates()
    expect(healthy.get('a')!.linvel.y).toBeLessThan(-1)

    // Invalid structural edit (mass<=0): refused, and the refusal must not
    // poison the simulator that raised it.
    expect(() => sim.replaceScene(broken(), sim.readStates())).toThrow(RangeError)

    // Old world untouched: same id set, exact same state, still steppable.
    expect([...sim.readStates().keys()]).toEqual(['a'])
    expect(sim.readStates()).toStrictEqual(healthy)
    sim.step()
    expect(sim.readStates().get('a')!.position.y).toBeLessThan(healthy.get('a')!.position.y)

    // User fixes the mass -> next rebuild succeeds and playback resumes from
    // the carried state instead of needing an app reboot.
    const atRecovery = sim.readStates()
    expect(() => sim.replaceScene(fixed(), atRecovery)).not.toThrow()
    expect(sim.readStates()).toStrictEqual(atRecovery)
    for (let i = 0; i < 10; i++) sim.step()
    expect(sim.readStates().get('a')!.position.y).toBeLessThan(atRecovery.get('a')!.position.y)
  })
})

describe('setGravity live seam (T7/M2)', () => {
  const scene = (): Scene => ({
    version: 1,
    constants: { g: 9.81 },
    bodies: [{ id: 'a', shape: 'circle', radius: 0.3, fixed: false, mass: 1, position: { x: 0, y: 10 }, rotation: 0 }],
    forces: [],
    contacts: [],
  })

  it('a mid-flight g edit changes the acceleration from the NEXT step on, without touching anything else', async () => {
    const sim = await createSimulator(scene())
    const control = await createSimulator(scene())
    for (let i = 0; i < 30; i++) {
      sim.step()
      control.step()
    }
    // Both worlds are identical and falling before the switch.
    expect(sim.readStates()).toStrictEqual(control.readStates())
    const vCut = sim.readStates().get('a')!.linvel.y
    const yCut = sim.readStates().get('a')!.position.y

    sim.setGravity(0)
    for (let i = 0; i < 10; i++) sim.step()
    control.step()

    // g=0 freezes velocity EXACTLY (no further acceleration) while the world
    // keeps integrating position linearly — a bent trajectory, not a halt.
    const after = sim.readStates().get('a')!
    expect(after.linvel.y).toBe(vCut)
    expect(after.position.y).toBeLessThan(yCut)
    // The untouched-g control accelerated past it in the same span.
    expect(control.readStates().get('a')!.linvel.y).toBeLessThan(vCut)
  })
})

describe('particle mode (T7/M2)', () => {
  // Torque setup: circle COM is its origin, so an off-center anchor with a
  // perpendicular push spins the body up when rotations are free.
  const spinner = (particleMode?: boolean): Scene => ({
    version: 1,
    constants: { g: 0, ...(particleMode !== undefined && { particleMode }) },
    bodies: [{ id: 'b', shape: 'circle', radius: 0.5, fixed: false, mass: 1, position: { x: 0, y: 0 }, rotation: 0 }],
    forces: [{ id: 'spin', bodyId: 'b', anchor: { x: 0.5, y: 0 }, magnitude: 10, direction: 90 }],
    contacts: [],
  })

  it('constants.particleMode locks every body rotation: torque cannot spin bodies up', async () => {
    const free = await createSimulator(spinner())
    for (let i = 0; i < 60; i++) free.step()
    expect(free.readStates().get('b')!.angvel).toBeGreaterThan(0.1)

    const locked = await createSimulator(spinner(true))
    for (let i = 0; i < 60; i++) locked.step()
    const b = locked.readStates().get('b')!
    expect(b.angvel).toBe(0)
    expect(b.rotation).toBe(0)
  })

  it('toggling particle mode mid-flight is structural: carried position/linvel survive exactly, spin freezes', async () => {
    const sim = await createSimulator(spinner())
    for (let i = 0; i < 60; i++) sim.step()
    const carried = sim.readStates()
    expect(carried.get('b')!.angvel).toBeGreaterThan(0.1)

    sim.replaceScene(spinner(true), carried)
    const after = sim.readStates().get('b')!
    expect(after.position).toStrictEqual(carried.get('b')!.position)
    expect(after.linvel).toStrictEqual(carried.get('b')!.linvel)
    expect(after.rotation).toBe(carried.get('b')!.rotation)
    expect(after.angvel).toBe(0)

    // Torque stays active but can no longer spin the locked body.
    for (let i = 0; i < 30; i++) sim.step()
    const later = sim.readStates().get('b')!
    expect(later.angvel).toBe(0)
    expect(later.rotation).toBe(after.rotation)
  })
})

describe('no invisible walls (T7/M2)', () => {
  it('a body launched beyond the viewport integrates indefinitely: monotonic x, preserved velocity, no wrap/kill', async () => {
    const scene = (): Scene => ({
      version: 1,
      constants: { g: 0 },
      bodies: [{ id: 'shot', shape: 'circle', radius: 0.5, fixed: false, mass: 1, position: { x: 0, y: 0 }, rotation: 0 }],
      forces: [{ id: 'launch', bodyId: 'shot', anchor: { x: 0, y: 0 }, magnitude: 10, direction: 0 }],
      contacts: [],
    })
    const sim = await createSimulator(scene())
    // One powered step, then coast: constant velocity forever after.
    sim.step()
    sim.setForceMagnitude('launch', 0)
    const v0 = sim.readStates().get('shot')!.linvel.x
    expect(v0).toBeGreaterThan(0)

    // The camera shows x in [-1.5, 13.5] (centerX 6, 900px @ 60 px/m); run far
    // past any plausible wall/wrap/kill boundary. Coasting speed is one
    // TIMESTEP of thrust (~0.17 m/s), so 50 m takes thousands of steps.
    let prev = sim.readStates().get('shot')!
    let steps = 0
    while (prev.position.x < 50 && steps < 20000) {
      sim.step()
      const s = sim.readStates().get('shot')!
      expect(s.linvel.x).toBe(v0)
      expect(s.linvel.y).toBe(0)
      expect(s.angvel).toBe(0)
      expect(s.position.x).toBeGreaterThan(prev.position.x)
      expect(s.position.y).toBe(0)
      prev = s
      steps++
    }
    expect(steps).toBeLessThan(20000) // never stalled or culled
    expect(prev.position.x).toBeGreaterThanOrEqual(50)
  })
})

describe('Initial velocity (ticket 04)', () => {
  const projectileScene = (): Scene => ({
    version: 1,
    constants: { g: 9.81 },
    bodies: [
      {
        id: 'shell',
        shape: 'circle',
        radius: 0.3,
        fixed: false,
        mass: 1,
        position: { x: 0, y: 10 },
        rotation: 0,
        vx: 3,
        vy: 8,
      },
    ],
    forces: [],
    contacts: [],
  })

  it('the world is built with the Initial velocity already applied, before any step', async () => {
    const sim = await createSimulator(projectileScene())
    expect(sim.readStates().get('shell')!.linvel).toStrictEqual({ x: 3, y: 8 })
  })

  it('free-flight displacement matches the closed form (no forces, pure v0 + gravity)', async () => {
    const sim = await createSimulator(projectileScene())
    const steps = 60
    for (let i = 0; i < steps; i++) sim.step()
    const t = steps * TIMESTEP
    const s = sim.readStates().get('shell')!
    // Rapier integrates semi-implicit Euler: position lags the exact parabola
    // by ~0.5*g*t*dt (~4cm after 1s). Bound = 2cm slack + 2% of displacement.
    expect(Math.abs(s.position.x - 3 * t)).toBeLessThanOrEqual(0.02)
    const yClosedForm = 10 + 8 * t - 0.5 * 9.81 * t * t
    expect(Math.abs(s.position.y - yClosedForm)).toBeLessThanOrEqual(0.02 + 0.02 * Math.abs(yClosedForm - 10))
    expect(s.linvel.x).toBeCloseTo(3, 6)
  })

  it('a paused/rebuilt world preserves the carried Initial-velocity-driven state exactly', async () => {
    const sim = await createSimulator(projectileScene())
    for (let i = 0; i < 30; i++) sim.step()
    const before = sim.readStates().get('shell')!
    expect(before.linvel.y).toBeLessThan(7) // gravity has been integrating

    sim.replaceScene(projectileScene(), sim.readStates())
    expect(sim.readStates().get('shell')).toStrictEqual(before)
  })

  it('a structural rebuild WITHOUT carry restarts from the document including its Initial velocity', async () => {
    const sim = await createSimulator(projectileScene())
    for (let i = 0; i < 30; i++) sim.step()
    sim.replaceScene(projectileScene())
    expect(sim.readStates().get('shell')).toStrictEqual({
      position: { x: 0, y: 10 },
      rotation: 0,
      linvel: { x: 3, y: 8 },
      angvel: 0,
    })
  })

  it('a carried structural rebuild mid-flight does not restart the body: trajectory continues as if untouched', async () => {
    const sim = await createSimulator(projectileScene())
    const control = await createSimulator(projectileScene())
    for (let i = 0; i < 30; i++) {
      sim.step()
      control.step()
    }
    // Structural edit (unrelated second body added) with kinematic carry.
    const doc = projectileScene()
    sim.replaceScene(
      { ...doc, bodies: [...doc.bodies, { id: 'pebble', shape: 'circle', radius: 0.2, fixed: false, mass: 1, position: { x: -5, y: 10 }, rotation: 0 }] },
      sim.readStates(),
    )
    for (let i = 0; i < 30; i++) {
      sim.step()
      control.step()
    }
    expect(sim.readStates().get('shell')).toStrictEqual(control.readStates().get('shell'))
  })
})
