import type { Scene } from '../scene'
import type { BodyState, ConstraintState, PulleyState } from '../sim/simulator'
import { bodyEnergy, systemEnergy } from '../sim/energy'
import { TIMESTEP } from '../sim/timestep'
import { getAcceleration, type AccelTracker } from '../playback/accelerationTracker'
import { fmtNum, type Lang } from '../i18n'
import { splitLabel } from './draw'

export const GRAPH_COLORS = ['#2563eb', '#c2410c', '#15803d', '#9333ea'] as const
export const GRAPH_KINDS = ['position', 'velocity', 'acceleration', 'energy', 'momentum'] as const
export type GraphKind = typeof GRAPH_KINDS[number]
export interface GraphFrame {
  scene: Scene
  states: ReadonlyMap<string, BodyState> | null
  constraints: readonly ConstraintState[]
  pulleys: readonly PulleyState[]
  acceleration: AccelTracker
}
export interface Series {
  name: string
  unit: string
  points: { t: number; value: number }[]
}
export interface Layout {
  plot: { x: number; y: number; width: number; height: number }
  ticksT: number[]
  ticksY: number[]
  mapT(t: number): number
  mapY(value: number): number
}

export function graphLayout(series: Series[], tMax: number, width: number, height: number): Layout {
  const values = series.flatMap(s => s.points.map(p => p.value)).filter(Number.isFinite)
  const min = values.length ? Math.min(...values) : 0
  const max = values.length ? Math.max(...values) : 0
  const margin = (max - min || Math.abs(min) || 1) * 0.05
  const low = min - margin
  const high = max + margin
  const end = Math.max(tMax, 1)
  const plot = { x: 64, y: 48, width: Math.max(1, width - 88), height: Math.max(1, height - 78) }
  return {
    plot,
    ticksT: [0, end / 2, end],
    ticksY: [low, low < 0 && high > 0 ? 0 : (low + high) / 2, high],
    mapT: t => plot.x + t / end * plot.width,
    mapY: value => plot.y + (high - value) / (high - low) * plot.height,
  }
}

/** Each sample uses its own document: live edits must not rewrite history. */
export function seriesFor(kind: GraphKind, frames: readonly GraphFrame[], bodyId: string | null, scene: Scene): Series[] {
  if (bodyId !== null && !scene.bodies.some(b => b.id === bodyId)) return []
  if (bodyId === null && kind !== 'energy' && kind !== 'momentum') return []
  const spring = bodyId === null && (scene.constraints ?? []).some(c => c.kind === 'spring')
  const names = {
    position: ['x', 'y'], velocity: ['v_x', 'v_y', '|v|'], acceleration: ['a_x', 'a_y', '|a|'],
    energy: spring ? ['E_c', 'E_pg', 'E_mec', 'E_el'] : ['E_c', 'E_pg', 'E_mec'], momentum: ['p_x', 'p_y', '|p|'],
  }[kind]
  const unit = { position: 'm', velocity: 'm/s', acceleration: 'm/s²', energy: 'J', momentum: 'kg·m/s' }[kind]
  const result = names.map(name => ({ name, unit, points: [] } as Series))
  frames.forEach((frame, i) => {
    const doc = frame.scene
    const states = frame.states ?? new Map(doc.bodies.map(b => [b.id, {
      position: b.position, rotation: b.rotation, linvel: { x: b.vx ?? 0, y: b.vy ?? 0 }, angvel: 0,
    }]))
    const body = doc.bodies.find(b => b.id === bodyId)
    const state = bodyId === null ? undefined : states.get(bodyId)
    if (bodyId !== null && (!body || !state)) return
    let values: number[]
    if (kind === 'energy' || kind === 'momentum') {
      const e = body && state ? bodyEnergy(doc, body, state) : systemEnergy(doc, states, frame.constraints, frame.pulleys)
      values = kind === 'momentum' ? [e.p.x, e.p.y, Math.hypot(e.p.x, e.p.y)]
        : [e.Ec, e.Epg, 'Emec' in e && typeof e.Emec === 'number' ? e.Emec : e.Ec + e.Epg, 'Eel' in e && typeof e.Eel === 'number' ? e.Eel : 0]
    } else {
      const v = kind === 'position' ? state!.position : kind === 'velocity' ? state!.linvel : getAcceleration(frame.acceleration, doc, bodyId!, true)
      values = [v.x, v.y, Math.hypot(v.x, v.y)]
    }
    result.forEach((s, j) => s.points.push({ t: i * TIMESTEP, value: values[j] }))
  })
  return result
}

export function drawGraph(ctx: CanvasRenderingContext2D, layout: Layout, series: Series[], cursorT: number, lang: Lang): void {
  const { plot, mapT, mapY } = layout
  ctx.save()
  ctx.clearRect(0, 0, plot.x + plot.width + 24, plot.y + plot.height + 30)
  ctx.font = '11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = '#444'
  ctx.strokeStyle = '#ddd'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (const t of layout.ticksT) {
    const x = mapT(t)
    ctx.moveTo(x, plot.y)
    ctx.lineTo(x, plot.y + plot.height)
    ctx.fillText(fmtNum(t, 2, lang), x, plot.y + plot.height + 16)
  }
  ctx.fillText('s', plot.x + plot.width + 16, plot.y + plot.height + 16)
  ctx.textAlign = 'right'
  for (const y of layout.ticksY) {
    ctx.moveTo(plot.x, mapY(y))
    ctx.lineTo(plot.x + plot.width, mapY(y))
    ctx.fillText(fmtNum(y, 2, lang), plot.x - 6, mapY(y) + 4)
  }
  ctx.fillText(series[0]?.unit ?? '', plot.x - 6, plot.y - 8)
  ctx.stroke()
  ctx.save()
  ctx.beginPath()
  ctx.rect(plot.x, plot.y, plot.width, plot.height)
  ctx.clip()
  series.forEach((s, i) => {
    ctx.strokeStyle = GRAPH_COLORS[i % GRAPH_COLORS.length]
    ctx.lineWidth = 1.5
    ctx.beginPath()
    s.points.forEach((p, j) => j ? ctx.lineTo(mapT(p.t), mapY(p.value)) : ctx.moveTo(mapT(p.t), mapY(p.value)))
    ctx.stroke()
  })
  ctx.strokeStyle = '#444'
  ctx.setLineDash([3, 3])
  ctx.beginPath()
  ctx.moveTo(mapT(cursorT), plot.y)
  ctx.lineTo(mapT(cursorT), plot.y + plot.height)
  ctx.stroke()
  ctx.restore()
  // Right-aligned legend leaves the upper-left corner to the native selector.
  let x = plot.x + plot.width
  for (let i = series.length - 1; i >= 0; i--) {
    const [base, sub] = splitLabel(series[i].name)
    ctx.fillStyle = GRAPH_COLORS[i % GRAPH_COLORS.length]
    ctx.font = '10px system-ui, sans-serif'
    ctx.fillText(sub, x, 22)
    x -= ctx.measureText(sub).width
    ctx.font = '13px system-ui, sans-serif'
    ctx.fillText(base, x, 18)
    x -= ctx.measureText(base).width + 16
  }
  ctx.restore()
}
