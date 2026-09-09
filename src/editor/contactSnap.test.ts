import { describe, expect, it } from 'vitest'
import type { Body } from '../scene'
import { resolveContactSnap } from './contactSnap'

const ground: Body = {
  id: 'ground',
  shape: 'rectangle',
  width: 20,
  height: 1,
  fixed: true,
  mass: 0,
  position: { x: 0, y: -0.5 },
  rotation: 0,
}

describe('resolveContactSnap', () => {
  it('places a rectangle flush on flat ground and aligns its rotation, naming the winning neighbor', () => {
    const body: Body = {
      id: 'box',
      shape: 'rectangle',
      width: 2,
      height: 1,
      fixed: false,
      mass: 1,
      position: { x: 2, y: 0.56 },
      rotation: 0.4,
    }

    const { body: snapped, neighborId } = resolveContactSnap(body, [ground], 100, true)

    expect(snapped.position.x).toBeCloseTo(2, 9)
    expect(snapped.position.y).toBeCloseTo(0.5, 9)
    expect(snapped.rotation).toBeCloseTo(0, 9)
    expect(neighborId).toBe('ground')
  })

  it('places a rectangle flush against an inclined face and aligns to that face', () => {
    const angle = Math.PI / 6
    const onSlope = { x: 2, y: 2 * Math.tan(angle) }
    const body: Body = {
      id: 'box',
      shape: 'rectangle',
      width: 1,
      height: 0.5,
      fixed: false,
      mass: 1,
      position: {
        x: onSlope.x - Math.sin(angle) * 0.3,
        y: onSlope.y + Math.cos(angle) * 0.3,
      },
      rotation: -0.2,
    }
    const incline: Body = {
      id: 'incline',
      shape: 'triangle',
      base: 4,
      alpha: 30,
      fixed: true,
      mass: 0,
      position: { x: 0, y: 0 },
      rotation: 0,
    }

    const { body: snapped, neighborId } = resolveContactSnap(body, [incline], 100, true)

    expect(snapped.position.x).toBeCloseTo(onSlope.x - Math.sin(angle) * 0.25, 9)
    expect(snapped.position.y).toBeCloseTo(onSlope.y + Math.cos(angle) * 0.25, 9)
    expect(snapped.rotation).toBeCloseTo(angle, 9)
    expect(neighborId).toBe('incline')
  })

  it('places a circle tangent to the nearest surface', () => {
    const body: Body = {
      id: 'ball',
      shape: 'circle',
      radius: 0.4,
      fixed: false,
      mass: 1,
      position: { x: -1, y: 0.47 },
      rotation: 0,
    }

    const { body: snapped, neighborId } = resolveContactSnap(body, [ground], 100, true)

    expect(snapped.position).toEqual({ x: -1, y: 0.4 })
    expect(neighborId).toBe('ground')
  })

  it('leaves placement untouched and names no neighbor outside the pixel tolerance or when disabled', () => {
    const body: Body = {
      id: 'ball',
      shape: 'circle',
      radius: 0.4,
      fixed: false,
      mass: 1,
      position: { x: 0.137, y: 0.51 },
      rotation: 0,
    }

    const outOfTolerance = resolveContactSnap(body, [ground], 100, true)
    expect(outOfTolerance.body).toBe(body)
    expect(outOfTolerance.neighborId).toBeNull()

    const disabled = resolveContactSnap({ ...body, position: { x: 0.137, y: 0.47 } }, [ground], 100, false)
    expect(disabled.body.position).toEqual({ x: 0.137, y: 0.47 })
    expect(disabled.neighborId).toBeNull()
  })

  it('keeps the tolerance fixed in screen pixels as zoom changes', () => {
    const body: Body = {
      id: 'ball',
      shape: 'circle',
      radius: 0.4,
      fixed: false,
      mass: 1,
      position: { x: 0, y: 0.47 },
      rotation: 0,
    }

    const tight = resolveContactSnap(body, [ground], 100, true)
    expect(tight.body.position.y).toBe(0.4)
    expect(tight.neighborId).toBe('ground')

    const zoomedOut = resolveContactSnap(body, [ground], 200, true)
    expect(zoomedOut.body).toBe(body)
    expect(zoomedOut.neighborId).toBeNull()
  })

  it('chooses the nearest when several surfaces are within tolerance, naming that surface as the neighbor', () => {
    const ceiling: Body = { ...ground, id: 'ceiling', position: { x: 0, y: 1.4 } }
    const body: Body = {
      id: 'ball',
      shape: 'circle',
      radius: 0.4,
      fixed: false,
      mass: 1,
      position: { x: 0, y: 0.47 },
      rotation: 0,
    }

    const { body: snapped, neighborId } = resolveContactSnap(body, [ground, ceiling], 100, true)

    expect(snapped.position.x).toBeCloseTo(0, 9)
    expect(snapped.position.y).toBeCloseTo(0.5, 9)
    // The ceiling's underside is the nearer surface (smaller displacement),
    // even though the ground is the one the ball's y is closest to in raw terms.
    expect(neighborId).toBe('ceiling')
  })

  it('uses tangent distance when a circle is dropped near another circle', () => {
    const neighbor: Body = {
      id: 'fixed-ball',
      shape: 'circle',
      radius: 1,
      fixed: true,
      mass: 0,
      position: { x: 0, y: 0 },
      rotation: 0,
    }
    const body: Body = {
      id: 'ball',
      shape: 'circle',
      radius: 0.5,
      fixed: false,
      mass: 1,
      position: { x: 1.57, y: 0 },
      rotation: 0,
    }

    const { body: snapped, neighborId } = resolveContactSnap(body, [neighbor], 100, true)

    expect(snapped.position).toEqual({ x: 1.5, y: 0 })
    expect(neighborId).toBe('fixed-ball')
  })

  it('moves a triangle into contact without changing its rotation', () => {
    const body: Body = {
      id: 'incline',
      shape: 'triangle',
      base: 3,
      alpha: 30,
      fixed: false,
      mass: 1,
      position: { x: -1, y: 0.06 },
      rotation: 0,
    }

    const { body: snapped, neighborId } = resolveContactSnap(body, [ground], 100, true)

    expect(snapped.position).toEqual({ x: -1, y: 0 })
    expect(snapped.rotation).toBe(0)
    expect(neighborId).toBe('ground')
  })
})
