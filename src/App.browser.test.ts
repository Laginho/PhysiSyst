import { describe, expect, it } from 'vitest'
import { withBrowserSession } from './test/browser'

describe('selection keeps the canvas stationary (PHY-18)', () => {
  it.each([1280, 1920])('keeps the same 3:2 rectangle through all selections in Chromium at viewport width %i', async (width) => {
    const { before, selections } = await withBrowserSession(width, 25000, async (session) => {
      await session.reset()
      const before = await session.rect()
      const selections: { id: string | null; legends: string[]; rectangle: object }[] = []
      for (const [id, x, y] of [
        ['caixa', 9, 3],
        ['rampa', 3.5, 0.2],
        ['bola', 11, 5],
        [null, 0, 8],
      ] as const) {
        await session.select(x, y)
        selections.push({ id, legends: await session.selectedLegends(), rectangle: await session.rect() })
      }
      return { before, selections }
    })

    expect(before.width).toBeGreaterThan(100)
    expect(before.top).toBeGreaterThanOrEqual(0)
    expect(before.bottom).toBeLessThanOrEqual(1080)
    expect((before.width - 2) / (before.height - 2)).toBeCloseTo(1.5, 2)
    for (const { id, legends, rectangle } of selections) {
      if (id) expect(legends).toContain(id)
      else expect(legends).not.toContain('bola')
      expect(rectangle).toEqual(before)
    }
  }, 30000)

  it.each([1280, 1920])('drops at the same world position with and without prior selection in Chromium at viewport width %i', async (width) => {
    const positions = await withBrowserSession(width, 25000, async (session) => {
      await session.reset()
      const results = []
      for (const preselected of [false, true]) {
        if (preselected) {
          await session.reset()
          await session.select(9, 3)
        }
        await session.drag({ x: 9, y: 3 }, { x: 8, y: 6 })
        results.push(await session.readBoxPosition())
      }
      return results
    })

    expect(positions).toHaveLength(2)
    expect(positions[0]).toEqual(positions[1])
    expect(positions[0].x).toBeCloseTo(8, 2)
    expect(positions[0].y).toBeCloseTo(6, 2)
  }, 30000)
})
