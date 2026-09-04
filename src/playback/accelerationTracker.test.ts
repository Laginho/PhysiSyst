import { describe, expect, it } from 'vitest'
import type { Body, Scene } from '../scene'
import { TIMESTEP, type BodyState } from '../sim'
import {
  estimateAnalyticAcceleration,
  getAcceleration,
  initialTracker,
  onRebuild,
  onReset,
  onSteps,
} from './accelerationTracker'

type CircleBodyOverrides = Partial<Omit<Extract<Body, { shape: 'circle' }>, 'id' | 'shape'>>

const dynamicBody = (id = 'b', overrides: CircleBodyOverrides = {}): Body => ({
  id,
  shape: 'circle',
  radius: 0.5,
  fixed: false,
  mass: 2,
  position: { x: 0, y: 0 },
  rotation: 0,
  ...overrides,
})

type RectangleBodyOverrides = Partial<Omit<Extract<Body, { shape: 'rectangle' }>, 'id' | 'shape'>>

const fixedBody = (id = 'ground', overrides: RectangleBodyOverrides = {}): Body => ({
  id,
  shape: 'rectangle',
  width: 10,
  height: 1,
  fixed: true,
  mass: 0,
  position: { x: 0, y: -1 },
  rotation: 0,
  ...overrides,
})

const sceneOf = (bodies: Body[], options?: Partial<Scene>): Scene => ({
  version: 1,
  constants: { g: 9.81 },
  bodies,
  forces: [],
  contacts: [],
  ...options,
})

function state(vx = 0, vy = 0): Map<string, BodyState> {
  return new Map([[
    'b',
    { position: { x: 0, y: 0 }, rotation: 0, linvel: { x: vx, y: vy }, angvel: 0 },
  ]])
}

function stateFor(...entries: Array<[string, { x: number; y: number }]>): Map<string, BodyState> {
  return new Map(entries.map(([id, linvel]) => [id, {
    position: { x: 0, y: 0 },
    rotation: 0,
    linvel,
    angvel: 0,
  }]))
}

describe('accelerationTracker elapsed-carry and readout truth', () => {
  it('keeps the last measured acceleration visible after pausing', () => {
    let tracker = initialTracker()
    tracker = onSteps(tracker, 1, state(0, 0), state(6, -12))

    const readout = getAcceleration(tracker, sceneOf([dynamicBody()]), 'b', true)

    expect(readout.x).toBeCloseTo(6 / TIMESTEP, 5)
    expect(readout.y).toBeCloseTo(-12 / TIMESTEP, 5)
    expect(readout.approximate).toBe(false)
  })

  it('uses n·TIMESTEP for a multi-step batch, not one TIMESTEP', () => {
    let tracker = initialTracker()
    tracker = onSteps(tracker, 2, state(1, 4), state(5, -4))

    const readout = getAcceleration(tracker, sceneOf([dynamicBody()]), 'b', false)

    expect(readout.x).toBeCloseTo(4 / (2 * TIMESTEP), 5)
    expect(readout.y).toBeCloseTo(-8 / (2 * TIMESTEP), 5)
    // A one-step divisor would be twice these values.
    expect(Math.abs(readout.x - 4 / TIMESTEP)).toBeGreaterThan(100)
    expect(Math.abs(readout.y + 8 / TIMESTEP)).toBeGreaterThan(100)
  })

  it('reset drops the stale measured value and selects the analytic path', () => {
    let tracker = initialTracker()
    tracker = onSteps(tracker, 1, state(0, 0), state(30, 15))
    tracker = onReset()

    const readout = getAcceleration(tracker, sceneOf([dynamicBody()]), 'b', true)

    expect(readout).toEqual({ x: 0, y: -9.81, approximate: false })
  })

  it('estimates a never-stepped free dynamic body from gravity', () => {
    const scene = sceneOf([dynamicBody('b', { mass: 5 })])

    expect(estimateAnalyticAcceleration(scene, 'b')).toEqual({ x: 0, y: -9.81 })
    expect(getAcceleration(initialTracker(), scene, 'b', true)).toEqual({ x: 0, y: -9.81, approximate: false })
  })

  it('estimates one applied force in the world frame as ΣF/m', () => {
    const scene = sceneOf([dynamicBody('b', { mass: 2 })], {
      constants: { g: 0 },
      forces: [{ id: 'push', bodyId: 'b', anchor: { x: 0, y: 0 }, magnitude: 8, direction: 30 }],
    })

    const acceleration = estimateAnalyticAcceleration(scene, 'b')

    expect(acceleration.x).toBeCloseTo((8 * Math.cos(Math.PI / 6)) / 2, 9)
    expect(acceleration.y).toBeCloseTo((8 * Math.sin(Math.PI / 6)) / 2, 9)
  })

  it('vector-sums multiple applied forces before dividing by mass', () => {
    const scene = sceneOf([dynamicBody('b', { mass: 2 })], {
      constants: { g: 0 },
      forces: [
        { id: 'right', bodyId: 'b', anchor: { x: 0, y: 0 }, magnitude: 4, direction: 0 },
        { id: 'up', bodyId: 'b', anchor: { x: 0, y: 0 }, magnitude: 6, direction: 90 },
      ],
    })

    expect(estimateAnalyticAcceleration(scene, 'b')).toEqual({ x: 2, y: 3 })
  })

  it('marks only analytic acceleration for Contact participants as approximate', () => {
    const body = dynamicBody('b', { mass: 2 })
    const wall = fixedBody()
    const free = sceneOf([body], {
      constants: { g: 0 },
      forces: [{ id: 'push', bodyId: 'b', anchor: { x: 0, y: 0 }, magnitude: 4, direction: 0 }],
    })
    const touching = sceneOf([body, wall], {
      constants: { g: 0 },
      forces: free.forces,
      contacts: [{ a: 'b', b: 'ground', muS: 0, muK: 0 }],
    })

    const freeReadout = getAcceleration(initialTracker(), free, 'b', true)
    const contactReadout = getAcceleration(initialTracker(), touching, 'b', true)
    expect(freeReadout).toMatchObject({ x: 2, y: 0, approximate: false })
    expect(contactReadout).toMatchObject({ x: 2, y: 0, approximate: true })

    let tracker = initialTracker()
    tracker = onSteps(tracker, 1, state(0, 0), state(1, 1))
    expect(getAcceleration(tracker, touching, 'b', true).approximate).toBe(false)
  })

  it('checks both sides of a declared Contact for approximation', () => {
    const a = dynamicBody('a')
    const b = dynamicBody('b')
    const scene = sceneOf([a, b], {
      contacts: [{ a: 'a', b: 'b', muS: 0, muK: 0 }],
    })

    expect(getAcceleration(initialTracker(), scene, 'a', true).approximate).toBe(true)
    expect(getAcceleration(initialTracker(), scene, 'b', true).approximate).toBe(true)
  })

  it('returns zero safely for fixed bodies and unknown ids', () => {
    const scene = sceneOf([fixedBody(), dynamicBody()])

    expect(estimateAnalyticAcceleration(scene, 'ground')).toEqual({ x: 0, y: 0 })
    expect(estimateAnalyticAcceleration(scene, 'ghost')).toEqual({ x: 0, y: 0 })
    expect(getAcceleration(initialTracker(), scene, 'ground', true)).toEqual({ x: 0, y: 0, approximate: false })
    expect(getAcceleration(initialTracker(), scene, 'ghost', true)).toEqual({ x: 0, y: 0, approximate: false })
  })

  it('preserves a surviving body measured acceleration across rebuilds', () => {
    const oldScene = sceneOf([dynamicBody('b')], { constants: { g: 9.81 } })
    const nextScene = sceneOf([dynamicBody('b'), dynamicBody('new')], { constants: { g: 9.81 } })
    const measuredPrev = stateFor(['b', { x: 0, y: 0 }])
    const measuredNext = stateFor(['b', { x: 5 * TIMESTEP, y: 7 * TIMESTEP }], ['new', { x: 0, y: 0 }])

    let tracker = initialTracker()
    tracker = onSteps(tracker, 1, measuredPrev, measuredNext)
    tracker = onRebuild(tracker, measuredNext, measuredNext)

    const surviving = getAcceleration(tracker, nextScene, 'b', true)
    const added = getAcceleration(tracker, nextScene, 'new', true)

    expect(surviving).toEqual({ x: 5, y: 7, approximate: false })
    expect(added).toEqual({ x: 0, y: -9.81, approximate: false })
    // Keep the old scene in the fixture to make the structural-rebuild seam explicit.
    expect(oldScene.bodies.map((body) => body.id)).toEqual(['b'])
  })

  it('every scheduler notch: elapsed = steps·dt recovers g', async () => {
    const { advance, initialPlayback } = await import('./scheduler')
    const scene = sceneOf([dynamicBody()])
    for (const speed of [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const) {
      let playback = initialPlayback(speed)
      playback = advance(playback, { type: 'play' }).state
      let total = 0
      let tracker = initialTracker()
      for (let i = 0; i < 20; i++) {
        const transition = advance(playback, { type: 'frame' })
        playback = transition.state
        const n = transition.steps
        if (n === 0) continue
        const prev = state(0, -9.81 * total * TIMESTEP)
        const nextTotal = total + n
        const curr = state(0, -9.81 * nextTotal * TIMESTEP)
        tracker = onSteps(tracker, n, prev, curr)
        const acceleration = getAcceleration(tracker, scene, 'b', false)
        expect(acceleration.y).toBeCloseTo(-9.81, 5)
        total = nextTotal
      }
    }
  })
})
