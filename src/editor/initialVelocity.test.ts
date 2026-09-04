import { describe, expect, it } from 'vitest'
import { cartesianToPolar, polarToCartesian } from './initialVelocity'

const TABLE = [
  { vx: 1, vy: 0, magnitude: 1, angleDeg: 0 },
  { vx: 0, vy: 1, magnitude: 1, angleDeg: 90 },
  { vx: -1, vy: 0, magnitude: 1, angleDeg: 180 },
  { vx: 0, vy: -1, magnitude: 1, angleDeg: -90 },
  { vx: 3, vy: 4, magnitude: 5, angleDeg: 53.13010235415598 },
  { vx: -3, vy: 4, magnitude: 5, angleDeg: 126.86989764584402 },
  { vx: -3, vy: -4, magnitude: 5, angleDeg: -126.86989764584402 },
  { vx: 3, vy: -4, magnitude: 5, angleDeg: -53.13010235415598 },
  { vx: -0.75, vy: 2.5, magnitude: 2.6100766272276377, angleDeg: 106.69924423399362 },
] as const

function expectComponentClose(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1e-10 * Math.max(1, Math.abs(expected)))
}

describe('Initial velocity Cartesian/polar conversion', () => {
  it('maps axes and all quadrants to magnitude plus degrees without swapping signs', () => {
    for (const row of TABLE) {
      const polar = cartesianToPolar(row.vx, row.vy)
      expect(polar.magnitude).toBeCloseTo(row.magnitude, 10)
      expect(polar.angleDeg).toBeCloseTo(row.angleDeg, 10)
    }
  })

  it('defines exact zero velocity deterministically as magnitude 0 and angle 0°', () => {
    expect(cartesianToPolar(0, 0)).toEqual({ magnitude: 0, angleDeg: 0 })
  })

  it('round-trips Cartesian components to floating-point precision', () => {
    for (const row of [...TABLE, { vx: 0.123456789, vy: -9876.54321 }]) {
      const polar = cartesianToPolar(row.vx, row.vy)
      const cartesian = polarToCartesian(polar.magnitude, polar.angleDeg)
      expectComponentClose(cartesian.vx, row.vx)
      expectComponentClose(cartesian.vy, row.vy)
    }
  })

  it('keeps stored components unchanged when the UI mode is projected repeatedly', () => {
    const stored = { vx: 0.123456789, vy: -9.87654321 }
    const before = { ...stored }

    for (let i = 0; i < 100; i++) {
      // A mode switch reads the polar projection; it does not write it back.
      const display = cartesianToPolar(stored.vx, stored.vy)
      expect(display.magnitude).toBeGreaterThan(0)
      expect(stored).toEqual(before)
    }

    expect(stored).toEqual(before)
  })
})
