// @vitest-environment jsdom

import { createElement } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from './App'

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
