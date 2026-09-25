// @vitest-environment jsdom

import { createElement } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { makeTransform, worldToScreen } from './render/transform'
import { CANVAS_MIN_WIDTH } from './render/fitCanvas'
import { trashRect } from './editor/trash'
import { createSimulator, type Simulator } from './sim'
import { ptBR } from './i18n/pt-BR'
import { en } from './i18n/en'
import { setLang } from './i18n'
import { AUTOSAVE_DELAY_MS, blankScene, loadScene, saveCurrentSceneId, saveIndex, saveScene, type SceneIndexEntry, type Storage as PersistStorage } from './persistence'
import type { Scene } from './scene/types'
import { presetById } from './presets'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

// The real simulator boots real wasm (rapier2d-compat) — fine for the app,
// but nothing in this file asserts actual physics, only doc/UI state, so a
// no-op fake removes real-boot timing from every test and lets the loading-
// screen tests below control exactly when boot resolves/rejects.
vi.mock('./sim', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./sim')>()),
  createSimulator: vi.fn(),
}))

function makeFakeSimulator(): Simulator {
  return {
    warnings: [],
    step: () => {},
    readStates: () => new Map(),
    readContacts: () => [],
    readConstraints: () => [],
    setForceMagnitude: () => {},
    setGravity: () => {},
    setForceDirection: () => {},
    setForceAnchor: () => {},
    setBodyMass: () => {},
    replaceScene: () => {},
  }
}

const LOADING_JOKES = Array.from({ length: 10 }, (_, i) => ptBR[`loading.msg.${String(i + 1).padStart(2, '0')}` as keyof typeof ptBR])

const originalGetContext = HTMLCanvasElement.prototype.getContext
let root: Root | null = null

const originalSetPointerCapture = HTMLCanvasElement.prototype.setPointerCapture

// jsdom has no ResizeObserver at all. This stub fires its callback synchronously
// from observe() with whatever `containerSize` the test set beforehand, mirroring
// the initial-measurement call a real ResizeObserver makes on observe().
let containerSize = { width: 900, height: 600 }
// Set by the constructor of whichever FakeResizeObserver instance App creates
// last, so a test can fire a SECOND callback by hand — mirroring the follow-up
// measurement a real ResizeObserver sends once a layout change (e.g. stacking
// the columns) actually resizes the box it watches, which this stub otherwise
// never does on its own (it only fires once, synchronously, from observe()).
let lastResizeObserverCallback: ResizeObserverCallback | null = null
class FakeResizeObserver {
  #cb: ResizeObserverCallback
  constructor(cb: ResizeObserverCallback) {
    this.#cb = cb
    lastResizeObserverCallback = cb
  }
  observe(target: Element) {
    this.#cb([{ target, contentRect: containerSize } as ResizeObserverEntry], this as unknown as ResizeObserver)
  }
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  document.body.innerHTML = ''
  window.localStorage.clear()
  containerSize = { width: 900, height: 600 }
  lastResizeObserverCallback = null
  vi.mocked(createSimulator).mockReset()
  vi.mocked(createSimulator).mockImplementation(async () => makeFakeSimulator())
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: FakeResizeObserver,
  })
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
  vi.useRealTimers()
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

/** App imports the simulator dynamically (PHY-32): wait for that import so `createSimulator` has been called. */
async function settleSimImport(): Promise<void> {
  await act(async () => {
    await vi.dynamicImportSettled()
  })
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

// The scene picker's own <select> — the app renders more than one <select>
// (velocity mode, force endpoints), so this finds it by its fieldset legend.
function sceneSelect(host: HTMLElement): HTMLSelectElement {
  const fieldset = [...host.querySelectorAll('fieldset')].find((f) => f.querySelector('legend')?.textContent?.trim() === ptBR['scenes.title'])
  const select = fieldset?.querySelector('select')
  if (!select) throw new Error('missing scene select')
  return select
}

function setSelectValue(select: HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
  if (!setter) throw new Error('HTMLSelectElement.value setter is unavailable')
  setter.call(select, value)
  select.dispatchEvent(new Event('change', { bubbles: true }))
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

function click(canvas: Element, at: { x: number; y: number }): void {
  const p = screen(at.x, at.y)
  act(() => canvas.dispatchEvent(pointerEvent('pointerdown', p.x, p.y)))
  act(() => canvas.dispatchEvent(pointerEvent('pointerup', p.x, p.y)))
}

function panel(host: HTMLElement, legend: string): HTMLFieldSetElement | undefined {
  return [...host.querySelectorAll('fieldset')].find((f) => f.querySelector('legend')?.textContent?.trim() === legend)
}

function field(host: HTMLElement, legend: string, label: string): number {
  const p = panel(host, legend)
  if (!p) throw new Error(`missing panel ${legend}`)
  return Number(inputForLabel(p, label).value)
}

/** Seeds storage with a scene, then renders the app on it. */
function setupWith(seed: () => void): { host: HTMLElement; canvas: HTMLCanvasElement } {
  seed()
  const host = renderApp()
  const canvas = host.querySelector('canvas')
  if (!canvas) throw new Error('missing canvas')
  return { host, canvas }
}

// The loading overlay is the canvas's only sibling in its box — whatever it
// renders (joke badge or error panel) sits right next to <canvas> in the DOM.
function loadingOverlay(host: HTMLElement): HTMLElement | undefined {
  const canvas = host.querySelector('canvas')
  const box = canvas?.parentElement
  return [...(box?.children ?? [])].find((el) => el !== canvas) as HTMLElement | undefined
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

describe('canvas fits its container (PHY-15)', () => {
  it('the same relative click selects the body at that world position, at two container sizes', () => {
    for (const { width, height } of [
      { width: 900, height: 600 },
      { width: 1200, height: 800 },
    ] as const) {
      document.body.innerHTML = ''
      window.localStorage.clear()
      containerSize = { width, height }

      const host = renderApp()
      act(() => findButton(host, 'nova cena')?.click()) // demo scene's own bodies would confuse the hit-test below
      act(() => findButton(host, 'retângulo')?.click())
      const canvas = host.querySelector('canvas')
      if (!canvas) throw new Error('missing canvas')

      // Place the body at a known WORLD position through the properties panel's
      // own x/y (m) fields — world-space, so this doesn't depend on any pixel
      // transform being correct.
      const bodyPanel = [...host.querySelectorAll('fieldset')].find((f) => f.querySelector('legend')?.textContent?.trim() === 'retangulo')!
      const more = bodyPanel.querySelector(':scope > details') as HTMLDetailsElement
      if (!more.open) act(() => more.querySelector('summary')?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
      act(() => setNativeInputValue(inputForLabel(more, 'x (m)'), 10))
      act(() => setNativeInputValue(inputForLabel(more, 'y (m)'), 1))

      // Deselect, away from where the body now sits.
      act(() => canvas.dispatchEvent(pointerEvent('pointerdown', 2, 2)))
      expect([...host.querySelectorAll('fieldset')].some((f) => f.querySelector('legend')?.textContent?.trim() === 'retangulo')).toBe(false)

      // Reselect with a click at the screen point that world (10, 1) maps to
      // AT THIS container size — only lands on the body if the camera's
      // pixels-per-meter actually tracks the current width.
      const t = makeTransform({ centerX: 6, centerY: 4, pixelsPerMeter: width / 15 }, width, height)
      const target = worldToScreen(t, 10, 1)
      act(() => canvas.dispatchEvent(pointerEvent('pointerdown', target.x, target.y)))
      expect([...host.querySelectorAll('fieldset')].some((f) => f.querySelector('legend')?.textContent?.trim() === 'retangulo')).toBe(true)

      act(() => root?.unmount())
      root = null
    }
  })

  it('dropping on the trash target removes the body, at two container sizes', () => {
    for (const { width, height } of [
      { width: 900, height: 600 },
      { width: 1200, height: 800 },
    ] as const) {
      document.body.innerHTML = ''
      window.localStorage.clear()
      containerSize = { width, height }

      const host = renderApp()
      act(() => findButton(host, 'nova cena')?.click()) // demo scene's own bodies would confuse the hit-test below
      act(() => findButton(host, 'retângulo')?.click())
      const canvas = host.querySelector('canvas')
      if (!canvas) throw new Error('missing canvas')

      // addShape spawns at the exact CSS-pixel center of the canvas, whatever
      // that size actually is — reading it back from the DOM keeps the pickup
      // point correct even before the canvas itself tracks the container.
      const spawn = { x: parseFloat(canvas.style.width) / 2, y: parseFloat(canvas.style.height) / 2 }
      // The trash target this test expects at this container size — only the
      // real drop zone once the App derives it from the current size instead
      // of a stale constant.
      const rect = trashRect(width, height)
      const trashCenter = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }

      act(() => canvas.dispatchEvent(pointerEvent('pointerdown', spawn.x, spawn.y)))
      act(() => canvas.dispatchEvent(pointerEvent('pointermove', trashCenter.x, trashCenter.y)))
      act(() => canvas.dispatchEvent(pointerEvent('pointerup', trashCenter.x, trashCenter.y)))

      expect([...host.querySelectorAll('fieldset')].some((f) => f.querySelector('legend')?.textContent?.trim() === 'retangulo')).toBe(false)

      act(() => root?.unmount())
      root = null
    }
  })
})

describe('canvas coluna nunca vaza para o inspetor (PHY-20)', () => {
  it('empilha as colunas quando a coluna do canvas mediria menos que o piso, e desempilha quando volta a caber', () => {
    // Squeeze: side-by-side with the fixed-width inspector, this column would
    // measure below CANVAS_MIN_WIDTH — exactly the case that used to let the
    // canvas float past its own column onto the inspector's.
    containerSize = { width: 550, height: 500 }
    const host = renderApp()
    const canvas = host.querySelector('canvas')
    if (!canvas) throw new Error('missing canvas')
    const row = canvas.parentElement?.parentElement?.parentElement as HTMLElement
    const inspector = row.children[1] as HTMLElement

    expect(row.style.flexDirection).toBe('column')
    expect(inspector.style.width).toBe('100%')

    // Mirrors the follow-up measurement a real ResizeObserver sends once
    // stacking actually resizes the box: freed from sharing the row with the
    // inspector, it now measures wider than the floor, but still not enough
    // to fit both columns side by side — stays stacked.
    act(() => lastResizeObserverCallback?.([{ contentRect: { width: 820, height: 500 } } as ResizeObserverEntry], null as unknown as ResizeObserver))
    expect(row.style.flexDirection).toBe('column')
    expect(parseFloat(canvas.style.width)).toBeGreaterThan(CANVAS_MIN_WIDTH)
    expect(parseFloat(canvas.style.width)).toBeLessThanOrEqual(820)

    // Wide enough that both columns fit side by side without the canvas
    // column dropping below the floor — un-stacks.
    act(() => lastResizeObserverCallback?.([{ contentRect: { width: 1400, height: 500 } } as ResizeObserverEntry], null as unknown as ResizeObserver))
    expect(row.style.flexDirection).toBe('row')
    expect(inspector.style.width).toBe('270px')
    expect(parseFloat(canvas.style.width)).toBeLessThanOrEqual(1400)
  })
})

describe('loading screen (PHY-16)', () => {
  it('boots the simulator on mount, before any play interaction', async () => {
    renderApp()
    await settleSimImport()
    expect(createSimulator).toHaveBeenCalledTimes(1)
  })

  it('shows the loading overlay while booting, without blocking canvas pointer events', async () => {
    let resolveBoot!: (sim: Simulator) => void
    vi.mocked(createSimulator).mockImplementationOnce(() => new Promise((resolve) => { resolveBoot = resolve }))

    const host = renderApp()
    expect(LOADING_JOKES.some((joke) => host.textContent?.includes(joke))).toBe(true)

    // jsdom dispatches pointer events straight at the node you target, with no
    // real hit-testing — clicking the canvas itself would "work" whether or
    // not a full-cover overlay sits on top in a real browser. The seam that
    // actually decides whether the student's clicks reach the canvas is the
    // overlay's own pointer-events/coverage, so assert on that directly.
    const overlay = loadingOverlay(host)
    if (!overlay) throw new Error('missing loading overlay')
    expect(overlay.style.pointerEvents).toBe('none')
    // Every edge, not just the `inset` shorthand: a badge that grew back into
    // a full cover written the long way would sail past a shorthand-only
    // check. jsdom keeps the unsupported `inset` raw but normalises the
    // longhands, so both spellings of zero count as covering an edge.
    for (const edge of ['inset', 'top', 'right', 'bottom', 'left'] as const) {
      expect({ edge, value: overlay.style[edge] }).not.toEqual({ edge, value: '0' })
      expect({ edge, value: overlay.style[edge] }).not.toEqual({ edge, value: '0px' })
    }

    await settleSimImport()
    await act(async () => {
      resolveBoot(makeFakeSimulator())
      await Promise.resolve()
    })
  })

  it('rotates the message every 1.5s and clears the timer once the sim is ready', async () => {
    vi.useFakeTimers()
    // A separate low-frequency readout poll runs for the app's whole
    // lifetime — the assertion below must catch specifically the loading
    // rotation's own interval being cleared, not just "some timer, somewhere".
    const clearSpy = vi.spyOn(globalThis, 'clearInterval')
    let resolveBoot!: (sim: Simulator) => void
    vi.mocked(createSimulator).mockImplementationOnce(() => new Promise((resolve) => { resolveBoot = resolve }))

    const host = renderApp()
    const initial = LOADING_JOKES.find((joke) => host.textContent?.includes(joke))
    expect(initial).toBeDefined()

    act(() => { vi.advanceTimersByTime(1500) })
    const afterOneTick = LOADING_JOKES.find((joke) => host.textContent?.includes(joke))
    expect(afterOneTick).toBeDefined()
    expect(afterOneTick).not.toBe(initial)

    expect(clearSpy).not.toHaveBeenCalled()

    await settleSimImport()
    await act(async () => {
      resolveBoot(makeFakeSimulator())
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(clearSpy).toHaveBeenCalled()
    expect(LOADING_JOKES.some((joke) => host.textContent?.includes(joke))).toBe(false)
  })

  it('shows a fixed error with a retry button on boot failure; retry re-attempts the boot', async () => {
    vi.mocked(createSimulator).mockRejectedValueOnce(new Error('boom'))

    const host = renderApp()
    await settleSimImport()

    expect(host.textContent).toContain(ptBR['loading.error'])
    // Exactly one error surface: the overlay's fixed message, never the raw
    // exception text surfacing again in the simError side panel.
    expect(host.textContent).not.toContain('boom')
    const retry = findButton(host, ptBR['loading.retry'])
    expect(retry).toBeDefined()

    vi.mocked(createSimulator).mockResolvedValueOnce(makeFakeSimulator())
    act(() => retry?.click())
    await settleSimImport()

    expect(createSimulator).toHaveBeenCalledTimes(2)
    expect(host.textContent).not.toContain(ptBR['loading.error'])
  })

  it('leaves the error state when a boot triggered by play succeeds', async () => {
    vi.mocked(createSimulator).mockRejectedValueOnce(new Error('boom'))
    const host = renderApp()
    await settleSimImport()
    expect(host.textContent).toContain(ptBR['loading.error'])

    // The student presses play instead of "tentar de novo": that path boots
    // through the same shared ensureSim, so a success there has to clear the
    // error overlay too — otherwise the scene runs behind an opaque panel
    // that never goes away and swallows every canvas pointer event.
    vi.mocked(createSimulator).mockResolvedValueOnce(makeFakeSimulator())
    const play = findButton(host, ptBR['playback.play'])
    if (!play) throw new Error('missing play button')
    act(() => play.click())
    await settleSimImport()

    expect(createSimulator).toHaveBeenCalledTimes(2)
    expect(host.textContent).not.toContain(ptBR['loading.error'])
    expect(loadingOverlay(host)).toBeUndefined()
  })
})

describe('ferramenta Mola, Anchor snap e arraste do ponto de força (PHY-27)', () => {
  // Wall face midpoint (1.5, 2) and block center (5, 0.5): the relaxed x₀
  // between the snapped anchors is √(3.5² + 1.5²). Raw clicks near them are
  // √(3.6² + 1.51²) apart, so x₀ alone tells snapped from unsnapped.
  const SNAPPED_X0 = Math.hypot(3.5, 1.5)
  const WALL_CLICK = { x: 1.45, y: 2.03 }
  const BLOCK_CLICK = { x: 5.05, y: 0.52 }
  const SPRING_MIDDLE = { x: 3.25, y: 1.25 }

  function seedWallAndBlock(): void {
    const storage = window.localStorage as unknown as PersistStorage
    const scene: Scene = {
      version: 1,
      constants: { g: 9.81 },
      bodies: [
        { id: 'chao', shape: 'rectangle', width: 14, height: 1, fixed: true, mass: 0, position: { x: 7, y: -0.5 }, rotation: 0 },
        { id: 'parede', shape: 'rectangle', width: 1, height: 4, fixed: true, mass: 0, position: { x: 1, y: 2 }, rotation: 0 },
        { id: 'bloco', shape: 'rectangle', width: 1, height: 1, fixed: false, mass: 1, position: { x: 5, y: 0.5 }, rotation: 0 },
      ],
      forces: [],
      contacts: [],
    }
    saveIndex(storage, [{ id: 'cena-1', name: 'Cena 1', updatedAt: 1 }])
    saveScene(storage, 'cena-1', scene)
    saveCurrentSceneId(storage, 'cena-1')
  }

  const setup = () => setupWith(seedWallAndBlock)

  function buildSpring(host: HTMLElement, canvas: Element): void {
    act(() => findButton(host, 'mola')?.click())
    click(canvas, WALL_CLICK)
    click(canvas, BLOCK_CLICK)
  }

  it('clique em A, clique em B cria exatamente uma mola relaxada, com as âncoras do snap, e a seleciona', () => {
    const { host, canvas } = setup()
    buildSpring(host, canvas)

    expect(panel(host, 'mola')).toBeDefined()
    expect(field(host, 'mola', 'x₀ (m)')).toBeCloseTo(SNAPPED_X0, 6)
    expect(field(host, 'mola', 'Δx (m)')).toBeCloseTo(0, 6)
    expect(field(host, 'mola', 'k (N/m)')).toBeGreaterThan(0)
    expect(field(host, 'mola', 'c (N·s/m)')).toBe(0)
    expect(panel(host, 'mola-2')).toBeUndefined()
    // Exactly one spring: clicking the line picks the topmost, which is still 'mola'.
    pressKey('Escape')
    click(canvas, SPRING_MIDDLE)
    expect(panel(host, 'mola')).toBeDefined()

    // Exactly one edit: one undo takes the scene back to where it was seeded.
    pressKey('z', { ctrlKey: true })
    expect(panel(host, 'mola')).toBeUndefined()
    expect(findButton(host, '↶')?.disabled).toBe(true)
  })

  it('clique fora de Corpo é ignorado e a ferramenta continua esperando a âncora', () => {
    const { host, canvas } = setup()
    act(() => findButton(host, 'mola')?.click())
    click(canvas, { x: 3, y: 6 })
    click(canvas, WALL_CLICK)
    click(canvas, BLOCK_CLICK)

    expect(field(host, 'mola', 'x₀ (m)')).toBeCloseTo(SNAPPED_X0, 6)
  })

  it('clique em B = A é ignorado: a âncora A fica e o próximo corpo fecha a mola', () => {
    const { host, canvas } = setup()
    act(() => findButton(host, 'mola')?.click())
    click(canvas, WALL_CLICK)
    click(canvas, { x: 1, y: 3.2 })
    expect(panel(host, 'mola')).toBeUndefined()
    click(canvas, BLOCK_CLICK)

    expect(field(host, 'mola', 'x₀ (m)')).toBeCloseTo(SNAPPED_X0, 6)
  })

  it('Esc entre os cliques cancela sem mexer no doc', () => {
    const { host, canvas } = setup()
    act(() => findButton(host, 'mola')?.click())
    click(canvas, WALL_CLICK)
    pressKey('Escape')
    click(canvas, BLOCK_CLICK)

    // Back to selection: the second click selected the block, nothing was created.
    expect(panel(host, 'bloco')).toBeDefined()
    expect(panel(host, 'mola')).toBeUndefined()
    expect(findButton(host, '↶')?.disabled).toBe(true)
  })

  it('clicar na mola seleciona; Delete remove só a mola; Ctrl+Z restaura', () => {
    const { host, canvas } = setup()
    buildSpring(host, canvas)
    pressKey('Escape')
    expect(panel(host, 'mola')).toBeUndefined()

    click(canvas, SPRING_MIDDLE)
    expect(panel(host, 'mola')).toBeDefined()

    pressKey('Delete')
    expect(panel(host, 'mola')).toBeUndefined()
    click(canvas, SPRING_MIDDLE)
    expect(panel(host, 'mola')).toBeUndefined()
    click(canvas, { x: 5, y: 0.5 })
    expect(panel(host, 'bloco')).toBeDefined()
    click(canvas, { x: 1, y: 2 })
    expect(panel(host, 'parede')).toBeDefined()

    pressKey('z', { ctrlKey: true })
    click(canvas, SPRING_MIDDLE)
    expect(panel(host, 'mola')).toBeDefined()
    expect(field(host, 'mola', 'x₀ (m)')).toBeCloseTo(SNAPPED_X0, 6)
  })

  it('arrastar um corpo ligado mantém x₀ e muda o Δx mostrado', () => {
    const { host, canvas } = setup()
    buildSpring(host, canvas)

    // Grabbed at its center, where the spring is anchored: the body under
    // the pointer wins over the spring end drawn on top of it.
    dragTo(canvas, { x: 5, y: 0.5 }, { x: 6, y: 0.5 })
    const moved = currentPosition(host, 'bloco')
    expect(moved.x).toBeCloseTo(6, 9)
    expect(moved.y).toBeCloseTo(0.5, 9)
    click(canvas, { x: 3.75, y: 1.25 })

    expect(field(host, 'mola', 'x₀ (m)')).toBeCloseTo(SNAPPED_X0, 6)
    expect(field(host, 'mola', 'Δx (m)')).toBeCloseTo(Math.hypot(4.5, 1.5) - SNAPPED_X0, 6)
  })

  it('inspetor edita k, c, x₀; Δx grava x₀ = x − Δx; valor que o codec rejeita não entra e avisa', () => {
    const { host, canvas } = setup()
    buildSpring(host, canvas)
    const input = (label: string) => inputForLabel(panel(host, 'mola')!, label)

    act(() => setNativeInputValue(input('k (N/m)'), 80))
    act(() => setNativeInputValue(input('c (N·s/m)'), 0.5))
    act(() => setNativeInputValue(input('Δx (m)'), -0.1))
    expect(field(host, 'mola', 'k (N/m)')).toBe(80)
    expect(field(host, 'mola', 'c (N·s/m)')).toBe(0.5)
    expect(field(host, 'mola', 'x₀ (m)')).toBeCloseTo(SNAPPED_X0 + 0.1, 6)
    expect(field(host, 'mola', 'Δx (m)')).toBeCloseTo(-0.1, 6)

    act(() => setNativeInputValue(input('x₀ (m)'), 3))
    expect(field(host, 'mola', 'Δx (m)')).toBeCloseTo(SNAPPED_X0 - 3, 6)
    expect(panel(host, 'mola')?.textContent).not.toContain('k e x₀ devem ser positivos')

    act(() => setNativeInputValue(input('k (N/m)'), -5))
    expect(field(host, 'mola', 'k (N/m)')).toBe(80)
    expect(panel(host, 'mola')?.textContent).toContain('k e x₀ devem ser positivos')

    // Δx ≥ x would make x₀ ≤ 0.
    act(() => setNativeInputValue(input('Δx (m)'), 5))
    expect(field(host, 'mola', 'x₀ (m)')).toBe(3)

    act(() => setNativeInputValue(input('c (N·s/m)'), -1))
    expect(field(host, 'mola', 'c (N·s/m)')).toBe(0.5)
    expect(panel(host, 'mola')?.textContent).toContain('k e x₀ devem ser positivos')

    act(() => setNativeInputValue(input('k (N/m)'), 60))
    expect(panel(host, 'mola')?.textContent).not.toContain('k e x₀ devem ser positivos')
  })

  it('durante o playback, com a mola selecionada, a leitura mostra F_el e Δx do simulador', async () => {
    vi.mocked(createSimulator).mockImplementation(async () => ({
      ...makeFakeSimulator(),
      readConstraints: () => [{ id: 'mola', kind: 'spring' as const, dx: -0.1, force: { a: 2, b: 2 } }],
    }))
    const { host, canvas } = setup()
    await settleSimImport()
    buildSpring(host, canvas)

    await act(async () => {
      findButton(host, '▶ reproduzir')?.click()
    })
    const readout = () => panel(host, 'leitura — mola')?.textContent ?? ''
    for (let i = 0; i < 200 && !readout().includes('F_el'); i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 5))
      })
    }

    expect(readout()).toContain('F_el: 2.00 N')
    expect(readout()).toContain('Δx: -0.100 m')
  }, 10000)

  it('inspetor edita a massa mₛ da mola (PHY-30); negativa não entra e avisa', () => {
    const { host, canvas } = setup()
    buildSpring(host, canvas)
    const input = () => inputForLabel(panel(host, 'mola')!, 'mₛ (kg)')
    expect(field(host, 'mola', 'mₛ (kg)')).toBe(0)

    act(() => setNativeInputValue(input(), 0.2))
    expect(field(host, 'mola', 'mₛ (kg)')).toBe(0.2)
    expect(panel(host, 'mola')?.textContent).not.toContain('k e x₀ devem ser positivos')

    act(() => setNativeInputValue(input(), -1))
    expect(field(host, 'mola', 'mₛ (kg)')).toBe(0.2)
    expect(panel(host, 'mola')?.textContent).toContain('k e x₀ devem ser positivos')

    // The edit was one step: undo takes the mass back to 0.
    pressKey('z', { ctrlKey: true })
    expect(field(host, 'mola', 'mₛ (kg)')).toBe(0)
  })

  it('com mₛ > 0, a leitura mostra F_el,1 e F_el,2, cada ponta com o seu valor (PHY-30, CLEAN-10)', async () => {
    vi.mocked(createSimulator).mockImplementation(async () => ({
      ...makeFakeSimulator(),
      readConstraints: () => [{ id: 'mola', kind: 'spring' as const, dx: 0.1, force: { a: 2, b: 2.5 } }],
    }))
    const { host, canvas } = setup()
    await settleSimImport()
    buildSpring(host, canvas)
    act(() => setNativeInputValue(inputForLabel(panel(host, 'mola')!, 'mₛ (kg)'), 0.2))

    await act(async () => {
      findButton(host, '▶ reproduzir')?.click()
    })
    const readout = () => panel(host, 'leitura — mola')?.textContent ?? ''
    for (let i = 0; i < 200 && !readout().includes('F_el'); i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 5))
      })
    }

    // The same labels as the arrows, in the order of the ends (CLEAN-10).
    expect(readout()).toContain('F_el,1: 2.00 N')
    expect(readout()).toContain('F_el,2: 2.50 N')
    expect(readout().indexOf('F_el,1')).toBeLessThan(readout().indexOf('F_el,2'))
    expect(readout()).not.toContain('F_el em')
    expect(readout()).not.toContain('F_el: ')
    expect(readout()).toContain('Δx: 0.100 m')
  }, 10000)

  it('arrastar o ponto de aplicação de uma força move a âncora com Anchor snap, em um passo de undo', () => {
    const { host, canvas } = setup()
    click(canvas, { x: 5.2, y: 0.7 })
    act(() => findButton(host, 'adicionar força')?.click())
    expect(field(host, 'forças de bloco', 'âncora x (m, local)')).toBe(0)

    // From the force's point (the block center) to near the right-face midpoint.
    dragTo(canvas, { x: 5, y: 0.5 }, { x: 5.46, y: 0.53 })

    expect(field(host, 'forças de bloco', 'âncora x (m, local)')).toBe(0.5)
    expect(field(host, 'forças de bloco', 'âncora y (m, local)')).toBe(0)
    expect(currentPosition(host, 'bloco')).toEqual({ x: 5, y: 0.5 })

    pressKey('z', { ctrlKey: true })
    expect(field(host, 'forças de bloco', 'âncora x (m, local)')).toBe(0)
    expect(field(host, 'forças de bloco', 'âncora y (m, local)')).toBe(0)
    // The drag was one step: the next undo already takes back adding the force.
    pressKey('z', { ctrlKey: true })
    expect(panel(host, 'forças de bloco')?.textContent).toContain('nenhuma')
    expect(findButton(host, '↶')?.disabled).toBe(true)
  })
})

describe('ferramentas Polia e Corda (PHY-28)', () => {
  // Ceiling 4 × 0.5 at (6, 7): its bottom face midpoint (6, 6.75) takes the
  // pulley at the default radius r = 0.25 m. Blocks 0.4 × 0.4 at x = 5.75 and
  // 6.25 put both legs vertical, tangent to it, so L = 2 · 3.55 + π·r — only
  // with every anchor snapped (raw clicks are a few cm off).
  const TETO_CLICK = { x: 6.02, y: 6.78 }
  const TETO_CORNER_CLICK = { x: 4.03, y: 6.78 }
  const B1_CLICK = { x: 5.76, y: 3.19 }
  const B2_CLICK = { x: 6.24, y: 3.19 }
  const PULLEY_SPOT = { x: 6, y: 6.6 }
  const CORNER_PULLEY_SPOT = { x: 4.05, y: 6.6 }
  const LEFT_LEG = { x: 5.75, y: 5 }

  function seedAtwood(pulleys?: Scene['pulleys']): void {
    const storage = window.localStorage as unknown as PersistStorage
    const block = (id: string, x: number, mass: number) =>
      ({ id, shape: 'rectangle', width: 0.4, height: 0.4, fixed: false, mass, position: { x, y: 3 }, rotation: 0 }) as const
    const scene: Scene = {
      version: 1,
      constants: { g: 9.81 },
      bodies: [
        { id: 'teto', shape: 'rectangle', width: 4, height: 0.5, fixed: true, mass: 0, position: { x: 6, y: 7 }, rotation: 0 },
        block('bloco1', 5.75, 1),
        block('bloco2', 6.25, 2),
      ],
      forces: [],
      contacts: [],
      ...(pulleys && { pulleys }),
    }
    saveIndex(storage, [{ id: 'cena-1', name: 'Cena 1', updatedAt: 1 }])
    saveScene(storage, 'cena-1', scene)
    saveCurrentSceneId(storage, 'cena-1')
  }

  const setup = () => setupWith(() => seedAtwood())

  function tool(host: HTMLElement, name: 'polia' | 'corda' | 'mola'): void {
    act(() => findButton(host, name)?.click())
  }

  function buildAtwood(host: HTMLElement, canvas: Element): void {
    tool(host, 'polia')
    click(canvas, TETO_CLICK)
    tool(host, 'corda')
    click(canvas, B1_CLICK)
    click(canvas, PULLEY_SPOT)
    click(canvas, B2_CLICK)
  }

  const lengthText = (r: number) => `L: ${(2 * 3.55 + Math.PI * r).toFixed(3)} m`

  it('Polia: um clique num corpo monta a polia na âncora do Anchor snap e a seleciona; clique fora de corpo é ignorado', () => {
    const { host, canvas } = setup()
    tool(host, 'polia')
    click(canvas, { x: 3, y: 5 })
    expect(panel(host, 'polia')).toBeUndefined()
    click(canvas, TETO_CLICK)

    expect(panel(host, 'polia')).toBeDefined()
    const r = field(host, 'polia', 'raio (m)')
    expect(r).toBeGreaterThan(0)
    expect(field(host, 'polia', 'massa (kg)')).toBe(0)
    expect(panel(host, 'polia-2')).toBeUndefined()

    // The snapped center (6, 6.75) makes both legs vertical: L = 2 · 3.55 + π·r.
    tool(host, 'corda')
    click(canvas, B1_CLICK)
    click(canvas, PULLEY_SPOT)
    click(canvas, B2_CLICK)
    expect(panel(host, 'corda')?.textContent).toContain(lengthText(r))

    // Pulley and rope are one undo step each.
    pressKey('z', { ctrlKey: true })
    pressKey('z', { ctrlKey: true })
    expect(findButton(host, '↶')?.disabled).toBe(true)
  })

  it('mola nova seleciona a mola mesmo com uma polia de mesmo id na cena (ids são por lista)', () => {
    // Hand-edited JSON: a pulley named 'mola'. freshId only looks at constraints,
    // so the new spring is born 'mola' too — both panels would read 'mola'.
    const { host, canvas } = setupWith(() =>
      seedAtwood([{ id: 'mola', bodyId: 'teto', anchor: { x: 0, y: -0.25 }, radius: 0.25 }]),
    )
    tool(host, 'mola')
    click(canvas, B1_CLICK)
    click(canvas, B2_CLICK)

    expect(panel(host, 'mola')?.textContent).toContain('k (N/m)')
    expect(panel(host, 'mola')?.textContent).not.toContain('raio (m)')
  })

  it('Corda: A → polias → B cria uma corda com via na ordem clicada e a seleciona', () => {
    const { host, canvas } = setup()
    tool(host, 'polia')
    click(canvas, TETO_CLICK)
    tool(host, 'polia')
    click(canvas, TETO_CORNER_CLICK)
    tool(host, 'corda')
    click(canvas, B1_CLICK)
    click(canvas, CORNER_PULLEY_SPOT)
    click(canvas, PULLEY_SPOT)
    click(canvas, B2_CLICK)

    expect(panel(host, 'corda')?.textContent).toContain('bloco1 → polia-2 → polia → bloco2')
    expect(panel(host, 'corda-2')).toBeUndefined()
  })

  it('clicar na mesma polia duas vezes seguidas é ignorado', () => {
    const { host, canvas } = setup()
    tool(host, 'polia')
    click(canvas, TETO_CLICK)
    tool(host, 'corda')
    click(canvas, B1_CLICK)
    click(canvas, PULLEY_SPOT)
    click(canvas, PULLEY_SPOT)
    click(canvas, B2_CLICK)

    expect(panel(host, 'corda')?.textContent).toContain('bloco1 → polia → bloco2')
  })

  it('Esc no meio da corda cancela sem mexer no doc', () => {
    const { host, canvas } = setup()
    tool(host, 'polia')
    click(canvas, TETO_CLICK)
    tool(host, 'corda')
    click(canvas, B1_CLICK)
    click(canvas, PULLEY_SPOT)
    pressKey('Escape')
    click(canvas, B2_CLICK)

    // Back to selection: the click selected the block, no rope exists.
    expect(panel(host, 'bloco2')).toBeDefined()
    expect(panel(host, 'corda')).toBeUndefined()
    click(canvas, LEFT_LEG)
    expect(panel(host, 'corda')).toBeUndefined()
    // The only edit left to undo is the pulley.
    pressKey('z', { ctrlKey: true })
    expect(findButton(host, '↶')?.disabled).toBe(true)
  })

  it('sem polia, clicar em B = A não cria nada e a ferramenta continua esperando B', () => {
    const { host, canvas } = setup()
    tool(host, 'corda')
    click(canvas, B1_CLICK)
    click(canvas, { x: 5.75, y: 2.9 })
    expect(panel(host, 'corda')).toBeUndefined()
    expect(findButton(host, '↶')?.disabled).toBe(true)
    click(canvas, B2_CLICK)

    expect(panel(host, 'corda')?.textContent).toContain('bloco1 → bloco2')
  })

  it('inspetor da polia edita raio e massa; inspetor da corda mostra o caminho e L sem campo editável', () => {
    const { host, canvas } = setup()
    buildAtwood(host, canvas)
    click(canvas, PULLEY_SPOT)
    const r = field(host, 'polia', 'raio (m)')
    click(canvas, LEFT_LEG)
    const rope = panel(host, 'corda')!
    expect(rope.textContent).toContain('bloco1 → polia → bloco2')
    expect(rope.textContent).toContain(lengthText(r))
    expect(rope.querySelectorAll('input')).toHaveLength(0)

    click(canvas, PULLEY_SPOT)
    act(() => setNativeInputValue(inputForLabel(panel(host, 'polia')!, 'raio (m)'), 0.3))
    act(() => setNativeInputValue(inputForLabel(panel(host, 'polia')!, 'massa (kg)'), 2))
    expect(field(host, 'polia', 'raio (m)')).toBe(0.3)
    expect(field(host, 'polia', 'massa (kg)')).toBe(2)

    // L is derived, never stored: the new radius moves the tangent points.
    click(canvas, LEFT_LEG)
    expect(panel(host, 'corda')?.textContent).not.toContain(lengthText(r))
  })

  it('remover polia remove as cordas que passam por ela; Ctrl+Z restaura tudo de uma vez', () => {
    const { host, canvas } = setup()
    buildAtwood(host, canvas)
    click(canvas, PULLEY_SPOT)
    expect(panel(host, 'polia')).toBeDefined()

    pressKey('Delete')
    expect(panel(host, 'polia')).toBeUndefined()
    click(canvas, PULLEY_SPOT)
    expect(panel(host, 'polia')).toBeUndefined()
    click(canvas, LEFT_LEG)
    expect(panel(host, 'corda')).toBeUndefined()
    click(canvas, { x: 7.5, y: 7.1 })
    expect(panel(host, 'teto')).toBeDefined()
    // A rope left over the removed pulley would be invisible, but it would
    // still hold the id: a new rope takes 'corda' only if the old one is gone.
    tool(host, 'corda')
    click(canvas, B1_CLICK)
    click(canvas, B2_CLICK)
    expect(panel(host, 'corda')).toBeDefined()
    pressKey('z', { ctrlKey: true })

    pressKey('Escape')
    pressKey('z', { ctrlKey: true })
    click(canvas, PULLEY_SPOT)
    expect(panel(host, 'polia')).toBeDefined()
    click(canvas, LEFT_LEG)
    expect(panel(host, 'corda')).toBeDefined()
  })

  it('remover corpo remove as polias montadas nele, as molas presas e as cordas pelas polias; Ctrl+Z restaura tudo de uma vez', () => {
    const { host, canvas } = setup()
    buildAtwood(host, canvas)
    // A spring from bloco2 to the ceiling's bottom-right corner (8, 6.75).
    tool(host, 'mola')
    click(canvas, B2_CLICK)
    click(canvas, { x: 7.97, y: 6.78 })
    const springMiddle = { x: (6.25 + 8) / 2, y: (3.2 + 6.75) / 2 }
    pressKey('Escape')
    click(canvas, springMiddle)
    expect(panel(host, 'mola')).toBeDefined()

    click(canvas, { x: 7.5, y: 7.1 })
    expect(panel(host, 'teto')).toBeDefined()
    pressKey('Delete')
    for (const [spot, legend] of [[PULLEY_SPOT, 'polia'], [LEFT_LEG, 'corda'], [springMiddle, 'mola']] as const) {
      click(canvas, spot)
      expect(panel(host, legend)).toBeUndefined()
    }
    // Dependents left dangling would be invisible but keep their ids: new
    // ones take the bare ids only if the old ones are gone. Undone after.
    tool(host, 'polia')
    click(canvas, { x: 5.76, y: 2.81 })
    expect(panel(host, 'polia')).toBeDefined()
    tool(host, 'corda')
    click(canvas, B1_CLICK)
    click(canvas, B2_CLICK)
    expect(panel(host, 'corda')).toBeDefined()
    tool(host, 'mola')
    click(canvas, B1_CLICK)
    click(canvas, B2_CLICK)
    expect(panel(host, 'mola')).toBeDefined()
    for (let i = 0; i < 3; i++) pressKey('z', { ctrlKey: true })

    pressKey('z', { ctrlKey: true })
    for (const [spot, legend] of [[PULLEY_SPOT, 'polia'], [LEFT_LEG, 'corda'], [springMiddle, 'mola'], [{ x: 7.5, y: 7.1 }, 'teto']] as const) {
      click(canvas, spot)
      expect(panel(host, legend)).toBeDefined()
    }
  })

  it('clicar na corda seleciona; Delete remove só a corda', () => {
    const { host, canvas } = setup()
    buildAtwood(host, canvas)
    pressKey('Escape')
    expect(panel(host, 'corda')).toBeUndefined()
    click(canvas, LEFT_LEG)
    expect(panel(host, 'corda')).toBeDefined()

    pressKey('Delete')
    expect(panel(host, 'corda')).toBeUndefined()
    click(canvas, LEFT_LEG)
    expect(panel(host, 'corda')).toBeUndefined()
    click(canvas, PULLEY_SPOT)
    expect(panel(host, 'polia')).toBeDefined()
  })

  async function playAndRead(host: HTMLElement, until: string): Promise<string> {
    await act(async () => {
      findButton(host, '▶ reproduzir')?.click()
    })
    const readout = () => panel(host, 'leitura — corda')?.textContent ?? ''
    for (let i = 0; i < 200 && !readout().includes(until); i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 5))
      })
    }
    return readout()
  }

  it('durante o playback, com a corda selecionada, a leitura mostra T, e "frouxa" quando a corda afrouxa', async () => {
    let state = { id: 'corda', kind: 'rope' as const, tension: 13.08, slack: false, segments: [13.08, 13.08] }
    vi.mocked(createSimulator).mockImplementation(async () => ({ ...makeFakeSimulator(), readConstraints: () => [state] }))
    const { host, canvas } = setup()
    await settleSimImport()
    buildAtwood(host, canvas)

    const taut = await playAndRead(host, 'T:')
    expect(taut).toContain('T: 13.08 N')
    expect(taut).not.toContain('T₁')
    expect(taut).not.toContain('frouxa')

    state = { ...state, tension: 0, slack: true, segments: [0, 0] }
    const slack = await playAndRead(host, 'frouxa')
    expect(slack).toContain('T: 0.00 N')
    expect(slack).toContain('frouxa')
  }, 10000)

  it('com polia de massa no caminho, a leitura mostra T₁, T₂ por segmento', async () => {
    vi.mocked(createSimulator).mockImplementation(async () => ({
      ...makeFakeSimulator(),
      readConstraints: () => [{ id: 'corda', kind: 'rope' as const, tension: 13, slack: false, segments: [12, 13] }],
    }))
    const { host, canvas } = setup()
    await settleSimImport()
    buildAtwood(host, canvas)
    click(canvas, PULLEY_SPOT)
    act(() => setNativeInputValue(inputForLabel(panel(host, 'polia')!, 'massa (kg)'), 2))
    click(canvas, LEFT_LEG)

    const readout = await playAndRead(host, 'T₂')
    expect(readout).toContain('T₁: 12.00 N')
    expect(readout).toContain('T₂: 13.00 N')
    expect(readout).not.toContain('T: ')
  }, 10000)
})

describe('recarregar reabre a cena em que o estudante estava (PHY-19)', () => {
  // Each scene gets its own extra body (`marca-<id>`) so a test can tell
  // which scene's *content* loaded into the canvas, not just which id the
  // <select> reports — the two are set by different code paths.
  function markedScene(id: string): Scene {
    const scene = blankScene()
    return {
      ...scene,
      bodies: [...scene.bodies, { shape: 'circle', radius: 0.5, id: `marca-${id}`, fixed: true, mass: 0, position: { x: 1, y: 1 }, rotation: 0 }],
    }
  }

  function seedThreeScenes(): SceneIndexEntry[] {
    const storage = window.localStorage as unknown as PersistStorage
    const entries: SceneIndexEntry[] = [
      { id: 'cena-1', name: 'Cena 1', updatedAt: 1 },
      { id: 'cena-2', name: 'Cena 2', updatedAt: 2 },
      { id: 'cena-3', name: 'Cena 3', updatedAt: 3 },
    ]
    saveIndex(storage, entries)
    for (const e of entries) saveScene(storage, e.id, markedScene(e.id))
    return entries
  }

  it('com a terceira cena marcada como atual no storage, a inicialização abre a terceira', () => {
    seedThreeScenes()
    saveCurrentSceneId(window.localStorage as unknown as PersistStorage, 'cena-3')

    const host = renderApp()
    expect(sceneSelect(host).value).toBe('cena-3')
    // Pins the *content* half of criterion 2 — the canvas doc, not only the
    // <select>, must be the persisted scene's.
    expect(host.textContent).toContain('marca-cena-3')
    expect(host.textContent).not.toContain('marca-cena-1')
  })

  it('sem marca de cena atual, a inicialização abre a primeira do índice (comportamento atual)', () => {
    seedThreeScenes()

    const host = renderApp()
    expect(sceneSelect(host).value).toBe('cena-1')
  })

  it('trocar de cena persiste a nova cena como atual — reload abre a escolhida, não a primeira', () => {
    seedThreeScenes()

    const host = renderApp()
    expect(sceneSelect(host).value).toBe('cena-1')
    act(() => setSelectValue(sceneSelect(host), 'cena-2'))
    expect(sceneSelect(host).value).toBe('cena-2')

    act(() => root?.unmount())
    root = null

    const reopened = renderApp()
    expect(sceneSelect(reopened).value).toBe('cena-2')
    expect(reopened.textContent).toContain('marca-cena-2')
    expect(reopened.textContent).not.toContain('marca-cena-1')
  })

  it('excluir a cena atual e reinicializar abre a primeira do índice restante, sem tela quebrada', () => {
    const storage = window.localStorage as unknown as PersistStorage
    const entries: SceneIndexEntry[] = [
      { id: 'cena-1', name: 'Cena 1', updatedAt: 1 },
      { id: 'cena-2', name: 'Cena 2', updatedAt: 2 },
    ]
    saveIndex(storage, entries)
    for (const e of entries) saveScene(storage, e.id, blankScene())
    saveCurrentSceneId(storage, 'cena-2')

    const host = renderApp()
    expect(sceneSelect(host).value).toBe('cena-2')
    act(() => findButton(host, ptBR['scenes.delete'])?.click())
    act(() => root?.unmount())
    root = null

    const reopened = renderApp()
    expect(sceneSelect(reopened).value).toBe('cena-1')
  })
})

describe('corpo coberto pela polia montada nele (PHY-37)', () => {
  // Preset "Polia móvel": pulley `movel` r 0.25 on the CM of `carga`
  // (0.3 × 0.3 at (6, 2.5)), so the disk covers the whole load.
  const CARGA_CORNER = { x: 6.14, y: 2.64 }
  const MOVEL_AXLE = { x: 6, y: 2.5 }
  const setup = () =>
    setupWith(() => {
      const storage = window.localStorage as unknown as PersistStorage
      saveIndex(storage, [{ id: 'cena-1', name: 'Cena 1', updatedAt: 1 }])
      saveScene(storage, 'cena-1', presetById('movable-pulley')!.buildScene())
      saveCurrentSceneId(storage, 'cena-1')
    })

  it('um clique num canto da carga seleciona a carga, não a polia', () => {
    const { host, canvas } = setup()
    click(canvas, CARGA_CORNER)
    expect(panel(host, 'carga')).toBeDefined()
    expect(panel(host, 'movel')).toBeUndefined()
  })

  it('o eixo da polia continua selecionando a polia', () => {
    const { host, canvas } = setup()
    click(canvas, MOVEL_AXLE)
    expect(panel(host, 'movel')).toBeDefined()
    expect(panel(host, 'carga')).toBeUndefined()
  })

  it('na ferramenta Corda, o eixo da polia entra na corda em vez de terminá-la na carga', () => {
    const { host, canvas } = setup()
    act(() => findButton(host, 'corda')?.click())
    click(canvas, { x: 5.5, y: 8.3 })
    click(canvas, MOVEL_AXLE)
    click(canvas, { x: 6.75, y: 1.5 })
    expect(panel(host, 'corda-2')).toBeDefined()
  })
})

describe('galeria em árvore (PHY-31)', () => {
  const name = (catalog: Record<string, string>, id: string): string | undefined => catalog[`preset.${id}.name`]

  /** The gallery's groups in render order: the node heading and the preset names under it. */
  function galleryGroups(host: HTMLElement, legend: string): { node: string | null; presets: string[] }[] {
    const gallery = panel(host, legend)
    if (!gallery) throw new Error('missing gallery')
    return [...gallery.querySelectorAll('[role="group"]')].map((g) => ({
      node: g.getAttribute('aria-label'),
      presets: [...g.querySelectorAll('strong')].map((s) => s.textContent?.trim() ?? ''),
    }))
  }

  it('agrupa por nó na ordem do livro, com os presets na ordem declarada, e só nós com preset aparecem', () => {
    const host = renderApp()
    const pt = ptBR as Record<string, string>
    const names = (...ids: string[]) => ids.map((id) => name(pt, id))
    expect(galleryGroups(host, ptBR['gallery.title'])).toStrictEqual([
      { node: 'Mecânica / Dinâmica / Princípios', presets: names('atwood', 'table-hanging', 'movable-pulley', 'wedge-flagship') },
      { node: 'Mecânica / Dinâmica / Atrito entre sólidos', presets: names('incline-block') },
      { node: 'Mecânica / Dinâmica / Resultantes tangencial e centrípeta', presets: names('loop-pendulum') },
      { node: 'Mecânica / Dinâmica / Movimentos em campo gravitacional uniforme', presets: names('free-fall', 'projectile') },
      { node: 'Ondulatória / MHS', presets: names('spring-horizontal', 'spring-vertical', 'simple-pendulum', 'spring-damped') },
    ])
  })

  it('usar um preset cria a cena com o nome no idioma atual e o conteúdo do preset', () => {
    const host = renderApp()
    const english = en as Record<string, string>
    try {
      const langSelect = [...host.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'en'))
      if (!langSelect) throw new Error('missing language select')
      act(() => setSelectValue(langSelect, 'en'))
      // Node headings follow the language too.
      expect(galleryGroups(host, en['gallery.title'])[0]?.node).toBe('Mechanics / Dynamics / Principles')

      const gallery = panel(host, en['gallery.title'])!
      const atwood = [...gallery.querySelectorAll('label')].find((l) => l.querySelector('strong')?.textContent?.trim() === name(english, 'atwood'))
      if (!atwood) throw new Error('missing Atwood preset')
      act(() => atwood.querySelector('input')?.click())
      act(() => findButton(host, en['gallery.useSelected'])?.click())

      const scenes = panel(host, en['scenes.title'])?.querySelector('select')
      expect(scenes?.selectedOptions[0]?.textContent?.trim()).toBe(name(english, 'atwood'))
      // The canvas doc is the preset's: its blocks are listed in the app.
      expect(host.textContent).toContain('bloco-1')
      expect(host.textContent).toContain('bloco-2')
    } finally {
      setLang('pt-BR')
    }
  })
})

describe('autosave pendente grava no pagehide (PHY-35)', () => {
  const storage = () => window.localStorage as unknown as PersistStorage
  function seedCena1() {
    saveIndex(storage(), [{ id: 'cena-1', name: 'Cena 1', updatedAt: 1 }])
    saveScene(storage(), 'cena-1', blankScene())
    saveCurrentSceneId(storage(), 'cena-1')
  }
  const storedIds = () => loadScene(storage(), 'cena-1')?.bodies.map((b) => b.id) ?? []

  it('uma edição feita antes dos 400 ms é gravada quando a página sai', () => {
    vi.useFakeTimers()
    const { host } = setupWith(seedCena1)
    act(() => findButton(host, 'retângulo')?.click())
    expect(storedIds()).not.toContain('retangulo')

    act(() => window.dispatchEvent(new Event('pagehide')))
    expect(storedIds()).toContain('retangulo')
  })

  it('sem edição pendente o pagehide não grava nada', () => {
    vi.useFakeTimers()
    const { host } = setupWith(seedCena1)
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    try {
      // Only the mount's schedule is pending, and its payload is the one already stored.
      act(() => window.dispatchEvent(new Event('pagehide')))
      expect(setItem).not.toHaveBeenCalled()

      act(() => findButton(host, 'retângulo')?.click())
      act(() => vi.advanceTimersByTime(AUTOSAVE_DELAY_MS))
      expect(storedIds()).toContain('retangulo')
      setItem.mockClear()

      act(() => window.dispatchEvent(new Event('pagehide')))
      expect(setItem).not.toHaveBeenCalled()
    } finally {
      setItem.mockRestore()
    }
  })

  it('depois do unmount o pagehide não grava e o listener sai de window', () => {
    vi.useFakeTimers()
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    try {
      const { host } = setupWith(seedCena1)
      act(() => findButton(host, 'retângulo')?.click())
      act(() => root?.unmount())
      root = null
      setItem.mockClear()

      act(() => window.dispatchEvent(new Event('pagehide')))
      expect(setItem).not.toHaveBeenCalled()
      // Behaviour alone can't see a leaked listener (unmount cancels the pending save), so check the pairing too.
      const added = add.mock.calls.filter(([type]) => type === 'pagehide').map(([, fn]) => fn)
      const removed = remove.mock.calls.filter(([type]) => type === 'pagehide').map(([, fn]) => fn)
      expect(added.length).toBeGreaterThan(0)
      expect(removed).toEqual(expect.arrayContaining(added))
    } finally {
      add.mockRestore()
      remove.mockRestore()
      setItem.mockRestore()
    }
  })
})

describe('trocar de cena zera o playback (PHY-36)', () => {
  const storage = () => window.localStorage as unknown as PersistStorage
  // Same id and same pose in both scenes: the case carry-over keeps.
  const ballScene = (): Scene => ({
    ...blankScene(),
    bodies: [...blankScene().bodies, { shape: 'circle', radius: 0.5, id: 'bola', fixed: false, mass: 1, position: { x: 6, y: 3.5 }, rotation: 0 }],
  })
  function seed() {
    saveIndex(storage(), [
      { id: 'cena-1', name: 'Cena 1', updatedAt: 1 },
      { id: 'cena-2', name: 'Cena 2', updatedAt: 2 },
    ])
    saveScene(storage(), 'cena-1', ballScene())
    saveScene(storage(), 'cena-2', ballScene())
    saveCurrentSceneId(storage(), 'cena-1')
  }
  const wait = (ms: number) =>
    act(async () => {
      await new Promise((r) => setTimeout(r, ms))
    })
  const readoutText = (host: HTMLElement) => (panel(host, 'leitura — bola') ?? panel(host, 'leitura'))?.textContent ?? ''

  it.each([
    ['duplicar', (host: HTMLElement) => findButton(host, ptBR['scenes.duplicate'])?.click()],
    ['lista de cenas', (host: HTMLElement) => setSelectValue(sceneSelect(host), 'cena-2')],
  ])('via %s: a cena nova começa em passos 0, na pose e na velocidade do documento', async (_, switchScene) => {
    // Every step lands `bola` far from its document pose, moving.
    vi.mocked(createSimulator).mockImplementation(async () => ({
      ...makeFakeSimulator(),
      readStates: () => new Map([['bola', { position: { x: 9, y: 6 }, rotation: 0, linvel: { x: 5, y: 0 }, angvel: 0 }]]),
    }))
    const { host, canvas } = setupWith(seed)
    await settleSimImport()
    for (let i = 0; i < 100 && loadingOverlay(host); i++) await wait(5)
    expect(loadingOverlay(host)).toBeUndefined()
    act(() => findButton(host, ptBR['playback.step'])?.click())
    await wait(150)
    expect(readoutText(host)).toContain(`${ptBR['readout.steps']}: 1`)

    act(() => switchScene(host))
    await wait(150)

    expect(readoutText(host)).toContain(`${ptBR['readout.steps']}: 0`)
    // Clicking the document pose finds the body, and it reads the document's state.
    click(canvas, { x: 6, y: 3.5 })
    await wait(150)
    expect(readoutText(host)).toContain(`${ptBR['readout.position']}: (6.00, 3.50) m`)
    expect(readoutText(host)).toContain(`${ptBR['readout.velocityMagnitude']}: 0.00 m/s`)
  }, 10000)
})
