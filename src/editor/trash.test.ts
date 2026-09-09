import { describe, expect, it } from 'vitest'
import { pointInTrash, trashRect } from './trash'

describe('trashRect', () => {
  it('sits flush against the bottom-right corner with a fixed margin', () => {
    const r = trashRect(900, 600)
    expect(r.x + r.w).toBe(900 - 12)
    expect(r.y + r.h).toBe(600 - 12)
    expect(r.w).toBe(40)
    expect(r.h).toBe(40)
  })
})

describe('pointInTrash', () => {
  const r = trashRect(900, 600)

  it('is true for a point inside the rect, including its edges', () => {
    expect(pointInTrash(r, r.x, r.y)).toBe(true)
    expect(pointInTrash(r, r.x + r.w, r.y + r.h)).toBe(true)
    expect(pointInTrash(r, r.x + r.w / 2, r.y + r.h / 2)).toBe(true)
  })

  it('is false just outside the rect', () => {
    expect(pointInTrash(r, r.x - 1, r.y)).toBe(false)
    expect(pointInTrash(r, r.x, r.y - 1)).toBe(false)
    expect(pointInTrash(r, r.x + r.w + 1, r.y + r.h)).toBe(false)
  })
})
