/**
 * Rope path geometry (PHY-23): straight segments tangent to each pulley plus
 * the arc the rope wraps on it. Expected values are worked by hand from the
 * tangent-length theorem and the figure, never from the module's formula.
 */
import { describe, expect, it } from 'vitest'
import { ropePath, scenePath } from './ropePath'
import type { Scene, Vec2 } from './types'

const EPS = 1e-9

function expectPoint(actual: Vec2, expected: Vec2): void {
  expect(actual.x).toBeCloseTo(expected.x, 9)
  expect(actual.y).toBeCloseTo(expected.y, 9)
}

describe('ropePath over one pulley', () => {
  it('symmetric Atwood: two vertical drops and a half turn over the top', () => {
    const path = ropePath({ x: -1, y: -5 }, { x: 1, y: -5 }, [{ center: { x: 0, y: 0 }, radius: 1 }])
    expect(path.segments).toHaveLength(2)
    expectPoint(path.segments[0]!.from, { x: -1, y: -5 })
    expectPoint(path.segments[0]!.to, { x: -1, y: 0 })
    expectPoint(path.segments[1]!.from, { x: 1, y: 0 })
    expectPoint(path.segments[1]!.to, { x: 1, y: -5 })
    expect(path.arcs).toHaveLength(1)
    // Over the top from the left side to the right side is clockwise.
    expect(path.arcs[0]!.direction).toBe(-1)
    expect(path.arcs[0]!.sweep).toBeCloseTo(Math.PI, 9)
    expect(path.length).toBeCloseTo(5 + Math.PI + 5, 9)
  })

  it('asymmetric drops keep the half turn and add the two unequal legs', () => {
    const path = ropePath({ x: -1, y: -2 }, { x: 1, y: -6 }, [{ center: { x: 0, y: 0 }, radius: 1 }])
    expectPoint(path.segments[0]!.to, { x: -1, y: 0 })
    expectPoint(path.segments[1]!.from, { x: 1, y: 0 })
    expect(path.length).toBeCloseTo(2 + Math.PI + 6, 9)
  })

  it('an end that approaches off-axis leaves along the tangent from that point', () => {
    // A = (-3, -4): distance 5 to the center, so the tangent leg is √(5² − 1²).
    // The tangent point sits at angle (π + atan(4/3)) − acos(1/5) on the circle;
    // the rope wraps clockwise from it down to (1, 0), then drops 3 m to B.
    const a = { x: -3, y: -4 }
    const path = ropePath(a, { x: 1, y: -3 }, [{ center: { x: 0, y: 0 }, radius: 1 }])
    const phi = Math.PI + Math.atan(4 / 3) - Math.acos(1 / 5)
    const tangent = path.segments[0]!.to
    expectPoint(tangent, { x: Math.cos(phi), y: Math.sin(phi) })
    // Radius ⟂ rope at the tangent point.
    expect(Math.abs(tangent.x * (tangent.x - a.x) + tangent.y * (tangent.y - a.y))).toBeLessThan(EPS)
    expect(path.arcs[0]!.direction).toBe(-1)
    expect(path.arcs[0]!.sweep).toBeCloseTo(phi, 9)
    expect(path.length).toBeCloseTo(Math.sqrt(24) + phi + 3, 9)
  })

  it('large radius, block on the table: horizontal leg, quarter turn, vertical drop', () => {
    const path = ropePath({ x: -10, y: 2 }, { x: 2, y: -5 }, [{ center: { x: 0, y: 0 }, radius: 2 }])
    expectPoint(path.segments[0]!.to, { x: 0, y: 2 })
    expectPoint(path.segments[1]!.from, { x: 2, y: 0 })
    expect(path.arcs[0]!.direction).toBe(-1)
    expect(path.arcs[0]!.sweep).toBeCloseTo(Math.PI / 2, 9)
    expect(path.length).toBeCloseTo(10 + Math.PI + 5, 9)
  })

  it('the wrap side follows the geometry: a rope under the pulley wraps counter-clockwise', () => {
    // Mirror of the symmetric case: ends above, rope passes under the pulley.
    const path = ropePath({ x: -1, y: 5 }, { x: 1, y: 5 }, [{ center: { x: 0, y: 0 }, radius: 1 }])
    expectPoint(path.segments[0]!.to, { x: -1, y: 0 })
    expectPoint(path.segments[1]!.from, { x: 1, y: 0 })
    expect(path.arcs[0]!.direction).toBe(1)
    expect(path.length).toBeCloseTo(5 + Math.PI + 5, 9)
  })
})

describe('scenePath: rope path from document poses', () => {
  const scene: Scene = {
    version: 1,
    constants: { g: 9.81 },
    bodies: [
      { shape: 'rectangle', width: 4, height: 0.5, id: 'teto', fixed: true, mass: 0, position: { x: 0, y: 6 }, rotation: 0 },
      { shape: 'rectangle', width: 0.4, height: 0.4, id: 'a', fixed: false, mass: 3, position: { x: -0.25, y: 2 }, rotation: 0 },
      // Rotated a quarter turn: its body-local anchor (0.2, 0) points up in the world.
      { shape: 'rectangle', width: 0.4, height: 0.4, id: 'b', fixed: false, mass: 2, position: { x: 0.25, y: 1 }, rotation: Math.PI / 2 },
    ],
    forces: [],
    contacts: [],
    pulleys: [{ id: 'p', bodyId: 'teto', anchor: { x: 0, y: -0.75 }, radius: 0.25 }],
    constraints: [
      { id: 'corda', kind: 'rope', a: { bodyId: 'a', anchor: { x: 0, y: 0.2 } }, b: { bodyId: 'b', anchor: { x: 0.2, y: 0 } }, via: ['p'] },
    ],
  }

  it('resolves anchors in each body frame and the pulley on its mount', () => {
    const path = scenePath(scene, scene.constraints![0]!)!
    expectPoint(path.segments[0]!.from, { x: -0.25, y: 2.2 })
    expectPoint(path.segments[0]!.to, { x: -0.25, y: 5.25 })
    expectPoint(path.segments[1]!.from, { x: 0.25, y: 5.25 })
    expectPoint(path.segments[1]!.to, { x: 0.25, y: 1.2 })
    expect(path.length).toBeCloseTo(3.05 + 0.25 * Math.PI + 4.05, 9)
  })

  it('returns null when a reference dangles', () => {
    const rope = { ...scene.constraints![0]!, via: ['ghost'] }
    expect(scenePath(scene, rope)).toBeNull()
  })
})
