import { describe, expect, it } from 'vitest'
import type { Body, Scene } from '../scene'
import { bodyAtPoint, pointInBody, pulleyAtPoint, ropeAtPoint, springAtPoint } from './hitTest'

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

describe('springAtPoint (PHY-27)', () => {
  // Wall at the origin, block at (4, 0): spring s1 runs from (0.5, 0) to (3.5, 0).
  const wall = rect({ id: 'wall', width: 1, height: 1, fixed: true })
  const block = rect({ id: 'block', width: 1, height: 1, position: { x: 4, y: 0 } })
  const end = (bodyId: string, x: number) => ({ bodyId, anchor: { x, y: 0 } })
  const SCENE: Scene = {
    version: 1,
    constants: { g: 9.81 },
    bodies: [wall, block],
    forces: [],
    contacts: [],
    constraints: [{ id: 's1', kind: 'spring', a: end('wall', 0.5), b: end('block', -0.5), k: 20, x0: 3 }],
  }

  it('hits a point within the tolerance of the segment between the anchors', () => {
    expect(springAtPoint(SCENE, { x: 2, y: 0.08 }, 0.1)?.id).toBe('s1')
    expect(springAtPoint(SCENE, { x: 0.55, y: -0.05 }, 0.1)?.id).toBe('s1')
  })

  it('misses beside the segment and past its ends', () => {
    expect(springAtPoint(SCENE, { x: 2, y: 0.2 }, 0.1)).toBeNull()
    expect(springAtPoint(SCENE, { x: 3.7, y: 0 }, 0.1)).toBeNull()
  })

  it('follows the bodies it is anchored to', () => {
    const raised: Scene = { ...SCENE, bodies: [wall, { ...block, position: { x: 4, y: 3 } }] }
    // Now from (0.5, 0) to (3.5, 3): its midpoint is (2, 1.5).
    expect(springAtPoint(raised, { x: 2, y: 1.5 }, 0.1)?.id).toBe('s1')
    expect(springAtPoint(raised, { x: 2, y: 0 }, 0.1)).toBeNull()
  })

  it('the topmost spring wins, and a rope is never a spring hit', () => {
    const layered: Scene = {
      ...SCENE,
      constraints: [...SCENE.constraints!, { id: 's2', kind: 'spring', a: end('wall', 0.5), b: end('block', -0.5), k: 20, x0: 3 }],
    }
    expect(springAtPoint(layered, { x: 2, y: 0 }, 0.1)?.id).toBe('s2')
    const roped: Scene = { ...SCENE, constraints: [{ id: 'r1', kind: 'rope', a: end('wall', 0.5), b: end('block', -0.5), via: [] }] }
    expect(springAtPoint(roped, { x: 2, y: 0 }, 0.1)).toBeNull()
  })
})

describe('pulleyAtPoint and ropeAtPoint (PHY-28)', () => {
  // Ceiling at (0, 5), pulley p1 of radius 0.5 hung at (0, 4); blocks at
  // (±0.5, 0). Rope r1 runs up x = −0.5, over p1, down x = 0.5.
  const ceiling = rect({ id: 'ceiling', width: 4, height: 1, position: { x: 0, y: 5 }, fixed: true })
  const left = rect({ id: 'left', width: 0.4, height: 0.4, position: { x: -0.5, y: 0 } })
  const right = rect({ id: 'right', width: 0.4, height: 0.4, position: { x: 0.5, y: 0 } })
  const top = (bodyId: string) => ({ bodyId, anchor: { x: 0, y: 0.2 } })
  const SCENE: Scene = {
    version: 1,
    constants: { g: 9.81 },
    bodies: [ceiling, left, right],
    forces: [],
    contacts: [],
    pulleys: [{ id: 'p1', bodyId: 'ceiling', anchor: { x: 0, y: -1 }, radius: 0.5 }],
    constraints: [{ id: 'r1', kind: 'rope', a: top('left'), b: top('right'), via: ['p1'] }],
  }

  it('hits a pulley inside its circle, following its mount body, and misses outside', () => {
    expect(pulleyAtPoint(SCENE, { x: 0.3, y: 4.3 })?.id).toBe('p1')
    expect(pulleyAtPoint(SCENE, { x: 0, y: 4.45 })?.id).toBe('p1')
    expect(pulleyAtPoint(SCENE, { x: 0.4, y: 3.6 })).toBeNull()
    expect(pulleyAtPoint({ ...SCENE, bodies: [{ ...ceiling, position: { x: 3, y: 5 } }, left, right] }, { x: 3, y: 4 })?.id).toBe('p1')
  })

  it('the topmost pulley wins', () => {
    const two: Scene = { ...SCENE, pulleys: [...SCENE.pulleys!, { id: 'p2', bodyId: 'ceiling', anchor: { x: 0, y: -1 }, radius: 0.5 }] }
    expect(pulleyAtPoint(two, { x: 0, y: 4 })?.id).toBe('p2')
  })

  it('hits a rope within the tolerance of any straight leg, and misses beside it and past its ends', () => {
    expect(ropeAtPoint(SCENE, { x: -0.45, y: 2 }, 0.1)?.id).toBe('r1')
    expect(ropeAtPoint(SCENE, { x: 0.55, y: 3 }, 0.1)?.id).toBe('r1')
    expect(ropeAtPoint(SCENE, { x: 0, y: 2 }, 0.1)).toBeNull()
    expect(ropeAtPoint(SCENE, { x: -0.5, y: -0.5 }, 0.1)).toBeNull()
  })

  it('a spring is never a rope hit', () => {
    const sprung: Scene = { ...SCENE, constraints: [{ id: 's1', kind: 'spring', a: top('left'), b: { bodyId: 'ceiling', anchor: { x: -0.5, y: -0.5 } }, k: 20, x0: 4 }] }
    expect(ropeAtPoint(sprung, { x: -0.5, y: 2 }, 0.1)).toBeNull()
  })
})
