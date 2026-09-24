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

describe('ropePath, general rope (PHY-24)', () => {
  it('no pulley: one straight leg between the ends', () => {
    const path = ropePath({ x: 0, y: 0 }, { x: 3, y: -4 }, [])
    expect(path.segments).toHaveLength(1)
    expect(path.arcs).toHaveLength(0)
    expectPoint(path.segments[0]!.from, { x: 0, y: 0 })
    expectPoint(path.segments[0]!.to, { x: 3, y: -4 })
    expect(path.length).toBeCloseTo(5, 9)
  })

  it('two pulleys in series: up, a quarter turn, across the tops, a quarter turn, down', () => {
    // Pulleys r = 0.25 at (−0.5, 5) and (0.5, 5); ends hang under their outer sides.
    const path = ropePath({ x: -0.75, y: 1 }, { x: 0.75, y: 2 }, [
      { center: { x: -0.5, y: 5 }, radius: 0.25 },
      { center: { x: 0.5, y: 5 }, radius: 0.25 },
    ])
    expect(path.segments).toHaveLength(3)
    expectPoint(path.segments[0]!.to, { x: -0.75, y: 5 })
    expectPoint(path.segments[1]!.from, { x: -0.5, y: 5.25 })
    expectPoint(path.segments[1]!.to, { x: 0.5, y: 5.25 })
    expectPoint(path.segments[2]!.from, { x: 0.75, y: 5 })
    expect(path.arcs.map((a) => a.direction)).toEqual([-1, -1])
    for (const arc of path.arcs) expect(arc.sweep).toBeCloseTo(Math.PI / 2, 9)
    expect(path.length).toBeCloseTo(4 + Math.PI / 8 + 1 + Math.PI / 8 + 3, 9)
  })

  it('pulleys on opposite sides of the rope take the crossed tangent between them', () => {
    // Over the first pulley (clockwise), under the second (counter-clockwise),
    // centers 2 m apart at the same height: the crossing leg runs through the
    // midpoint, length √(2² − (2·0.5)²) = √3, and each wrap is 2π/3.
    const r = 0.5
    const path = ropePath({ x: -1.5, y: -3 }, { x: 1.5, y: 3 }, [
      { center: { x: -1, y: 0 }, radius: r },
      { center: { x: 1, y: 0 }, radius: r },
    ])
    expect(path.arcs.map((a) => a.direction)).toEqual([-1, 1])
    const cross = path.segments[1]!
    expect(Math.hypot(cross.to.x - cross.from.x, cross.to.y - cross.from.y)).toBeCloseTo(Math.sqrt(3), 9)
    expect((cross.from.x + cross.to.x) / 2).toBeCloseTo(0, 9)
    expect((cross.from.y + cross.to.y) / 2).toBeCloseTo(0, 9)
    for (const arc of path.arcs) expect(arc.sweep).toBeCloseTo((2 * Math.PI) / 3, 9)
    expect(path.length).toBeCloseTo(3 + (2 * Math.PI) / 3 * r + Math.sqrt(3) + (2 * Math.PI) / 3 * r + 3, 9)
  })

  it('a movable pulley: down to it, a half turn underneath, up over a fixed pulley', () => {
    // Ceiling point (−0.25, 10); movable pulley r = 0.25 at (0, 4); fixed pulley
    // r = 0.25 at (0.5, 9.5); counterweight end at (0.75, 3).
    const path = ropePath({ x: -0.25, y: 10 }, { x: 0.75, y: 3 }, [
      { center: { x: 0, y: 4 }, radius: 0.25 },
      { center: { x: 0.5, y: 9.5 }, radius: 0.25 },
    ])
    expectPoint(path.segments[0]!.to, { x: -0.25, y: 4 })
    expectPoint(path.segments[1]!.from, { x: 0.25, y: 4 })
    expectPoint(path.segments[1]!.to, { x: 0.25, y: 9.5 })
    expectPoint(path.segments[2]!.from, { x: 0.75, y: 9.5 })
    // Under the movable pulley counter-clockwise, over the fixed one clockwise.
    expect(path.arcs.map((a) => a.direction)).toEqual([1, -1])
    for (const arc of path.arcs) expect(arc.sweep).toBeCloseTo(Math.PI, 9)
    expect(path.length).toBeCloseTo(6 + Math.PI / 4 + 5.5 + Math.PI / 4 + 6.5, 9)
  })
})

describe('scenePath follows a movable pulley (PHY-24)', () => {
  const scene = (loadY: number): Scene => ({
    version: 1,
    constants: { g: 9.81 },
    bodies: [
      { shape: 'rectangle', width: 4, height: 0.5, id: 'teto', fixed: true, mass: 0, position: { x: 0, y: 10 }, rotation: 0 },
      { shape: 'rectangle', width: 0.3, height: 0.3, id: 'carga', fixed: false, mass: 3, position: { x: 0, y: loadY }, rotation: 0 },
      { shape: 'rectangle', width: 0.2, height: 0.2, id: 'contrapeso', fixed: false, mass: 1, position: { x: 0.75, y: 3 }, rotation: 0 },
    ],
    forces: [],
    contacts: [],
    pulleys: [
      { id: 'movel', bodyId: 'carga', anchor: { x: 0, y: 0 }, radius: 0.25 },
      { id: 'fixa', bodyId: 'teto', anchor: { x: 0.5, y: -0.5 }, radius: 0.25 },
    ],
    constraints: [
      {
        id: 'corda',
        kind: 'rope',
        a: { bodyId: 'teto', anchor: { x: -0.25, y: 0 } },
        b: { bodyId: 'contrapeso', anchor: { x: 0, y: 0 } },
        via: ['movel', 'fixa'],
      },
    ],
  })

  it('the path is wrapped on the pulley at its mount body pose, and moves with it', () => {
    const at4 = scenePath(scene(4), scene(4).constraints![0]!)!
    const at3 = scenePath(scene(3), scene(3).constraints![0]!)!
    expectPoint(at4.arcs[0]!.center, { x: 0, y: 4 })
    expectPoint(at3.arcs[0]!.center, { x: 0, y: 3 })
    expectPoint(at3.segments[0]!.to, { x: -0.25, y: 3 })
    // Lowering the load 1 m lengthens both legs that hang on it.
    expect(at3.length - at4.length).toBeCloseTo(2, 9)
  })
})
