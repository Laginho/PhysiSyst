// @vitest-environment jsdom

import { createElement } from 'react'
import { createRequire } from 'node:module'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { makeTransform, worldToScreen } from './render/transform'
import { CANVAS_MIN_WIDTH } from './render/fitCanvas'
import { trashRect } from './editor/trash'
import { createSimulator, type BodyState, type InitialProbe, type Simulator } from './sim'
import { ptBR } from './i18n/pt-BR'
import { en } from './i18n/en'
import { setLang, t } from './i18n'
import { AUTOSAVE_DELAY_MS, CURRENT_SCENE_KEY, INDEX_KEY, GALLERY_ACK_KEY, loadIndex, SCENE_KEY_PREFIX, blankScene, loadScene, saveCurrentSceneId, saveIndex, saveScene, type SceneIndexEntry, type Storage as PersistStorage } from './persistence'
import { DEMO_SCENE } from './scene/demo'
import { scenePath } from './scene'
import type { Scene } from './scene/types'
import { PRESETS, presetById } from './presets'
import { withBrowserSession } from './test/browser'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

// The real simulator boots real wasm (rapier2d-compat) — fine for the app,
// most tests here assert doc/UI state; PHY-39 opts into real physics. A
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
    probeInitial: () => ({ contacts: [], constraints: [] }),
    readPulleys: () => [],
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
  vi.unstubAllGlobals()
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

describe('recording graph panel (PHY-72)', () => {
  it('toggles an accessible panel, defaults to energy and follows selection', async () => {
    const host = renderApp()
    await settleSimImport()
    const toggle = findButton(host, 'gráfico')
    expect(toggle).toBeDefined()
    expect(toggle!.getAttribute('aria-pressed')).toBe('false')
    const id = toggle!.getAttribute('aria-controls')!
    expect(host.querySelector(`#${id}`)).toBeNull()
    act(() => toggle!.click())
    expect(toggle!.getAttribute('aria-pressed')).toBe('true')
    const panel = host.querySelector(`#${id}`)!
    const select = panel.querySelector('select')!
    expect(select.value).toBe('energy')
    expect(panel.querySelector('canvas[role="img"]')!.getAttribute('aria-label')).toContain(t('readout.system'))
    click(host.querySelector('canvas')!, { x: 9, y: 3 })
    expect(panel.querySelector('canvas')!.getAttribute('aria-label')).toContain('caixa')
    act(() => setSelectValue(select, 'velocity'))
    expect(select.value).toBe('velocity')
    click(host.querySelector('canvas')!, { x: 0, y: 8 })
    expect(select.value).toBe('energy')
    act(() => toggle!.click())
    expect(host.querySelector(`#${id}`)).toBeNull()
  })
})

describe('canvas dock and controls scale (PHY-76)', () => {
  afterEach(() => setLang('pt-BR'))
  const scaledControls = (host: HTMLElement): HTMLElement => {
    const block = [...host.querySelectorAll<HTMLElement>('div')].find(el => Boolean(el.style.zoom))
    if (!block) throw new Error('missing scaled controls block')
    return block
  }
  const scaleButton = (host: HTMLElement, direction: 'bigger' | 'smaller'): HTMLButtonElement => {
    const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${t(`controls.${direction}`)}"]`)
    if (!button) throw new Error(`missing controls.${direction} button`)
    return button
  }
  const dock = (host: HTMLElement) => host.querySelector('canvas')!.parentElement!.nextElementSibling as HTMLElement

  it('hydrates the saved scale and scales transport, palette and tool hints without scaling the sizer or graph', () => {
    window.localStorage.setItem('physics-sim:controlsScale', '1.3')
    const host = renderApp()
    const block = scaledControls(host)
    expect(block.style.zoom).toBe('1.3')
    expect(block.contains(findButton(host, t('playback.play'))!)).toBe(true)
    expect(block.contains(findButton(host, t('palette.rectangle'))!)).toBe(true)
    for (const direction of ['bigger', 'smaller'] as const) {
      const button = scaleButton(host, direction)
      expect(block.contains(button)).toBe(false)
      expect(dock(host).contains(button)).toBe(true)
      expect(button.title).toBe(t('controls.sizeTitle', { pct: 130 }))
    }
    act(() => findButton(host, t('graph.toggle'))!.click())
    expect(dock(host).contains(host.querySelector('#recording-graph'))).toBe(true)
    expect(block.contains(host.querySelector('#recording-graph'))).toBe(false)
    act(() => findButton(host, t('palette.spring'))!.click())
    expect(block.textContent).toContain(t('tool.springFirst'))
  })

  it('increments in tenths and persists the choice without changing the document, selection or undo', () => {
    const host = renderApp()
    click(host.querySelector('canvas')!, { x: 9, y: 3 })
    act(() => window.dispatchEvent(new Event('pagehide')))
    const before = window.localStorage.getItem('physics-sim:scene:cena-1')
    expect(findButton(host, '↶')!.disabled).toBe(true)
    act(() => scaleButton(host, 'bigger').click())
    expect(scaledControls(host).style.zoom).toBe('1.1')
    expect(window.localStorage.getItem('physics-sim:controlsScale')).toBe('1.1')
    act(() => window.dispatchEvent(new Event('pagehide')))
    expect(window.localStorage.getItem('physics-sim:scene:cena-1')).toBe(before)
    expect([...host.querySelectorAll('legend')].map(el => el.textContent)).toContain('caixa')
    expect(findButton(host, '↶')!.disabled).toBe(true)
  })

  it.each([
    ['bigger', 6, '1.6', 'smaller'],
    ['smaller', 3, '0.7', 'bigger'],
  ] as const)('stops %s at its bound and leaves the opposite button enabled', (direction, clicks, expected, opposite) => {
    const host = renderApp()
    const button = scaleButton(host, direction)
    for (let i = 0; i < clicks; i++) act(() => button.click())
    expect(scaledControls(host).style.zoom).toBe(expected)
    expect(window.localStorage.getItem('physics-sim:controlsScale')).toBe(expected)
    expect(button.disabled).toBe(true)
    expect(scaleButton(host, opposite).disabled).toBe(false)
    act(() => button.click())
    expect(scaledControls(host).style.zoom).toBe(expected)
  })

  it.each([
    [1200, 800, 'row'],
    [700, 900, 'column'],
  ] as const)('orders transport, palette and graph in a canvas-width dock at %ix%i', (width, height, direction) => {
    containerSize = { width: direction === 'column' ? width - 282 : width, height }
    const host = renderApp()
    if (direction === 'column') act(() => lastResizeObserverCallback?.(
      [{ contentRect: { width, height } } as ResizeObserverEntry], null as unknown as ResizeObserver,
    ))
    act(() => findButton(host, t('graph.toggle'))!.click())
    const canvas = host.querySelector('canvas')!
    expect(canvas.parentElement!.parentElement!.parentElement!.style.flexDirection).toBe(direction)
    expect(dock(host).style.width).toBe(canvas.style.width)
    const transport = findButton(host, t('playback.play'))!
    const palette = findButton(host, t('palette.rectangle'))!
    const graph = host.querySelector('#recording-graph')!
    expect(dock(host).contains(transport)).toBe(true)
    expect(dock(host).contains(palette)).toBe(true)
    expect(transport.compareDocumentPosition(palette) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(palette.compareDocumentPosition(graph) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('keeps the graph at canvas width and 180px high at both scale extremes and preserves its toggle', () => {
    const host = renderApp()
    const toggle = findButton(host, t('graph.toggle'))!
    act(() => toggle.click())
    for (const scale of ['1', '1.6']) {
      if (scale === '1.6') for (let i = 0; i < 6; i++) act(() => scaleButton(host, 'bigger').click())
      expect(scaledControls(host).style.zoom).toBe(scale)
      const graph = host.querySelector<HTMLCanvasElement>('#recording-graph canvas')!
      expect(graph.style.width).toBe(host.querySelector('canvas')!.style.width)
      expect(graph.style.height).toBe('180px')
      expect(scaledControls(host).contains(graph)).toBe(false)
      expect(toggle.getAttribute('aria-pressed')).toBe('true')
      expect(toggle.getAttribute('aria-controls')).toBe('recording-graph')
    }
    act(() => toggle.click())
    expect(host.querySelector('#recording-graph')).toBeNull()
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
  })

  it('updates dock width in the same render as a corner-handle drag', () => {
    containerSize = { width: 1200, height: 800 }
    const host = renderApp()
    const canvas = host.querySelector('canvas')!
    const before = parseFloat(canvas.style.width)
    const handle = host.querySelector<HTMLButtonElement>(`[aria-label="${t('canvas.resize')}"]`)!
    Object.assign(handle, { setPointerCapture: () => {}, releasePointerCapture: () => {} })
    act(() => handle.dispatchEvent(pointerEvent('pointerdown', before, 0)))
    act(() => handle.dispatchEvent(pointerEvent('pointermove', before - 180, 0)))
    expect(canvas.style.width).toBe(`${before - 180}px`)
    expect(dock(host).style.width).toBe(canvas.style.width)
    act(() => handle.dispatchEvent(pointerEvent('pointerup', before - 180, 0)))
  })

  it('translates both sizer labels and the percentage title in pt-BR and en', () => {
    const host = renderApp()
    const language = host.querySelector<HTMLSelectElement>('select:has(option[value="en"])')!
    for (const lang of ['pt-BR', 'en']) {
      act(() => setSelectValue(language, lang))
      for (const direction of ['bigger', 'smaller'] as const) {
        expect(scaleButton(host, direction).getAttribute('aria-label')).not.toBe(`controls.${direction}`)
        expect(scaleButton(host, direction).title).toBe(t('controls.sizeTitle', { pct: 100 }))
        expect(scaleButton(host, direction).title).toContain('100')
      }
    }
  })
})

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
  // Snap no longer has a global contact list. Observe its persisted document
  // through the same public save/load path the user uses when leaving the app.
  act(() => window.dispatchEvent(new Event('pagehide')))
  const scene = loadScene(window.localStorage, sceneSelect(host).value)
  if (!scene) throw new Error('missing persisted scene')
  return scene.contacts.map(c => `${c.a} ↔ ${c.b}`)
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

describe('selected Body contacts (PHY-75)', () => {
  function contactScene(): Scene {
    return {
      version: 1, constants: { g: 0 }, forces: [],
      bodies: [
        { id: 'chao', shape: 'rectangle', width: 14, height: 1, fixed: true, mass: 0, position: { x: 7, y: -0.5 }, rotation: 0 },
        { id: 'bloco', shape: 'rectangle', width: 1, height: 1, fixed: false, mass: 2, position: { x: 4, y: 3 }, rotation: 0 },
        { id: 'bola', shape: 'circle', radius: 0.5, fixed: false, mass: 1, position: { x: 8, y: 3 }, rotation: 0 },
      ],
      contacts: [
        { a: 'chao', b: 'bloco', muS: 0.3, muK: 0.2, e: 0.5 },
        { a: 'bloco', b: 'bola', muS: 0.7, muK: 0.6 },
      ],
    }
  }
  function setup(scene = contactScene()) {
    vi.useFakeTimers()
    return setupWith(() => {
      saveIndex(window.localStorage, [{ id: 'restitution', name: 'Restitution', updatedAt: 1 }])
      saveScene(window.localStorage, 'restitution', scene)
      saveCurrentSceneId(window.localStorage, 'restitution')
    })
  }
  function contactsOf(host: HTMLElement, label: string): HTMLFieldSetElement {
    const fieldset = panel(host, `contatos de ${label}`)
    if (!fieldset) throw new Error(`missing contacts of ${label}`)
    return fieldset
  }
  function rows(fieldset: Element): Element[] {
    return [...fieldset.querySelectorAll('span')].map(span => span.parentElement!.parentElement!)
  }
  function saved(): Scene {
    act(() => window.dispatchEvent(new Event('pagehide')))
    return loadScene(window.localStorage, 'restitution')!
  }

  it.each(['populated', 'empty'] as const)('has no global contact panel or coefficients without selection: %s', (kind) => {
    const scene = kind === 'populated' ? contactScene() : { ...contactScene(), bodies: [], contacts: [] }
    const { host } = setup(scene)
    expect(panel(host, 'contatos')).toBeUndefined()
    expect([...host.querySelectorAll('label')].some(label => label.textContent?.trim() === ptBR['contacts.muS'])).toBe(false)
  })

  it('shows all and only selected-body pairs from either endpoint with partner labels and coefficient fields', () => {
    const { host, canvas } = setup()
    click(canvas, { x: 4, y: 3 })
    const contacts = contactsOf(host, 'm_a')
    expect([...contacts.querySelectorAll('span')].map(span => span.textContent)).toEqual(['fixo: retângulo 1', 'm_b'])
    expect(contacts.previousElementSibling?.querySelector('legend')?.textContent).toBe('forças de bloco')
    expect(rows(contacts)).toHaveLength(2)
    for (const [i, row] of rows(contacts).entries()) {
      const inputs = [...row.querySelectorAll('input[type="number"]')]
      expect(inputs).toHaveLength(3)
      expect(inputs.map(input => input.closest('label')?.textContent?.trim())).toEqual([ptBR['contacts.muS'], ptBR['contacts.muK'], ptBR['contacts.e']])
      expect(inputs.every(input => (input as HTMLInputElement).step === '0.05')).toBe(true)
      expect((inputs[2] as HTMLInputElement).value).toBe(i === 0 ? '0.5' : '0')
      expect(row.querySelector('button')?.textContent).toBe('✕')
    }
    click(canvas, { x: 8, y: 3 })
    expect(panel(host, 'contatos de m_a')).toBeUndefined()
    expect([...contactsOf(host, 'm_b').querySelectorAll('span')].map(span => span.textContent)).toEqual(['m_a'])
  })

  it('edits restitution from endpoint b without clamping or changing pair order or friction, then removes only that pair', () => {
    const scene = contactScene()
    const { host, canvas } = setup(scene)
    click(canvas, { x: 8, y: 3 })
    const contacts = contactsOf(host, 'm_b')
    const restitution = inputForLabel(contacts, ptBR['contacts.e'])
    for (const e of [0.8, -0.1, 1.5]) {
      act(() => setNativeInputValue(restitution, e))
      expect(saved().contacts).toEqual([scene.contacts[0], { ...scene.contacts[1], e }])
      expect(restitution.value).toBe(String(e))
    }
    act(() => contacts.querySelector('button')!.click())
    expect(saved().contacts).toEqual([scene.contacts[0]])
    expect(contacts.textContent).toContain(ptBR['contacts.empty'])
    expect(contacts.querySelector('input')).toBeNull()
  })

  it('edits both friction coefficients independently from endpoint b', () => {
    const scene = contactScene()
    const { host, canvas } = setup(scene)
    click(canvas, { x: 8, y: 3 })
    const contacts = contactsOf(host, 'm_b')
    act(() => setNativeInputValue(inputForLabel(contacts, ptBR['contacts.muS']), -0.2))
    expect(saved().contacts).toEqual([scene.contacts[0], { ...scene.contacts[1], muS: -0.2 }])
    act(() => setNativeInputValue(inputForLabel(contacts, ptBR['contacts.muK']), 1.2))
    expect(saved().contacts).toEqual([scene.contacts[0], { ...scene.contacts[1], muS: -0.2, muK: 1.2 }])
  })

  it('disables an exhausted partner picker and adds only the unpaired partner with default coefficients', () => {
    const scene = contactScene()
    const { host, canvas } = setup(scene)
    click(canvas, { x: 4, y: 3 })
    const block = contactsOf(host, 'm_a')
    expect(block.querySelector('select')!.options).toHaveLength(0)
    expect(block.querySelector('select')!.matches(':disabled')).toBe(true)
    expect(findButton(host, ptBR['contacts.add'])!.matches(':disabled')).toBe(true)
    click(canvas, { x: 8, y: 3 })
    const ball = contactsOf(host, 'm_b')
    const select = ball.querySelector('select')!
    expect([...select.options].map(o => [o.value, o.text])).toEqual([['chao', 'fixo: retângulo 1']])
    expect(select.matches(':disabled')).toBe(false)
    act(() => findButton(host, ptBR['contacts.add'])!.click())
    expect(saved().contacts).toEqual([...scene.contacts, { a: 'bola', b: 'chao', muS: 0, muK: 0, e: 0 }])
    expect([...ball.querySelectorAll('span')].map(span => span.textContent)).toEqual(['m_a', 'fixo: retângulo 1'])
    expect(select.options).toHaveLength(0)
    expect(select.matches(':disabled')).toBe(true)
    expect(findButton(host, ptBR['contacts.add'])!.matches(':disabled')).toBe(true)
  })

  it('keeps partner choice valid after adding, removing, and switching selected bodies', () => {
    const scene = { ...contactScene(), contacts: [] }
    const { host, canvas } = setup(scene)
    click(canvas, { x: 8, y: 3 })
    let contacts = contactsOf(host, 'm_b')
    let select = contacts.querySelector('select')!
    expect([...select.options].map(o => o.text)).toEqual(['fixo: retângulo 1', 'm_a'])
    act(() => setSelectValue(select, 'bloco'))
    act(() => findButton(host, ptBR['contacts.add'])!.click())
    expect(saved().contacts).toEqual([{ a: 'bola', b: 'bloco', muS: 0, muK: 0, e: 0 }])
    expect(select.value).toBe('chao')
    act(() => contacts.querySelector('button')!.click())
    expect(saved().contacts).toEqual([])
    click(canvas, { x: 4, y: 3 })
    contacts = contactsOf(host, 'm_a')
    select = contacts.querySelector('select')!
    expect([...select.options].map(o => o.value)).toEqual(['chao', 'bola'])
    expect(select.value).toBe('chao')
    act(() => findButton(host, ptBR['contacts.add'])!.click())
    expect(saved().contacts).toEqual([{ a: 'bloco', b: 'chao', muS: 0, muK: 0, e: 0 }])
  })

  it('numbers fixed partners by shape in document order and uses the same labels for fixed selection', () => {
    const scene = contactScene()
    scene.bodies.push(
      { id: 'parede', shape: 'rectangle', width: 1, height: 1, fixed: true, mass: 0, position: { x: 2, y: 6 }, rotation: 0 },
      { id: 'apoio', shape: 'circle', radius: 0.4, fixed: true, mass: 0, position: { x: 6, y: 6 }, rotation: 0 },
      { id: 'rampa', shape: 'triangle', base: 1, alpha: 45, fixed: true, mass: 0, position: { x: 9, y: 6 }, rotation: 0 },
    )
    scene.contacts = []
    const { host, canvas } = setup(scene)
    click(canvas, { x: 8, y: 3 })
    expect([...contactsOf(host, 'm_b').querySelector('select')!.options].map(o => o.text)).toEqual([
      'fixo: retângulo 1', 'm_a', 'fixo: retângulo 2', 'fixo: bola 1', 'fixo: cunha 1',
    ])
    click(canvas, { x: 2, y: 6 })
    const fixed = contactsOf(host, 'fixo: retângulo 2')
    expect(fixed.textContent).toContain(ptBR['contacts.empty'])
    expect([...fixed.querySelector('select')!.options].map(o => o.value)).not.toContain('parede')
  })

  it('shows an empty, disabled partner picker for a lone selected body', () => {
    const scene = contactScene()
    scene.bodies = [scene.bodies[2]]
    scene.contacts = []
    const { host, canvas } = setup(scene)
    click(canvas, { x: 8, y: 3 })
    const contacts = contactsOf(host, 'm')
    expect(contacts.textContent).toContain(ptBR['contacts.empty'])
    expect(contacts.querySelector('select')!.options).toHaveLength(0)
    expect(contacts.querySelector('select')!.matches(':disabled')).toBe(true)
    expect(findButton(host, ptBR['contacts.add'])!.matches(':disabled')).toBe(true)
  })

  it('locks the whole body contact fieldset after stepping and unlocks after reset', async () => {
    const { host, canvas } = setup()
    await settleSimImport()
    click(canvas, { x: 8, y: 3 })
    const contacts = contactsOf(host, 'm_b')
    expect(contacts.disabled).toBe(false)
    await act(async () => findButton(host, ptBR['playback.step'])!.click())
    expect(contacts.disabled).toBe(true)
    expect([...contacts.querySelectorAll('input, select, button')].every(el => el.matches(':disabled'))).toBe(true)
    act(() => findButton(host, ptBR['playback.reset'])!.click())
    expect(contacts.disabled).toBe(false)
    expect([...contacts.querySelectorAll('input, select, button')].every(el => !el.matches(':disabled'))).toBe(true)
  })

  it('localizes body and fixed contact labels with matching catalogs and removes contacts.title', () => {
    for (const catalog of [ptBR, en] as Record<string, string>[]) {
      expect(catalog['contacts.of']).toBeTruthy()
      expect(catalog['contacts.fixedLabel']).toBeTruthy()
      expect(catalog).not.toHaveProperty('contacts.title')
    }
    expect(Object.keys(ptBR).sort()).toEqual(Object.keys(en).sort())
    const { host, canvas } = setup()
    click(canvas, { x: 4, y: 3 })
    const language = [...host.querySelectorAll('select')].find(s => s.querySelector('option[value="en"]'))!
    try {
      act(() => setSelectValue(language, 'en'))
      expect(panel(host, 'contacts of m_a')?.textContent).toContain('fixed: rectangle 1')
      click(canvas, { x: 1, y: -0.5 })
      expect(panel(host, 'contacts of fixed: rectangle 1')).toBeDefined()
    } finally {
      act(() => setSelectValue(language, 'pt-BR'))
    }
  })
})

// The loading overlay is the canvas's only sibling in its box — whatever it
// renders (joke badge or error panel) sits right next to <canvas> in the DOM.
function loadingOverlay(host: HTMLElement): HTMLElement | undefined {
  const canvas = host.querySelector('canvas')
  const box = canvas?.parentElement
  return [...(box?.children ?? [])].find((el) => el !== canvas && el.tagName === 'DIV') as HTMLElement | undefined
}

describe('initial velocity overlay (PHY-59)', () => {
  it.each([
    ['global', 'step'],
    ['selected', 'step'],
    ['global', 'play'],
    ['selected', 'play'],
  ] as const)('shows v0 only before stepping and after reset: %s / %s', async (mode, transport) => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    let frame!: FrameRequestCallback
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frame = callback; return 1 })
    vi.stubGlobal('cancelAnimationFrame', () => {})
    const strokes: unknown[] = []
    const labels: Array<{ color: unknown; text: string }> = []
    // Record the current canvas frame at the browser boundary; all overlay
    // producers and drawing functions remain real.
    const ctx = new Proxy({} as Record<PropertyKey, unknown>, {
      get(target, key) {
        if (key === 'clearRect') return () => { strokes.length = 0; labels.length = 0 }
        if (key === 'stroke') return () => { strokes.push(target.strokeStyle) }
        if (key === 'measureText') return () => ({ width: 10 })
        if (key === 'fillText') return (text: string) => { labels.push({ color: target.fillStyle, text }) }
        return target[key] ?? (() => {})
      },
    })
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => ctx })
    const scene = blankScene()
    scene.bodies = [{ id: 'ball', shape: 'circle', radius: 0.5, mass: 1, fixed: false, position: { x: 6, y: 4 }, rotation: 0, vx: 2 }]
    scene.forces = [{ id: 'push', bodyId: 'ball', anchor: { x: 0, y: 0 }, magnitude: 3, direction: 0 }]
    const step = vi.fn()
    vi.mocked(createSimulator).mockResolvedValue({ ...makeFakeSimulator(), step })
    const { host, canvas } = setupWith(() => {
      const storage = window.localStorage as unknown as PersistStorage
      saveIndex(storage, [{ id: 'velocity', name: 'Velocity', updatedAt: 1 }])
      saveScene(storage, 'velocity', scene)
      saveCurrentSceneId(storage, 'velocity')
    })
    await settleSimImport()
    if (mode === 'global') {
      const label = [...host.querySelectorAll('label')].find((el) => el.textContent?.trim() === ptBR['panel.showVectors'])!
      act(() => label.querySelector('input')!.click())
    } else {
      click(canvas, { x: 6, y: 4 })
    }
    const expectOverlay = (visible: boolean) => {
      expect(strokes.includes('#43a047')).toBe(visible)
      expect(labels.filter((label) => label.color === '#43a047').map((label) => label.text)).toEqual(visible ? ['v₀'] : [])
      expect(strokes).toContain('#d97742')
      expect(labels.filter((label) => label.color === '#d97742').map((label) => label.text)).toEqual(['F'])
    }
    expectOverlay(true)
    if (transport === 'step') {
      await act(async () => { findButton(host, ptBR['playback.step'])!.click() })
    } else {
      await act(async () => { findButton(host, ptBR['playback.play'])!.click() })
      expectOverlay(true)
      act(() => frame(16))
      act(() => frame(32))
    }
    expect(step).toHaveBeenCalled()
    expectOverlay(false)
    if (transport === 'play') {
      act(() => findButton(host, ptBR['playback.pause'])!.click())
      expectOverlay(false)
    }
    act(() => findButton(host, ptBR['playback.reset'])!.click())
    expectOverlay(true)
  })
})

describe('initial force vectors (PHY-82)', () => {
  const doc = (): Scene => ({
    version: 1, constants: { g: 9.81 }, contacts: [], forces: [],
    bodies: [
      ...blankScene().bodies,
      { id: 'caixa', shape: 'rectangle', width: 1, height: 1, fixed: false, mass: 1, position: { x: 3, y: 0.5 }, rotation: 0 },
      { id: 'pivo', shape: 'circle', radius: 0.2, fixed: true, mass: 0, position: { x: 8, y: 6 }, rotation: 0 },
      { id: 'bola', shape: 'circle', radius: 0.3, fixed: false, mass: 1, position: { x: 8, y: 3 }, rotation: Math.PI / 2 },
    ],
    constraints: [{ id: 'corda', kind: 'rope', a: { bodyId: 'pivo', anchor: { x: 0, y: 0 } }, b: { bodyId: 'bola', anchor: { x: 0.2, y: 0 } }, via: [] }],
  })
  const probeReading = (): InitialProbe => ({
    contacts: [{ aId: 'chao', bId: 'caixa', point: { x: 3, y: 0 }, normal: { x: 0, y: 1 } }],
    constraints: [{
      id: 'corda', kind: 'rope', tension: 5, slack: false, segments: [5],
      // Poses after the disposable step differ from the document anchors.
      path: { segments: [{ from: { x: 8, y: 6 }, to: { x: 10, y: 4 } }], arcs: [], length: Math.sqrt(8) },
    }],
  })

  async function setupProbe(options: { scene?: Scene; otherScene?: Scene; throws?: boolean; delayedBoot?: boolean } = {}) {
    setLang('pt-BR')
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const labels: string[] = []
    const arrows: Array<{ color: unknown; path: number[][] }> = []
    const points: number[][] = []
    let path: number[][] = []
    const ctx = new Proxy({} as Record<PropertyKey, unknown>, {
      get(target, key) {
        if (key === 'clearRect') return () => { labels.length = 0; arrows.length = 0; points.length = 0 }
        if (key === 'beginPath') return () => { path = [] }
        if (key === 'moveTo' || key === 'lineTo') return (x: number, y: number) => { path.push([x, y]); points.push([x, y]) }
        if (key === 'stroke') return () => {
          if (['#1565c0', '#6a1b9a', '#00838f'].includes(target.strokeStyle as string)) {
            arrows.push({ color: target.strokeStyle, path: [...path] })
          }
        }
        if (key === 'fillText') return (text: string) => { labels.push(text) }
        if (key === 'measureText') return () => ({ width: 10 })
        return target[key] ?? (() => {})
      },
    })
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => ctx })
    const scene = options.scene ?? doc()
    let current = scene
    let count = 0
    const step = vi.fn(() => { count++ })
    const probeInitial = vi.fn((_scene: Scene): InitialProbe => {
      if (options.throws) throw new Error('probe failed')
      return probeReading()
    })
    const sim: Simulator = {
      ...makeFakeSimulator(), step, probeInitial,
      replaceScene: vi.fn((next: Scene) => { current = next; count = 0 }),
      readContacts: () => count === 0 ? [] : [{ aId: 'chao', bId: 'caixa', point: { x: 3 + count / 10, y: 0 }, normal: { x: 0, y: 1 } }],
      readConstraints: () => [
        { id: 'corda', kind: 'rope', tension: count * 9, slack: false, segments: [count * 9] },
        ...(current.constraints?.some(c => c.kind === 'spring')
          ? [{ id: 'mola', kind: 'spring' as const, dx: 0.7, force: { a: 7, b: 7 } }] : []),
      ],
      readStates: () => new Map(current.bodies.map(body => [body.id, {
        position: { x: body.position.x + (body.fixed ? 0 : count / 10), y: body.position.y },
        rotation: body.rotation, linvel: { x: body.fixed ? 0 : count, y: 0 }, angvel: 0,
      }])),
    }
    let resolveBoot!: (sim: Simulator) => void
    if (options.delayedBoot) vi.mocked(createSimulator).mockImplementation(() => new Promise(resolve => { resolveBoot = resolve }))
    else vi.mocked(createSimulator).mockResolvedValue(sim)
    const { host, canvas } = setupWith(() => {
      saveIndex(window.localStorage, [
        { id: 'probe', name: 'Probe', updatedAt: 1 },
        ...(options.otherScene ? [{ id: 'other', name: 'Other', updatedAt: 2 }] : []),
      ])
      saveScene(window.localStorage, 'probe', scene)
      if (options.otherScene) saveScene(window.localStorage, 'other', options.otherScene)
      saveCurrentSceneId(window.localStorage, 'probe')
    })
    // Enable forces while boot is still pending: resolving boot itself must repaint.
    act(() => inputForLabel(host, ptBR['panel.showVectors']).click())
    await settleSimImport()
    const origin = (color: string): number[] | undefined => arrows.find(arrow => arrow.color === color)?.path[0]
    const point = (x: number, y: number): number[] => { const p = screen(x, y); return [p.x, p.y] }
    const steps = async (n: number) => {
      for (let i = 0; i < n; i++) await act(async () => { findButton(host, ptBR['playback.step'])!.click() })
    }
    const seek = (index: number) => act(() => {
      setNativeInputValue(host.querySelector<HTMLInputElement>('input[type="range"][min="0"]')!, index)
    })
    return { host, canvas, labels, arrows, points, sim, step, probeInitial, origin, point, steps, seek,
      resolveBoot: () => act(async () => { resolveBoot(sim) }),
    }
  }

  it('paints N and T at t0 and anchors T to the document rather than the disposable pose', async () => {
    const p = await setupProbe()
    expect(p.labels).toContain('N')
    expect(p.labels).toContain('T')
    expect(p.origin('#1565c0')).toEqual(p.point(3, 0))
    expect(p.origin('#6a1b9a')).toEqual(p.point(8, 3.2))
    expect(p.origin('#6a1b9a')).not.toEqual(p.point(10, 4))
    expect(p.probeInitial).toHaveBeenCalledExactlyOnceWith(doc())
    expect(p.step).not.toHaveBeenCalled()
  })

  it('uses live contacts and constraints after the first step without probing again', async () => {
    const p = await setupProbe()
    expect(p.origin('#1565c0')).toEqual(p.point(3, 0))
    await p.steps(1)
    expect(p.origin('#1565c0')).toEqual(p.point(3.1, 0))
    expect(p.origin('#6a1b9a')).toEqual(p.point(8.1, 3.2))
    const tension = p.arrows.find(arrow => arrow.color === '#6a1b9a')!.path
    expect(Math.hypot(tension[1]![0]! - tension[0]![0]!, tension[1]![1]! - tension[0]![1]!)).toBeCloseTo(60, 6)
    act(() => setNativeInputValue(inputForLabel(p.host, ptBR['panel.gLabel']), 5))
    expect(p.probeInitial).toHaveBeenCalledTimes(1)
    expect(p.step).toHaveBeenCalledTimes(1)
  })

  it('probes once per structural t0 edit and reset, but never for g or pending-world synchronization', async () => {
    const p = await setupProbe()
    expect(p.probeInitial).toHaveBeenCalledTimes(1)
    for (let i = 0; i < 3; i++) {
      dragTo(p.canvas, { x: 8 + i, y: 3 }, { x: 9 + i, y: 3 })
      expect(p.probeInitial).toHaveBeenCalledTimes(i + 2)
      expect(p.probeInitial.mock.lastCall![0].bodies.find(body => body.id === 'bola')!.position.x).toBe(9 + i)
    }
    act(() => setNativeInputValue(inputForLabel(p.host, ptBR['panel.gLabel']), 5))
    expect(p.probeInitial).toHaveBeenCalledTimes(4)
    // Selection and vector visibility repaint a document whose live rebuild is pending.
    click(p.canvas, { x: 1, y: 7 })
    act(() => inputForLabel(p.host, ptBR['panel.showVectors']).click())
    act(() => inputForLabel(p.host, ptBR['panel.showVectors']).click())
    expect(p.probeInitial).toHaveBeenCalledTimes(4)
    act(() => findButton(p.host, ptBR['playback.reset'])!.click())
    expect(p.probeInitial).toHaveBeenCalledTimes(5)
    expect(p.probeInitial.mock.lastCall![0].constants.g).toBe(5)
    expect(p.step).not.toHaveBeenCalled()
    await p.steps(1)
    expect(p.probeInitial).toHaveBeenCalledTimes(5)
  })

  it('uses the cached probe on seek(0) and the recorded contact on seek(5)', async () => {
    const p = await setupProbe()
    await p.steps(10)
    expect(p.origin('#1565c0')).toEqual(p.point(4, 0))
    p.seek(0)
    expect(p.labels).toContain('N')
    expect(p.labels).toContain('T')
    expect(p.origin('#1565c0')).toEqual(p.point(3, 0))
    expect(p.origin('#6a1b9a')).toEqual(p.point(8, 3.2))
    p.seek(5)
    expect(p.origin('#1565c0')).toEqual(p.point(3.5, 0))
    expect(p.probeInitial).toHaveBeenCalledTimes(1)
    expect(p.step).toHaveBeenCalledTimes(10)
  })

  it('keeps painting without N, T or simError when the optional probe throws', async () => {
    const p = await setupProbe({ throws: true })
    expect(p.probeInitial).toHaveBeenCalledTimes(1)
    expect(p.labels).toContain('m')
    expect(p.labels).not.toContain('N')
    expect(p.labels).not.toContain('T')
    expect(loadingOverlay(p.host)).toBeUndefined()
    expect(p.host.textContent).not.toContain('probe failed')
    act(() => findButton(p.host, ptBR['playback.reset'])!.click())
    expect(p.probeInitial).toHaveBeenCalledTimes(2)
    expect(p.host.textContent).not.toContain('probe failed')
    expect(p.step).not.toHaveBeenCalled()
  })

  it('probes the latest document after edits made while boot is pending', async () => {
    const p = await setupProbe({ delayedBoot: true })
    expect(p.probeInitial).not.toHaveBeenCalled()
    dragTo(p.canvas, { x: 8, y: 3 }, { x: 9, y: 3 })
    await p.resolveBoot()
    expect(p.probeInitial).toHaveBeenCalledTimes(1)
    expect(p.probeInitial.mock.lastCall![0].bodies.find(body => body.id === 'bola')!.position.x).toBe(9)
    expect(p.origin('#6a1b9a')).toEqual(p.point(9, 3.2))
    expect(p.step).not.toHaveBeenCalled()
    await p.steps(1)
    expect(p.probeInitial).toHaveBeenCalledTimes(1)
  })

  it('refreshes on scene switching and on editing the initial recorded document', async () => {
    const next = doc()
    next.bodies = next.bodies.map(body => body.id === 'bola' ? { ...body, position: { x: 9, y: 3 } } : body)
    const p = await setupProbe({ otherScene: next })
    // Opening the preset uses the same rebuild transition as opening a saved scene.
    act(() => findButton(p.host, ptBR['scenes.galleryOpen'])!.click())
    const atwood = [...p.host.querySelectorAll('button')].find(button => button.textContent?.includes(ptBR['preset.atwood.name']))!
    act(() => atwood.click())
    expect(p.probeInitial).toHaveBeenCalledTimes(2)
    expect(p.probeInitial.mock.lastCall![0]).toEqual(presetById('atwood')!.buildScene())
    act(() => setSelectValue(sceneSelect(p.host), 'other'))
    expect(p.probeInitial).toHaveBeenCalledTimes(3)
    expect(p.origin('#6a1b9a')).toEqual(p.point(9, 3.2))
    await p.steps(2)
    p.seek(0)
    dragTo(p.canvas, { x: 9, y: 3 }, { x: 10, y: 3 })
    expect(p.probeInitial).toHaveBeenCalledTimes(4)
    expect(p.origin('#6a1b9a')).toEqual(p.point(10, 3.2))
    expect(p.host.querySelector<HTMLInputElement>('input[type="range"][min="0"]')!.max).toBe('0')
    expect(p.step).toHaveBeenCalledTimes(2)
  })

  it('preserves the document rope drawing and live initial spring readings', async () => {
    const scene = doc()
    scene.constraints!.push({ id: 'mola', kind: 'spring', a: { bodyId: 'pivo', anchor: { x: -1, y: 0 } }, b: { bodyId: 'bola', anchor: { x: 0, y: 0 } }, k: 10, x0: 2.3 })
    const p = await setupProbe({ scene })
    expect(p.probeInitial).toHaveBeenCalledTimes(1)
    expect(p.points).toContainEqual([8, 6])
    expect(p.points).toContainEqual([8, 3.2])
    expect(p.points).not.toContainEqual([10, 4])
    expect(p.origin('#00838f')).toEqual(p.point(8, 3))
    const spring = p.arrows.find(arrow => arrow.color === '#00838f')!.path
    expect(spring[0]).toEqual(p.point(8, 3))
    expect(Math.hypot(spring[1]![0]! - spring[0]![0]!, spring[1]![1]! - spring[0]![1]!)).toBeCloseTo(20 * Math.sqrt(7), 6)
    click(p.canvas, { x: 8, y: 4.5 })
    act(() => { vi.advanceTimersByTime(100) })
    expect(panel(p.host, t('readout.title', { id: 'corda' }))?.textContent).toContain('T: 0,00 N')
  })
})

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
    'undo estrutural durante playback é recusado depois de um passo (PHY-39)',
    async () => {
      const host = renderApp()
      act(() => findButton(host, 'retângulo')?.click())

      await settleSimImport()
      await act(async () => { findButton(host, ptBR['playback.step'])!.click() })
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

      expect(findButton(host, '⏸ pausar')).toBeDefined()
      expect(panel(host, 'retangulo')).toBeDefined()
      expect(host.textContent).toContain('reinicie (⟲) para editar')
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

describe('simulator warnings panel (PHY-53)', () => {
  function warningLines(host: HTMLElement): string[] {
    return [...(panel(host, ptBR['warnings.title'])?.querySelectorAll('li') ?? [])].map((li) => li.textContent ?? '')
  }

  it('shows simulator construction warnings after boot', async () => {
    const sim = { ...makeFakeSimulator(), warnings: ['Friction is degraded for this contact graph'] }
    vi.mocked(createSimulator).mockResolvedValue(sim)

    const host = renderApp()
    await settleSimImport()

    expect(warningLines(host)).toContain('Friction is degraded for this contact graph')
  })

  it('shows a warning added during play on the next repaint without another interaction', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    let frame!: FrameRequestCallback
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frame = callback; return 1 })
    vi.stubGlobal('cancelAnimationFrame', () => {})
    const warnings: string[] = []
    let steps = 0
    vi.mocked(createSimulator).mockResolvedValue({
      ...makeFakeSimulator(),
      warnings,
      step: () => {
        if (++steps === 2) warnings.push("body 'ball' approaches Rapier's ω ceiling")
      },
    })
    const host = renderApp()
    await settleSimImport()
    await act(async () => { findButton(host, ptBR['playback.play'])!.click() })

    act(() => frame(16))
    expect(panel(host, ptBR['warnings.title'])).toBeUndefined()
    act(() => frame(32))
    expect(warningLines(host)).toEqual(["body 'ball' approaches Rapier's ω ceiling"])
    act(() => frame(48))
    expect(warningLines(host)).toEqual(["body 'ball' approaches Rapier's ω ceiling"])
  })

  it('lists scene warnings before simulator warnings', async () => {
    vi.mocked(createSimulator).mockResolvedValue({ ...makeFakeSimulator(), warnings: ['Friction is degraded'] })
    const scene = blankScene()
    scene.constants.g = 0
    const { host } = setupWith(() => {
      const storage = window.localStorage as unknown as PersistStorage
      saveIndex(storage, [{ id: 'warning-scene', name: 'Warning scene', updatedAt: 1 }])
      saveScene(storage, 'warning-scene', scene)
      saveCurrentSceneId(storage, 'warning-scene')
    })
    await settleSimImport()

    expect(warningLines(host)).toEqual(['constants.g: g should be a positive number', 'Friction is degraded'])
  })

  it('hides the panel when both the scene and simulator have no warnings', async () => {
    const host = renderApp()
    await settleSimImport()

    expect(panel(host, ptBR['warnings.title'])).toBeUndefined()
  })

  it('removes simulator warnings after rebuilding without them', async () => {
    const warnings = ['Friction is degraded']
    vi.mocked(createSimulator).mockResolvedValue({
      ...makeFakeSimulator(),
      warnings,
      replaceScene: () => { warnings.length = 0 },
    })
    const host = renderApp()
    await settleSimImport()
    expect(warningLines(host)).toEqual(['Friction is degraded'])

    await act(async () => { findButton(host, ptBR['playback.reset'])!.click() })

    expect(panel(host, ptBR['warnings.title'])).toBeUndefined()
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
    act(() => input('k (N/m)').dispatchEvent(new FocusEvent('focusout', { bubbles: true })))
    expect(field(host, 'mola', 'k (N/m)')).toBe(80)
    expect(panel(host, 'mola')?.textContent).toContain('k e x₀ devem ser positivos')

    // Δx ≥ x would make x₀ ≤ 0.
    act(() => setNativeInputValue(input('Δx (m)'), 5))
    expect(field(host, 'mola', 'x₀ (m)')).toBe(3)

    act(() => setNativeInputValue(input('c (N·s/m)'), -1))
    act(() => input('c (N·s/m)').dispatchEvent(new FocusEvent('focusout', { bubbles: true })))
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

    expect(readout()).toContain('F_el: 2,00 N')
    expect(readout()).toContain('Δx: -0,100 m')
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
    act(() => input().dispatchEvent(new FocusEvent('focusout', { bubbles: true })))
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
    expect(readout()).toContain('F_el,1: 2,00 N')
    expect(readout()).toContain('F_el,2: 2,50 N')
    expect(readout().indexOf('F_el,1')).toBeLessThan(readout().indexOf('F_el,2'))
    expect(readout()).not.toContain('F_el em')
    expect(readout()).not.toContain('F_el: ')
    expect(readout()).toContain('Δx: 0,100 m')
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

  const lengthText = (r: number) => `L: ${(2 * 3.55 + Math.PI * r).toFixed(3).replace('.', ',')} m`

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

  it.each(['mola', 'corda'] as const)('CLEAN-24: %s mostra a recusa ao clicar no próprio corpo e mantém A', (name) => {
    const { host, canvas } = setup()
    tool(host, name)
    click(canvas, B1_CLICK)
    click(canvas, B1_CLICK)

    const hint = findButton(host, name)?.parentElement?.nextElementSibling
    expect(hint?.textContent).toContain(ptBR['error.parConsigoMesmo'])
    expect(hint?.textContent).toContain(ptBR[name === 'mola' ? 'tool.springSecond' : 'tool.ropeNext'])
    expect(panel(host, name)).toBeUndefined()
    expect(findButton(host, '↶')?.disabled).toBe(true)

    click(canvas, B2_CLICK)
    expect(panel(host, name)).toBeDefined()
  })

  it('CLEAN-24: corda pode voltar ao corpo A depois de passar por uma polia', () => {
    const { host, canvas } = setup()
    tool(host, 'polia')
    click(canvas, TETO_CLICK)
    tool(host, 'corda')
    click(canvas, B1_CLICK)
    click(canvas, PULLEY_SPOT)
    click(canvas, B1_CLICK)

    expect(panel(host, 'corda')?.textContent).toContain('bloco1 → polia → bloco1')
    expect(host.textContent).not.toContain(ptBR['error.parConsigoMesmo'])
  })

  it('CLEAN-24: depois da recusa a mola ainda usa A e limpa o erro ao criar o vínculo com B', () => {
    const { host, canvas } = setup()
    tool(host, 'mola')
    click(canvas, B1_CLICK)
    click(canvas, B1_CLICK)
    click(canvas, B2_CLICK)

    expect(panel(host, 'mola')).toBeDefined()
    expect(field(host, 'mola', 'x₀ (m)')).toBeCloseTo(0.5, 8)
    expect(host.textContent).not.toContain(ptBR['error.parConsigoMesmo'])
    expect(findButton(host, '↶')?.disabled).toBe(false)
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
    expect(taut).toContain('T: 13,08 N')
    expect(taut).not.toContain('T₁')
    expect(taut).not.toContain('frouxa')

    state = { ...state, tension: 0, slack: true, segments: [0, 0] }
    const slack = await playAndRead(host, 'frouxa')
    expect(slack).toContain('T: 0,00 N')
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
    expect(readout).toContain('T₁: 12,00 N')
    expect(readout).toContain('T₂: 13,00 N')
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
    click(host.querySelector('canvas')!, { x: 1, y: 1 })
    expect(panel(host, 'marca-cena-3')).toBeDefined()
    expect(panel(host, 'marca-cena-1')).toBeUndefined()
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
    click(reopened.querySelector('canvas')!, { x: 1, y: 1 })
    expect(panel(reopened, 'marca-cena-2')).toBeDefined()
    expect(panel(reopened, 'marca-cena-1')).toBeUndefined()
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
  // 3 px beside the axle at 60 px/m: on the drawn dot, never exactly on the axle.
  const MOVEL_AXLE = { x: 6.05, y: 2.5 }
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

describe('rascunho numérico no Chromium (PHY-44)', () => {
  it.each([
    ['x₀ (m)', 'x0', 1.5],
    ['k (N/m)', 'k', 40],
  ] as const)('%s aceita 0.5 tecla por tecla, reverte no blur e só desfaz a edição aceita', async (label, property, original) => {
    // jsdom's WebSocket sends an Origin that Chromium's CDP endpoint rejects.
    vi.stubGlobal('WebSocket', createRequire(import.meta.url)('ws'))
    await withBrowserSession(1280, 25000, async (session) => {
      await session.reset()
      await session.evaluate(`[...document.querySelectorAll('button')].find(el => el.querySelector('strong')?.textContent === 'Massa-mola horizontal').click()`)
      await session.evaluate(`[...document.querySelectorAll('button')].find(el => el.textContent === 'duplicar cena').click()`)
      await session.select(5, 0.2)
      await session.evaluate(`window.numericField = [...document.querySelectorAll('fieldset')]
        .find(el => el.querySelector('legend')?.textContent === 'mola');
        window.numericField = [...numericField.querySelectorAll('label')]
          .find(el => el.textContent === ${JSON.stringify(label)}).querySelector('input');
        window.numericInputs = 0;
        numericField.addEventListener('input', () => numericInputs++);
        window.storedSpring = async () => {
          await new Promise(resolve => setTimeout(resolve, ${AUTOSAVE_DELAY_MS + 50}));
          return JSON.parse(localStorage.getItem(${JSON.stringify(SCENE_KEY_PREFIX)} + localStorage.getItem(${JSON.stringify(CURRENT_SCENE_KEY)}))).constraints.find(c => c.id === 'mola');
        }`)
      const stored = () => session.evaluate<Record<string, number>>('storedSpring()')
      const text = () => session.evaluate<string>('numericField.value')
      const type = (character: string) => session.evaluate(`document.execCommand('insertText', false, ${JSON.stringify(character)})`)
      const selectAll = () => session.evaluate("numericField.focus(); document.execCommand('selectAll')")

      // Each execCommand performs native editing and emits one input. In particular,
      // Chromium retains the visible decimal point while value reports "0".
      await selectAll()
      await type('0')
      expect(await text()).toBe('0')
      expect((await stored())[property]).toBe(original)
      expect(await session.evaluate<boolean>("[...document.querySelectorAll('button')].find(el => el.textContent === '↶').disabled")).toBe(true)
      await session.evaluate('numericField.blur()')
      expect(await text()).toBe(String(original))

      await selectAll()
      await type('-')
      expect((await stored())[property]).toBe(original)
      await session.evaluate('numericField.blur()')
      expect(await text()).toBe(String(original))

      await selectAll()
      await type('0')
      expect(await text()).toBe('0')
      expect((await stored())[property]).toBe(original)
      await type('.')
      expect((await stored())[property]).toBe(original)
      expect(await session.evaluate<boolean>("[...document.querySelectorAll('button')].find(el => el.textContent === '↶').disabled")).toBe(true)
      await type('5')
      expect(await text()).toBe('0.5')
      expect((await stored())[property]).toBe(0.5)
      expect(await session.evaluate<number>('numericInputs')).toBe(5)

      await session.evaluate("numericField.blur(); [...document.querySelectorAll('button')].find(el => el.textContent === '↶').click()")
      expect(await text()).toBe(String(original))
      expect((await stored())[property]).toBe(original)
      expect(await session.evaluate<boolean>("[...document.querySelectorAll('button')].find(el => el.textContent === '↶').disabled")).toBe(true)
    })
  }, 30000)
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
      { node: 'Mecânica / Dinâmica / Colisões', presets: names('collision-elastic', 'collision-inelastic') },
      { node: 'Ondulatória / MHS', presets: names('spring-horizontal', 'spring-vertical', 'simple-pendulum', 'spring-damped') },
    ])
  })

  it('duplicar um preset cria a cena no idioma atual (PHY-62)', () => {
    const host = renderApp()
    const english = en as Record<string, string>
    try {
      const langSelect = [...host.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'en'))
      if (!langSelect) throw new Error('missing language select')
      act(() => setSelectValue(langSelect, 'en'))
      // Node headings follow the language too.
      expect(galleryGroups(host, en['gallery.title'])[0]?.node).toBe('Mechanics / Dynamics / Principles')

      const gallery = panel(host, en['gallery.title'])!
      const atwood = [...gallery.querySelectorAll('button')].find((l) => l.querySelector('strong')?.textContent?.trim() === name(english, 'atwood'))
      if (!atwood) throw new Error('missing Atwood preset')
      act(() => atwood.click())
      act(() => findButton(host, en['scenes.duplicate'])!.click())

      const scenes = panel(host, en['scenes.title'])?.querySelector('select')
      expect(scenes?.selectedOptions[0]?.textContent?.trim()).toBe(name(english, 'atwood'))
      // Inspect both blocks on the canvas; the removed global contact
      // dropdowns no longer list every body id in the DOM.
      const canvas = host.querySelector('canvas')!
      click(canvas, { x: 5.75, y: 3 })
      expect(panel(host, 'bloco-1')).toBeDefined()
      click(canvas, { x: 6.25, y: 2 })
      expect(panel(host, 'bloco-2')).toBeDefined()
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
  // Same id and same pose in both scenes.
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
    // Steps advance the live world; only replaceScene resets it to the document.
    vi.mocked(createSimulator).mockImplementation(async (scene) => {
      const statesFor = (doc: Scene) =>
        new Map(doc.bodies.map((body) => [body.id, {
          position: { ...body.position }, rotation: body.rotation,
          linvel: { x: body.vx ?? 0, y: body.vy ?? 0 }, angvel: 0,
        }]))
      let states = statesFor(scene)
      return {
        ...makeFakeSimulator(),
        step: () => {
          const ball = states.get('bola')!
          states = new Map(states).set('bola', {
            ...ball,
            position: { x: ball.position.x + 3, y: ball.position.y + 2.5 },
            linvel: { x: ball.linvel.x + 5, y: 0 },
          })
        },
        readStates: () => new Map(states),
        replaceScene: (doc) => { states = statesFor(doc) },
      }
    })
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
    expect(readoutText(host)).toContain(`${ptBR['readout.position']}: (6,00, 3,50) m`)
    expect(readoutText(host)).toContain(`${ptBR['readout.velocityMagnitude']}: 0,00 m/s`)

    // Read the next simulated state, so clearing the UI refs alone cannot pass.
    act(() => findButton(host, ptBR['playback.step'])?.click())
    await wait(150)
    expect(readoutText(host)).toContain(`${ptBR['readout.steps']}: 1`)
    expect(readoutText(host)).toContain(`${ptBR['readout.position']}: (9,00, 6,00) m`)
    expect(readoutText(host)).toContain(`${ptBR['readout.velocityMagnitude']}: 5,00 m/s`)
  }, 10000)
})


describe('falhas de edição e troca de cena sem carry (CLEAN-16)', () => {
  const scene = (vx = 0): Scene => ({
    version: 1, constants: { g: 0 },
    bodies: [{ id: 'bola', shape: 'circle', radius: 5, fixed: false, mass: 1, position: { x: 6, y: 3.5 }, rotation: 0, vx }],
    forces: [], contacts: [],
  })
  function fakeSimulator(doc: Scene): Simulator {
    const statesFor = (next: Scene): Map<string, BodyState> => new Map(next.bodies.map((body) => [body.id, {
      position: { ...body.position }, rotation: body.rotation,
      linvel: { x: body.vx ?? 0, y: body.vy ?? 0 }, angvel: 0,
    }]))
    let states = statesFor(doc)
    return {
      ...makeFakeSimulator(),
      step: () => {
        const ball = states.get('bola')!
        states = new Map(states).set('bola', {
          ...ball, position: { x: ball.position.x + 3, y: ball.position.y + 2.5 },
          linvel: { x: ball.linvel.x + 5, y: 0 },
        })
      },
      readStates: () => new Map(states),
      replaceScene: (next) => { states = statesFor(next) },
    }
  }
  async function setup(sim: Simulator) {
    vi.useFakeTimers()
    vi.mocked(createSimulator).mockResolvedValue(sim)
    const { host, canvas } = setupWith(() => {
      const storage = window.localStorage as unknown as PersistStorage
      saveIndex(storage, [
        { id: 'cena-1', name: 'Cena 1', updatedAt: 1 },
        { id: 'cena-2', name: 'Cena 2', updatedAt: 2 },
      ])
      saveScene(storage, 'cena-1', scene())
      saveScene(storage, 'cena-2', scene(2))
      saveCurrentSceneId(storage, 'cena-1')
    })
    await settleSimImport()
    expect(loadingOverlay(host)).toBeUndefined()
    await act(async () => { findButton(host, ptBR['playback.step'])!.click() })
    click(canvas, { x: 9, y: 6 })
    await act(async () => { await vi.advanceTimersByTimeAsync(120) })
    expect(panel(host, 'leitura — bola')!.textContent).toContain('posição: (9,00, 6,00) m')
    expect(panel(host, 'leitura — bola')!.textContent).toContain('velocidade: 5,00 m/s')
    return { host, canvas }
  }

  it('uma edição ao vivo que falha mostra o erro, pausa e reinicia nas poses do documento', async () => {
    const sim = fakeSimulator(scene())
    sim.setGravity = () => { throw new Error('falha ao editar g') }
    const { host } = await setup(sim)
    await act(async () => { findButton(host, ptBR['playback.play'])!.click() })
    act(() => setNativeInputValue(inputForLabel(host, ptBR['panel.gLabel']), 2))
    await act(async () => { await vi.advanceTimersByTimeAsync(120) })

    expect(panel(host, ptBR['simError.title'])!.textContent).toContain('falha ao editar g')
    expect(findButton(host, ptBR['playback.play'])).toBeDefined()
    const text = panel(host, 'leitura — bola')!.textContent
    expect(text).toContain('passos: 0')
    expect(text).toContain('posição: (6,00, 3,50) m')
    expect(text).toContain('velocidade: 0,00 m/s')
    // A resumed step also starts in the rebuilt world, rather than old UI refs.
    await act(async () => { findButton(host, ptBR['playback.step'])!.click() })
    await act(async () => { await vi.advanceTimersByTimeAsync(120) })
    expect(panel(host, 'leitura — bola')!.textContent).toContain('posição: (9,00, 6,00) m')
    expect(panel(host, 'leitura — bola')!.textContent).toContain('velocidade: 5,00 m/s')
  })

  it('CLEAN-30 uma troca de cena cujo replaceScene falha não mostra leituras da cena anterior, nem após o retry', async () => {
    const sim = fakeSimulator(scene())
    const replace = vi.spyOn(sim, 'replaceScene')
    replace.mockImplementationOnce(() => { throw new Error('falha ao trocar cena') })
    const { host, canvas } = await setup(sim)
    act(() => setSelectValue(sceneSelect(host), 'cena-2'))
    expect(panel(host, ptBR['simError.title'])!.textContent).toContain('falha ao trocar cena')
    // The wide body contains this point even at the old simulated pose: a
    // stale projection is selected too, so the readout must expose the leak.
    click(canvas, { x: 6, y: 3.5 })
    await act(async () => { await vi.advanceTimersByTimeAsync(120) })
    const text = panel(host, 'leitura — bola')!.textContent
    expect(text).toContain('passos: 0')
    expect(text).toContain('posição: (6,00, 3,50) m')
    expect(text).toContain('velocidade: 2,00 m/s')
    expect(text).toContain('E_c: 2,00 J')
    expect(text).toContain('|p|: 2,00 kg·m/s')
    expect(panel(host, 'sistema')?.textContent).toContain('E_mec: 2,00 J')
    expect(panel(host, 'sistema')?.textContent).toContain('|p|: 2,00 kg·m/s')

    await act(async () => { findButton(host, ptBR['playback.step'])!.click() })
    await act(async () => { await vi.advanceTimersByTimeAsync(120) })
    expect(panel(host, 'leitura — bola')!.textContent).toContain('passos: 1')
    expect(panel(host, 'leitura — bola')!.textContent).toContain('posição: (9,00, 6,00) m')
    expect(panel(host, 'leitura — bola')!.textContent).toContain('velocidade: 7,00 m/s')
    expect(panel(host, 'leitura — bola')!.textContent).toContain('E_c: 24,50 J')
    expect(panel(host, 'sistema')?.textContent).toContain('E_mec: 24,50 J')
  })

  it('CLEAN-30 a failed reset reads the document until a successful retry', async () => {
    const sim = fakeSimulator(scene())
    const { host } = await setup(sim)
    vi.spyOn(sim, 'replaceScene').mockImplementationOnce(() => { throw new Error('reset failed') })
    act(() => findButton(host, ptBR['playback.reset'])!.click())
    await act(async () => { await vi.advanceTimersByTimeAsync(120) })
    expect(panel(host, ptBR['simError.title'])?.textContent).toContain('reset failed')
    expect(panel(host, 'leitura — bola')?.textContent).toContain('E_c: 0,00 J')
    expect(panel(host, 'sistema')?.textContent).toContain('E_mec: 0,00 J')
    expect(panel(host, 'sistema')?.textContent).toContain('|p|: 0,00 kg·m/s')
    await act(async () => { findButton(host, ptBR['playback.step'])!.click() })
    await act(async () => { await vi.advanceTimersByTimeAsync(120) })
    expect(panel(host, 'sistema')?.textContent).toContain('E_c: 12,50 J')
    expect(panel(host, 'sistema')?.textContent).toContain('|p|: 5,00 kg·m/s')
  })
})

describe('CLEAN-30 document energy during boot', () => {
  it('uses document spring strain and zero chain/pulley kinetic energy without publishing constraint readings', async () => {
    setLang('pt-BR')
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const scene: Scene = {
      version: 1, constants: { g: 10 }, forces: [], contacts: [],
      bodies: [
        { id: 'wall', shape: 'circle', radius: 0.2, mass: 0, fixed: true, position: { x: 2, y: 4 }, rotation: 0 },
        { id: 'ball', shape: 'circle', radius: 0.5, mass: 1, fixed: false, position: { x: 6, y: 4 }, rotation: 0 },
      ],
      constraints: [{ id: 'spring', kind: 'spring', a: { bodyId: 'wall', anchor: { x: 0, y: 0 } },
        b: { bodyId: 'ball', anchor: { x: 0, y: 0 } }, k: 10, x0: 3, mass: 1 }],
      pulleys: [{ id: 'disk', bodyId: 'wall', anchor: { x: 0, y: 0 }, radius: 1, mass: 2 }],
    }
    vi.mocked(createSimulator).mockResolvedValue({
      ...makeFakeSimulator(),
      readStates: () => new Map(scene.bodies.map(b => [b.id, {
        position: b.position, rotation: b.rotation, linvel: { x: 0, y: 0 }, angvel: 0,
      }])),
      readConstraints: () => [{ id: 'spring', kind: 'spring', dx: 1, force: { a: 10, b: 10 }, chainKinetic: 7 }],
      readPulleys: () => [{ id: 'disk', angvel: 3 }],
    })
    const { host, canvas } = setupWith(() => {
      const storage = window.localStorage as unknown as PersistStorage
      saveIndex(storage, [{ id: 'spring-energy', name: 'Spring energy', updatedAt: 1 }])
      saveScene(storage, 'spring-energy', scene)
      saveCurrentSceneId(storage, 'spring-energy')
    })
    await settleSimImport()
    const poll = () => act(() => { vi.advanceTimersByTime(100) })
    const system = () => panel(host, 'sistema')?.textContent ?? ''
    poll()
    // The previous frame deliberately has moving chain nodes and a spinning disk.
    expect(system()).toContain('E_c: 11,50 J')
    click(canvas, { x: 4, y: 4 })
    expect(panel(host, 'spring')).toBeDefined()
    act(() => setNativeInputValue(inputForLabel(panel(host, 'spring')!, ptBR['spring.x0']), 2))
    poll()
    expect(system()).toContain('E_c: 0,00 J')
    expect(system()).toContain('E_el: 20,00 J')
    expect(system()).toContain('E_mec: 60,00 J')
    expect(panel(host, 'leitura — spring')?.textContent).toContain(ptBR['readout.noData'])
  })

  it('reads initial velocity and rotated triangle centroid before boot and after an edit during boot', async () => {
    setLang('pt-BR')
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    let resolveBoot!: (sim: Simulator) => void
    vi.mocked(createSimulator).mockImplementationOnce(() => new Promise(resolve => { resolveBoot = resolve }))
    const scene: Scene = {
      version: 1, constants: { g: 3 }, forces: [], contacts: [],
      bodies: [{ id: 'triangle', shape: 'triangle', base: 3, alpha: 45, mass: 2, fixed: false,
        position: { x: 6, y: 4 }, rotation: Math.PI / 2, vx: 3, vy: 4 }],
    }
    const { host, canvas } = setupWith(() => {
      const storage = window.localStorage as unknown as PersistStorage
      saveIndex(storage, [{ id: 'boot-energy', name: 'Boot energy', updatedAt: 1 }])
      saveScene(storage, 'boot-energy', scene)
      saveCurrentSceneId(storage, 'boot-energy')
    })
    await settleSimImport()
    click(canvas, { x: 5, y: 6 })
    const poll = () => act(() => { vi.advanceTimersByTime(100) })
    poll()
    const body = () => panel(host, 'leitura — triangle')?.textContent ?? ''
    expect(body()).toContain('E_c: 25,00 J')
    expect(body()).toContain('E_pg: 36,00 J')
    expect(body()).toContain('|p|: 10,00 kg·m/s')
    expect(panel(host, 'sistema')?.textContent).toContain('E_mec: 61,00 J')
    expect(panel(host, 'sistema')?.textContent).toContain('p_x: 6,00 kg·m/s')
    expect(panel(host, 'sistema')?.textContent).toContain('p_y: 8,00 kg·m/s')
    act(() => setNativeInputValue(inputForLabel(host, ptBR['properties.posY']), 5))
    poll()
    expect(body()).toContain('E_pg: 42,00 J')
    let current = scene
    const replaceScene = vi.fn((doc: Scene) => { current = doc })
    await act(async () => {
      resolveBoot({ ...makeFakeSimulator(), replaceScene,
        readStates: () => new Map(current.bodies.map(b => [b.id, {
          position: b.position, rotation: b.rotation, linvel: { x: b.vx ?? 0, y: b.vy ?? 0 }, angvel: 0,
        }])),
      })
    })
    poll()
    expect(loadingOverlay(host)).toBeUndefined()
    expect(replaceScene).not.toHaveBeenCalled()
    expect(body()).toContain('E_pg: 42,00 J')
    expect(panel(host, 'sistema')?.textContent).toContain('E_mec: 67,00 J')
    await act(async () => { findButton(host, ptBR['playback.step'])!.click() })
    poll()
    expect(replaceScene).toHaveBeenCalledTimes(1)
    expect(body()).toContain('E_pg: 42,00 J')
  })

  it.each(['fixed', 'empty'] as const)('has no system reading during boot for a %s document', async (bodies) => {
    setLang('pt-BR')
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    vi.mocked(createSimulator).mockImplementationOnce(() => new Promise(() => {}))
    const scene: Scene = { version: 1, constants: { g: 10 }, forces: [], contacts: [], bodies: bodies === 'empty' ? [] : [
      { id: 'fixed', shape: 'circle', radius: 1, mass: 2, fixed: true, position: { x: 6, y: 4 }, rotation: 0 },
    ] }
    const { host } = setupWith(() => {
      const storage = window.localStorage as unknown as PersistStorage
      saveIndex(storage, [{ id: 'no-energy', name: 'No energy', updatedAt: 1 }])
      saveScene(storage, 'no-energy', scene)
      saveCurrentSceneId(storage, 'no-energy')
    })
    await settleSimImport()
    act(() => { vi.advanceTimersByTime(100) })
    expect(panel(host, 'sistema')?.textContent).toContain(ptBR['readout.noData'])
    expect(panel(host, 'sistema')?.textContent).not.toContain('E_mec')
  })
})

describe('edição estrutural só em t0 (PHY-39)', () => {
  const storage = () => window.localStorage as unknown as PersistStorage
  const hint = 'reinicie (⟲) para editar'
  const scene = (): Scene => ({
    version: 1, constants: { g: 0 },
    bodies: [
      { id: 'parede', shape: 'rectangle', width: 1, height: 2, fixed: true, mass: 0, position: { x: 2, y: 4 }, rotation: 0 },
      { id: 'bloco', shape: 'rectangle', width: 1, height: 1, fixed: false, mass: 1, position: { x: 5, y: 4 }, rotation: 0 },
    ], forces: [{ id: 'F', bodyId: 'bloco', anchor: { x: 0, y: 0 }, magnitude: 0, direction: 0 }], contacts: [],
  })
  function setup(doc = scene()) {
    vi.useFakeTimers()
    return setupWith(() => {
      saveIndex(storage(), [{ id: 'cena-1', name: 'Cena 1', updatedAt: 1 }])
      saveScene(storage(), 'cena-1', doc)
      saveCurrentSceneId(storage(), 'cena-1')
    })
  }
  async function step(host: HTMLElement, n = 1) {
    await settleSimImport()
    for (let i = 0; i < 100 && loadingOverlay(host); i++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(5) })
    }
    expect(loadingOverlay(host)).toBeUndefined()
    for (let i = 0; i < n; i++) await act(async () => { findButton(host, ptBR['playback.step'])!.click() })
  }
  function savedDoc() {
    act(() => { window.dispatchEvent(new Event('pagehide')) })
    return loadScene(storage(), 'cena-1')
  }
  function expectUnchanged(before: Scene, host: HTMLElement) {
    expect(savedDoc()).toStrictEqual(before)
    expect(host.textContent).toContain(hint)
  }

  it.each(['pausado', 'rodando'])('recusa mover, girar, redimensionar e jogar no lixo, %s', async (mode) => {
    const before = scene()
    const { host, canvas } = setup(before)
    await step(host)
    if (mode === 'rodando') await act(async () => { findButton(host, ptBR['playback.play'])!.click() })
    click(canvas, { x: 5.2, y: 4.2 })
    for (const [from, to] of [
      [{ x: 5.2, y: 4.2 }, { x: 6.2, y: 4.2 }],
      [{ x: 5, y: 3.1 }, { x: 5.9, y: 4 }],
      [{ x: 5.5, y: 4.5 }, { x: 6, y: 5 }],
    ]) {
      dragTo(canvas, from!, to!)
      expectUnchanged(before, host)
    }
    const p = screen(5.2, 4.2)
    const trash = trashRect(900, 600)
    act(() => canvas.dispatchEvent(pointerEvent('pointerdown', p.x, p.y)))
    act(() => canvas.dispatchEvent(pointerEvent('pointerup', trash.x + trash.w / 2, trash.y + trash.h / 2)))
    expectUnchanged(before, host)
    expect(panel(host, 'bloco')).toBeDefined()
    expect(findButton(host, '↶')!.disabled).toBe(true)
  })

  it('recusa o arrasto de alpha da cunha', async () => {
    const before = scene()
    before.bodies[1] = { id: 'bloco', shape: 'triangle', base: 2, alpha: 45, fixed: false, mass: 1, position: { x: 5, y: 4 }, rotation: 0 }
    const { host, canvas } = setup(before)
    await step(host)
    click(canvas, { x: 5.5, y: 4.2 })
    dragTo(canvas, { x: 6, y: 5 }, { x: 6, y: 6 })
    expectUnchanged(before, host)
  })

  it.each(['mola', 'corda', 'polia'])('recusa a ferramenta %s armada antes do primeiro passo', async (name) => {
    const before = scene()
    const { host, canvas } = setup(before)
    act(() => findButton(host, name)!.click())
    await step(host)
    click(canvas, { x: 2, y: 4 })
    click(canvas, { x: 5, y: 4 })
    expectUnchanged(before, host)
    expect(findButton(host, name)!.disabled).toBe(true)
  })

  it('recusa Delete, Backspace e campos estruturais; desabilita controles e libera depois do reset', async () => {
    const before = scene()
    const { host, canvas } = setup(before)
    await step(host)
    click(canvas, { x: 5.2, y: 4.2 })
    const properties = panel(host, 'bloco')!
    const structural = [...properties.querySelectorAll('input')]
    for (const input of structural) {
      expect(input.matches(':disabled')).toBe(true)
      if (input.type === 'number') {
        act(() => setNativeInputValue(input, Number(input.value) + 1))
        expectUnchanged(before, host)
      }
    }
    for (const key of ['Delete', 'Backspace']) {
      pressKey(key)
      expectUnchanged(before, host)
      expect(panel(host, 'bloco')).toBeDefined()
    }
    for (const text of ['retângulo', 'bola', 'cunha', 'mola', 'polia', 'corda', ptBR['panel.delete'], ptBR['panel.duplicate'], ptBR['forces.add']]) {
      expect(findButton(host, text)!.matches(':disabled')).toBe(true)
    }
    expect(panel(host, ptBR['forces.title'].replace('{id}', 'bloco'))!.querySelector('button')!.matches(':disabled')).toBe(true)
    expect(inputForLabel(host, ptBR['panel.particleMode']).matches(':disabled')).toBe(true)
    expect([...panel(host, 'contatos de m')!.querySelectorAll('input, select, button')].every((el) => el.matches(':disabled'))).toBe(true)
    act(() => findButton(host, ptBR['playback.reset'])!.click())
    expect(structural.every((el) => !el.matches(':disabled'))).toBe(true)
    expect(findButton(host, 'mola')!.disabled).toBe(false)
    act(() => setNativeInputValue(inputForLabel(properties, ptBR['properties.mass']), 2))
    expect(field(host, 'bloco', ptBR['properties.mass'])).toBe(2)
    expect(host.textContent).not.toContain(hint)
  })

  it.each(['atwood', 'spring-horizontal'])('desabilita o inspetor de vínculos e polias de %s', async (preset) => {
    const before = presetById(preset)!.buildScene()
    const { host, canvas } = setup(before)
    await step(host)
    // Pulley axle and spring midpoint are stable after one step.
    const spots = preset === 'atwood' ? [{ x: 6, y: 7 }, { x: 5.75, y: 5 }] : [{ x: 5, y: 0.2 }]
    for (const spot of spots) {
      click(canvas, spot)
      const id = preset === 'atwood' ? (spot.y === 7 ? before.pulleys![0]!.id : before.constraints![0]!.id) : before.constraints![0]!.id
      const inspector = panel(host, id)!
      expect(inspector).toBeDefined()
      expect([...inspector.querySelectorAll('input, button')].every((el) => el.matches(':disabled'))).toBe(true)
    }
  })

  it('bloqueia undo/redo estrutural sem consumir o histórico; libera após reset', async () => {
    const { host } = setup()
    act(() => findButton(host, 'bola')!.click())
    pressKey('z', { ctrlKey: true })
    await step(host)
    expect(findButton(host, '↷')!.disabled).toBe(true)
    pressKey('y', { ctrlKey: true })
    expect(savedDoc()!.bodies.some((b) => b.id === 'bola')).toBe(false)
    expect(host.textContent).toContain(hint)
    act(() => findButton(host, ptBR['playback.reset'])!.click())
    pressKey('y', { ctrlKey: true })
    expect(panel(host, 'bola')).toBeDefined()
    await step(host)
    expect(findButton(host, '↶')!.disabled).toBe(true)
    pressKey('z', { ctrlKey: true })
    expect(panel(host, 'bola')).toBeDefined()
    act(() => findButton(host, ptBR['playback.reset'])!.click())
    pressKey('z', { ctrlKey: true })
    expect(savedDoc()!.bodies.some((b) => b.id === 'bola')).toBe(false)
  })

  it('a recusa acompanha o idioma inglês', async () => {
    const { host, canvas } = setup()
    await step(host)
    const language = [...host.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'en'))!
    try {
      act(() => setSelectValue(language, 'en'))
      click(canvas, { x: 5.2, y: 4.2 })
      pressKey('Delete')
      expect(savedDoc()).toStrictEqual(scene())
      expect(host.textContent).toContain('reset (⟲) to edit')
    } finally {
      setLang('pt-BR')
    }
  })

  it('força, direção, ponto de aplicação e g continuam chegando ao mundo; undo/redo ao vivo funcionam', async () => {
    const real = await vi.importActual<typeof import('./sim')>('./sim')
    let sim!: Simulator
    vi.mocked(createSimulator).mockImplementation(async (doc) => (sim = await real.createSimulator(doc)))
    const { host, canvas } = setup()
    await step(host)
    click(canvas, { x: 5.2, y: 4.2 })
    const forces = panel(host, ptBR['forces.title'].replace('{id}', 'bloco'))!
    act(() => setNativeInputValue(inputForLabel(forces, ptBR['forces.magnitude']), 12))
    act(() => setNativeInputValue(inputForLabel(forces, ptBR['forces.direction']), 90))
    dragTo(canvas, { x: 5, y: 4 }, { x: 5.5, y: 4 })
    act(() => setNativeInputValue(inputForLabel(host, ptBR['panel.gLabel']), 6))
    expect(savedDoc()!.forces[0]!.anchor).toStrictEqual({ x: 0.5, y: 0 })
    await step(host)
    const state = sim.readStates().get('bloco')!
    expect(state.linvel.x).toBeCloseTo(0, 5)
    expect(state.linvel.y).toBeCloseTo(0.1, 5)
    expect(state.angvel).toBeGreaterThan(0)
    expect(findButton(host, '↶')!.disabled).toBe(false)
    pressKey('z', { ctrlKey: true })
    expect(savedDoc()!.constants.g).toBe(0)
    expect(findButton(host, '↷')!.disabled).toBe(false)
    pressKey('y', { ctrlKey: true })
    expect(savedDoc()!.constants.g).toBe(6)
    expect(host.textContent).not.toContain(hint)
  })

  it('Atwood após 30 passos: arrasto recusado preserva documento e T dentro de 1%', async () => {
    const real = await vi.importActual<typeof import('./sim')>('./sim')
    let sim!: Simulator
    vi.mocked(createSimulator).mockImplementation(async (doc) => (sim = await real.createSimulator(doc)))
    const before = presetById('atwood')!.buildScene()
    const { host, canvas } = setup(before)
    await step(host, 30)
    const from = sim.readStates().get('bloco-1')!.position
    dragTo(canvas, from, { x: from.x + 0.01, y: from.y })
    expectUnchanged(before, host)
    await step(host)
    const rope = sim.readConstraints()[0]!
    expect(rope.kind).toBe('rope')
    if (rope.kind !== 'rope') throw new Error('missing rope')
    expect(Math.abs(rope.tension / 23.544 - 1)).toBeLessThan(0.01)
    expect(rope.slack).toBe(false)
    click(canvas, { x: 5.75, y: 5 })
    act(() => { vi.advanceTimersByTime(100) })
    expect(panel(host, 'leitura — corda')!.textContent).toContain('T: 23,54 N')
  })
})

describe('desenho da corda durante o playback (PHY-56)', () => {
  const storage = () => window.localStorage as unknown as PersistStorage
  // A pulley of radius 0.5 mounted on the movable block `bloco`, the rope tied to two fixed blocks.
  const doc = (): Scene => ({
    version: 1,
    constants: { g: 9.81 },
    bodies: [
      { id: 'esq', shape: 'rectangle', width: 0.4, height: 0.4, fixed: true, mass: 0, position: { x: 4.5, y: 5 }, rotation: 0 },
      { id: 'dir', shape: 'rectangle', width: 0.4, height: 0.4, fixed: true, mass: 0, position: { x: 5.5, y: 5 }, rotation: 0 },
      { id: 'bloco', shape: 'rectangle', width: 0.4, height: 0.4, fixed: false, mass: 1, position: { x: 5, y: 2 }, rotation: 0 },
    ],
    forces: [],
    contacts: [],
    pulleys: [{ id: 'polia', bodyId: 'bloco', anchor: { x: 0, y: 0 }, radius: 0.5 }],
    constraints: [{ id: 'corda', kind: 'rope', a: { bodyId: 'esq', anchor: { x: 0, y: 0 } }, b: { bodyId: 'dir', anchor: { x: 0, y: 0 } }, via: ['polia'] }],
  })
  const MARKER = {
    segments: [
      { from: { x: 100, y: 100 }, to: { x: 101, y: 100 } },
      { from: { x: 101, y: 100 }, to: { x: 102, y: 100 } },
    ],
    arcs: [{ center: { x: 101, y: 100 }, radius: 0.5, start: 0, sweep: -0.5, direction: 1 as const }],
    length: 2,
  }
  const reading = (path: unknown) => ({ id: 'corda', kind: 'rope' as const, tension: 5, slack: false, segments: [5, 5], path }) as never

  const lineTos: Array<[number, number]> = []
  function recordCanvas(): void {
    lineTos.length = 0
    const ctx = new Proxy({} as Record<PropertyKey, unknown>, {
      get: (_t, name) => (...args: unknown[]) => {
        if (name === 'lineTo') lineTos.push([args[0] as number, args[1] as number])
        if (name === 'measureText') return { width: 10 }
      },
      set: () => true,
    })
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => ctx })
  }
  const drew = (x: number, y: number) => lineTos.some(([lx, ly]) => lx === x && ly === y)

  async function boot(path: unknown) {
    vi.useFakeTimers()
    recordCanvas()
    vi.mocked(createSimulator).mockImplementation(async () => ({ ...makeFakeSimulator(), readConstraints: () => [reading(path)] }))
    const { host, canvas } = setupWith(() => {
      saveIndex(storage(), [{ id: 'cena-1', name: 'Cena 1', updatedAt: 1 }])
      saveScene(storage(), 'cena-1', doc())
      saveCurrentSceneId(storage(), 'cena-1')
    })
    await settleSimImport()
    for (let i = 0; i < 100 && loadingOverlay(host); i++) await act(async () => { await vi.advanceTimersByTimeAsync(5) })
    expect(loadingOverlay(host)).toBeUndefined()
    // A click on empty canvas repaints at t = 0.
    click(canvas, { x: 1, y: 1 })
    return host
  }
  const stepOnce = (host: HTMLElement) => act(async () => { findButton(host, ptBR['playback.step'])!.click() })
  const resetOnce = (host: HTMLElement) => act(async () => { findButton(host, ptBR['playback.reset'])!.click() })
  const docTangent = () => scenePath(doc(), doc().constraints![0] as never)!.segments[0]!.to

  it('no editor o desenho segue o documento, e só depois do primeiro passo vem do caminho do simulador; reiniciar volta ao documento', async () => {
    const host = await boot(MARKER)
    expect(drew(101, 100)).toBe(false)
    expect(drew(102, 100)).toBe(false)
    expect(drew(docTangent().x, docTangent().y)).toBe(true)

    await stepOnce(host)
    expect(drew(101, 100)).toBe(true)
    expect(drew(102, 100)).toBe(true)

    lineTos.length = 0
    await resetOnce(host)
    expect(drew(101, 100)).toBe(false)
    expect(drew(102, 100)).toBe(false)
    expect(drew(docTangent().x, docTangent().y)).toBe(true)
  })

  it('uma leitura velha, com um caminho de um segmento só, não derruba o paint e a corda sai do documento', async () => {
    // The drawing runs before the arrows, so a throw from the arrows still leaves the rope drawn: listen for it.
    const errors: unknown[] = []
    const onError = (e: ErrorEvent) => { e.preventDefault(); errors.push(e.error) }
    window.addEventListener('error', onError)
    try {
      await boot({ segments: [{ from: { x: 100, y: 100 }, to: { x: 101, y: 100 } }], arcs: [], length: 1 })
    } finally {
      window.removeEventListener('error', onError)
    }
    expect(errors).toStrictEqual([])
    expect(drew(101, 100)).toBe(false)
    expect(drew(docTangent().x, docTangent().y)).toBe(true)
  })

  it('CLEAN-27: o clique na corda segue o caminho do simulador só depois do primeiro passo, e reiniciar volta ao documento', async () => {
    const OPEN_SPACE = { x: 2.5, y: 0.5 }
    const host = await boot({
      segments: [
        { from: { x: 2, y: 0.5 }, to: OPEN_SPACE },
        { from: OPEN_SPACE, to: { x: 3, y: 0.5 } },
      ],
      arcs: [{ center: { x: 2.5, y: 0.5 }, radius: 0.5, start: 0, sweep: -0.5, direction: 1 as const }],
      length: 1,
    })
    const canvas = host.querySelector('canvas')!
    click(canvas, OPEN_SPACE)
    expect(panel(host, 'corda')).toBeUndefined()

    await stepOnce(host)
    click(canvas, OPEN_SPACE)
    expect(panel(host, 'corda')).toBeDefined()

    click(canvas, { x: 1, y: 1 })
    expect(panel(host, 'corda')).toBeUndefined()
    await resetOnce(host)
    click(canvas, OPEN_SPACE)
    expect(panel(host, 'corda')).toBeUndefined()
  })
})

describe('galeria de um clique (PHY-62)', () => {
  const storage = () => window.localStorage as unknown as PersistStorage
  function card(host: HTMLElement, id: string): HTMLButtonElement {
    const button = [...host.querySelectorAll('button')].find((b) => b.querySelector('strong')?.textContent === t(`preset.${id}.name`))
    if (!button) throw new Error(`missing preset card: ${id}`)
    return button
  }
  const sceneWrites = (calls: string[][]) => calls.filter(([key]) => key === INDEX_KEY || key!.startsWith(SCENE_KEY_PREFIX))
  const flush = () => act(() => vi.advanceTimersByTime(AUTOSAVE_DELAY_MS))

  it.each(['g', 'F'])('entrada equivalente de %s preserva o preset até uma edição real', async (quantity) => {
    vi.useFakeTimers()
    const host = renderApp()
    await settleSimImport()
    act(() => card(host, 'wedge-flagship').click())
    if (quantity === 'F') click(host.querySelector('canvas')!, { x: 12, y: 0.5 })
    const field = quantity === 'g' ? inputForLabel(host, ptBR['panel.gLabel'])
      : inputForLabel(panel(host, ptBR['forces.title'].replace('{id}', 'cunha'))!, ptBR['forces.magnitude'])
    const indexBefore = storage().getItem(INDEX_KEY)
    const savedBefore = storage().getItem(`${SCENE_KEY_PREFIX}cena-1`)
    const writes = vi.spyOn(Storage.prototype, 'setItem')
    try {
      act(() => field.focus())
      const equivalent = field.value.includes('.') ? `${field.value}0` : `${field.value}.0`
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, equivalent)
        field.dispatchEvent(new Event('input', { bubbles: true }))
      })
      flush()
      expect(sceneSelect(host).value).toBe('preset:wedge-flagship')
      expect(host.textContent).toContain(t('preset.readOnlyHint'))
      expect(sceneWrites(writes.mock.calls)).toEqual([])
      expect(storage().getItem(INDEX_KEY)).toBe(indexBefore)
      expect(storage().getItem(`${SCENE_KEY_PREFIX}cena-1`)).toBe(savedBefore)
      expect(loadIndex(storage())).toHaveLength(1)
      act(() => setNativeInputValue(field, 6))
      flush()
      expect(sceneSelect(host).value).toBe('cena-2')
      expect(loadIndex(storage())).toHaveLength(2)
      const copy = loadScene(storage(), 'cena-2')!
      expect(quantity === 'g' ? copy.constants.g : copy.forces[0]!.magnitude).toBe(6)
    } finally { writes.mockRestore() }
  })

  it('abre cada card em t=0 sem salvar cenas; transporte não cria cópia', async () => {
    vi.useFakeTimers()
    const replaceScene = vi.fn()
    vi.mocked(createSimulator).mockResolvedValue({ ...makeFakeSimulator(), replaceScene })
    const host = renderApp()
    await settleSimImport()
    expect(sceneSelect(host).value).toBe('cena-1')
    expect(loadIndex(storage())).toHaveLength(1)
    const writes = vi.spyOn(Storage.prototype, 'setItem')
    try {
      for (const preset of PRESETS) {
        act(() => card(host, preset.id).click())
        expect(replaceScene).toHaveBeenLastCalledWith(preset.buildScene())
        expect(sceneSelect(host).selectedOptions[0]?.disabled).toBe(true)
        expect(sceneSelect(host).selectedOptions[0]?.textContent).toBe(t('scenes.presetOption', { name: t(`preset.${preset.id}.name`) }))
        expect(host.textContent).toContain(t('preset.readOnlyHint'))
        expect(host.textContent).toContain('passos: 0')
        expect(findButton(host, ptBR['playback.play'])).toBeDefined()
        expect(findButton(host, ptBR['scenes.delete'])!.disabled).toBe(true)
        expect(panel(host, ptBR['gallery.title'])).toBeDefined()
        await act(async () => { findButton(host, ptBR['playback.step'])!.click() })
        act(() => findButton(host, ptBR['playback.reset'])!.click())
        const speed = host.querySelector<HTMLInputElement>('input[type="range"]')!
        act(() => setNativeInputValue(speed, 2))
        await act(async () => { findButton(host, ptBR['playback.play'])!.click() })
        flush()
      }
      expect(sceneWrites(writes.mock.calls)).toEqual([])
      expect(storage().getItem(GALLERY_ACK_KEY)).toBe('true')
      expect(host.querySelector('input[name="preset"]')).toBeNull()
      expect(findButton(host, ptBR['gallery.useSelected'])).toBeUndefined()
    } finally { writes.mockRestore() }
  })

  it('reabre o preset após reload; desconhecido volta à cena salva', async () => {
    const host = renderApp()
    await settleSimImport()
    act(() => card(host, 'atwood').click())
    expect(storage().getItem(CURRENT_SCENE_KEY)).toBe('preset:atwood')
    act(() => root!.unmount())
    root = null
    const reloaded = renderApp()
    await settleSimImport()
    expect(sceneSelect(reloaded).value).toBe('preset:atwood')
    expect(createSimulator).toHaveBeenLastCalledWith(presetById('atwood')!.buildScene())
    expect(reloaded.textContent).toContain(t('preset.readOnlyHint'))
    expect(reloaded.textContent).not.toContain('não encontrada')
    act(() => root!.unmount())
    root = null
    saveCurrentSceneId(storage(), 'preset:unknown')
    const fallback = renderApp()
    expect(sceneSelect(fallback).value).toBe('cena-1')
    expect(fallback.textContent).not.toContain(t('preset.readOnlyHint'))
  })

  it('clique no preset já aberto preserva playback e mundo', async () => {
    vi.useFakeTimers()
    let frame: FrameRequestCallback = () => {}
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frame = cb; return 1 })
    vi.stubGlobal('cancelAnimationFrame', () => {})
    const replaceScene = vi.fn()
    const step = vi.fn()
    vi.mocked(createSimulator).mockResolvedValue({ ...makeFakeSimulator(), replaceScene, step })
    const host = renderApp()
    await settleSimImport()
    act(() => card(host, 'atwood').click())
    await act(async () => { findButton(host, ptBR['playback.play'])!.click() })
    act(() => frame(0))
    act(() => frame(100))
    flush()
    expect(step).toHaveBeenCalled()
    const calls = replaceScene.mock.calls.length
    const steps = host.textContent!.match(/passos: (\d+)/)![1]
    expect(Number(steps)).toBeGreaterThan(0)
    act(() => card(host, 'atwood').click())
    expect(replaceScene).toHaveBeenCalledTimes(calls)
    expect(host.textContent).toContain(`passos: ${steps}`)
    expect(findButton(host, ptBR['playback.pause'])).toBeDefined()
  })

  it('primeira edição cria uma cópia; undo mantém o id e reabrir preserva o original', async () => {
    vi.useFakeTimers()
    const host = renderApp()
    await settleSimImport()
    act(() => card(host, 'atwood').click())
    act(() => findButton(host, ptBR['palette.rectangle'])!.click())
    flush()
    expect(sceneSelect(host).value).toBe('cena-2')
    expect(loadIndex(storage())).toHaveLength(2)
    expect(loadIndex(storage())[1]!.name).toBe(t('preset.atwood.name'))
    expect(loadScene(storage(), 'cena-2')!.bodies).toHaveLength(5)
    expect(host.textContent).not.toContain(t('preset.readOnlyHint'))
    expect(sceneSelect(host).querySelector('option:disabled')).toBeNull()
    expect(panel(host, ptBR['gallery.title'])).toBeDefined()
    act(() => findButton(host, '↶')!.click())
    flush()
    expect(sceneSelect(host).value).toBe('cena-2')
    expect(loadIndex(storage())).toHaveLength(2)
    expect(loadScene(storage(), 'cena-2')).toEqual(presetById('atwood')!.buildScene())
    act(() => setNativeInputValue(inputForLabel(host, ptBR['panel.gLabel']), 4))
    flush()
    expect(loadIndex(storage())).toHaveLength(2)
    act(() => inputForLabel(host, ptBR['panel.gLabel']).dispatchEvent(new FocusEvent('focusout', { bubbles: true })))
    act(() => card(host, 'atwood').click())
    expect(inputForLabel(host, ptBR['panel.gLabel']).value).toBe('9.81')
    expect(loadScene(storage(), 'cena-2')!.constants.g).toBe(4)
  })

  it.each(['g', 'F'])('primeira edição de %s durante play cria cópia sem reset e chega ao mundo', async (quantity) => {
    vi.useFakeTimers()
    let frame: FrameRequestCallback = () => {}
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frame = cb; return 1 })
    vi.stubGlobal('cancelAnimationFrame', () => {})
    const replaceScene = vi.fn()
    const setGravity = vi.fn()
    const setForceMagnitude = vi.fn()
    vi.mocked(createSimulator).mockResolvedValue({ ...makeFakeSimulator(), replaceScene, setGravity, setForceMagnitude })
    const host = renderApp()
    await settleSimImport()
    act(() => card(host, 'wedge-flagship').click())
    if (quantity === 'F') click(host.querySelector('canvas')!, { x: 12, y: 0.5 })
    await act(async () => { findButton(host, ptBR['playback.play'])!.click() })
    act(() => frame(0))
    act(() => frame(100))
    flush()
    const steps = host.textContent!.match(/passos: (\d+)/)![1]
    expect(Number(steps)).toBeGreaterThan(0)
    const rebuilds = replaceScene.mock.calls.length
    const field = quantity === 'g' ? inputForLabel(host, ptBR['panel.gLabel'])
      : inputForLabel(panel(host, ptBR['forces.title'].replace('{id}', 'cunha'))!, ptBR['forces.magnitude'])
    act(() => setNativeInputValue(field, 6))
    flush()
    expect(sceneSelect(host).value).toBe('cena-2')
    expect(replaceScene).toHaveBeenCalledTimes(rebuilds)
    expect(host.textContent).toContain(`passos: ${steps}`)
    expect(findButton(host, ptBR['playback.pause'])).toBeDefined()
    if (quantity === 'g') {
      expect(setGravity).toHaveBeenLastCalledWith(6)
      expect(loadScene(storage(), 'cena-2')!.constants.g).toBe(6)
    } else {
      expect(setForceMagnitude).toHaveBeenLastCalledWith('empurrao', 6)
      expect(loadScene(storage(), 'cena-2')!.forces[0]!.magnitude).toBe(6)
    }
    act(() => frame(200))
    flush()
    expect(Number(host.textContent!.match(/passos: (\d+)/)![1])).toBeGreaterThan(Number(steps))
  })

  it('exporta o doc do preset e duplicar cria cópias com nomes distintos', async () => {
    const host = renderApp()
    await settleSimImport()
    act(() => card(host, 'atwood').click())
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:preset')
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() })
    const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    try {
      act(() => findButton(host, ptBR['scenes.export'])!.click())
      const blob = createObjectURL.mock.calls[0]![0] as Blob
      const json = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.readAsText(blob)
      })
      expect(JSON.parse(json)).toEqual(presetById('atwood')!.buildScene())
      expect(loadIndex(storage())).toHaveLength(1)
      act(() => findButton(host, ptBR['scenes.delete'])!.click())
      expect(loadIndex(storage())).toHaveLength(1)
      for (let n = 2; n <= 3; n++) {
        act(() => findButton(host, ptBR['scenes.duplicate'])!.click())
        expect(sceneSelect(host).value).toBe(`cena-${n}`)
        expect(sceneSelect(host).selectedOptions[0]!.textContent).toBe(t('preset.atwood.name') + (n === 2 ? '' : ' (2)'))
        expect(loadScene(storage(), `cena-${n}`)).toEqual(presetById('atwood')!.buildScene())
        expect(panel(host, ptBR['gallery.title'])).toBeDefined()
        act(() => card(host, 'atwood').click())
      }
    } finally { download.mockRestore() }
  })

  it('flush da cena salva precede abertura; cena em branco continua criando uma cena', async () => {
    vi.useFakeTimers()
    const host = renderApp()
    await settleSimImport()
    expect(loadScene(storage(), 'cena-1')).toEqual(DEMO_SCENE)
    act(() => setNativeInputValue(inputForLabel(host, ptBR['panel.gLabel']), 3))
    expect(loadScene(storage(), 'cena-1')!.constants.g).not.toBe(3)
    await act(async () => { findButton(host, ptBR['playback.play'])!.click() })
    act(() => card(host, 'atwood').click())
    expect(loadScene(storage(), 'cena-1')!.constants.g).toBe(3)
    expect(findButton(host, ptBR['playback.play'])).toBeDefined()
    expect(host.textContent).toContain('passos: 0')
    act(() => findButton(host, ptBR['gallery.blank'])!.click())
    expect(sceneSelect(host).value).toBe('cena-2')
    expect(loadScene(storage(), 'cena-2')).toEqual(blankScene())
    expect(host.textContent).not.toContain(t('preset.readOnlyHint'))
  })

  it('falha ao salvar cópia mantém preset intacto; repetir edição cria só uma cópia', async () => {
    vi.useFakeTimers()
    const host = renderApp()
    await settleSimImport()
    act(() => card(host, 'atwood').click())
    const original = Storage.prototype.setItem
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === INDEX_KEY) throw new Error('quota PHY-62')
      original.call(this, key, value)
    })
    try {
      act(() => setNativeInputValue(inputForLabel(host, ptBR['panel.gLabel']), 5))
      flush()
      expect(sceneSelect(host).value).toBe('preset:atwood')
      act(() => inputForLabel(host, ptBR['panel.gLabel']).dispatchEvent(new FocusEvent('focusout', { bubbles: true })))
      expect(inputForLabel(host, ptBR['panel.gLabel']).value).toBe('9.81')
      expect(loadIndex(storage())).toHaveLength(1)
      expect(loadScene(storage(), 'cena-2')).toBeNull()
      expect(host.textContent).toContain('quota PHY-62')
    } finally { write.mockRestore() }
    act(() => setNativeInputValue(inputForLabel(host, ptBR['panel.gLabel']), 5))
    flush()
    expect(sceneSelect(host).value).toBe('cena-2')
    expect(loadScene(storage(), 'cena-2')!.constants.g).toBe(5)
    expect(loadIndex(storage())).toHaveLength(2)
  })
})


describe('recorded time player (PHY-64)', () => {
  async function setupRecording(kind?: 'spring' | 'rope', bodies: 'dynamic' | 'fixed' | 'empty' = 'dynamic') {
    setLang('pt-BR')
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    let frame!: FrameRequestCallback
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frame = cb; return 1 })
    vi.stubGlobal('cancelAnimationFrame', () => {})
    const scene: Scene = {
      version: 1, constants: { g: 10 }, contacts: [], forces: [
        { id: 'push', bodyId: 'ball', anchor: { x: 0, y: 0 }, magnitude: 3, direction: 0 },
      ],
      bodies: [
        { id: 'wall', shape: 'circle', radius: 0.2, mass: 0, fixed: true, position: { x: 2, y: 4 }, rotation: 0 },
        { id: 'ball', shape: 'circle', radius: 0.5, mass: 1, fixed: false, position: { x: 6, y: 4 }, rotation: 0 },
      ],
    }
    let count = 0
    if (kind) {
      const ends = { a: { bodyId: 'wall', anchor: { x: 0, y: 0 } }, b: { bodyId: 'ball', anchor: { x: 0, y: 0 } } }
      scene.constraints = kind === 'spring'
        ? [{ id: 'link', kind, ...ends, k: 10, x0: 4, c: 0 }]
        : [{ id: 'link', kind, ...ends, via: [] }]
    }
    if (bodies === 'empty') { scene.bodies = []; scene.forces = [] }
    if (bodies === 'fixed') scene.bodies.forEach(b => { b.fixed = true })
    let current = scene
    const step = vi.fn(() => { count++ })
    const replaceScene = vi.fn((doc: Scene) => { current = doc; count = 0 })
    vi.mocked(createSimulator).mockResolvedValue({
      ...makeFakeSimulator(), step, replaceScene,
      readConstraints: () => kind === 'spring'
        ? [{ id: 'link', kind, dx: count / 100, force: { a: count, b: count } }]
        : kind === 'rope' ? [{ id: 'link', kind, tension: count, slack: false, segments: [count] }] : [],
      readStates: () => new Map(current.bodies.map((b) => [b.id, {
        position: { x: b.position.x + (b.fixed ? 0 : count / 100), y: b.position.y },
        rotation: b.rotation, linvel: { x: b.fixed ? 0 : count * count / 60, y: 0 }, angvel: 0,
      }])),
    })
    const { host, canvas } = setupWith(() => {
      const storage = window.localStorage as unknown as PersistStorage
      saveIndex(storage, [{ id: 'recorded', name: 'Recorded', updatedAt: 1 }])
      saveScene(storage, 'recorded', scene)
      saveCurrentSceneId(storage, 'recorded')
    })
    await settleSimImport()
    const slider = () => {
      const input = host.querySelector<HTMLInputElement>('input[type="range"][min="0"]')
      expect(input, 'time slider').not.toBeNull()
      return input!
    }
    const poll = () => act(() => { vi.advanceTimersByTime(100) })
    const seek = (index: number) => { act(() => setNativeInputValue(slider(), index)); poll() }
    const play = async () => { await act(async () => { findButton(host, ptBR['playback.play'])!.click() }) }
    const steps = async (n: number) => {
      for (let i = 0; i < n; i++) await act(async () => { findButton(host, ptBR['playback.step'])!.click() })
      poll()
    }
    return { host, canvas, slider, poll, seek, play, steps, step, replaceScene,
      frame: () => act(() => frame(16)),
      readout: () => panel(host, t('readout.title', { id: 'ball' }))?.textContent ?? '',
    }
  }

  async function setupGraph() {
    const p = await setupRecording()
    act(() => findButton(p.host, ptBR['graph.toggle'])!.click())
    const graph = p.host.querySelector<HTMLCanvasElement>('#recording-graph canvas')!
    const select = p.host.querySelector<HTMLSelectElement>('#recording-graph select')!
    // Offset and CSS scaling deliberately differ from the logical 900px canvas.
    graph.getBoundingClientRect = () => ({ left: 100, top: 700, width: 450, height: 90 } as DOMRect)
    const capture = vi.spyOn(graph, 'setPointerCapture')
    const pointer = (type: string, x: number, buttons = 1) => {
      const event = new MouseEvent(type, { bubbles: true, clientX: 100 + x / 2, clientY: 740, buttons })
      Object.defineProperty(event, 'pointerId', { value: 7 })
      act(() => graph.dispatchEvent(event))
      p.poll()
    }
    return { ...p, graph, select, pointer, capture }
  }

  it('PHY-73 seeks the midpoint to frame 30 and returns to the live tip at the right margin', async () => {
    const p = await setupGraph()
    p.pointer('pointerdown', 900)
    expect(p.slider().value).toBe('0')
    await p.steps(60)
    expect(p.slider().max).toBe('60')
    p.pointer('pointerdown', 470)
    expect(p.slider().value).toBe('30')
    expect(p.host.textContent).toContain('t = 0,50 s')
    expect(p.capture).toHaveBeenCalledWith(7)
    p.pointer('pointerdown', -100)
    expect(p.slider().value).toBe('0')
    p.pointer('pointerdown', 1000)
    expect(p.slider().value).toBe('60')
    await p.steps(1)
    expect(p.slider().value).toBe('61')
    expect(p.step).toHaveBeenCalledTimes(61)
  })

  it('PHY-73 pauses playing on graph press and stays paused after release', async () => {
    const p = await setupGraph()
    await p.steps(60)
    await p.play()
    expect(findButton(p.host, ptBR['playback.pause'])).toBeDefined()
    p.pointer('pointerdown', 470)
    expect(findButton(p.host, ptBR['playback.play'])).toBeDefined()
    p.pointer('pointerup', 470, 0)
    p.frame()
    expect(findButton(p.host, ptBR['playback.play'])).toBeDefined()
    expect(p.slider().value).toBe('30')
    expect(p.step).toHaveBeenCalledTimes(60)
  })

  it('PHY-73 drags through successive indices only while the primary button is held', async () => {
    const p = await setupGraph()
    await p.steps(60)
    p.pointer('pointerdown', 64)
    p.pointer('pointermove', 267)
    expect(p.slider().value).toBe('15')
    p.pointer('pointermove', 673)
    expect(p.slider().value).toBe('45')
    p.pointer('pointerup', 673, 0)
    p.pointer('pointermove', 470, 0)
    expect(p.slider().value).toBe('45')
  })

  it('PHY-73 disables kinematics without a body and keeps energy when a body is reselected', async () => {
    const p = await setupGraph()
    const disabled = () => [...p.select.options].map(o => o.disabled)
    expect(disabled()).toEqual([true, true, true, false, false])
    click(p.canvas, { x: 6, y: 4 })
    expect(disabled()).toEqual([false, false, false, false, false])
    expect(p.select.value).toBe('energy')
    act(() => setSelectValue(p.select, 'velocity'))
    click(p.canvas, { x: 0, y: 8 })
    expect(p.select.value).toBe('energy')
    expect(disabled()).toEqual([true, true, true, false, false])
    click(p.canvas, { x: 6, y: 4 })
    expect(p.select.value).toBe('energy')
    act(() => setSelectValue(p.select, 'momentum'))
    click(p.canvas, { x: 0, y: 8 })
    click(p.canvas, { x: 6, y: 4 })
    expect(p.select.value).toBe('momentum')
  })

  it.each(['fixed', 'empty'] as const)('PHY-71 shows no data for a %s system', async (bodies) => {
    const p = await setupRecording(undefined, bodies)
    p.poll()
    expect(panel(p.host, 'sistema')?.textContent).toContain(ptBR['readout.noData'])
    expect(panel(p.host, 'sistema')?.textContent).not.toContain('E_mec')
  })

  it('CLEAN-30 reads document energy while a t0 structural edit awaits its rebuild', async () => {
    const p = await setupRecording()
    click(p.canvas, { x: 6, y: 4 })
    p.poll()
    expect(p.readout()).toContain('E_pg: 40,00 J')
    act(() => setNativeInputValue(inputForLabel(p.host, ptBR['properties.posY']), 5))
    p.poll()
    expect(p.readout()).toContain('posição: (6,00, 5,00) m')
    expect(p.readout()).toContain('E_pg: 50,00 J')
    expect(panel(p.host, 'sistema')?.textContent).toContain('E_mec: 50,00 J')
    expect(p.replaceScene).not.toHaveBeenCalled()
    await p.steps(1)
    expect(p.readout()).toContain('E_pg: 50,00 J')
  })

  it('PHY-71 localizes body, component and speed readings when language changes', async () => {
    const p = await setupRecording()
    click(p.canvas, { x: 6, y: 4 })
    await p.steps(10)
    expect(p.readout()).toContain('(6,10, 4,00) m')
    expect(p.readout()).toContain('(1,67, 0,00) m/s')
    expect(p.readout()).toContain('(19,00, 0,00) m/s²')
    expect(p.readout()).toContain('1,00×')
    expect(p.readout()).not.toMatch(/\d\.\d/)
    const language = [...p.host.querySelectorAll('select')].find(s => s.querySelector('option[value="en"]'))!
    act(() => setSelectValue(language, 'en'))
    expect(p.readout()).toContain('(6.10, 4.00) m')
    expect(p.readout()).toContain('(1.67, 0.00) m/s')
    expect(p.readout()).toContain('(19.00, 0.00) m/s²')
    expect(p.readout()).toContain('1.00×')
    expect(p.readout()).not.toMatch(/\d,\d/)
  })

  it('PHY-71 shows body energy inside more and system energy without selection', async () => {
    const p = await setupRecording()
    await p.steps(10)
    const system = panel(p.host, 'sistema')!
    expect(system).toBeDefined()
    expect(system.textContent).toContain('E_c: 1,39 J')
    expect(system.textContent).toContain('E_pg: 40,00 J')
    expect(system.textContent).toContain('E_mec: 41,39 J')
    expect(system.querySelector('strong')?.textContent).toContain('E_mec: 41,39 J')
    expect(system.textContent).toContain('|p|: 1,67 kg·m/s')
    expect(system.textContent).not.toContain('E_el')
    expect(system.querySelector('details')?.textContent).toContain('p_x: 1,67 kg·m/s')
    expect(system.querySelector('details')?.textContent).toContain('p_y: 0,00 kg·m/s')
    click(p.canvas, { x: 6.1, y: 4 })
    p.poll()
    const more = panel(p.host, 'leitura — ball')!.querySelector('details')!
    expect(more.textContent).toContain('E_c: 1,39 J')
    expect(more.textContent).toContain('E_pg: 40,00 J')
    expect(more.textContent).toContain('|p|: 1,67 kg·m/s')
    const language = [...p.host.querySelectorAll('select')].find(s => s.querySelector('option[value="en"]'))!
    act(() => setSelectValue(language, 'en'))
    expect(panel(p.host, 'system')?.textContent).toContain('E_mec: 41.39 J')
  })

  it('PHY-71 uses recorded body and spring energy while paused, including frame zero', async () => {
    const p = await setupRecording('spring')
    await p.steps(10)
    const reading = () => panel(p.host, 'sistema')?.textContent ?? ''
    expect(reading()).toContain('E_el: 0,05 J')
    expect(reading()).toContain('E_mec: 41,44 J')
    p.seek(4)
    expect(reading()).toContain('E_c: 0,04 J')
    expect(reading()).toContain('E_el: 0,01 J')
    expect(reading()).toContain('E_mec: 40,04 J')
    expect(reading()).toContain('|p|: 0,27 kg·m/s')
    p.seek(0)
    expect(reading()).toContain('E_c: 0,00 J')
    expect(reading()).toContain('E_mec: 40,00 J')
    p.seek(10)
    expect(reading()).toContain('E_mec: 41,44 J')
    expect(p.step).toHaveBeenCalledTimes(10)
  })

  it('dragging a historical force handle at cursor zero edits the anchor and resets the recording', async () => {
    const p = await setupRecording()
    click(p.canvas, { x: 6, y: 4 })
    await p.steps(3)
    const forces = panel(p.host, t('forces.title', { id: 'ball' }))!
    act(() => setNativeInputValue(inputForLabel(forces, ptBR['forces.anchorX']), 0.4))
    p.seek(0)
    dragTo(p.canvas, { x: 6, y: 4 }, { x: 6, y: 4.5 })
    p.poll()
    const edited = p.replaceScene.mock.calls.at(-1)![0]
    expect(edited.bodies.find(b => b.id === 'ball')!.position).toEqual({ x: 6, y: 4 })
    expect(edited.forces[0]!.anchor).toEqual({ x: 0, y: 0.5 })
    expect(p.slider().max).toBe('0')
  })

  it.each(['button', 'keyboard'] as const)('PHY-66 %s seeks backward from live and recorded play, stopping at zero', async (mode) => {
    const translations: Array<[number, number]> = []
    const ctx = new Proxy({} as Record<PropertyKey, unknown>, {
      get(target, key) {
        if (key === 'clearRect') return () => { translations.length = 0 }
        if (key === 'translate') return (x: number, y: number) => { translations.push([x, y]) }
        if (key === 'measureText') return () => ({ width: 10 })
        return target[key] ?? (() => {})
      },
    })
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => ctx })
    const p = await setupRecording()
    click(p.canvas, { x: 6, y: 4 })
    const backButton = () => findButton(p.host, '⏮ voltar um passo')!
    const back = () => {
      if (mode === 'button') act(() => backButton().click())
      else pressKey('ArrowLeft')
      p.poll()
    }
    expect(backButton()).toBeDefined()
    expect(backButton().title).toBe('voltar um registro da gravação (←)')
    expect(backButton().nextElementSibling).toBe(findButton(p.host, ptBR['playback.step']))
    expect(backButton().disabled).toBe(true)
    back()
    expect(p.slider().value).toBe('0')
    expect(p.step).not.toHaveBeenCalled()
    await p.steps(4)
    await p.play()
    back()
    expect(p.slider().value).toBe('3')
    expect(p.host.textContent).toContain('t = 0,05 s')
    expect(p.readout()).toContain('(6,03, 4,00) m')
    expect(p.readout()).toContain('passos: 3')
    p.frame()
    expect(translations).toContainEqual([expect.closeTo(451.8, 8), 300])
    expect(findButton(p.host, ptBR['playback.play'])).toBeDefined()
    expect(p.step).toHaveBeenCalledTimes(4)
    await p.play()
    back()
    expect(p.slider().value).toBe('2')
    expect(findButton(p.host, ptBR['playback.play'])).toBeDefined()
    back()
    expect(p.slider().value).toBe('1')
    back()
    expect(p.slider().value).toBe('0')
    expect(backButton().disabled).toBe(true)
    await p.play()
    back()
    expect(p.slider().value).toBe('0')
    expect(findButton(p.host, ptBR['playback.pause'])).toBeDefined()
    p.frame()
    p.poll()
    expect(p.slider().value).toBe('1')
    expect(p.step).toHaveBeenCalledTimes(4)
    expect(p.replaceScene).not.toHaveBeenCalled()
  })

  it('PHY-66 lists the left-arrow shortcut with localized text', async () => {
    const p = await setupRecording()
    pressKey('?')
    const row = Array.from(p.host.querySelectorAll('tr')).find((r) => r.cells[0]?.textContent === '←')
    expect(row?.cells[1]?.textContent).toBe('voltar um passo')
  })

  it('records each 2x step and seeks poses, velocities and per-step acceleration without rewinding physics', async () => {
    const p = await setupRecording()
    click(p.canvas, { x: 6, y: 4 })
    expect(p.slider().max).toBe('0')
    act(() => setNativeInputValue(p.host.querySelector<HTMLInputElement>('input[type="range"][min="0.25"]')!, 2))
    await p.play()
    for (let i = 0; i < 101; i++) p.frame()
    p.poll()
    expect(p.slider().max).toBe('202')
    p.seek(10)
    expect(p.readout()).toContain('passos: 10')
    expect(p.readout()).toContain('(6,10, 4,00) m')
    expect(p.readout()).toContain('(1,67, 0,00) m/s')
    expect(p.readout()).toContain('(19,00, 0,00) m/s²')
    p.seek(200)
    expect(p.readout()).toContain('(8,00, 4,00) m')
    expect(p.readout()).toContain('(399,00, 0,00) m/s²')
    expect(p.host.textContent).toContain('t = 3,33 s')
    // Hit-testing uses the same projected bodies as paint; the historical pose is selectable.
    click(p.canvas, { x: 11, y: 7 })
    click(p.canvas, { x: 8, y: 4 })
    expect(panel(p.host, 'ball')).toBeDefined()
    p.frame()
    expect(p.step).toHaveBeenCalledTimes(202)
    expect(findButton(p.host, ptBR['playback.play'])).toBeDefined()
    p.seek(0)
    p.seek(202)
    expect(p.readout()).toContain('(8,02, 4,00) m')
    expect(p.slider().max).toBe('202')
    expect(p.replaceScene).not.toHaveBeenCalled()
    p.seek(10)
    await p.steps(1)
    expect(p.readout()).toContain('passos: 11')
    expect(p.slider().value).toBe('11')
    p.seek(10)
    await p.play()
    p.frame()
    p.poll()
    expect(p.step).toHaveBeenCalledTimes(202)
    expect(p.slider().value).toBe('12')
  })

  it.each([1, 0.5])('PHY-65 replay at %sx paints recorded frames, pauses and resumes live without a jump', async (speed) => {
    const translations: Array<[number, number]> = []
    const ctx = new Proxy({} as Record<PropertyKey, unknown>, {
      get(target, key) {
        if (key === 'clearRect') return () => { translations.length = 0 }
        if (key === 'translate') return (x: number, y: number) => { translations.push([x, y]) }
        if (key === 'measureText') return () => ({ width: 10 })
        return target[key] ?? (() => {})
      },
    })
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => ctx })
    const p = await setupRecording()
    click(p.canvas, { x: 6, y: 4 })
    await p.steps(4)
    p.seek(0)
    act(() => setNativeInputValue(p.host.querySelector<HTMLInputElement>('input[type="range"][min="0.25"]')!, speed))
    await p.play()
    expect(p.slider().value).toBe('0')
    for (const index of [1, 2]) {
      if (speed === 0.5) {
        p.frame()
        p.poll()
        expect(p.slider().value).toBe(String(index - 1))
      }
      p.frame()
      p.poll()
      expect(p.slider().value).toBe(String(index))
      expect(p.slider().max).toBe('4')
      expect(p.step).toHaveBeenCalledTimes(4)
      expect(p.readout()).toContain(index === 1 ? '(6,01, 4,00) m' : '(6,02, 4,00) m')
      expect(p.host.textContent).toContain(index === 1 ? 't = 0,02 s' : 't = 0,03 s')
      expect(translations).toContainEqual([expect.closeTo(index === 1 ? 450.6 : 451.2, 8), 300])
    }
    act(() => findButton(p.host, ptBR['playback.pause'])!.click())
    p.frame()
    p.poll()
    expect(p.slider().value).toBe('2')
    expect(p.step).toHaveBeenCalledTimes(4)
    await p.play()
    for (let i = 0; i < 2 / speed; i++) p.frame()
    p.poll()
    expect(p.slider().value).toBe('4')
    expect(p.readout()).toContain('(6,04, 4,00) m')
    expect(p.step).toHaveBeenCalledTimes(4)
    for (let i = 0; i < 1 / speed; i++) p.frame()
    p.poll()
    expect(p.slider().max).toBe('5')
    expect(p.slider().value).toBe('5')
    expect(p.readout()).toContain('(6,05, 4,00) m')
    expect(p.readout()).toContain('(9,00, 0,00) m/s²')
    expect(p.step).toHaveBeenCalledTimes(5)
    expect(p.replaceScene).not.toHaveBeenCalled()
  })

  it('PHY-65 single-step follows records and unlocks live fields and both history actions at the tip', async () => {
    const p = await setupRecording()
    click(p.canvas, { x: 6, y: 4 })
    const gravity = () => inputForLabel(p.host, ptBR['panel.gLabel'])
    act(() => setNativeInputValue(gravity(), 12))
    act(() => setNativeInputValue(gravity(), 15))
    act(() => findButton(p.host, '↶')!.click())
    await p.steps(3)
    p.seek(1)
    const force = () => inputForLabel(panel(p.host, t('forces.title', { id: 'ball' }))!, ptBR['forces.magnitude'])
    await p.steps(1)
    expect(p.slider().value).toBe('2')
    expect(p.readout()).toContain('(6,02, 4,00) m')
    expect(p.step).toHaveBeenCalledTimes(3)
    for (const control of [gravity(), force(), findButton(p.host, '↶')!, findButton(p.host, '↷')!]) expect(control.disabled).toBe(true)
    await p.steps(1)
    expect(p.slider().value).toBe('3')
    expect(p.readout()).toContain('(6,03, 4,00) m')
    expect(p.step).toHaveBeenCalledTimes(3)
    for (const control of [gravity(), force(), findButton(p.host, '↶')!, findButton(p.host, '↷')!]) expect(control.disabled).toBe(false)
    // The frame path must update React locks too, without a discrete action at the tip.
    p.seek(1)
    await p.play()
    p.frame()
    expect(gravity().disabled).toBe(true)
    p.frame()
    p.poll()
    for (const control of [gravity(), force(), findButton(p.host, '↶')!, findButton(p.host, '↷')!]) expect(control.disabled).toBe(false)
  })

  it('PHY-65 spends only surplus 2x credit in the live world and restores live acceleration first', async () => {
    const p = await setupRecording()
    click(p.canvas, { x: 6, y: 4 })
    await p.steps(4)
    p.seek(3)
    act(() => setNativeInputValue(p.host.querySelector<HTMLInputElement>('input[type="range"][min="0.25"]')!, 2))
    await p.play()
    p.frame()
    p.poll()
    expect(p.step).toHaveBeenCalledTimes(5)
    expect(p.slider().value).toBe('5')
    expect(p.readout()).toContain('(6,05, 4,00) m')
    expect(p.readout()).toContain('(9,00, 0,00) m/s²')
  })

  it.each(['play', 'step'] as const)('PHY-77 capped replay pauses at the last recorded pose via %s', async (mode) => {
    const p = await setupRecording()
    click(p.canvas, { x: 6, y: 4 })
    await p.play()
    for (let i = 0; i < 610; i++) p.frame()
    p.poll()
    p.seek(597)
    if (mode === 'play') { await p.play(); p.frame(); p.poll() }
    else await p.steps(1)
    expect(p.slider().value).toBe('598')
    expect(p.readout()).toContain('(11,98, 4,00) m')
    expect(p.step).toHaveBeenCalledTimes(599)
    if (mode === 'play') { p.frame(); p.poll() }
    else await p.steps(1)
    expect(p.slider().value).toBe('599')
    expect(p.slider().max).toBe('599')
    expect(p.readout()).toContain('(11,99, 4,00) m')
    expect(p.readout()).toContain('passos: 599')
    expect(p.host.textContent).toContain('t = 9,98 s')
    expect(findButton(p.host, ptBR['playback.play'])!.disabled).toBe(true)
    expect(p.step).toHaveBeenCalledTimes(599)
  })
  it('PHY-77 pauses when full with the slider, clock and step count at the last record', async () => {
    const p = await setupRecording()
    click(p.canvas, { x: 6, y: 4 })
    await p.play()
    for (let i = 0; i < 610; i++) p.frame()
    p.poll()
    expect(p.step).toHaveBeenCalledTimes(599)
    expect(p.slider().max).toBe('599')
    expect(p.slider().value).toBe('599')
    expect(p.readout()).toContain('(11,99, 4,00) m')
    expect(p.readout()).toContain('passos: 599')
    expect(p.host.textContent).toContain('t = 9,98 s')
    expect(findButton(p.host, ptBR['playback.play'])).toBeDefined()
    expect(p.host.textContent).toContain('gravação cheia (10 s) — reinicie')
    const language = p.host.querySelector<HTMLSelectElement>('select:has(option[value="en"])')!
    act(() => setSelectValue(language, 'en'))
    expect(p.host.textContent).toContain('recording full (10 s) — reset')
  })

  it('PHY-77 blocks full-tip buttons and keyboard steps while keeping recorded navigation available', async () => {
    const p = await setupRecording()
    click(p.canvas, { x: 6, y: 4 })
    await p.play()
    for (let i = 0; i < 610; i++) p.frame()
    p.poll()
    const play = findButton(p.host, ptBR['playback.play'])!
    const step = findButton(p.host, ptBR['playback.step'])!
    expect(play?.disabled).toBe(true)
    expect(step.disabled).toBe(true)
    act(() => { play.click(); step.click() })
    await act(async () => { pressKey(' '); pressKey('ArrowRight') })
    expect(p.step).toHaveBeenCalledTimes(599)
    expect(findButton(p.host, ptBR['playback.play'])?.disabled).toBe(true)
    p.frame()
    p.poll()
    expect(p.step).toHaveBeenCalledTimes(599)
    expect(p.slider().value).toBe('599')
    expect(findButton(p.host, ptBR['playback.play'])!.disabled).toBe(true)
    const back = findButton(p.host, ptBR['playback.stepBack'])!
    expect(back.disabled).toBe(false)
    expect(p.slider().disabled).toBe(false)
    act(() => back.click())
    p.poll()
    expect(p.slider().value).toBe('598')
    expect(findButton(p.host, ptBR['playback.play'])!.disabled).toBe(false)
    expect(step.disabled).toBe(false)
    p.seek(10)
    expect(p.readout()).toContain('(6,10, 4,00) m')
    expect(p.host.textContent).toContain('gravação cheia (10 s) — reinicie')
    expect(p.step).toHaveBeenCalledTimes(599)
  })

  it('PHY-77 replays a full recording from 590 and pauses again without new physics steps', async () => {
    const p = await setupRecording()
    await p.play()
    for (let i = 0; i < 610; i++) p.frame()
    p.poll()
    p.seek(590)
    await p.play()
    p.frame()
    p.poll()
    expect(p.slider().value).toBe('591')
    expect(findButton(p.host, ptBR['playback.pause'])).toBeDefined()
    for (let i = 0; i < 20; i++) p.frame()
    p.poll()
    expect(p.slider().value).toBe('599')
    expect(findButton(p.host, ptBR['playback.play'])!.disabled).toBe(true)
    expect(p.step).toHaveBeenCalledTimes(599)
  })

  it('PHY-77 reset clears the full warning and enables recording a new run', async () => {
    const p = await setupRecording()
    await p.play()
    for (let i = 0; i < 610; i++) p.frame()
    p.poll()
    expect(p.host.textContent).toContain('gravação cheia (10 s) — reinicie')
    expect(findButton(p.host, ptBR['playback.reset'])!.disabled).toBe(false)
    act(() => findButton(p.host, ptBR['playback.reset'])!.click())
    p.poll()
    expect(p.host.textContent).not.toContain('gravação cheia (10 s) — reinicie')
    expect(p.slider().max).toBe('0')
    expect(p.slider().value).toBe('0')
    expect(findButton(p.host, ptBR['playback.play'])!.disabled).toBe(false)
    expect(findButton(p.host, ptBR['playback.step'])!.disabled).toBe(false)
    expect(p.step).toHaveBeenCalledTimes(599)
    await p.play()
    p.frame()
    p.poll()
    expect(p.step).toHaveBeenCalledTimes(600)
    expect(p.slider().max).toBe('1')
    expect(p.slider().value).toBe('1')
  })

  it('blocks live fields, history and force anchor drags while inspecting an old step', async () => {
    const p = await setupRecording()
    click(p.canvas, { x: 6, y: 4 })
    const gravity = () => inputForLabel(p.host, ptBR['panel.gLabel'])
    act(() => setNativeInputValue(gravity(), 12))
    act(() => setNativeInputValue(gravity(), 15))
    act(() => findButton(p.host, '↶')!.click())
    await p.steps(3)
    p.seek(1)
    const forces = panel(p.host, t('forces.title', { id: 'ball' }))!
    for (const input of [gravity(), inputForLabel(forces, ptBR['forces.magnitude']), inputForLabel(forces, ptBR['forces.direction'])]) {
      expect(input.disabled).toBe(true)
      expect(input.title).toBe('Volte ao fim da gravação para editar')
    }
    expect(findButton(p.host, '↶')!.disabled).toBe(true)
    expect(findButton(p.host, '↷')!.disabled).toBe(true)
    pressKey('z', { ctrlKey: true })
    pressKey('y', { ctrlKey: true })
    expect(gravity().value).toBe('12')
    dragTo(p.canvas, { x: 6.01, y: 4 }, { x: 6.4, y: 4.3 })
    expect(inputForLabel(forces, ptBR['forces.anchorX']).value).toBe('0')
    expect(inputForLabel(forces, ptBR['forces.anchorY']).value).toBe('0')
    p.seek(3)
    expect(gravity().disabled).toBe(false)
    act(() => setNativeInputValue(gravity(), 20))
    expect(gravity().value).toBe('20')
    expect(p.slider().max).toBe('3')
  })

  it.each(['structure', 'gravity'] as const)('editing %s at cursor zero replaces the initial record and resets physics', async (edit) => {
    const p = await setupRecording()
    await p.steps(3)
    p.seek(0)
    expect(findButton(p.host, ptBR['palette.circle'])!.disabled).toBe(false)
    if (edit === 'structure') act(() => findButton(p.host, ptBR['palette.circle'])!.click())
    else act(() => setNativeInputValue(inputForLabel(p.host, ptBR['panel.gLabel']), 20))
    p.poll()
    expect(p.slider().max).toBe('0')
    expect(p.slider().value).toBe('0')
    expect(p.host.textContent).toContain('passos: 0')
    expect(p.replaceScene).toHaveBeenCalled()
    const edited = p.replaceScene.mock.calls.at(-1)![0]
    if (edit === 'structure') expect(edited.bodies).toHaveLength(3)
    else expect(edited.constants.g).toBe(20)
    await p.steps(2)
    p.seek(0)
    expect(p.host.textContent).toContain('passos: 0')
    expect(p.slider().max).toBe('2')
  })

  it('refreshes record zero after a pre-step structural edit and clears history on reset and scene switch', async () => {
    const p = await setupRecording()
    click(p.canvas, { x: 6, y: 4 })
    dragTo(p.canvas, { x: 6.2, y: 4.2 }, { x: 7.2, y: 4.2 })
    await p.steps(2)
    p.seek(0)
    expect(p.readout()).toContain('(7,00, 4,00) m')
    act(() => findButton(p.host, ptBR['playback.reset'])!.click())
    p.poll()
    expect(p.slider().max).toBe('0')
    expect(p.host.textContent).toContain('passos: 0')
    await p.steps(2)
    p.seek(1)
    act(() => findButton(p.host, ptBR['scenes.duplicate'])!.click())
    p.poll()
    expect(p.slider().max).toBe('0')
    expect(p.host.textContent).toContain('passos: 0')
    expect(findButton(p.host, ptBR['palette.circle'])!.disabled).toBe(false)
  })

  it.each(['spring', 'rope'] as const)('reads the recorded %s instead of the live constraint', async (kind) => {
    const p = await setupRecording(kind)
    await p.steps(4)
    p.seek(1)
    click(p.canvas, { x: 4, y: 4 })
    p.poll()
    const reading = () => panel(p.host, t('readout.title', { id: 'link' }))?.textContent ?? ''
    expect(reading()).toContain(kind === 'spring' ? 'F_el: 1,00 N' : 'T: 1,00 N')
    if (kind === 'spring') expect(reading()).toContain('Δx: 0,010 m')
    p.seek(4)
    expect(reading()).toContain(kind === 'spring' ? 'F_el: 4,00 N' : 'T: 4,00 N')
  })

  it('paints the historical body pose and localizes the time label', async () => {
    const translations: Array<[number, number]> = []
    const ctx = new Proxy({} as Record<PropertyKey, unknown>, {
      get(target, key) {
        if (key === 'clearRect') return () => { translations.length = 0 }
        if (key === 'translate') return (x: number, y: number) => { translations.push([x, y]) }
        if (key === 'measureText') return () => ({ width: 10 })
        return target[key] ?? (() => {})
      },
    })
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => ctx })
    const p = await setupRecording()
    await p.steps(5)
    p.seek(1)
    expect(translations).toContainEqual([expect.closeTo(450.6, 8), 300])
    expect(translations).not.toContainEqual([453, 300])
    expect(p.host.textContent).toContain('t = 0,02 s')
    const language = [...p.host.querySelectorAll('select')].find((select) => select.querySelector('option[value="en"]'))!
    act(() => setSelectValue(language, 'en'))
    expect(p.host.textContent).toContain('t = 0.02 s')
  })


  it('keeps recorded force vectors when gravity and force change later at the live tip', async () => {
    let path: number[][] = []
    const arrows: Array<{ color: unknown; path: number[][] }> = []
    const ctx = new Proxy({} as Record<PropertyKey, unknown>, {
      get(target, key) {
        if (key === 'clearRect') return () => { arrows.length = 0 }
        if (key === 'beginPath') return () => { path = [] }
        if (key === 'moveTo' || key === 'lineTo') return (...point: number[]) => { path.push(point) }
        if (key === 'stroke') return () => {
          if (target.strokeStyle === '#d97742' || target.strokeStyle === '#2e7d32') arrows.push({ color: target.strokeStyle, path })
        }
        if (key === 'measureText') return () => ({ width: 10 })
        return target[key] ?? (() => {})
      },
    })
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => ctx })
    const p = await setupRecording()
    click(p.canvas, { x: 6, y: 4 })
    await p.steps(1)
    const recorded = structuredClone(arrows)
    expect(recorded).toHaveLength(2)
    const forces = panel(p.host, t('forces.title', { id: 'ball' }))!
    act(() => setNativeInputValue(inputForLabel(forces, ptBR['forces.magnitude']), 30))
    act(() => setNativeInputValue(inputForLabel(p.host, ptBR['panel.gLabel']), 5))
    await p.steps(1)
    expect(arrows).not.toEqual(recorded)
    p.seek(1)
    expect(arrows).toEqual(recorded)
  })

})
