import { describe, expect, it } from 'vitest'
import { fitCanvas } from './fitCanvas'

describe('fitCanvas', () => {
  it('fills a wide container: height is the limiting axis', () => {
    // 2000x600 container: 3:2 at full height (600) needs width 900, which fits.
    expect(fitCanvas(2000, 600)).toEqual({ width: 900, height: 600 })
  })

  it('fills a tall container: width is the limiting axis', () => {
    // 900x2000 container: 3:2 at full width (900) needs height 600, which fits.
    expect(fitCanvas(900, 2000)).toEqual({ width: 900, height: 600 })
  })

  it('never goes below the 600px width floor, even in a tiny container', () => {
    expect(fitCanvas(300, 300)).toEqual({ width: 600, height: 400 })
  })

  it('an exactly-3:2 container is used at full size', () => {
    expect(fitCanvas(1200, 800)).toEqual({ width: 1200, height: 800 })
  })

  it('always returns an exact 3:2 ratio', () => {
    for (const [w, h] of [
      [2000, 600],
      [900, 2000],
      [300, 300],
      [1200, 800],
      [1920, 1080],
    ] as const) {
      const size = fitCanvas(w, h)
      expect(size.width / size.height).toBeCloseTo(3 / 2, 9)
    }
  })
})
