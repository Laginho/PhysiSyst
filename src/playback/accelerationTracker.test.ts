import { describe, expect, it } from 'vitest'
import { TIMESTEP, type BodyState } from '../sim'
import { getAcceleration, initialTracker, onRebuild, onReset, onSteps } from './accelerationTracker'

function state(vy: number): Map<string, BodyState> {
  return new Map([['b', { position: { x: 0, y: 0 }, rotation: 0, linvel: { x: 0, y: vy }, angvel: 0 }]])
}

describe('accelerationTracker elapsed-carry (T8 regression)', () => {
  it('single-step batch yields g', () => {
    let t = initialTracker()
    const g = 9.81
    const prev = state(-g * 1 * TIMESTEP)
    const curr = state(-g * 2 * TIMESTEP)
    t = onSteps(t, 1, prev, curr)
    expect(getAcceleration(t, 'b', false).y).toBeCloseTo(-g, 5)
    // buggy divisor would be Δv/1dt = -g correct here, so also test 2-step
  })

  it('2-step batch at 2× must still report ≈g, not ≈2g', () => {
    let t = initialTracker()
    const g = 9.81
    // batch of 2 steps: vy goes from -2gdt to -4gdt
    const prev = state(-g * 2 * TIMESTEP)
    const curr = state(-g * 4 * TIMESTEP)
    t = onSteps(t, 2, prev, curr)
    const acc = getAcceleration(t, 'b', false).y
    expect(acc).toBeCloseTo(-g, 5)
    // The bug was elapsed=TIMESTEP always → acc would be -2g (200% error)
    expect(Math.abs(acc + 2 * g) / g).toBeGreaterThan(0.5)
  })

  it('paused zeroes acceleration regardless of elapsed', () => {
    let t = initialTracker()
    const prev = state(0)
    const curr = state(60) // big jump
    t = onSteps(t, 2, prev, curr)
    expect(getAcceleration(t, 'b', true)).toEqual({ x: 0, y: 0 })
  })

  it('rebuild and reset clear history', () => {
    let t = initialTracker()
    t = onSteps(t, 2, state(0), state(-19.62))
    expect(getAcceleration(t, 'b', false).y).not.toBe(0)
    t = onRebuild(t, null, state(0))
    // no prev → zero
    expect(getAcceleration(t, 'b', false)).toEqual({ x: 0, y: 0 })
    t = onSteps(t, 1, state(0), state(-9.81 * TIMESTEP))
    t = onReset()
    expect(getAcceleration(t, 'b', false)).toEqual({ x: 0, y: 0 })
  })

  it('every scheduler notch: elapsed = steps·dt recovers g (construction cover)', async () => {
    const { advance, initialPlayback } = await import('./scheduler')
    for (const speed of [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const) {
      let s = initialPlayback(speed)
      s = advance(s, { type: 'play' }).state
      let total = 0
      let tracker = initialTracker()
      for (let i = 0; i < 20; i++) {
        const tr = advance(s, { type: 'frame' })
        s = tr.state
        const n = tr.steps
        if (n === 0) continue
        const prev = state(-9.81 * total * TIMESTEP)
        const nextTotal = total + n
        const curr = state(-9.81 * nextTotal * TIMESTEP)
        tracker = onSteps(tracker, n, prev, curr)
        const acc = getAcceleration(tracker, 'b', false).y
        expect(acc).toBeCloseTo(-9.81, 5)
        total = nextTotal
      }
    }
  })
})
