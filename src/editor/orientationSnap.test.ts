import { describe, expect, it } from 'vitest'
import type { Body, Constraint, Scene } from '../scene'
import { bodyOrientationSnap, snapOrientation } from './orientationSnap'

describe('snapOrientation', () => {
  const other = { x: 0, y: 0 }

  it('aligns a nearly vertical segment through its other end', () => {
    expect(snapOrientation({ x: 0.05, y: 2 }, other, 60)).toEqual({
      axis: 'vertical', through: other, delta: { x: -0.05, y: 0 },
    })
  })

  it('aligns a nearly horizontal segment through its other end', () => {
    expect(snapOrientation({ x: 2, y: -0.1 }, other, 60)).toEqual({
      axis: 'horizontal', through: other, delta: { x: 0, y: 0.1 },
    })
  })

  it('leaves a segment outside the screen tolerance alone', () => {
    expect(snapOrientation({ x: 0.3, y: 2 }, other, 60)).toBeNull()
  })

  it.each([{ x: 0, y: 0 }, { x: 0.1, y: 0.12 }, { x: 0, y: 10 / 60 }])(
    'does not snap short or coincident ends at $x, $y', (moving) => {
      expect(snapOrientation(moving, other, 60)).toBeNull()
    },
  )

  it('chooses the smaller perpendicular displacement when both axes fit', () => {
    expect(snapOrientation({ x: 0.16, y: 0.12 }, other, 60)).toEqual({
      axis: 'horizontal', through: other, delta: { x: 0, y: -0.12 },
    })
  })

  it('includes the tolerance boundary and measures it in screen pixels', () => {
    expect(snapOrientation({ x: 0.25, y: 2 }, other, 40)).toEqual({
      axis: 'vertical', through: other, delta: { x: -0.25, y: 0 },
    })
    expect(snapOrientation({ x: 0.25, y: 2 }, other, 80)).toBeNull()
  })
})

describe('bodyOrientationSnap', () => {
  const pivot: Body = { id: 'pivo', shape: 'circle', radius: 0.1, fixed: true, mass: 0,
    position: { x: 6, y: 7 }, rotation: 0 }
  const ball: Body = { id: 'bola', shape: 'circle', radius: 0.3, fixed: false, mass: 1,
    position: { x: 8, y: 5 }, rotation: 0 }
  const rope: Constraint = { id: 'corda', kind: 'rope', via: [],
    a: { bodyId: 'pivo', anchor: { x: 0, y: 0 } }, b: { bodyId: 'bola', anchor: { x: 0, y: 0 } } }
  const scene = (constraints?: Constraint[]): Scene => ({ version: 1, constants: { g: 9.81 },
    bodies: [pivot, ball], constraints, contacts: [], forces: [] })
  const proposed: Body = { ...ball, position: { x: 6.08, y: 5 } }

  it.each([false, true])('aligns a pendulum at its proposed pose, reversed=%s', (reversed) => {
    const doc = scene([{ ...rope, a: reversed ? rope.b : rope.a, b: reversed ? rope.a : rope.b }])
    const result = bodyOrientationSnap(doc, proposed, 60)
    expect(result.body).toEqual({ ...proposed, position: { x: 6, y: 5 } })
    expect(result.guide?.axis).toBe('vertical')
    expect(result.guide?.through).toEqual({ x: 6, y: 7 })
    expect(result.guide?.delta.x).toBeCloseTo(-0.08, 12)
    expect(result.guide?.delta.y).toBe(0)
    expect(doc.bodies[1]!.position).toEqual({ x: 8, y: 5 })
    expect(proposed.position).toEqual({ x: 6.08, y: 5 })
  })

  it.each([0, Math.PI / 2])('aligns a spring using body-local anchors at rotation %s', (rotation) => {
    const wall: Body = { ...pivot, id: 'parede', position: { x: 4.1, y: 0.1 }, rotation: Math.PI / 2 }
    const block: Body = { ...ball, id: 'bloco', shape: 'rectangle', width: 1, height: 1,
      position: { x: 6.1, y: rotation === 0 ? 0.27 : 0.47 }, rotation }
    const spring: Constraint = { id: 'mola', kind: 'spring', k: 10, x0: 2,
      a: { bodyId: wall.id, anchor: { x: 0.1, y: 0 } }, b: { bodyId: block.id, anchor: { x: -0.2, y: 0 } } }
    const result = bodyOrientationSnap({ ...scene([spring]), bodies: [wall, block] }, block, 60)
    expect(result.body.position.x).toBe(6.1)
    expect(result.body.position.y).toBeCloseTo(rotation === 0 ? 0.2 : 0.4, 12)
    expect(result.body.rotation).toBe(rotation)
    expect(result.guide?.axis).toBe('horizontal')
    expect(result.guide?.through).toEqual({ x: 4.1, y: 0.2 })
  })

  it('ignores ropes through pulleys', () => {
    const result = bodyOrientationSnap(scene([{ ...rope, via: ['polia'] }]), proposed, 60)
    expect(result.body).toBe(proposed)
    expect(result.guide).toBeNull()
  })

  it.each([undefined, [], [{ ...rope, b: rope.a }], [{ ...rope, a: { ...rope.a, bodyId: 'missing' } }]])(
    'leaves a body without an eligible connection alone (%j)', (constraints) => {
      const result = bodyOrientationSnap(scene(constraints), proposed, 60)
      expect(result.body).toBe(proposed)
      expect(result.guide).toBeNull()
    },
  )

  it('leaves connected bodies alone outside the tolerance', () => {
    const distant = { ...ball, position: { x: 6.3, y: 5 } }
    expect(bodyOrientationSnap(scene([rope]), distant, 60)).toEqual({ body: distant, guide: null })
  })

  it('chooses the closest segment without accumulating competing snaps', () => {
    const side: Body = { ...pivot, id: 'side', position: { x: 4, y: 5.04 } }
    const spring: Constraint = { id: 'mola', kind: 'spring', k: 10, x0: 2,
      a: { bodyId: ball.id, anchor: { x: 0, y: 0 } }, b: { bodyId: side.id, anchor: { x: 0, y: 0 } } }
    const doc = { ...scene([rope, spring]), bodies: [pivot, ball, side] }
    const result = bodyOrientationSnap(doc, proposed, 60)
    expect(result.body.position).toEqual({ x: 6.08, y: 5.04 })
    expect(result.guide?.axis).toBe('horizontal')
    expect(result.guide?.through).toEqual(side.position)
    expect(bodyOrientationSnap({ ...doc, constraints: [spring, rope] }, proposed, 60)).toEqual(result)
  })
})
