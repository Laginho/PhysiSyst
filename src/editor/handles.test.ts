import { describe, expect, it } from 'vitest'
import type { Body } from '../scene'
import { makeTransform } from '../render/transform'
import {
  alphaFromLocal,
  clampAlphaDeg,
  getHandles,
  HANDLE_HIT_RADIUS_PX,
  localToWorld,
  minDimension,
  pickHandle,
} from './handles'

const TRANSFORM = makeTransform({ centerX: 0, centerY: 0, pixelsPerMeter: 100 }, 800, 600)

const rect: Body = {
  id: 'r',
  shape: 'rectangle',
  position: { x: 0, y: 0 },
  width: 2,
  height: 1,
  mass: 1,
  fixed: false,
  rotation: 0,
}
const circle: Body = { ...rect, id: 'c', shape: 'circle', radius: 1 }
const tri: Body = { ...rect, id: 't', shape: 'triangle', base: 6, alpha: 30 }

describe('panel clamp helpers (same constants as handle drags)', () => {
  it('clampAlphaDeg pins α inside the schema-open interval', () => {
    expect(clampAlphaDeg(120)).toBe(89.5)
    expect(clampAlphaDeg(-45)).toBe(0.5)
    expect(clampAlphaDeg(30)).toBe(30)
    expect(clampAlphaDeg(89.5)).toBe(89.5)
  })

  it('minDimension floors shape sizes at MIN_SIZE', () => {
    expect(minDimension(0)).toBe(0.05)
    expect(minDimension(-3)).toBe(0.05)
    expect(minDimension(2)).toBe(2)
  })
})

describe('localToWorld', () => {
  it('is translate-only for an unrotated body', () => {
    expect(localToWorld(rect, 1, -0.5)).toEqual({ x: 1, y: -0.5 })
  })

  it('applies the body rotation about its own origin', () => {
    const rotated = { ...rect, rotation: Math.PI / 2 }
    // local (1, 0) under +90° CCW -> (0, 1)
    const w = localToWorld(rotated, 1, 0)
    expect(w.x).toBeCloseTo(0, 9)
    expect(w.y).toBeCloseTo(1, 9)
  })
})

describe('getHandles', () => {
  it('rectangle exposes rotate + resize; positions project through the camera', () => {
    const hs = getHandles(rect, TRANSFORM)
    expect(hs.map((h) => h.kind)).toEqual(['rotate', 'resize'])
    const resize = hs.find((h) => h.kind === 'resize')!
    // Corner local (1, 0.5) -> screen (400 + 100, 300 - 50)
    expect(resize.sx).toBeCloseTo(500, 9)
    expect(resize.sy).toBeCloseTo(250, 9)
  })

  it('circle exposes rotate + resize at (0,-r-0.4) and (r,0)', () => {
    const hs = getHandles(circle, TRANSFORM)
    expect(hs.map((h) => h.kind)).toEqual(['rotate', 'resize'])
    const resize = hs.find((h) => h.kind === 'resize')!
    expect(resize.sx).toBeCloseTo(500, 9)
    expect(resize.sy).toBeCloseTo(300, 9)
  })

  it('triangle exposes rotate + resize + alpha on the hypotenuse midpoint', () => {
    const hs = getHandles(tri, TRANSFORM)
    expect(hs.map((h) => h.kind)).toEqual(['rotate', 'resize', 'alpha'])
    const alpha = hs.find((h) => h.kind === 'alpha')!
    // local (base/2, h/2) = (3, 3*tan30°/... ) -> h = 6*tan30 ≈ 3.464, half ≈ 1.732
    expect(alpha.sx).toBeCloseTo(400 + 300, 9)
    expect(alpha.sy).toBeCloseTo(300 - 173.20508, 5)
  })

  it('handles ride along when the body rotates', () => {
    const rotated = { ...circle, rotation: Math.PI }
    const resize = getHandles(rotated, TRANSFORM).find((h) => h.kind === 'resize')!
    // local (1,0) rotated 180° -> world (-1,0)
    expect(resize.sx).toBeCloseTo(300, 9)
    expect(resize.sy).toBeCloseTo(300, 9)
  })
})

describe('pickHandle', () => {
  it('hits within the grab radius and prefers the closest handle', () => {
    const hs = getHandles(rect, TRANSFORM)
    const near = pickHandle(hs, 503, 252)
    expect(near?.kind).toBe('resize')
    expect(pickHandle(hs, 700, 100)).toBeNull()
  })

  it('exposes a positive grab radius', () => {
    expect(HANDLE_HIT_RADIUS_PX).toBeGreaterThan(0)
  })
})

describe('alphaFromLocal', () => {
  it('recovers the schema angle from a point on the hypotenuse', () => {
    // h = 6*tan(30°); local midpoint (3, h/2) lies ON the hypotenuse -> α = 30°
    const h = 6 * Math.tan(Math.PI / 6)
    expect(alphaFromLocal(3, h / 2)).toBeCloseTo(30, 6)
  })

  it('clamps inside the schema-open interval (0°, 90°)', () => {
    expect(alphaFromLocal(-1, 5)).toBeGreaterThan(0)
    expect(alphaFromLocal(-1, 5)).toBeLessThan(90)
    expect(alphaFromLocal(0.001, 50)).toBeLessThan(90)
    expect(alphaFromLocal(50, 0.0001)).toBeGreaterThan(0)
  })
})
