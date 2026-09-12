import { describe, expect, it } from 'vitest'
import { messageAt } from './loadingMessage'

describe('messageAt', () => {
  it('is deterministic for the same seed, tick and count', () => {
    expect(messageAt(42, 3, 10)).toBe(messageAt(42, 3, 10))
    expect(messageAt(7, 0, 10)).toBe(messageAt(7, 0, 10))
  })

  it('covers every index across one full cycle of `count` ticks', () => {
    const count = 10
    for (const seed of [1, 2, 99, 12345]) {
      const seen = new Set(Array.from({ length: count }, (_, tick) => messageAt(seed, tick, count)))
      expect(seen).toEqual(new Set(Array.from({ length: count }, (_, i) => i)))
    }
  })

  it('never returns the same index on two consecutive ticks, across several cycles', () => {
    const count = 10
    for (const seed of [1, 2, 99, 12345]) {
      let previous = messageAt(seed, 0, count)
      for (let tick = 1; tick < count * 5; tick++) {
        const current = messageAt(seed, tick, count)
        expect(current).not.toBe(previous)
        previous = current
      }
    }
  })

  it('different seeds produce different rotations', () => {
    const count = 10
    const a = Array.from({ length: count }, (_, tick) => messageAt(1, tick, count))
    const b = Array.from({ length: count }, (_, tick) => messageAt(2, tick, count))
    expect(a).not.toEqual(b)
  })
})
