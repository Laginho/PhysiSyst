import { describe, expect, it } from 'vitest'
import { actionForKey } from './shortcuts'

function key(overrides: Partial<Parameters<typeof actionForKey>[0]>) {
  return actionForKey({
    key: '',
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    inTextField: false,
    targetHandlesKeyNatively: false,
    ...overrides,
  })
}

describe('actionForKey', () => {
  it('Ctrl+Z undoes', () => {
    expect(key({ key: 'z', ctrlKey: true })).toBe('undo')
  })

  it('Cmd+Z undoes — metaKey behaves exactly like ctrlKey', () => {
    expect(key({ key: 'z', metaKey: true })).toBe('undo')
  })

  it('Ctrl+Shift+Z redoes', () => {
    expect(key({ key: 'z', ctrlKey: true, shiftKey: true })).toBe('redo')
  })

  it('Ctrl+Y redoes', () => {
    expect(key({ key: 'y', ctrlKey: true })).toBe('redo')
  })

  it('Cmd+Shift+Z redoes — metaKey behaves exactly like ctrlKey', () => {
    expect(key({ key: 'z', metaKey: true, shiftKey: true })).toBe('redo')
  })

  it('Delete removes the selected body', () => {
    expect(key({ key: 'Delete' })).toBe('delete')
  })

  it('Backspace removes the selected body', () => {
    expect(key({ key: 'Backspace' })).toBe('delete')
  })

  it('Space toggles play/pause', () => {
    expect(key({ key: ' ' })).toBe('togglePlay')
  })

  it('ArrowRight steps once', () => {
    expect(key({ key: 'ArrowRight' })).toBe('stepOnce')
  })

  it('R resets', () => {
    expect(key({ key: 'r' })).toBe('reset')
  })

  it('Escape deselects or closes the menu', () => {
    expect(key({ key: 'Escape' })).toBe('deselectOrClose')
  })

  it('? opens/closes the shortcuts menu', () => {
    expect(key({ key: '?' })).toBe('toggleHelp')
  })

  it('a focused text field swallows every shortcut, even Ctrl+Z', () => {
    expect(key({ key: 'z', ctrlKey: true, inTextField: true })).toBeNull()
    expect(key({ key: 'Delete', inTextField: true })).toBeNull()
    expect(key({ key: ' ', inTextField: true })).toBeNull()
  })

  it('an unmapped key returns null', () => {
    expect(key({ key: 'q' })).toBeNull()
    expect(key({ key: 'F5' })).toBeNull()
  })

  it('Space does nothing when the focused element handles it natively (e.g. a button) — lets it activate instead', () => {
    expect(key({ key: ' ', targetHandlesKeyNatively: true })).toBeNull()
  })

  it('Space still toggles play/pause when the target does not handle it natively', () => {
    expect(key({ key: ' ', targetHandlesKeyNatively: false })).toBe('togglePlay')
  })

  it('a native-activation target does not swallow unrelated shortcuts, like Ctrl+Z', () => {
    expect(key({ key: 'z', ctrlKey: true, targetHandlesKeyNatively: true })).toBe('undo')
  })
})
