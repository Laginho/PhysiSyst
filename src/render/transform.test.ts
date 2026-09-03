import { describe, expect, it } from 'vitest'
import { makeTransform, screenToWorld, worldToScreen } from './transform'
import { drawGrid, gridSpacing } from './draw'

describe('world<->screen transform', () => {
  it('maps the camera center to the canvas center', () => {
    const t = makeTransform({ centerX: 3, centerY: -2, pixelsPerMeter: 50 }, 800, 600)
    const s = worldToScreen(t, 3, -2)
    expect(s.x).toBeCloseTo(400, 9)
    expect(s.y).toBeCloseTo(300, 9)
  })

  it('flips y: world up is screen up (smaller y)', () => {
    const t = makeTransform({ centerX: 0, centerY: 0, pixelsPerMeter: 100 }, 800, 600)
    const origin = worldToScreen(t, 0, 0)
    const above = worldToScreen(t, 0, 1)
    expect(origin.y - above.y).toBeCloseTo(100, 9)
    expect(above.x).toBeCloseTo(origin.x, 9)
  })

  it('scales horizontal offsets by pixelsPerMeter', () => {
    const t = makeTransform({ centerX: 0, centerY: 0, pixelsPerMeter: 32 }, 800, 600)
    const s = worldToScreen(t, 2, 0)
    expect(s.x).toBeCloseTo(400 + 64, 9)
    expect(s.y).toBeCloseTo(300, 9)
  })

  it('round-trips world -> screen -> world identically', () => {
    const t = makeTransform({ centerX: -12.5, centerY: 7.25, pixelsPerMeter: 47.5 }, 1024, 768)
    for (const [wx, wy] of [
      [0, 0],
      [-12.5, 7.25],
      [31.75, -104.125],
      [0.001, -0.001],
      [500, 500],
    ] as const) {
      const s = worldToScreen(t, wx, wy)
      const w = screenToWorld(t, s.x, s.y)
      expect(w.x).toBeCloseTo(wx, 9)
      expect(w.y).toBeCloseTo(wy, 9)
    }
  })

  it('round-trips screen -> world -> screen identically', () => {
    const t = makeTransform({ centerX: 2, centerY: 2, pixelsPerMeter: 13 }, 640, 480)
    for (const [sx, sy] of [
      [0, 0],
      [320, 240],
      [639.5, 1.25],
      [17, 459],
    ] as const) {
      const w = screenToWorld(t, sx, sy)
      const s = worldToScreen(t, w.x, w.y)
      expect(s.x).toBeCloseTo(sx, 9)
      expect(s.y).toBeCloseTo(sy, 9)
    }
  })
})
describe('gridSpacing', () => {
  // 1-2-5 ladder against T=40 provably yields px in [T, 2.5*T) = [40, 100).
  it.each([
    [5, 10], // raw 8 -> step 10 -> 50px
    [10, 5], // raw 4 -> step 5 -> 50px
    [20, 2], // raw exactly 2 -> step 2 -> 40px (envelope floor)
    [50, 1], // raw 0.8 -> step 1 -> 50px
    [100, 0.5], // raw 0.4 -> step 0.5 -> 50px
    [16, 5], // raw exactly 2.5 -> jumps to 5 -> 80px (worst case, still <100)
    [19.9, 5], // just above the 2->5 jump -> ~99.5px (near envelope ceiling)
    [39.9, 2], // just above the 1->2 jump -> ~79.8px
    [7.9, 10], // just above the 5->10 jump -> ~79.5px
  ] as const)('ppm %p picks %p m cells inside [40,100)px', (ppm, spacing) => {
    expect(gridSpacing(ppm)).toBe(spacing)
    const px = gridSpacing(ppm) * ppm
    expect(px).toBeGreaterThanOrEqual(40)
    expect(px).toBeLessThan(100)
  })

  it.each([0, -5, NaN, Infinity])('degenerate ppm %p falls back to 1 m cells', (ppm) => {
    expect(gridSpacing(ppm)).toBe(1)
  })
})
describe('drawGrid degenerate-camera guard', () => {
  // screenToWorld divides by ppm, so an invalid camera poisons the grid loop's
  // bounds with +-Infinity. drawGrid must bail out before touching ctx.
  // The stub ctx has no methods: any draw call throws, and vitest's timeout
  // catches a hang — either way the test fails if the guard is missing.
  it.each([0, NaN, Infinity])('returns immediately for ppm %p without drawing', (ppm) => {
    const ctx = {} as unknown as CanvasRenderingContext2D
    expect(() =>
      drawGrid(ctx, { centerX: 0, centerY: 0, pixelsPerMeter: ppm }, 800, 600),
    ).not.toThrow()
  })
})
