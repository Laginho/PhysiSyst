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
  it('places a rectangle flush on flat ground and aligns its rotation', () => {
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

    const snapped = resolveContactSnap(body, [ground], 100, true)

    expect(snapped.position.x).toBeCloseTo(2, 9)
    expect(snapped.position.y).toBeCloseTo(0.5, 9)
    expect(snapped.rotation).toBeCloseTo(0, 9)
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

    const snapped = resolveContactSnap(body, [incline], 100, true)

    expect(snapped.position.x).toBeCloseTo(onSlope.x - Math.sin(angle) * 0.25, 9)
    expect(snapped.position.y).toBeCloseTo(onSlope.y + Math.cos(angle) * 0.25, 9)
    expect(snapped.rotation).toBeCloseTo(angle, 9)
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

    const snapped = resolveContactSnap(body, [ground], 100, true)

    expect(snapped.position).toEqual({ x: -1, y: 0.4 })
  })

  it('leaves placement untouched outside the pixel tolerance or when disabled', () => {
    const body: Body = {
      id: 'ball',
      shape: 'circle',
      radius: 0.4,
      fixed: false,
      mass: 1,
      position: { x: 0.137, y: 0.51 },
      rotation: 0,
    }

    expect(resolveContactSnap(body, [ground], 100, true)).toBe(body)
    expect(resolveContactSnap({ ...body, position: { x: 0.137, y: 0.47 } }, [ground], 100, false).position).toEqual({
      x: 0.137,
      y: 0.47,
    })
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

    expect(resolveContactSnap(body, [ground], 100, true).position.y).toBe(0.4)
    expect(resolveContactSnap(body, [ground], 200, true)).toBe(body)
  })

  it('chooses the nearest when several surfaces are within tolerance', () => {
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

    const snapped = resolveContactSnap(body, [ground, ceiling], 100, true)

    expect(snapped.position.x).toBeCloseTo(0, 9)
    expect(snapped.position.y).toBeCloseTo(0.5, 9)
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

    const snapped = resolveContactSnap(body, [neighbor], 100, true)

    expect(snapped.position).toEqual({ x: 1.5, y: 0 })
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

    const snapped = resolveContactSnap(body, [ground], 100, true)

    expect(snapped.position).toEqual({ x: -1, y: 0 })
    expect(snapped.rotation).toBe(0)
  })
})
