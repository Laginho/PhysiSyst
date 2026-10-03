import { describe, expect, it } from 'vitest'
import { scenePath } from '../scene'
import type { Body, RopePath, Scene } from '../scene'
import type { ConstraintState } from '../sim'
import { drawArrow, drawScene, massLabels } from './draw'
import { makeTransform } from './transform'

const PPM = 60
const CAMERA = { centerX: 6, centerY: 4, pixelsPerMeter: PPM }

function makeBody(id: string, shape: Body['shape'], fixed = false): Body {
  const common = { id, fixed, mass: fixed ? 0 : 1, position: { x: 6, y: 4 }, rotation: 0 }
  if (shape === 'rectangle') return { ...common, shape, width: 1.5, height: 1 }
  if (shape === 'circle') return { ...common, shape, radius: 0.75 }
  return { ...common, shape, base: 3, alpha: 30 }
}

function sceneWith(bodies: Body[]): Scene {
  return { version: 1, constants: { g: 9.81 }, bodies, forces: [], contacts: [] }
}

describe('massLabels (derived from the Scene on every render, never stored)', () => {
  it('Triangle -> M; rectangle/circle -> m', () => {
    expect(massLabels(sceneWith([makeBody('t', 'triangle')])).get('t')).toBe('M')
    expect(massLabels(sceneWith([makeBody('r', 'rectangle')])).get('r')).toBe('m')
    expect(massLabels(sceneWith([makeBody('c', 'circle')])).get('c')).toBe('m')
  })

  it('collision within a letter class gets distinct subscripts in creation order', () => {
    const labels = massLabels(
      sceneWith([makeBody('r1', 'rectangle'), makeBody('r2', 'rectangle'), makeBody('c1', 'circle'), makeBody('t1', 'triangle'), makeBody('t2', 'triangle')]),
    )
    expect(labels.get('r1')).toBe('m_a')
    expect(labels.get('r2')).toBe('m_b')
    expect(labels.get('c1')).toBe('m_c')
    expect(labels.get('t1')).toBe('M_a')
    expect(labels.get('t2')).toBe('M_b')
  })

  it('sole member of a letter class carries the bare symbol', () => {
    const labels = massLabels(sceneWith([makeBody('t', 'triangle'), makeBody('r', 'rectangle')]))
    expect(labels.get('t')).toBe('M')
    expect(labels.get('r')).toBe('m')
  })

  it('deleting a body re-flows labels: survivors never share a symbol', () => {
    const trio = sceneWith([makeBody('a', 'rectangle'), makeBody('b', 'rectangle'), makeBody('c', 'rectangle')])
    expect(massLabels(trio).get('c')).toBe('m_c')
    const afterDelete = sceneWith([makeBody('a', 'rectangle'), makeBody('c', 'rectangle')])
    const relabeled = massLabels(afterDelete)
    expect(relabeled.get('a')).toBe('m_a')
    expect(relabeled.get('c')).toBe('m_b')
    const loneSurvivor = massLabels(sceneWith([makeBody('t2', 'triangle')]))
    expect(loneSurvivor.get('t2')).toBe('M')
  })

  it('fixed bodies carry no label', () => {
    const labels = massLabels(sceneWith([makeBody('chao', 'rectangle', true), makeBody('r', 'rectangle')]))
    expect([...labels.keys()]).toEqual(['r'])
  })
})

type LogEntry = { kind: 'call' | 'set'; name: string; args?: unknown[]; value?: unknown }

/** Records every method call and property assignment without needing a real canvas. */
function recordingCtx(widths: Record<string, number> = {}): { ctx: CanvasRenderingContext2D; log: LogEntry[] } {
  const log: LogEntry[] = []
  const proxy = new Proxy({} as Record<PropertyKey, unknown>, {
    get(_t, name) {
      return (...args: unknown[]) => {
        log.push({ kind: 'call', name: String(name), args })
        if (name === 'measureText') return { width: widths[String(args[0])] ?? 10 }
      }
    },
    set(_t, name, value) {
      log.push({ kind: 'set', name: String(name), value })
      return true
    },
  })
  return { ctx: proxy as unknown as CanvasRenderingContext2D, log }
}

const callsOf = (log: LogEntry[], name: string) => log.filter((e) => e.kind === 'call' && e.name === name)
const setsOf = (log: LogEntry[], name: string) => log.filter((e) => e.kind === 'set' && e.name === name).map((e) => e.value)

/** True when fillText would execute with a scale() in the ACTIVE transform (simulated save/restore/scale stack). */
function scaledAtFillText(log: LogEntry[]): boolean {
  const stack: boolean[] = [false]
  for (const e of log) {
    if (e.kind !== 'call') continue
    if (e.name === 'save') stack.push(stack.at(-1)!)
    else if (e.name === 'restore') stack.pop()
    else if (e.name === 'scale') stack[stack.length - 1] = true
    else if (e.name === 'fillText') return stack.at(-1) ?? false
  }
  return false
}

describe('textbook rendering (drawScene)', () => {
  it('dynamic body: white fill, black stroke, no dashed border', () => {
    const { ctx, log } = recordingCtx()
    drawScene(ctx, sceneWith([makeBody('r', 'rectangle')]), CAMERA, 900, 600)
    expect(setsOf(log, 'fillStyle')).toContain('#ffffff')
    expect(setsOf(log, 'fillStyle')).not.toContain('#4a90d9')
    expect(setsOf(log, 'strokeStyle')).toContain('#000000')
    expect(callsOf(log, 'setLineDash')).toHaveLength(0)
  })

  it('mass label drawn inside the dynamic body, under its own unscaled transform', () => {
    const { ctx, log } = recordingCtx()
    drawScene(ctx, sceneWith([makeBody('r', 'rectangle')]), CAMERA, 900, 600)
    const texts = callsOf(log, 'fillText').map((e) => e.args![0])
    expect(texts).toEqual(['m'])
    expect(scaledAtFillText(log)).toBe(false)
  })

  it('Triangle label is M, anchored inside the triangle (centroid), upright in pixels', () => {
    const { ctx, log } = recordingCtx()
    drawScene(ctx, sceneWith([makeBody('t', 'triangle')]), CAMERA, 900, 600)
    const fillCalls = callsOf(log, 'fillText')
    expect(fillCalls).toHaveLength(1)
    expect(fillCalls[0]!.args![0]).toBe('M')
    const translates = callsOf(log, 'translate')
    const [lx, ly] = translates.at(-1)!.args!
    const h = 3 * Math.tan((30 * Math.PI) / 180)
    expect(lx).toBeCloseTo(450 + ((2 * 3) / 3) * PPM, 6)
    expect(ly).toBeCloseTo(300 - (h / 3) * PPM, 6)
    const textAligns = setsOf(log, 'textAlign')
    expect(textAligns.at(-1)).toBe('center')
  })

  it('fixed body keeps the hatched treatment and dashed border, shows no label', () => {
    const { ctx, log } = recordingCtx()
    drawScene(ctx, sceneWith([makeBody('chao', 'rectangle', true)]), CAMERA, 900, 600)
    expect(callsOf(log, 'setLineDash').length).toBeGreaterThan(0)
    expect(callsOf(log, 'lineTo').length).toBeGreaterThan(0)
    expect(callsOf(log, 'fillText')).toHaveLength(0)
  })

  it('mixed scene: exactly one label per dynamic body, none for fixed', () => {
    const { ctx, log } = recordingCtx()
    drawScene(ctx, sceneWith([makeBody('chao', 'rectangle', true), makeBody('r', 'rectangle'), makeBody('t', 'triangle')]), CAMERA, 900, 600)
    const texts = callsOf(log, 'fillText').map((e) => e.args![0])
    expect(texts).toEqual(['m', 'M'])
  })
})

describe('drawScene, rope path (PHY-56)', () => {
  // Pulley of radius 0.5 centered (6, 6) on the fixed ceiling; blocks hang at x = 5.5 and 6.5, so the legs touch the pulley at y = 6.
  const CENTER = { x: 6, y: 6 }
  const scene: Scene = {
    ...sceneWith([
      { ...makeBody('teto', 'rectangle', true), position: { x: 6, y: 6 } },
      { ...makeBody('a', 'rectangle'), position: { x: 5.5, y: 2 } },
      { ...makeBody('b', 'rectangle'), position: { x: 6.5, y: 2 } },
    ]),
    pulleys: [{ id: 'p', bodyId: 'teto', anchor: { x: 0, y: 0 }, radius: 0.5 }],
    constraints: [
      { id: 'corda', kind: 'rope', a: { bodyId: 'a', anchor: { x: 0, y: 0 } }, b: { bodyId: 'b', anchor: { x: 0, y: 0 } }, via: ['p'] },
    ],
  }
  const rope = scene.constraints![0] as Extract<NonNullable<Scene['constraints']>[number], { kind: 'rope' }>

  const draw = (constraints?: readonly ConstraintState[]) => {
    const { ctx, log } = recordingCtx()
    drawScene(ctx, scene, CAMERA, 900, 600, { readings: constraints })
    return log
  }
  // The scene without its rope draws everything but the rope, so the rope's calls are what the full log has on top, before the closing restore.
  const baseline = (() => {
    const { ctx, log } = recordingCtx()
    drawScene(ctx, { ...scene, constraints: [] }, CAMERA, 900, 600, { readings: [] })
    return log.length
  })()
  const ropeLog = (log: LogEntry[]) => log.slice(baseline - 1, -1)

  const stateOf = (path: RopePath): ConstraintState => ({ id: 'corda', kind: 'rope', tension: 5, slack: false, segments: [5, 5], path })
  const arcsOf = (log: LogEntry[]) => callsOf(log, 'arc').map((e) => e.args as number[])

  const handPath = (sweep: number, direction: 1 | -1): RopePath => ({
    segments: [
      { from: { x: 5.5, y: 2 }, to: { x: 6, y: 2 } },
      { from: { x: 6, y: 2 }, to: { x: 6.5, y: 2 } },
    ],
    arcs: [{ center: CENTER, radius: 0.5, start: -Math.PI / 2, sweep, direction }],
    length: 1,
  })

  it('without constraints, the rope is drawn from the scenePath of the scene', () => {
    const path = scenePath(scene, rope)!
    const rec = ropeLog(draw())
    expect(callsOf(rec, 'moveTo').map((e) => e.args)).toStrictEqual(path.segments.map((s) => [s.from.x, s.from.y]))
    expect(callsOf(rec, 'lineTo').map((e) => e.args)).toStrictEqual(path.segments.map((s) => [s.to.x, s.to.y]))
    expect(arcsOf(rec)).toStrictEqual(path.arcs.map((a) => [a.center.x, a.center.y, a.radius, a.start, a.start + a.direction * a.sweep, a.direction < 0]))
  })

  it('a loose pulley (sweep < 0) is drawn as the two straight legs of the path, with no arc and nothing at the scenePath tangents', () => {
    const loose = handPath(-0.5, 1)
    const log = draw([stateOf(loose)])
    const rec = ropeLog(log)
    expect(callsOf(rec, 'moveTo').map((e) => e.args)).toStrictEqual(loose.segments.map((s) => [s.from.x, s.from.y]))
    expect(callsOf(rec, 'lineTo').map((e) => e.args)).toStrictEqual(loose.segments.map((s) => [s.to.x, s.to.y]))
    const own = loose.segments.flatMap((s) => [s.from, s.to])
    const tangents = scenePath(scene, rope)!.segments.flatMap((s) => [s.from, s.to]).filter((p) => !own.some((o) => o.x === p.x && o.y === p.y))
    expect(tangents).not.toHaveLength(0)
    for (const tangent of tangents) {
      expect(callsOf(rec, 'lineTo').some((e) => e.args![0] === tangent.x && e.args![1] === tangent.y)).toBe(false)
    }
    expect(arcsOf(rec)).toStrictEqual([])
    // The pulley's own disk and axle are still drawn.
    expect(arcsOf(log).filter(([x, y]) => x === CENTER.x && y === CENTER.y)).toHaveLength(2)
  })

  it.each([1, -1] as const)('a wrap of 7 rad (direction %i) is one arc call that spans 7 rad; a wrap of 0 is one arc call that spans nothing', (direction) => {
    const [wrapped] = arcsOf(ropeLog(draw([stateOf(handPath(7, direction))]))).map(([, , , start, end, anticlockwise]) => ({ span: end! - start!, anticlockwise }))
    expect(wrapped!.span).toBeCloseTo(direction * 7, 12)
    expect(wrapped!.anticlockwise).toBe(direction < 0)
    expect(arcsOf(ropeLog(draw([stateOf(handPath(7, direction))])))).toHaveLength(1)

    const flat = arcsOf(ropeLog(draw([stateOf(handPath(0, direction))])))
    expect(flat).toHaveLength(1)
    expect(flat[0]![4]).toBe(flat[0]![3])
  })

  it('constraints with no entry for the rope, or only spring states, draw the scenePath', () => {
    const expected = ropeLog(draw())
    const spring: ConstraintState = { id: 'mola', kind: 'spring', dx: 0, force: { a: 1, b: 1 } }
    expect(ropeLog(draw([]))).toStrictEqual(expected)
    expect(ropeLog(draw([spring]))).toStrictEqual(expected)
    expect(ropeLog(draw([{ id: 'corda', kind: 'rope', tension: 5, slack: false, segments: [5, 5] }]))).toStrictEqual(expected)
  })
})

describe('drawScene options (CLEAN-28)', () => {
  it('draws the orange selection outline only when the body is selected', () => {
    const scene = sceneWith([makeBody('r', 'rectangle')])
    const selected = recordingCtx()
    drawScene(selected.ctx, scene, CAMERA, 900, 600, { selection: { kind: 'body', id: 'r' } })
    expect(setsOf(selected.log, 'strokeStyle')).toContain('#ff8c00')

    const unselected = recordingCtx()
    drawScene(unselected.ctx, scene, CAMERA, 900, 600)
    expect(setsOf(unselected.log, 'strokeStyle')).not.toContain('#ff8c00')
  })
})

/** Each fillText with the font active when it ran. */
function textsWithFont(log: LogEntry[]): Array<{ text: unknown; x: number; y: number; font: unknown }> {
  const out: Array<{ text: unknown; x: number; y: number; font: unknown }> = []
  let font: unknown
  for (const e of log) {
    if (e.kind === 'set' && e.name === 'font') font = e.value
    if (e.kind === 'call' && e.name === 'fillText') out.push({ text: e.args![0], x: e.args![1] as number, y: e.args![2] as number, font })
  }
  return out
}

const fontPx = (font: unknown) => Number(/(\d+(?:\.\d+)?)px/.exec(String(font))![1])

/** Replay the canvas text state and rigid transforms to inspect screen positions. */
function screenTexts(log: LogEntry[]) {
  let state = { x: 0, y: 0, angle: 0, font: '', align: 'start' }
  const stack: typeof state[] = []
  const texts: Array<typeof state & { text: string }> = []
  for (const e of log) {
    if (e.kind === 'set') {
      if (e.name === 'font') state.font = String(e.value)
      if (e.name === 'textAlign') state.align = String(e.value)
      continue
    }
    const args = e.args!
    if (e.name === 'save') stack.push({ ...state })
    if (e.name === 'restore') state = stack.pop()!
    if (e.name === 'rotate') state.angle += Number(args[0])
    if (e.name === 'translate' || e.name === 'fillText') {
      const offset = e.name === 'fillText' ? 1 : 0
      const x = Number(args[offset]), y = Number(args[offset + 1])
      const point = {
        ...state,
        x: state.x + x * Math.cos(state.angle) - y * Math.sin(state.angle),
        y: state.y + x * Math.sin(state.angle) + y * Math.cos(state.angle),
      }
      if (e.name === 'translate') state = point
      else texts.push({ ...point, text: String(args[0]) })
    }
  }
  return texts
}

describe('mass label layout (PHY-60)', () => {
  it('centers the measured base and smaller, lowered subscript together', () => {
    const { ctx, log } = recordingCtx({ m: 20, a: 8, b: 8 })
    drawScene(ctx, sceneWith([makeBody('a', 'rectangle'), makeBody('b', 'rectangle')]), CAMERA, 900, 600)
    const texts = screenTexts(log)
    expect(texts.map((t) => t.text)).toEqual(['m', 'a', 'm', 'b'])
    const [base, sub] = texts.slice(2)
    expect(fontPx(base!.font)).toBe(16)
    expect(fontPx(sub!.font)).toBeLessThan(16)
    const left = base!.x - (base!.align === 'right' ? 20 : base!.align === 'center' ? 10 : 0)
    const right = sub!.x + (sub!.align === 'left' ? 8 : sub!.align === 'center' ? 4 : 0)
    expect((left + right) / 2).toBeCloseTo(450)
    expect(base!.y).toBe(300)
    expect(sub!.y).toBeGreaterThan(base!.y)
    expect(scaledAtFillText(log)).toBe(false)
  })

  it.each([
    { shape: 'rectangle', rotation: 0, right: 456, top: 294 },
    { shape: 'rectangle', rotation: Math.PI / 4, right: 458.485281, top: 291.514719 },
    { shape: 'circle', rotation: 0.7, right: 456, top: 294 },
    { shape: 'triangle', rotation: Math.PI / 2, right: 450, top: 288 },
  ] as const)('places an overflowing $shape at rotation $rotation above and right, upright', ({ shape, rotation, right, top }) => {
    const common = { ...makeBody('small', shape), rotation }
    const small: Body = shape === 'rectangle' ? { ...common, shape, width: 0.2, height: 0.2 }
      : shape === 'circle' ? { ...common, shape, radius: 0.1 }
        : { ...common, shape, base: 0.2, alpha: 45 }
    const { ctx, log } = recordingCtx({ m: 10, M: 10, a: 8, b: 8 })
    drawScene(ctx, sceneWith([makeBody('large', shape), small]), CAMERA, 900, 600)
    const texts = screenTexts(log).slice(-2)
    expect(texts.map((t) => t.text)).toEqual([shape === 'triangle' ? 'M' : 'm', 'b'])
    for (const text of texts) {
      const left = text.x - (text.align === 'right' ? 10 : text.align === 'center' ? 5 : 0)
      expect(left).toBeGreaterThan(right)
      expect(text.y + fontPx(text.font) / 2).toBeLessThan(top)
      expect(text.angle).toBe(0)
    }
  })

  it('uses measured width and a margin when deciding whether a label fits', () => {
    for (const [baseWidth, outside] of [[70, false], [81, true], [100, true]] as const) {
      const { ctx, log } = recordingCtx({ m: baseWidth, a: 8, b: 8 })
      drawScene(ctx, sceneWith([makeBody('a', 'rectangle'), makeBody('b', 'rectangle')]), CAMERA, 900, 600)
      const base = screenTexts(log).filter((t) => t.text === 'm' || t.text === 'm_b').at(-1)!
      expect(base.y < 270).toBe(outside)
      if (!outside) expect(base.y).toBe(300)
    }
  })

  it.each(['rectangle', 'triangle'] as const)('preserves the bare symbol and font for a roomy %s', (shape) => {
    const { ctx, log } = recordingCtx()
    drawScene(ctx, sceneWith([makeBody('only', shape)]), CAMERA, 900, 600)
    const texts = screenTexts(log)
    expect(texts).toHaveLength(1)
    expect(texts[0]!.text).toBe(shape === 'triangle' ? 'M' : 'm')
    expect(texts[0]!.font).toBe('italic 16px system-ui, sans-serif')
    expect(texts[0]!.align).toBe('center')
  })
})

describe('vector label beside its arrow (drawArrow)', () => {
  const t = makeTransform(CAMERA, 900, 600)
  // Arrow from the camera center (screen 450, 300) one meter right: tip at (510, 300).
  const tip = { x: 450 + PPM, y: 300 }

  it('draws the bare letter next to the tip, and nothing else', () => {
    const { ctx, log } = recordingCtx()
    drawArrow(ctx, { x: 6, y: 4 }, { x: 1, y: 0 }, t, undefined, 'T')
    const texts = textsWithFont(log)
    expect(texts.map((e) => e.text)).toEqual(['T'])
    expect(Math.hypot(texts[0]!.x - tip.x, texts[0]!.y - tip.y)).toBeLessThan(30)
  })

  it('F_el: the subscript in a smaller font, no value drawn', () => {
    const { ctx, log } = recordingCtx()
    drawArrow(ctx, { x: 6, y: 4 }, { x: 1, y: 0 }, t, undefined, 'F_el')
    const texts = textsWithFont(log)
    expect(texts.map((e) => e.text)).toEqual(['F', 'el'])
    expect(fontPx(texts[1]!.font)).toBeLessThan(fontPx(texts[0]!.font))
    for (const e of texts) expect(Math.hypot(e.x - tip.x, e.y - tip.y)).toBeLessThan(30)
  })

  it('no label: no text', () => {
    const { ctx, log } = recordingCtx()
    drawArrow(ctx, { x: 6, y: 4 }, { x: 1, y: 0 }, t)
    expect(callsOf(log, 'fillText')).toHaveLength(0)
  })
})
