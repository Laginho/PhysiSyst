import { describe, expect, it } from 'vitest'
import type { Body, Vec2 } from '../scene'
import { makeTransform } from '../render/transform'
import { anchorSnap } from './anchorSnap'

// 100 px/m: the 10 px tolerance is 0.1 m in the world.
const T100 = makeTransform({ centerX: 0, centerY: 0, pixelsPerMeter: 100 }, 800, 600)
const T50 = makeTransform({ centerX: 0, centerY: 0, pixelsPerMeter: 50 }, 800, 600)

const rect = (over: Partial<Body> = {}): Body =>
  ({ id: 'r', shape: 'rectangle', width: 2, height: 1, mass: 1, fixed: false, position: { x: 5, y: 5 }, rotation: 0, ...over }) as Body

function expectVec(actual: Vec2, expected: Vec2): void {
  expect(actual.x).toBeCloseTo(expected.x, 9)
  expect(actual.y).toBeCloseTo(expected.y, 9)
}

describe('anchorSnap: rectangle', () => {
  it('snaps to the center of mass inside the tolerance', () => {
    expectVec(anchorSnap(rect(), { x: 5.05, y: 5.02 }, T100), { x: 0, y: 0 })
  })

  it('snaps to a face midpoint', () => {
    expectVec(anchorSnap(rect(), { x: 6.05, y: 5 }, T100), { x: 1, y: 0 })
    expectVec(anchorSnap(rect(), { x: 5.03, y: 4.46 }, T100), { x: 0, y: -0.5 })
  })

  it('snaps to a vertex', () => {
    expectVec(anchorSnap(rect(), { x: 5.96, y: 5.46 }, T100), { x: 1, y: 0.5 })
    expectVec(anchorSnap(rect(), { x: 3.98, y: 4.51 }, T100), { x: -1, y: -0.5 })
  })

  it('keeps the clicked point, in local coordinates, outside every tolerance', () => {
    expectVec(anchorSnap(rect(), { x: 5.5, y: 5.2 }, T100), { x: 0.5, y: 0.2 })
  })

  it('the nearest candidate wins when two are inside the tolerance', () => {
    const tiny = rect({ width: 0.1, height: 0.1 })
    expectVec(anchorSnap(tiny, { x: 5.04, y: 5.04 }, T100), { x: 0.05, y: 0.05 })
    expectVec(anchorSnap(tiny, { x: 5.01, y: 5.01 }, T100), { x: 0, y: 0 })
  })

  it('works in the rotated body frame', () => {
    // +90°: local (x, y) sits at world position + (−y, x).
    const turned = rect({ rotation: Math.PI / 2 })
    expectVec(anchorSnap(turned, { x: 4.52, y: 6.03 }, T100), { x: 1, y: 0.5 })
    expectVec(anchorSnap(turned, { x: 4.8, y: 5.5 }, T100), { x: 0.5, y: 0.2 })
  })

  it('the tolerance is in screen pixels, so zooming out widens it in meters', () => {
    const point = { x: 5.15, y: 5 }
    expectVec(anchorSnap(rect(), point, T100), { x: 0.15, y: 0 })
    expectVec(anchorSnap(rect(), point, T50), { x: 0, y: 0 })
  })
})

describe('anchorSnap: circle', () => {
  const ball: Body = { id: 'c', shape: 'circle', radius: 1, mass: 1, fixed: false, position: { x: 2, y: 3 }, rotation: 0 }

  it('snaps to the center of mass', () => {
    expectVec(anchorSnap(ball, { x: 2.06, y: 2.95 }, T100), { x: 0, y: 0 })
  })

  it('keeps the clicked point elsewhere', () => {
    expectVec(anchorSnap(ball, { x: 2.7, y: 3.3 }, T100), { x: 0.7, y: 0.3 })
  })
})

describe('anchorSnap: triangle', () => {
  // base 3, α 45° → h = 3; origin at the α corner, vertices (0,0), (3,0), (3,3).
  const wedge: Body = { id: 't', shape: 'triangle', base: 3, alpha: 45, mass: 1, fixed: false, position: { x: 0, y: 0 }, rotation: 0 }

  it('snaps to the centroid, not the frame origin', () => {
    expectVec(anchorSnap(wedge, { x: 2.04, y: 1.03 }, T100), { x: 2, y: 1 })
  })

  it('snaps to each vertex', () => {
    expectVec(anchorSnap(wedge, { x: 0.05, y: 0.02 }, T100), { x: 0, y: 0 })
    expectVec(anchorSnap(wedge, { x: 2.95, y: 0.05 }, T100), { x: 3, y: 0 })
    expectVec(anchorSnap(wedge, { x: 2.96, y: 2.97 }, T100), { x: 3, y: 3 })
  })

  it('snaps to each face midpoint', () => {
    expectVec(anchorSnap(wedge, { x: 1.55, y: 0.04 }, T100), { x: 1.5, y: 0 })
    expectVec(anchorSnap(wedge, { x: 2.95, y: 1.46 }, T100), { x: 3, y: 1.5 })
    expectVec(anchorSnap(wedge, { x: 1.47, y: 1.45 }, T100), { x: 1.5, y: 1.5 })
  })

  it('keeps the clicked point elsewhere', () => {
    expectVec(anchorSnap(wedge, { x: 2.5, y: 0.5 }, T100), { x: 2.5, y: 0.5 })
  })
})
