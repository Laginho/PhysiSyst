import { describe, expect, it } from 'vitest'
import type { Body } from '../scene'
import { bodyAtPoint, pointInBody } from './hitTest'

// Partial-union spread can't be proven to re-form the Body union; runtime
// overrides always come from concrete per-shape literals below.
const rect = (over: Partial<Body> = {}): Body =>
  ({
    id: 'r',
    shape: 'rectangle',
    position: { x: 0, y: 0 },
    width: 4,
    height: 2,
    mass: 1,
    fixed: false,
    rotation: 0,
    ...over,
  }) as Body

describe('pointInBody', () => {
  it('rectangle: hits inside and on edges, misses outside', () => {
    expect(pointInBody(rect(), { x: 0, y: 0 })).toBe(true)
    expect(pointInBody(rect(), { x: 1.9, y: 0.9 })).toBe(true)
    expect(pointInBody(rect(), { x: 2, y: -1 })).toBe(true) // edge
    expect(pointInBody(rect(), { x: 2.1, y: 0 })).toBe(false)
    expect(pointInBody(rect(), { x: 0, y: -1.1 })).toBe(false)
  })

  it('rectangle rotated 90° about its center swaps the hit axes', () => {
    const r = rect({ rotation: Math.PI / 2 })
    // Unrotated half-extents were (2,1); after +90° CCW they lie along world y/x.
    expect(pointInBody(r, { x: 0, y: 1.9 })).toBe(true) // was width-axis extent
    expect(pointInBody(r, { x: 1.9, y: 0 })).toBe(false) // now beyond height
    expect(pointInBody(r, { x: 0, y: -1.9 })).toBe(true)
  })

  it('rectangle hit point rotates with an offset position', () => {
    const r = rect({ position: { x: 10, y: 20 }, rotation: Math.PI })
    expect(pointInBody(r, { x: 10 - 1.5, y: 20 - 0.5 })).toBe(true) // local (+1.5,+0.5) mirrored
    expect(pointInBody(r, { x: 10 - 2.5, y: 20 })).toBe(false)
  })

  it('circle: inside, boundary, outside; offset center respected', () => {
    const c: Body = {
      id: 'c',
      shape: 'circle',
      position: { x: 3, y: 4 },
      radius: 2,
      mass: 1,
      fixed: false,
      rotation: 0,
    }
    expect(pointInBody(c, { x: 3, y: 4 })).toBe(true)
    expect(pointInBody(c, { x: 5, y: 4 })).toBe(true) // boundary
    expect(pointInBody(c, { x: 5.01, y: 4 })).toBe(false)
  })

  it('triangle: centroid region in, hypotenuse and base-side outs', () => {
    // base 6, alpha 30° -> h = 6*tan(30°) ≈ 3.464
    const t: Body = {
      id: 't',
      shape: 'triangle',
      position: { x: 0, y: 0 },
      base: 6,
      alpha: 30,
      mass: 1,
      fixed: false,
      rotation: 0,
    }
    expect(pointInBody(t, { x: 4, y: 1 })).toBe(true) // below hypotenuse (y <= h*x/base ≈ 2.31)
    expect(pointInBody(t, { x: 1, y: 2 })).toBe(false) // above hypotenuse (limit ≈ 0.58)
    expect(pointInBody(t, { x: 7, y: 0.5 })).toBe(false) // past vertical leg
    expect(pointInBody(t, { x: 3, y: -0.1 })).toBe(false) // under base
  })

  it('triangle rotated about a distant origin moves with the body frame', () => {
    const t: Body = {
      id: 't',
      shape: 'triangle',
      position: { x: 10, y: 0 },
      base: 6,
      alpha: 30,
      mass: 1,
      fixed: false,
      rotation: Math.PI / 2, // local +x -> world +y
    }
    // Local point (4,1) maps to world (10-1, 4): rotate(+90°): (x,y)->(-y,x).
    expect(pointInBody(t, { x: 9, y: 4 })).toBe(true)
    expect(pointInBody(t, { x: 12, y: 1 })).toBe(false)
  })
})

describe('bodyAtPoint', () => {
  const a = rect({ id: 'a' })
  const b: Body = {
    id: 'b',
    shape: 'circle',
    position: { x: 0, y: 0 },
    radius: 1,
    mass: 1,
    fixed: false,
    rotation: 0,
  }

  it('topmost wins: later-in-array bodies are checked first (draw order)', () => {
    expect(bodyAtPoint([a, b], { x: 0, y: 0 })?.id).toBe('b')
    expect(bodyAtPoint([b, a], { x: 0, y: 0 })?.id).toBe('a')
  })

  it('returns null on empty space without bodies or on misses', () => {
    expect(bodyAtPoint([], { x: 0, y: 0 })).toBeNull()
    expect(bodyAtPoint([a], { x: 50, y: 50 })).toBeNull()
  })
})
