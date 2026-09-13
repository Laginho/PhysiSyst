import { describe, expect, it } from 'vitest'
import { messageAt } from './loadingMessage'

describe('messageAt (PHY-16)', () => {
  it('is deterministic: same seed, tick and count → same index', () => {
    for (let seed = 0; seed < 20; seed++) {
      for (let tick = 0; tick < 20; tick++) {
        expect(messageAt(seed, tick, 10)).toBe(messageAt(seed, tick, 10))
      }
    }
  })

  it('stays inside [0, count)', () => {
    for (const count of [1, 2, 3, 7, 10]) {
      for (let seed = 0; seed < 30; seed++) {
        for (let tick = 0; tick < 30; tick++) {
          const i = messageAt(seed, tick, count)
          expect(Number.isInteger(i)).toBe(true)
          expect(i).toBeGreaterThanOrEqual(0)
          expect(i).toBeLessThan(count)
        }
      }
    }
  })

  it('covers every index across `count` consecutive ticks, from any seed and any starting tick', () => {
    for (const count of [2, 3, 7, 10]) {
      for (let seed = 0; seed < 30; seed++) {
        for (const start of [0, 1, 5, 99]) {
          const seen = new Set<number>()
          for (let tick = start; tick < start + count; tick++) seen.add(messageAt(seed, tick, count))
          expect(seen.size, `count=${count} seed=${seed} start=${start}`).toBe(count)
        }
      }
    }
  })

  it('never returns the same index in two consecutive ticks (count ≥ 2)', () => {
    for (const count of [2, 3, 7, 10]) {
      for (let seed = 0; seed < 30; seed++) {
        for (let tick = 0; tick < 100; tick++) {
          expect(messageAt(seed, tick + 1, count), `count=${count} seed=${seed} tick=${tick}`).not.toBe(messageAt(seed, tick, count))
        }
      }
    }
  })

  it('the seed changes which message comes first (initial draw is honored)', () => {
    const firsts = new Set<number>()
    for (let seed = 0; seed < 10; seed++) firsts.add(messageAt(seed, 0, 10))
    expect(firsts.size).toBe(10)
  })
})
