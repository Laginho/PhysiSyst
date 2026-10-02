/**
 * Rope path geometry (PHY-23): straight segments tangent to each pulley plus
 * the arc the rope wraps on it. Expected values are worked by hand from the
 * tangent-length theorem and the figure, never from the module's formula.
 */
import { describe, expect, it } from 'vitest'
import { ropePath, scenePath, wrapAngle } from './ropePath'
import type { PathPulley, RopePath, RopeSegment } from './ropePath'
import type { Rope, Scene, Vec2 } from './types'

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
    const path = scenePath(scene, scene.constraints![0] as Rope)!
    expectPoint(path.segments[0]!.from, { x: -0.25, y: 2.2 })
    expectPoint(path.segments[0]!.to, { x: -0.25, y: 5.25 })
    expectPoint(path.segments[1]!.from, { x: 0.25, y: 5.25 })
    expectPoint(path.segments[1]!.to, { x: 0.25, y: 1.2 })
    expect(path.length).toBeCloseTo(3.05 + 0.25 * Math.PI + 4.05, 9)
  })

  it('returns null when a reference dangles', () => {
    const rope = { ...(scene.constraints![0] as Rope), via: ['ghost'] }
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
    const at4 = scenePath(scene(4), scene(4).constraints![0] as Rope)!
    const at3 = scenePath(scene(3), scene(3).constraints![0] as Rope)!
    expectPoint(at4.arcs[0]!.center, { x: 0, y: 4 })
    expectPoint(at3.arcs[0]!.center, { x: 0, y: 3 })
    expectPoint(at3.segments[0]!.to, { x: -0.25, y: 3 })
    // Lowering the load 1 m lengthens both legs that hang on it.
    expect(at3.length - at4.length).toBeCloseTo(2, 9)
  })
})

describe('ropePath, kept wrap direction (PHY-45)', () => {
  const pulley = [{ center: { x: 0, y: 0 }, radius: 1 }]

  it('two ends under the disk, nearly collinear with its center, swap sides: the kept direction holds and the length is continuous', () => {
    // a = (e, −3), b = (−e, −4): the turn at the center changes sign with e, so
    // the curve alone flips the wrap between e = +0.005 and e = −0.005.
    const lengths: number[] = []
    for (let e = 0.02; e >= -0.0201; e -= 0.005) {
      const path = ropePath({ x: e, y: -3 }, { x: -e, y: -4 }, pulley, [1])
      expect(path.arcs[0]!.direction, `direction at e = ${e.toFixed(3)}`).toBe(1)
      lengths.push(path.length)
    }
    for (let i = 1; i < lengths.length; i++) expect(Math.abs(lengths[i]! - lengths[i - 1]!)).toBeLessThan(0.05)
    // Without `keep` the direction is the curve's sign, as before.
    expect(ropePath({ x: 0.005, y: -3 }, { x: -0.005, y: -4 }, pulley).arcs[0]!.direction).toBe(1)
    expect(ropePath({ x: -0.005, y: -3 }, { x: 0.005, y: -4 }, pulley).arcs[0]!.direction).toBe(-1)
  })

  it('a kept wrap that goes past 3π/2 as a block swings under and up the far side holds its direction, with the length continuous', () => {
    // b = (1, −5), a = (3, y), y from −2 up to 0: the clockwise wrap passes 3π/2
    // near y = −1. Yielding to the curve there would jump the length by ~2 m.
    const b = { x: 1, y: -5 }
    let previous: number | undefined
    for (let step = 0; step <= 20; step++) {
      const y = -2 + step * 0.1
      const path = ropePath({ x: 3, y }, b, pulley, [-1])
      expect(path.arcs[0]!.direction, `direction at y = ${y.toFixed(1)}`).toBe(-1)
      if (previous !== undefined) expect(Math.abs(path.length - previous), `length step at y = ${y.toFixed(1)}`).toBeLessThan(0.2)
      previous = path.length
    }
  })

  it('two ends close under the disk, wrapping past 3π/2, swap sides and the kept direction still holds', () => {
    for (let e = 0.1; e >= -0.1001; e -= 0.02) {
      const path = ropePath({ x: e, y: -1.2 }, { x: -e, y: -1.2 }, pulley, [1])
      expect(path.arcs[0]!.direction, `direction at e = ${e.toFixed(2)}`).toBe(1)
    }
  })

  describe('ropePath, unwound sweep (PHY-54)', () => {
    const unit = (s: RopeSegment): Vec2 => {
      const d = Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y)
      return { x: (s.to.x - s.from.x) / d, y: (s.to.y - s.from.y) / d }
    }

    /** Reads `ends` in order, each call given the sweeps the one before returned. */
    function walk(ends: ReadonlyArray<readonly [Vec2, Vec2]>, pulleys: readonly PathPulley[], keep: readonly (1 | -1)[]): RopePath[] {
      let sweeps: Array<number | undefined> = pulleys.map(() => undefined)
      return ends.map(([a, b]) => {
        const path = ropePath(a, b, pulleys, keep, sweeps)
        sweeps = path.arcs.map((arc) => arc.sweep)
        return path
      })
    }

    function maxStep(paths: readonly RopePath[]): number {
      let worst = 0
      for (let i = 1; i < paths.length; i++) worst = Math.max(worst, Math.abs(paths[i]!.length - paths[i - 1]!.length))
      return worst
    }

    /** k from 0 up to 200 and back to 0: the height h = 0.9 + 0.001·k goes through the tangent height 1 and returns. */
    const ks = [...Array.from({ length: 201 }, (_, k) => k), ...Array.from({ length: 200 }, (_, k) => 199 - k)]

    it('a rope lifted past the tangent height lets go of the pulley, lies straight between its ends, and takes the pulley back on the way down', () => {
      const ends = ks.map((k): readonly [Vec2, Vec2] => [
        { x: -3, y: 0.9 + k * 0.001 },
        { x: 3, y: 0.9 + k * 0.001 },
      ])
      const paths = walk(ends, pulley, [-1])
      expect(maxStep(paths)).toBeLessThanOrEqual(0.001)
      paths.forEach((path, i) => {
        const k = ks[i]!
        const [a, b] = ends[i]!
        if (k >= 101) {
          expect(path.arcs[0]!.sweep, `sweep at k = ${k}`).toBeLessThan(0)
          expect(path.length, `length at k = ${k}`).toBeCloseTo(6, 9)
          expect(path.segments).toHaveLength(2)
          expectPoint(path.segments[0]!.to, path.segments[1]!.from)
          const joint = path.segments[0]!.to
          expect(joint.y).toBeCloseTo(a.y, 9)
          expect(joint.x).toBeGreaterThan(a.x)
          expect(joint.x).toBeLessThan(b.x)
          // Collinear and the same way on, so the pull back along one and ahead along the other sums to 0.
          expectPoint(unit(path.segments[0]!), unit(path.segments[1]!))
        }
        if (k <= 99) {
          expect(path.arcs[0]!.direction, `direction at k = ${k}`).toBe(-1)
          expect(path.length, `length at k = ${k}`).toBeCloseTo(ropePath(a, b, pulley, [-1]).length, 9)
        }
      })
    })

    it('a wrap that goes past a full turn keeps the length continuous', () => {
      const a = { x: -3, y: 0.5 }
      const ends: Array<readonly [Vec2, Vec2]> = []
      for (let i = 0; i * 0.001 <= 2 * Math.PI + 1; i++) ends.push([a, { x: 2 * Math.cos(-i * 0.001), y: 2 * Math.sin(-i * 0.001) }])
      const paths = walk(ends, pulley, [-1])
      expect(Math.max(...paths.map((path) => path.arcs[0]!.sweep))).toBeGreaterThan(2 * Math.PI)
      for (let i = 1; i < paths.length; i++) {
        const moved = Math.hypot(ends[i]![1].x - ends[i - 1]![1].x, ends[i]![1].y - ends[i - 1]![1].y)
        expect(Math.abs(paths[i]!.length - paths[i - 1]!.length), `length step ${i}`).toBeLessThanOrEqual(moved + EPS)
      }
    })

    it('a rope over two pulleys whose end is lifted past the first drops it and is the rope over the second alone', () => {
      const two = [
        { center: { x: 0, y: 0 }, radius: 1 },
        { center: { x: 5, y: 0 }, radius: 1 },
      ]
      const b = { x: 8, y: -2 }
      const ends = ks.map((k): readonly [Vec2, Vec2] => [{ x: -3, y: 0.9 + k * 0.001 }, b])
      const paths = walk(ends, two, [-1, -1])
      expect(maxStep(paths)).toBeLessThanOrEqual(0.001)
      paths.forEach((path, i) => {
        const k = ks[i]!
        const [a] = ends[i]!
        if (k >= 101) {
          expect(path.arcs[0]!.sweep, `sweep at k = ${k}`).toBeLessThan(0)
          expect(path.length, `length at k = ${k}`).toBeCloseTo(ropePath(a, b, [two[1]!], [-1]).length, 9)
        }
        if (k <= 99) expect(path.length, `length at k = ${k}`).toBeCloseTo(ropePath(a, b, two, [-1, -1]).length, 9)
      })
    })

    it('a loose pulley whose center projects past an end of the straight leg keeps both end segments and a joint that pulls nothing', () => {
      // The center projects to x = 0, past b = (−1, 2): the joint stays inside the leg.
      const a = { x: -3, y: 2 }
      const b = { x: -1, y: 2 }
      const path = ropePath(a, b, pulley, [-1], [-0.5])
      expect(path.arcs[0]!.sweep).toBeLessThan(0)
      expect(path.length).toBeCloseTo(2, 9)
      expect(path.segments).toHaveLength(2)
      for (const s of path.segments) expect(Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y)).toBeGreaterThan(0.1)
      expectPoint(path.segments[0]!.from, a)
      expectPoint(path.segments[1]!.to, b)
      expectPoint(path.segments[0]!.to, path.segments[1]!.from)
      expectPoint(unit(path.segments[0]!), unit(path.segments[1]!))
    })

    it('CLEAN-29: one loose pulley sits at the midpoint of its straight leg', () => {
      const path = ropePath({ x: -3, y: 2 }, { x: -1, y: 2 }, pulley, [-1], [-0.5])
      expect(path.segments).toHaveLength(2)
      expectPoint(path.segments[0]!.to, { x: -2, y: 2 })
      expectPoint(path.segments[1]!.from, { x: -2, y: 2 })
      expect(path.arcs[0]!.sweep).toBeLessThan(0)
    })

    it('CLEAN-29: a loose arc starts at the angle from its center to the returned joint', () => {
      const path = ropePath({ x: -3, y: 2 }, { x: -1, y: 2 }, pulley, [-1], [-0.5])
      const joint = path.segments[0]!.to
      const center = pulley[0]!.center
      expect(path.arcs[0]!.start).toBeCloseTo(Math.atan2(joint.y - center.y, joint.x - center.x), 9)
    })

    it('CLEAN-29: loose pulleys between two engaged pulleys divide the leg equally in via order', () => {
      const a = { x: -7, y: -5 }
      const b = { x: 7, y: -5 }
      const four = [
        { center: { x: -6, y: 0 }, radius: 1 },
        { center: { x: -1, y: -3 }, radius: 1 },
        { center: { x: 3, y: -3 }, radius: 1 },
        { center: { x: 6, y: 0 }, radius: 1 },
      ]
      const path = ropePath(a, b, four, [-1, -1, -1, -1], [undefined, -0.5, -0.5, undefined])
      expect(path.segments).toHaveLength(5)
      // The engaged pulleys bound a 12 m horizontal leg; each of its three parts is 4 m.
      expectPoint(path.segments[1]!.from, { x: -6, y: 1 })
      expectPoint(path.segments[1]!.to, { x: -2, y: 1 })
      expectPoint(path.segments[2]!.from, { x: -2, y: 1 })
      expectPoint(path.segments[2]!.to, { x: 2, y: 1 })
      expectPoint(path.segments[3]!.from, { x: 2, y: 1 })
      expectPoint(path.segments[3]!.to, { x: 6, y: 1 })
      expect(path.arcs).toHaveLength(4)
      for (let i = 0; i < four.length; i++) expectPoint(path.arcs[i]!.center, four[i]!.center)
      expect(path.arcs[0]!.sweep).toBeCloseTo(Math.PI / 2, 9)
      expect(path.arcs[3]!.sweep).toBeCloseTo(Math.PI / 2, 9)
      expect(path.length).toBeCloseTo(22 + Math.PI, 9)
      expect(path.length).toBeCloseTo(ropePath(a, b, [four[0]!, four[3]!], [-1, -1]).length, 9)
      for (const i of [1, 2]) {
        const arc = path.arcs[i]!
        const joint = path.segments[i]!.to
        const center = four[i]!.center
        expect(arc.sweep).toBeLessThan(0)
        expect(arc.start).toBeCloseTo(Math.atan2(joint.y - center.y, joint.x - center.x), 9)
      }
    })

    it('a pulley with no history reads as the path without history', () => {
      const ends: Array<readonly [Vec2, Vec2]> = [
        [{ x: -3, y: 0.5 }, { x: 3, y: -0.5 }],
        [{ x: -3, y: 2 }, { x: 3, y: 2 }],
        [{ x: 0.3, y: -3 }, { x: -0.2, y: -4 }],
      ]
      for (const [a, b] of ends) expect(ropePath(a, b, pulley, [-1], [undefined])).toStrictEqual(ropePath(a, b, pulley, [-1]))
    })

    /** Items 1.1–1.4 of CLEAN-25: both loose, length |a − b|, three segments along +x, no pull on either pulley. */
    function expectStraightOverLoose(path: RopePath, a: Vec2, b: Vec2, at: string): void {
      expect(path.arcs[0]!.sweep, `sweep 0 ${at}`).toBeLessThan(0)
      expect(path.arcs[1]!.sweep, `sweep 1 ${at}`).toBeLessThan(0)
      expect(Math.abs(path.length - Math.hypot(b.x - a.x, b.y - a.y)), `length ${at}`).toBeLessThanOrEqual(EPS)
      expect(path.segments, `segments ${at}`).toHaveLength(3)
      for (const s of path.segments) {
        expect(Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y), `segment length ${at}`).toBeGreaterThan(0.1)
        const u = unit(s)
        expect(Math.abs(u.x - 1) + Math.abs(u.y), `segment direction ${at}`).toBeLessThanOrEqual(EPS)
      }
      for (let i = 0; i < 2; i++) {
        const inbound = unit(path.segments[i]!)
        const outbound = unit(path.segments[i + 1]!)
        const pull = { x: outbound.x - inbound.x, y: outbound.y - inbound.y }
        expect(Math.abs(pull.x) + Math.abs(pull.y), `pull on pulley ${i} ${at}`).toBeLessThanOrEqual(EPS)
      }
    }

    it('CLEAN-25: two loose pulleys that swap order along the leg leave the rope straight, 11 m long and pulling neither', () => {
      const ends = (h: number): [Vec2, Vec2] => [
        { x: -3, y: h },
        { x: 8, y: h },
      ]
      const readings: Array<{ a: Vec2; b: Vec2; centers: [Vec2, Vec2]; check: boolean; at: string }> = []
      for (let k = 0; k <= 4000; k++) {
        const [a, b] = ends(-2 + k / 1000)
        readings.push({ a, b, centers: [{ x: 0, y: 0 }, { x: 5, y: 0 }], check: k >= 3001, at: `at (a) k = ${k}` })
      }
      for (let j = 1; j <= 3000; j++) {
        const [a, b] = ends(2)
        readings.push({ a, b, centers: [{ x: 0, y: 0 }, { x: 5, y: -j / 1000 }], check: true, at: `at (b) j = ${j}` })
      }
      for (let j = 1; j <= 5000; j++) {
        const [a, b] = ends(2)
        readings.push({ a, b, centers: [{ x: j / 1000, y: 0 }, { x: 5 - j / 1000, y: -3 }], check: true, at: `at (c) j = ${j}` })
      }
      let sweeps: Array<number | undefined> = [undefined, undefined]
      for (const { a, b, centers, check, at } of readings) {
        const pulleys = centers.map((center) => ({ center, radius: 1 }))
        const path = ropePath(a, b, pulleys, [-1, -1], sweeps)
        if (check) {
          expectStraightOverLoose(path, a, b, at)
          for (let i = 0; i < 2; i++) {
            expectPoint(path.arcs[i]!.center, centers[i]!)
            const alone = ropePath(a, b, [pulleys[i]!], [-1], [sweeps[i]]).arcs[0]!.sweep
            expect(Math.abs(path.arcs[i]!.sweep - alone), `sweep ${i} alone ${at}`).toBeLessThanOrEqual(EPS)
          }
        }
        sweeps = path.arcs.map((arc) => arc.sweep)
      }
      expect(Math.abs(sweeps[0]! - -0.4303793433006895)).toBeLessThanOrEqual(EPS)
      expect(Math.abs(sweeps[1]! - -1.3104262520688144)).toBeLessThanOrEqual(EPS)
    }, 30000)

    it.each([
      { name: 'equal projections', centers: [{ x: 2, y: 0 }, { x: 2, y: -3 }] },
      { name: 'both past b', centers: [{ x: 9, y: 0 }, { x: 10, y: 0 }] },
      { name: 'in via order', centers: [{ x: 0, y: 0 }, { x: 5, y: -3 }] },
    ])('CLEAN-25: two loose pulleys with $name leave the rope straight and pulling neither', ({ centers }) => {
      const a = { x: -3, y: 2 }
      const b = { x: 8, y: 2 }
      const path = ropePath(a, b, centers.map((center) => ({ center, radius: 1 })), [-1, -1], [-0.5, -0.5])
      expectStraightOverLoose(path, a, b, '')
    })
  })
})

describe('wrapAngle (CLEAN-26)', () => {
  it('maps an angle to its equivalent modulo 2π with absolute value at most π', () => {
    const cases: Array<[number, number]> = [
      [0, 0],
      [2 * Math.PI, 0],
      [(3 * Math.PI) / 2, -Math.PI / 2],
      [(-3 * Math.PI) / 2, Math.PI / 2],
      [Math.PI / 2 + 4 * Math.PI, Math.PI / 2],
    ]
    for (const [x, expected] of cases) expect(Math.abs(wrapAngle(x) - expected), `wrapAngle(${x})`).toBeLessThan(1e-12)
  })
})
