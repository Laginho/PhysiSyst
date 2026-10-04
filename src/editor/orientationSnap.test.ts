import { describe, expect, it } from 'vitest'
import { snapOrientation } from './orientationSnap'

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
