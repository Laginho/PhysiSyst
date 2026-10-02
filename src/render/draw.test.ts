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
function recordingCtx(): { ctx: CanvasRenderingContext2D; log: LogEntry[] } {
  const log: LogEntry[] = []
  const proxy = new Proxy({} as Record<PropertyKey, unknown>, {
    get(_t, name) {
      return (...args: unknown[]) => {
        log.push({ kind: 'call', name: String(name), args })
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
    drawScene(ctx, scene, CAMERA, 900, 600, undefined, null, constraints)
    return log
  }
  // The scene without its rope draws everything but the rope, so the rope's calls are what the full log has on top, before the closing restore.
  const baseline = (() => {
    const { ctx, log } = recordingCtx()
    drawScene(ctx, { ...scene, constraints: [] }, CAMERA, 900, 600)
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
