import { describe, expect, it } from 'vitest'
import { canRedo, canUndo, clear, initialHistory, push, redo, undo } from './history'

describe('initialHistory', () => {
  it('starts empty: neither undo nor redo available', () => {
    const h = initialHistory<number>()
    expect(canUndo(h)).toBe(false)
    expect(canRedo(h)).toBe(false)
  })
})

describe('push', () => {
  it('makes undo available and clears any redo branch', () => {
    let h = initialHistory<number>()
    h = push(h, 1)
    expect(canUndo(h)).toBe(true)

    const u = undo(h, 2)
    expect(u).not.toBeNull()
    h = u!.history
    expect(canRedo(h)).toBe(true)

    // Pushing a fresh entry (a new edit after undo) discards the redo branch.
    h = push(h, 5)
    expect(canRedo(h)).toBe(false)
  })

  it('keeps at most 50 entries, dropping the oldest', () => {
    let h = initialHistory<number>()
    for (let i = 0; i < 60; i++) h = push(h, i)
    let last = -1
    let count = 0
    while (canUndo(h)) {
      const u = undo(h, 999)!
      h = u.history
      last = u.entry
      count++
    }
    expect(count).toBe(50)
    expect(last).toBe(10) // oldest surviving entry: pushes 0..9 were evicted
  })
})

describe('undo/redo', () => {
  it('undo returns the last pushed entry and stashes the current one for redo', () => {
    let h = initialHistory<string>()
    h = push(h, 'a')
    h = push(h, 'b')
    const u1 = undo(h, 'c')
    expect(u1?.entry).toBe('b')
    h = u1!.history
    const u2 = undo(h, 'c-undone-to-b')
    expect(u2?.entry).toBe('a')
  })

  it('undo on an empty stack is a no-op (null)', () => {
    const h = initialHistory<string>()
    expect(undo(h, 'x')).toBeNull()
  })

  it('redo restores what undo just took back, and round-trips', () => {
    let h = initialHistory<string>()
    h = push(h, 'a')
    const u = undo(h, 'b')!
    h = u.history
    expect(canRedo(h)).toBe(true)
    const r = redo(h, u.entry)!
    expect(r.entry).toBe('b')
    h = r.history
    expect(canRedo(h)).toBe(false)
    expect(canUndo(h)).toBe(true)
  })

  it('redo on an empty future is a no-op (null)', () => {
    const h = initialHistory<string>()
    expect(redo(h, 'x')).toBeNull()
  })
})

describe('clear', () => {
  it('drops both stacks', () => {
    let h = initialHistory<number>()
    h = push(h, 1)
    const u = undo(h, 2)!
    h = u.history
    h = clear<number>()
    expect(canUndo(h)).toBe(false)
    expect(canRedo(h)).toBe(false)
  })
})
