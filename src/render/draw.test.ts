import { describe, expect, it } from 'vitest'
import type { Body, Scene } from '../scene'
import { drawScene, massLabels } from './draw'

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
