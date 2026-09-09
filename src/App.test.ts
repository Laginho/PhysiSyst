// @vitest-environment jsdom

import { createElement } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { makeTransform, worldToScreen } from './render/transform'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const originalGetContext = HTMLCanvasElement.prototype.getContext
let root: Root | null = null

const originalSetPointerCapture = HTMLCanvasElement.prototype.setPointerCapture

beforeEach(() => {
  document.body.innerHTML = ''
  window.localStorage.clear()
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => null,
  })
  // jsdom has no Pointer Events implementation at all (no constructor, no
  // capture methods) — stub the capture call so the canvas's onPointerDown
  // doesn't throw; dispatched events below are plain MouseEvents carrying
  // clientX/clientY, which is all the app's handlers read.
  Object.defineProperty(HTMLCanvasElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: () => {},
  })
})

afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: originalGetContext,
  })
  Object.defineProperty(HTMLCanvasElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: originalSetPointerCapture,
  })
})

function pointerEvent(type: string, x: number, y: number): MouseEvent {
  return new MouseEvent(type, { bubbles: true, clientX: x, clientY: y })
}

function renderApp(): HTMLElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root?.render(createElement(App)))
  return host
}

function inputForLabel(panel: Element, labelText: string): HTMLInputElement {
  const label = [...panel.querySelectorAll('label')].find((candidate) => candidate.textContent?.trim() === labelText)
  const input = label?.querySelector('input')
  if (!input) throw new Error(`missing input for ${labelText}`)
  return input
}

function setNativeInputValue(input: HTMLInputElement, value: number): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  if (!setter) throw new Error('HTMLInputElement.value setter is unavailable')
  setter.call(input, String(value))
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

// Same camera as App.tsx's module-private CAMERA/TRANSFORM (900x600, center
// (6,4), 60 px/m) — needed to convert the demo scene's world positions to the
// screen coordinates pointer events carry.
const TRANSFORM = makeTransform({ centerX: 6, centerY: 4, pixelsPerMeter: 60 }, 900, 600)
function screen(wx: number, wy: number) {
  return worldToScreen(TRANSFORM, wx, wy)
}

function contactPairs(host: HTMLElement): string[] {
  const fieldset = [...host.querySelectorAll('fieldset')].find((f) => f.querySelector('legend')?.textContent?.trim() === 'contatos')
  if (!fieldset) return []
  return [...fieldset.querySelectorAll('span')].map((s) => s.textContent?.trim() ?? '').filter((text) => text.includes('↔'))
}

// Drags whatever body sits at world (from.x, from.y) to world (to.x, to.y).
// Snap adjusts the exact resting position, so callers doing a second drag on
// an already-snapped body must pass its CURRENT position (see
// currentPosition below), never the position it was born at.
function dragTo(canvas: Element, from: { x: number; y: number }, to: { x: number; y: number }) {
  const start = screen(from.x, from.y)
  const target = screen(to.x, to.y)
  act(() => canvas.dispatchEvent(pointerEvent('pointerdown', start.x, start.y)))
  act(() => canvas.dispatchEvent(pointerEvent('pointermove', target.x, target.y)))
  act(() => canvas.dispatchEvent(pointerEvent('pointermove', target.x, target.y)))
  act(() => canvas.dispatchEvent(pointerEvent('pointerup', target.x, target.y)))
}

// Reads the selected body's live x/y off its properties panel (opening "ver
// mais" if needed) — the public seam for "where is this body right now".
function currentPosition(host: HTMLElement, id: string): { x: number; y: number } {
  const bodyPanel = [...host.querySelectorAll('fieldset')].find((f) => f.querySelector('legend')?.textContent?.trim() === id)
  if (!bodyPanel) throw new Error(`missing panel for ${id}`)
  const more = bodyPanel.querySelector(':scope > details') as HTMLDetailsElement | null
  if (!more) throw new Error(`missing details for ${id}`)
  if (!more.open) act(() => more.querySelector('summary')?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  return { x: Number(inputForLabel(more, 'x (m)').value), y: Number(inputForLabel(more, 'y (m)').value) }
}

/**
 * Dispatches a keydown at the currently focused element (falling back to
 * window), bubbling up to the App's single shortcut listener — same path a
 * real keystroke takes, and the only way `e.target` reflects a focused field.
 */
function pressKey(key: string, opts: Partial<KeyboardEventInit> = {}): void {
  const target: EventTarget = document.activeElement && document.activeElement !== document.body ? document.activeElement : window
  act(() => target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts })))
}

function findButton(host: HTMLElement, text: string): HTMLButtonElement | undefined {
  return [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)
}

describe('smoke', () => {
  it('loads the app module and exports a component', () => {
    expect(typeof App).toBe('function')
  })
})

describe('body properties panel', () => {
  it('shows only dynamic-body essentials by default and collapses pose and shape controls under ver mais', () => {
    const host = renderApp()
    const addRectangle = [...host.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'retângulo')
    expect(addRectangle).toBeDefined()

    act(() => addRectangle?.click())

    const bodyPanel = [...host.querySelectorAll('fieldset')].find((fieldset) => fieldset.querySelector('legend')?.textContent?.trim() === 'retangulo')
    expect(bodyPanel).toBeDefined()

    const more = bodyPanel?.querySelector(':scope > details')
    expect(more).not.toBeNull()
    expect(more?.querySelector(':scope > summary')?.textContent?.trim()).toBe('ver mais')
    expect((more as HTMLDetailsElement | null)?.open).toBe(false)

    const visiblePanelText = [...(bodyPanel?.children ?? [])]
      .filter((child) => child !== more)
      .map((child) => child.textContent ?? '')
      .join(' ')
    expect(visiblePanelText).toContain('massa (kg)')
    expect(visiblePanelText).toContain('fixo')
    expect(visiblePanelText).toContain('v₀ x (m/s)')
    expect(visiblePanelText).toContain('v₀ y (m/s)')
    expect(visiblePanelText).not.toContain('rotação (°)')
    expect(visiblePanelText).not.toContain('largura (m)')
    expect(visiblePanelText).not.toContain('altura (m)')
    expect(more?.textContent).toContain('x (m)')
    expect(more?.textContent).toContain('rotação (°)')
    expect(more?.textContent).toContain('largura (m)')
    expect(more?.textContent).toContain('altura (m)')
  })

  it('keeps ver mais open when the selected body changes', () => {
    const host = renderApp()
    const addRectangle = [...host.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'retângulo')
    expect(addRectangle).toBeDefined()

    act(() => addRectangle?.click())

    const firstBodyPanel = [...host.querySelectorAll('fieldset')].find((fieldset) => fieldset.querySelector('legend')?.textContent?.trim() === 'retangulo')
    const firstMore = firstBodyPanel?.querySelector(':scope > details') as HTMLDetailsElement | null
    expect(firstMore).not.toBeNull()

    act(() => firstMore?.querySelector('summary')?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(firstMore?.open).toBe(true)

    const addCircle = [...host.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'bola')
    expect(addCircle).toBeDefined()
    act(() => addCircle?.click())

    const secondBodyPanel = [...host.querySelectorAll('fieldset')].find((fieldset) => /^bola(?:-\d+)?$/.test(fieldset.querySelector('legend')?.textContent?.trim() ?? ''))
    const secondMore = secondBodyPanel?.querySelector(':scope > details') as HTMLDetailsElement | null
    expect(secondMore).not.toBeNull()
    expect(secondMore?.open).toBe(true)
    expect(secondMore?.textContent).toContain('raio (m)')
  })

  it('keeps advanced rectangle fields editable inside ver mais', () => {
    const host = renderApp()
    const addRectangle = [...host.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'retângulo')
    expect(addRectangle).toBeDefined()

    act(() => addRectangle?.click())

    const bodyPanel = [...host.querySelectorAll('fieldset')].find((fieldset) => fieldset.querySelector('legend')?.textContent?.trim() === 'retangulo')
    const more = bodyPanel?.querySelector(':scope > details') as HTMLDetailsElement | null
    expect(more).not.toBeNull()
    act(() => more?.querySelector('summary')?.dispatchEvent(new MouseEvent('click', { bubbles: true })))

    const x = inputForLabel(more as Element, 'x (m)')
    act(() => setNativeInputValue(x, 4))
    expect(x.value).toBe('4')

    const y = inputForLabel(more as Element, 'y (m)')
    act(() => setNativeInputValue(y, 5))
    expect(y.value).toBe('5')

    const rotation = inputForLabel(more as Element, 'rotação (°)')
    act(() => setNativeInputValue(rotation, 45))
    expect(rotation.value).toBe('45')

    const width = inputForLabel(more as Element, 'largura (m)')
    act(() => setNativeInputValue(width, -1))
    expect(width.value).toBe('0.05')

    const height = inputForLabel(more as Element, 'altura (m)')
    act(() => setNativeInputValue(height, -1))
    expect(height.value).toBe('0.05')
  })

  it('keeps triangle base and alpha inputs within their editing clamps', () => {
    const host = renderApp()
    const addTriangle = [...host.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'cunha')
    expect(addTriangle).toBeDefined()

    act(() => addTriangle?.click())

    const bodyPanel = [...host.querySelectorAll('fieldset')].find((fieldset) => fieldset.querySelector('legend')?.textContent?.trim() === 'cunha')
    expect(bodyPanel).toBeDefined()
    const more = bodyPanel?.querySelector(':scope > details') as HTMLDetailsElement | null
    expect(more).not.toBeNull()

    act(() => more?.querySelector('summary')?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(more?.open).toBe(true)

    const base = inputForLabel(more as Element, 'base (m)')
    const alpha = inputForLabel(more as Element, 'α (°)')
    act(() => {
      setNativeInputValue(base, -1)
      setNativeInputValue(alpha, 120)
    })

    expect(base.value).toBe('0.05')
    expect(alpha.value).toBe('89.5')
  })
})

describe('drag-to-trash', () => {
  it('dropping the dragged body on the trash target removes it', () => {
    const host = renderApp()
    const addRectangle = [...host.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'retângulo')
    act(() => addRectangle?.click())
    expect([...host.querySelectorAll('fieldset')].some((f) => f.querySelector('legend')?.textContent?.trim() === 'retangulo')).toBe(true)

    const canvas = host.querySelector('canvas')
    if (!canvas) throw new Error('missing canvas')
    // Body spawns at the view center (screen 450,300); drag it onto the
    // trash target in the canvas's bottom-right corner (screen ~868,568).
    act(() => canvas.dispatchEvent(pointerEvent('pointerdown', 450, 300)))
    act(() => canvas.dispatchEvent(pointerEvent('pointermove', 868, 568)))
    act(() => canvas.dispatchEvent(pointerEvent('pointerup', 868, 568)))

    expect([...host.querySelectorAll('fieldset')].some((f) => f.querySelector('legend')?.textContent?.trim() === 'retangulo')).toBe(false)
  })

  it('dropping the dragged body anywhere else places it normally', () => {
    const host = renderApp()
    const addRectangle = [...host.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'retângulo')
    act(() => addRectangle?.click())

    const canvas = host.querySelector('canvas')
    if (!canvas) throw new Error('missing canvas')
    act(() => canvas.dispatchEvent(pointerEvent('pointerdown', 450, 300)))
    act(() => canvas.dispatchEvent(pointerEvent('pointermove', 300, 300)))
    act(() => canvas.dispatchEvent(pointerEvent('pointerup', 300, 300)))

    const bodyPanel = [...host.querySelectorAll('fieldset')].find((fieldset) => fieldset.querySelector('legend')?.textContent?.trim() === 'retangulo')
    expect(bodyPanel).toBeDefined()
  })
})

describe('snap declara contato (PHY-13)', () => {
  it('creates exactly one pair on the pointer-up of a move drag that snaps', () => {
    const host = renderApp()
    const canvas = host.querySelector('canvas')
    if (!canvas) throw new Error('missing canvas')

    const before = contactPairs(host)
    dragTo(canvas, { x: 9, y: 3 }, { x: 9, y: 0.8 })
    const after = contactPairs(host)

    expect(after.length).toBe(before.length + 1)
    expect(after).toContain('caixa ↔ chao')
  })

  it('never creates a Contact mid-drag — only a pointer-up within tolerance does', () => {
    const host = renderApp()
    const canvas = host.querySelector('canvas')
    if (!canvas) throw new Error('missing canvas')

    const before = contactPairs(host)
    const start = screen(9, 3)
    const touching = screen(9, 0.8)
    const farAgain = screen(9, 3)
    act(() => canvas.dispatchEvent(pointerEvent('pointerdown', start.x, start.y)))
    act(() => canvas.dispatchEvent(pointerEvent('pointermove', touching.x, touching.y))) // touches chao mid-drag
    act(() => canvas.dispatchEvent(pointerEvent('pointermove', farAgain.x, farAgain.y))) // leaves tolerance again
    act(() => canvas.dispatchEvent(pointerEvent('pointerup', farAgain.x, farAgain.y))) // drops far away

    expect(contactPairs(host)).toEqual(before)
  })

  it('re-snapping the same pair is a silent no-op — contacts stay the same', () => {
    const host = renderApp()
    const canvas = host.querySelector('canvas')
    if (!canvas) throw new Error('missing canvas')

    dragTo(canvas, { x: 9, y: 3 }, { x: 9, y: 0.8 })
    const onceSnapped = contactPairs(host)
    expect(onceSnapped).toContain('caixa ↔ chao')

    // Drag away, then re-snap onto the same neighbor — grabbing the body
    // where each drag actually left it, never where the scene born it.
    const snappedAt = currentPosition(host, 'caixa')
    dragTo(canvas, snappedAt, { x: 9, y: 3 })
    const awayAt = currentPosition(host, 'caixa')
    dragTo(canvas, awayAt, { x: 9, y: 0.8 })
    const reSnapped = contactPairs(host)

    expect(reSnapped).toEqual(onceSnapped)
  })

  it('moving the body away afterward keeps the Contact', () => {
    const host = renderApp()
    const canvas = host.querySelector('canvas')
    if (!canvas) throw new Error('missing canvas')

    dragTo(canvas, { x: 9, y: 3 }, { x: 9, y: 0.8 })
    const snapped = contactPairs(host)
    expect(snapped).toContain('caixa ↔ chao')

    const snappedAt = currentPosition(host, 'caixa')
    dragTo(canvas, snappedAt, { x: 9, y: 3 })
    expect(contactPairs(host)).toEqual(snapped)
  })

  it('dropping the body on the trash after a snap leaves no dangling Contact', () => {
    const host = renderApp()
    const canvas = host.querySelector('canvas')
    if (!canvas) throw new Error('missing canvas')

    dragTo(canvas, { x: 9, y: 3 }, { x: 9, y: 0.8 })
    expect(contactPairs(host)).toContain('caixa ↔ chao')

    const snappedAt = currentPosition(host, 'caixa')
    // Trash target sits in the canvas's bottom-right corner (screen ~868,568).
    act(() => canvas.dispatchEvent(pointerEvent('pointerdown', screen(snappedAt.x, snappedAt.y).x, screen(snappedAt.x, snappedAt.y).y)))
    act(() => canvas.dispatchEvent(pointerEvent('pointermove', 868, 568)))
    act(() => canvas.dispatchEvent(pointerEvent('pointerup', 868, 568)))

    const after = contactPairs(host)
    expect(after.some((pair) => pair.includes('caixa'))).toBe(false)
  })
})

describe('undo/redo, delete, atalhos (PHY-14)', () => {
  it('a full drag (several pointermoves) is exactly one undo step', () => {
    const host = renderApp()
    const canvas = host.querySelector('canvas')
    if (!canvas) throw new Error('missing canvas')

    const before = { x: 11, y: 5 } // bola's DEMO_SCENE position — nothing is selected yet, so no panel to read it from
    dragTo(canvas, before, { x: before.x - 1, y: before.y })
    expect(currentPosition(host, 'bola')).not.toEqual(before)

    pressKey('z', { ctrlKey: true })
    expect(currentPosition(host, 'bola')).toEqual(before)
    // One drag pushed exactly one entry: nothing left to undo.
    expect(findButton(host, '↶')?.disabled).toBe(true)
  })

  it('a panel edit (mass) enters the undo stack on its own, separate from the add-body step', () => {
    const host = renderApp()
    act(() => findButton(host, 'retângulo')?.click())
    const bodyPanel = [...host.querySelectorAll('fieldset')].find((f) => f.querySelector('legend')?.textContent?.trim() === 'retangulo')!
    const mass = inputForLabel(bodyPanel, 'massa (kg)')
    expect(mass.value).toBe('1')

    act(() => setNativeInputValue(mass, 5))
    expect(inputForLabel(bodyPanel, 'massa (kg)').value).toBe('5')

    pressKey('z', { ctrlKey: true })
    expect(inputForLabel(bodyPanel, 'massa (kg)').value).toBe('1')
    // The add-body step is still there to undo.
    expect(findButton(host, '↶')?.disabled).toBe(false)
  })

  it('creating a new scene clears the undo stack', () => {
    const host = renderApp()
    act(() => findButton(host, 'retângulo')?.click())
    expect(findButton(host, '↶')?.disabled).toBe(false)

    act(() => findButton(host, 'nova cena')?.click())
    expect(findButton(host, '↶')?.disabled).toBe(true)
  })

  it(
    'undo during playback pauses transport, then restores the doc',
    async () => {
      const host = renderApp()
      act(() => findButton(host, 'retângulo')?.click())

      await act(async () => {
        findButton(host, '▶ reproduzir')?.click()
      })
      for (let i = 0; i < 200 && !findButton(host, '⏸ pausar'); i++) {
        await act(async () => {
          await new Promise((r) => setTimeout(r, 5))
        })
      }
      expect(findButton(host, '⏸ pausar')).toBeDefined()

      pressKey('z', { ctrlKey: true })

      expect(findButton(host, '▶ reproduzir')).toBeDefined()
      expect([...host.querySelectorAll('fieldset')].some((f) => f.querySelector('legend')?.textContent?.trim() === 'retangulo')).toBe(false)
    },
    10000,
  )

  it('Backspace removes the selected body with its dependents (same removal as the trash) and clears the selection', () => {
    const host = renderApp()
    act(() => findButton(host, 'retângulo')?.click())
    const bodyPanel = [...host.querySelectorAll('fieldset')].find((f) => f.querySelector('legend')?.textContent?.trim() === 'retangulo')!
    act(() => findButton(bodyPanel.parentElement!, 'adicionar força')?.click())
    expect([...host.querySelectorAll('fieldset')].some((f) => f.querySelector('legend')?.textContent?.startsWith('forças de'))).toBe(true)

    pressKey('Backspace')

    expect([...host.querySelectorAll('fieldset')].some((f) => f.querySelector('legend')?.textContent?.trim() === 'retangulo')).toBe(false)
    expect([...host.querySelectorAll('fieldset')].some((f) => f.querySelector('legend')?.textContent?.startsWith('forças de'))).toBe(false)
  })

  it('Delete/Backspace do nothing while focus is in a text field — it edits the field instead', () => {
    const host = renderApp()
    act(() => findButton(host, 'retângulo')?.click())
    const bodyPanel = [...host.querySelectorAll('fieldset')].find((f) => f.querySelector('legend')?.textContent?.trim() === 'retangulo')!
    const mass = inputForLabel(bodyPanel, 'massa (kg)')
    mass.focus()

    pressKey('Backspace')

    expect([...host.querySelectorAll('fieldset')].some((f) => f.querySelector('legend')?.textContent?.trim() === 'retangulo')).toBe(true)
  })

  it('shows a `?` popover listing the shortcuts, closed by Escape', () => {
    const host = renderApp()
    expect(host.textContent).not.toContain('Ctrl+Z')

    act(() => findButton(host, '?')?.click())
    expect(host.textContent).toContain('Ctrl+Z')

    pressKey('Escape')
    expect(host.textContent).not.toContain('Ctrl+Z')
  })

  it('Space with a palette button focused creates the body and leaves the transport alone (the button handles the key natively)', () => {
    const host = renderApp()
    const paletteButton = findButton(host, 'retângulo')!
    paletteButton.focus()

    const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    act(() => paletteButton.dispatchEvent(event))

    expect(event.defaultPrevented).toBe(false)
    expect(findButton(host, '▶ reproduzir')).toBeDefined()
  })

  it('↶ and ↷ are disabled until there is something to undo/redo', () => {
    const host = renderApp()
    expect(findButton(host, '↶')?.disabled).toBe(true)
    expect(findButton(host, '↷')?.disabled).toBe(true)

    act(() => findButton(host, 'retângulo')?.click())
    expect(findButton(host, '↶')?.disabled).toBe(false)
    expect(findButton(host, '↷')?.disabled).toBe(true)

    pressKey('z', { ctrlKey: true })
    expect(findButton(host, '↷')?.disabled).toBe(false)
  })
})
