import { describe, expect, it } from 'vitest'
import { colorOf, drawGraph, graphLayout, indexAtX, seriesFor, visibleSeries, GRAPH_KINDS, type GraphFrame, type Series } from './graph'
import type { Scene } from '../scene'
import { initialTracker } from '../playback/accelerationTracker'
import { bodyEnergy, systemEnergy } from '../sim/energy'

const series = (values: number[]): Series[] => [{ name: 'x', unit: 'm', points: values.map((value, t) => ({ t, value })) }]
const scene: Scene = { version: 1, constants: { g: 10 }, bodies: [{ id: 'b', shape: 'circle', radius: 1, mass: 2, fixed: false, position: { x: 1, y: 3 }, rotation: 0 }], forces: [], contacts: [] }
const frame: GraphFrame = { scene, states: new Map([['b', { position: { x: 1, y: 3 }, rotation: 0, linvel: { x: 3, y: 4 }, angvel: 0 }]]), constraints: [], pulleys: [], acceleration: initialTracker() }

describe('visible graph curves (PHY-81)', () => {
  const energy: Series[] = [
    { name: 'E_c', unit: 'J', points: [{ t: 0, value: 0 }, { t: 2, value: 10 }] },
    { name: 'E_pg', unit: 'J', points: [{ t: 0, value: 100 }, { t: 2, value: 200 }] },
    { name: 'E_mec', unit: 'J', points: [{ t: 0, value: 5 }, { t: 2, value: 5 }] },
  ]

  it('assigns stable identity colors and distinct colors within every graph kind', () => {
    const groups = [
      ['x', 'v_x', 'a_x', 'E_c', 'p_x'],
      ['y', 'v_y', 'a_y', 'E_pg', 'p_y'],
      ['|v|', '|a|', 'E_mec', '|p|'],
      ['E_el'],
    ]
    const colors = ['#2563eb', '#c2410c', '#15803d', '#9333ea']
    groups.forEach((names, i) => names.forEach(name => expect(colorOf(name)).toBe(colors[i])))
    const end = { bodyId: 'b', anchor: { x: 0, y: 0 } }
    const spring: Scene = { ...scene, constraints: [{ id: 's', kind: 'spring', a: end, b: end, k: 10, x0: 1 }] }
    for (const kind of GRAPH_KINDS) {
      const curves = seriesFor(kind, [frame], kind === 'energy' ? null : 'b', spring)
      expect(new Set(curves.map(s => colorOf(s.name))).size).toBe(curves.length)
    }
    expect(colorOf(energy[1].name)).toBe(colorOf(energy.slice(1)[0].name))
  })

  it('filters by name without changing order, samples or the input list', () => {
    expect(visibleSeries(energy, ['E_pg'])).toEqual([energy[0], energy[2]])
    expect(visibleSeries(energy, undefined)).toEqual(energy)
    expect(visibleSeries(energy, ['unknown'])).toEqual(energy)
    expect(visibleSeries(energy, energy.map(s => s.name))).toEqual([])
    expect(visibleSeries([], ['E_pg'])).toEqual([])
    expect(energy.map(s => s.name)).toEqual(['E_c', 'E_pg', 'E_mec'])
  })

  it('autoscales only visible samples and keeps a finite axis when all curves are hidden', () => {
    const curves = energy.slice(0, 2)
    expect(graphLayout(visibleSeries(curves, ['E_pg']), 2, 600, 180).ticksY).toEqual([-0.5, 0, 10.5])
    expect(graphLayout(curves, 2, 600, 180).ticksY).toEqual([-10, 0, 210])
    const empty = graphLayout(visibleSeries(curves, ['E_c', 'E_pg']), 2, 600, 180)
    expect(empty.ticksY).toEqual([-1, 0, 1])
    expect(Number.isFinite(empty.mapY(0))).toBe(true)
  })

  it('strokes only passed curves with identity colors, preserves axes/cursor and paints no legend', () => {
    const labels: string[] = []
    const strokes: unknown[] = []
    const dashes: number[][] = []
    const ctx = new Proxy({} as Record<PropertyKey, unknown>, {
      get(target, key) {
        if (key === 'fillText') return (text: string) => { labels.push(text) }
        if (key === 'stroke') return () => { strokes.push(target.strokeStyle) }
        if (key === 'setLineDash') return (dash: number[]) => { dashes.push(dash) }
        if (key === 'measureText') return () => ({ width: 10 })
        return target[key] ?? (() => {})
      },
    }) as unknown as CanvasRenderingContext2D
    for (const curves of [visibleSeries(energy, ['E_pg']), [energy[1]], []]) {
      strokes.length = 0
      drawGraph(ctx, graphLayout(curves, 2, 600, 180), curves, 1, 'en')
      expect(strokes).toEqual(['#ddd', ...curves.map(s => colorOf(s.name)), '#444'])
    }
    expect(labels.some(text => ['E_c', 'E_pg', 'E_mec', 'E', 'c', 'pg', 'mec'].includes(text))).toBe(false)
    expect(labels).toContain('J')
    expect(labels).toContain('s')
    expect(dashes).toContainEqual([3, 3])
  })
})

describe('graph seek index (PHY-73)', () => {
  it('rounds to the nearest recorded frame and clamps plot margins', () => {
    const l = graphLayout([], 2, 600, 180)
    expect([-100, 64, 320, 576, 900].map(x => indexAtX(l, x, 2))).toEqual([0, 0, 60, 120, 120])
    expect(indexAtX(l, l.mapT(0.509), 2)).toBe(31)
  })
  it('inverts the one-second minimum axis without seeking beyond a short recording', () => {
    const l = graphLayout([], 0.5, 600, 180)
    expect(indexAtX(l, 192, 0.5)).toBe(15)
    expect(indexAtX(l, 576, 0.5)).toBe(30)
    expect(indexAtX(graphLayout([], 0, 600, 180), 576, 0)).toBe(0)
  })
})

describe('recording graph (PHY-72)', () => {
  it('maps time edges and decreasing y with two or three ticks', () => {
    const l = graphLayout(series([0, 10]), 2, 600, 180)
    expect(l.mapT(0)).toBe(l.plot.x)
    expect(l.mapT(2)).toBe(l.plot.x + l.plot.width)
    expect(l.mapY(10)).toBeLessThan(l.mapY(0))
    expect(l.ticksT.length).toBeGreaterThanOrEqual(2)
    expect(l.ticksT.length).toBeLessThanOrEqual(3)
    expect(l.ticksT.every(t => t >= 0 && t <= 2)).toBe(true)
    expect(l.ticksY.length).toBeGreaterThanOrEqual(2)
    expect(l.ticksY.length).toBeLessThanOrEqual(3)
    expect(l.ticksY.every(y => y >= -0.5 && y <= 10.5)).toBe(true)
  })
  it('includes zero when crossing and handles constant or empty data', () => {
    expect(graphLayout(series([-3, 5]), 2, 600, 180).ticksY).toContain(0)
    for (const s of [series([4, 4]), []]) {
      const l = graphLayout(s, 1, 600, 180)
      expect(Number.isFinite(l.mapY(4))).toBe(true)
      expect(l.mapY(5)).toBeLessThan(l.mapY(4))
    }
  })
  it.each([false, true])('separates body and system energy with spring=%s', spring => {
    const end = { bodyId: 'b', anchor: { x: 0, y: 0 } }
    const doc: Scene = { ...scene, constraints: spring ? [{ id: 's', kind: 'spring', a: end, b: end, k: 10, x0: 1 }] : [] }
    const f: GraphFrame = { ...frame, scene: doc, constraints: spring ? [{ id: 's', kind: 'spring', dx: 2, force: { a: 20, b: 20 } }] : [] }
    const body = seriesFor('energy', [f, f], 'b', doc)
    expect(body.map(s => s.name)).toEqual(['E_c', 'E_pg', 'E_mec'])
    expect(body.map(s => s.points[0].value)).toEqual([25, 60, 85])
    const e = bodyEnergy(doc, doc.bodies[0], f.states!.get('b')!)
    expect(body[2].points.every(p => p.value === e.Ec + e.Epg)).toBe(true)
    const system = seriesFor('energy', [f], null, doc)
    expect(system).toHaveLength(spring ? 4 : 3)
    const se = systemEnergy(doc, f.states!, f.constraints, f.pulleys)
    expect(system.find(s => s.name === 'E_mec')!.points[0].value).toBe(se.Emec)
    if (spring) expect(system.find(s => s.name === 'E_el')!.points[0].value).toBe(20)
  })
  it('reads recorded vectors, time, and system momentum', () => {
    const f = { ...frame, acceleration: { ...initialTracker(), measured: new Map([['b', { x: -6, y: 8 }]]) } }
    expect(seriesFor('velocity', [f, f], 'b', scene).map(s => s.points[1])).toEqual([{ t: 1 / 60, value: 3 }, { t: 1 / 60, value: 4 }, { t: 1 / 60, value: 5 }])
    expect(seriesFor('position', [f], 'b', scene).map(s => s.points[0].value)).toEqual([1, 3])
    expect(seriesFor('acceleration', [f], 'b', scene).map(s => s.points[0].value)).toEqual([-6, 8, 10])
    expect(seriesFor('momentum', [f], null, scene).map(s => s.points[0].value)).toEqual([6, 8, 10])
    expect(seriesFor('velocity', [f], 'missing', scene)).toEqual([])
  })
})
