import { describe, expect, it } from 'vitest'
import { withBrowserSession } from './test/browser'
import { makeTransform, pixelsPerMeterForWidth, screenToWorld } from './render/transform'

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

describe('canvas nunca sobrepõe o inspetor nem vaza do viewport (PHY-20)', () => {
  // jsdom does no real layout, so App.test.ts can only check that stacking
  // flips the right CSS properties. Whether the stacked layout actually avoids
  // overlap needs a layout engine — measured here in Chromium.
  type Box = { left: number; right: number; top: number; bottom: number }
  const intersects = (a: Box, b: Box): boolean => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  const measure = (width: number) => withBrowserSession(width, 25000, async (session) => {
    await session.reset()
    return session.evaluate<{ canvas: Box; inspector: Box; innerWidth: number }>(
      "(() => { const canvas = document.querySelector('canvas'); " +
      "const row = canvas.parentElement.parentElement.parentElement; " +
      "return { canvas: canvas.getBoundingClientRect().toJSON(), " +
      "inspector: row.children[1].getBoundingClientRect().toJSON(), innerWidth: window.innerWidth }; })()",
    )
  })

  it.each([1400, 950, 900, 700])('canvas cabe inteiramente na viewport e não sobrepõe o inspetor em %ipx', async (width) => {
    const { canvas, inspector, innerWidth } = await measure(width)
    expect(intersects(canvas, inspector)).toBe(false)
    expect(canvas.left).toBeGreaterThanOrEqual(0)
    expect(canvas.right).toBeLessThanOrEqual(innerWidth)
  }, 30000)

  // Below ~632px (CANVAS_MIN_WIDTH plus main's horizontal padding) no column
  // layout can hold the 600px floor, and the floor is out of this ticket's
  // scope. The canvas legitimately spills past the right edge there
  // (reachable by scrolling). What must still hold: never spills left, never
  // overlaps the inspector. Criterion 3 was reworded to this on 2026-09-15.
  it.each([600, 360])('abaixo do piso o canvas nunca sobrepõe o inspetor nem vaza pela esquerda em %ipx', async (width) => {
    const { canvas, inspector } = await measure(width)
    expect(intersects(canvas, inspector)).toBe(false)
    expect(canvas.left).toBeGreaterThanOrEqual(0)
  }, 30000)
})

describe('preferred canvas size (PHY-63)', () => {
  type Session = import('./test/browser').BrowserSession
  const settle = (session: Session) => session.evaluate<void>(`new Promise(resolve => {
    let frames = 0; const tick = () => ++frames === 20 ? resolve() : requestAnimationFrame(tick); tick();
  })`)
  const dragHandle = async (session: Session, delta: number) => {
    const rect = await session.rect()
    const handle = await session.evaluate<{ x: number; y: number }>(`(() => {
      const el = document.querySelector('[title="Redimensionar canvas"]');
      if (!el) throw new Error('missing resize handle');
      const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`)
    const scale = pixelsPerMeterForWidth(rect.width - 2)
    const transform = makeTransform({ centerX: 6, centerY: 4, pixelsPerMeter: scale }, rect.width - 2, rect.height - 2)
    const from = screenToWorld(transform, handle.x - rect.left, handle.y - rect.top)
    await session.drag(from, { x: from.x + delta / scale, y: from.y })
    await settle(session)
  }
  const geometry = (session: Session) => session.evaluate<{ width: number; height: number; logicalWidth: number; logicalHeight: number }>(`(() => {
    const c = document.querySelector('canvas'), r = c.getBoundingClientRect();
    return { width: r.width - 2, height: r.height - 2, logicalWidth: c.width / devicePixelRatio, logicalHeight: c.height / devicePixelRatio };
  })()`)

  it('resizes the recording graph with the scene canvas (PHY-72)', async () => {
    await withBrowserSession(1920, 25000, async session => {
      await session.reset()
      await session.evaluate(`(() => {
        const button = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'gráfico');
        if (!button) throw new Error('missing graph toggle'); button.click();
      })()`)
      await settle(session)
      const measure = () => session.evaluate<{ width: number; height: number; sceneWidth: number }>(`(() => {
        const graph = document.querySelector('canvas[role="img"]');
        const scene = document.querySelector('canvas');
        const r = graph.getBoundingClientRect();
        return { width: r.width, height: r.height, sceneWidth: parseFloat(getComputedStyle(scene).width) };
      })()`)
      const before = await measure()
      expect(before.width).toBe(before.sceneWidth)
      expect(before.height).toBe(180)
      await dragHandle(session, -180)
      const after = await measure()
      expect(after.width).toBe(after.sceneWidth)
      expect(after.width).toBe(before.width - 180)
      expect(after.height).toBe(180)
    })
  }, 30000)

  it('drags the real corner handle with matching logical geometry and clamps both extremes', async () => {
    await withBrowserSession(1920, 25000, async session => {
      await session.reset()
      const auto = await geometry(session)
      await dragHandle(session, -180)
      const smaller = await geometry(session)
      expect(smaller.width).toBe(auto.width - 180)
      expect(smaller.width / smaller.height).toBe(1.5)
      expect(smaller.logicalWidth).toBe(smaller.width)
      expect(smaller.logicalHeight).toBe(smaller.height)
      await dragHandle(session, -3000)
      expect(await geometry(session)).toEqual({ width: 402, height: 268, logicalWidth: 402, logicalHeight: 268 })
      await dragHandle(session, 3000)
      expect(await geometry(session)).toEqual(auto)
    })
  }, 30000)

  it('keeps bodies, selection and undo unchanged and exposes a translated resize cursor', async () => {
    await withBrowserSession(1920, 25000, async session => {
      await session.reset()
      await session.select(9, 3)
      const position = await session.readBoxPosition()
      const selection = await session.selectedLegends()
      const readUndo = () => session.evaluate<boolean>('document.querySelector(\'[title="desfazer (Ctrl+Z)"]\').disabled')
      expect(await readUndo()).toBe(true)
      await dragHandle(session, -180)
      expect(await session.readBoxPosition()).toEqual(position)
      expect(await session.selectedLegends()).toEqual(selection)
      expect(await readUndo()).toBe(true)
      expect(await session.evaluate<string>('getComputedStyle(document.querySelector(\'[title="Redimensionar canvas"]\')).cursor')).toBe('nwse-resize')
      await session.evaluate(`document.querySelector('select:has(option[value="en"])').value = 'en'; document.querySelector('select:has(option[value="en"])').dispatchEvent(new Event('change', { bubbles: true }))`)
      await settle(session)
      expect(await session.evaluate<boolean>('Boolean(document.querySelector(\'[title="Resize canvas"]\'))')).toBe(true)
    })
  }, 30000)

  it('loads a dragged preference in a fresh page and restores it after its viewport shrinks', async () => {
    await withBrowserSession(1920, 25000, async session => {
      await session.reset()
      const auto = await geometry(session)
      await dragHandle(session, 900 - auto.width)
      expect((await geometry(session)).width).toBe(900)
      // A fresh same-origin page reads the saved choice. Its iframe gives this
      // app a real resizable window without changing the shared CDP harness.
      await session.evaluate(`new Promise(resolve => {
        const f = document.createElement('iframe'); f.id = 'resized-page';
        f.style.cssText = 'width:1920px;height:1080px;border:0';
        f.onload = () => resolve(); f.src = location.href; document.body.append(f);
      })`)
      const frameWidth = () => session.evaluate<number>(`document.querySelector('#resized-page').contentDocument.querySelector('canvas').getBoundingClientRect().width - 2`)
      await settle(session)
      expect(await frameWidth()).toBe(900)
      await session.evaluate(`document.querySelector('#resized-page').style.width = '1000px'`)
      await settle(session)
      expect(await frameWidth()).toBeLessThan(900)
      await session.evaluate(`document.querySelector('#resized-page').style.width = '1920px'`)
      await settle(session)
      expect(await frameWidth()).toBe(900)
      await session.evaluate(`new Promise(resolve => {
        const f = document.querySelector('#resized-page'); f.onload = () => resolve(); f.contentWindow.location.reload();
      })`)
      await settle(session)
      expect(await frameWidth()).toBe(900)
    })
  }, 30000)
})
