import { triangleHeight } from '../scene'
import type { Scene } from '../scene/types'
import { groundBody, loadIndex, saveIndex, saveScene, sceneKey, type SceneIndexEntry } from '../persistence'
import { t } from '../i18n'

/** A node of the gallery tree, as in *Tópicos de Física*: area → part (when the book has one) → topic. */
export interface TopicNode {
  area: string
  part?: string
  topic: string
}

// Only the nodes some preset uses, in book order. Labels: i18n `tree.*` (nodeLabelKeys).
export const TREE: readonly TopicNode[] = [
  { area: 'mecanica', part: 'dinamica', topic: 'principios' },
  { area: 'mecanica', part: 'dinamica', topic: 'atrito' },
  { area: 'mecanica', part: 'dinamica', topic: 'resultantes' },
  { area: 'mecanica', part: 'dinamica', topic: 'campo-uniforme' },
  { area: 'ondulatoria', topic: 'mhs' },
]

// Preset = pure definition returning Scene literal via single codec path; name and description live in i18n (`preset.<id>.*`)
export interface Preset extends TopicNode {
  id: string
  /** Order inside its topic, increasing difficulty. */
  position: number
  buildScene(): Scene
}

/** i18n keys of a node's labels, root first: `tree.<area>`, `tree.<area>.<part>`, `tree.<area>[.<part>].<topic>`. */
export function nodeLabelKeys(node: TopicNode): string[] {
  const path = [node.area, ...(node.part ? [node.part] : []), node.topic]
  return path.map((_, i) => `tree.${path.slice(0, i + 1).join('.')}`)
}

const sameNode = (a: TopicNode, b: TopicNode): boolean => a.area === b.area && a.part === b.part && a.topic === b.topic

/** The gallery: tree nodes in book order, each with its presets by position; nodes without a preset left out. */
export function galleryGroups(): { node: TopicNode; presets: Preset[] }[] {
  return TREE.map((node) => ({ node, presets: PRESETS.filter((p) => sameNode(p, node)).sort((a, b) => a.position - b.position) })).filter(
    (g) => g.presets.length > 0,
  )
}

function slopeFrame(alphaDeg: number) {
  const r = (alphaDeg * Math.PI) / 180
  return { ux: Math.cos(r), uy: Math.sin(r), nx: -Math.sin(r), ny: Math.cos(r) }
}

// flagship wedge — physics from T3 acceptance (F = (M+m)g·tanα) so gallery demo actually holds
function wedgeFlagship(): Scene {
  const ALPHA = 30
  const G = 9.81
  const MW = 10
  const MB = 2
  const BASE = 8
  const H = triangleHeight({ base: BASE, alpha: ALPHA })
  const F = (MW + MB) * G * (H / BASE)
  const f = slopeFrame(ALPHA)
  const D = 2.6
  const R = 0.5
  return {
    version: 1,
    constants: { g: G },
    bodies: [
      groundBody(),
      { id: 'cunha', shape: 'triangle', base: BASE, alpha: ALPHA, fixed: false, mass: MW, position: { x: 8, y: 0 }, rotation: 0 },
      {
        id: 'bloco',
        shape: 'circle',
        radius: R,
        fixed: false,
        mass: MB,
        position: { x: 8 + D * f.ux + R * f.nx, y: D * f.uy + R * f.ny },
        rotation: 0,
      },
    ],
    forces: [{ id: 'empurrao', bodyId: 'cunha', anchor: { x: (2 * BASE) / 3, y: H / 3 }, magnitude: F, direction: 180 }],
    contacts: [
      { a: 'chao', b: 'cunha', muS: 0, muK: 0 },
      { a: 'cunha', b: 'bloco', muS: 0, muK: 0 },
    ],
  }
}

function inclineBlock(): Scene {
  const ALPHA = 30
  const G = 9.81
  const f = slopeFrame(ALPHA)
  const R = 0.5
  const D = 3
  return {
    version: 1,
    constants: { g: G },
    bodies: [
      { id: 'rampa', shape: 'triangle', base: 8, alpha: ALPHA, fixed: true, mass: 0, position: { x: 2, y: 0 }, rotation: 0 },
      {
        id: 'bloco',
        shape: 'circle',
        radius: R,
        fixed: false,
        mass: 2,
        position: { x: 2 + D * f.ux + R * f.nx, y: D * f.uy + R * f.ny },
        rotation: 0,
      },
    ],
    forces: [],
    contacts: [{ a: 'rampa', b: 'bloco', muS: 0.3, muK: 0.2 }],
  }
}

function projectileLaunch(): Scene {
  const radius = 0.3
  const ground = groundBody()
  const groundRect = ground as Extract<typeof ground, { shape: 'rectangle' }>
  return {
    version: 1,
    constants: { g: 9.81 },
    bodies: [
      ground,
      {
        id: 'projetil',
        shape: 'circle',
        radius,
        fixed: false,
        mass: 1,
        position: { x: 2, y: groundRect.position.y + groundRect.height / 2 + radius },
        rotation: 0,
        vx: 8,
        vy: 6,
      },
    ],
    forces: [],
    contacts: [],
  }
}

function freeFall(): Scene {
  return {
    version: 1,
    constants: { g: 9.81 },
    bodies: [
      groundBody(),
      { id: 'bola', shape: 'circle', radius: 0.5, fixed: false, mass: 1, position: { x: 6, y: 7 }, rotation: 0 },
    ],
    forces: [],
    contacts: [],
  }
}

// The eight constraint presets below reproduce the acceptance families of
// PHY-23/24/26 (same geometry, moved into the default camera view).
const CM = { x: 0, y: 0 }
const TOP = { x: 0, y: 0.2 } // top face of a 0.4 m block

// a = (m₁−m₂)g/(m₁+m₂), T = 2m₁m₂g/(m₁+m₂)
function atwood(): Scene {
  return {
    version: 1,
    constants: { g: 9.81 },
    bodies: [
      groundBody(),
      { id: 'teto', shape: 'rectangle', width: 4, height: 0.5, fixed: true, mass: 0, position: { x: 6, y: 8 }, rotation: 0 },
      { id: 'bloco-1', shape: 'rectangle', width: 0.4, height: 0.4, fixed: false, mass: 3, position: { x: 5.75, y: 3 }, rotation: 0 },
      { id: 'bloco-2', shape: 'rectangle', width: 0.4, height: 0.4, fixed: false, mass: 2, position: { x: 6.25, y: 2 }, rotation: 0 },
    ],
    forces: [],
    contacts: [],
    pulleys: [{ id: 'polia', bodyId: 'teto', anchor: { x: 0, y: -0.75 }, radius: 0.25 }],
    constraints: [{ id: 'corda', kind: 'rope', a: { bodyId: 'bloco-1', anchor: TOP }, b: { bodyId: 'bloco-2', anchor: TOP }, via: ['polia'] }],
  }
}

// a = (m₂ − μₖm₁)g/(m₁+m₂); table top at y = 4, pulley past its right edge
function tableHanging(): Scene {
  return {
    version: 1,
    constants: { g: 9.81 },
    bodies: [
      groundBody(),
      { id: 'mesa', shape: 'rectangle', width: 8, height: 4, fixed: true, mass: 0, position: { x: 4, y: 2 }, rotation: 0 },
      { id: 'bloco', shape: 'rectangle', width: 0.4, height: 0.4, fixed: false, mass: 2, position: { x: 2, y: 4.2 }, rotation: 0 },
      { id: 'pendurado', shape: 'rectangle', width: 0.3, height: 0.3, fixed: false, mass: 1, position: { x: 8.4, y: 2.5 }, rotation: 0 },
    ],
    forces: [],
    contacts: [{ a: 'mesa', b: 'bloco', muS: 0.2, muK: 0.2 }],
    pulleys: [{ id: 'polia', bodyId: 'mesa', anchor: { x: 4.2, y: 2 }, radius: 0.2 }],
    constraints: [
      { id: 'corda', kind: 'rope', a: { bodyId: 'bloco', anchor: { x: 0.2, y: 0 } }, b: { bodyId: 'pendurado', anchor: { x: 0, y: 0.15 } }, via: ['polia'] },
    ],
  }
}

// 2:1 — ceiling → under the movable pulley on the load → over a fixed pulley → counterweight; a_load = (2m − M)g/(M + 4m)
function movablePulley(): Scene {
  return {
    version: 1,
    constants: { g: 9.81 },
    bodies: [
      groundBody(),
      { id: 'teto', shape: 'rectangle', width: 4, height: 0.5, fixed: true, mass: 0, position: { x: 6, y: 8.5 }, rotation: 0 },
      { id: 'carga', shape: 'rectangle', width: 0.3, height: 0.3, fixed: false, mass: 3, position: { x: 6, y: 2.5 }, rotation: 0 },
      { id: 'contrapeso', shape: 'rectangle', width: 0.2, height: 0.2, fixed: false, mass: 1, position: { x: 6.75, y: 1.5 }, rotation: 0 },
    ],
    forces: [],
    contacts: [],
    pulleys: [
      { id: 'movel', bodyId: 'carga', anchor: CM, radius: 0.25 },
      { id: 'fixa', bodyId: 'teto', anchor: { x: 0.5, y: -0.5 }, radius: 0.25 },
    ],
    constraints: [
      { id: 'corda', kind: 'rope', a: { bodyId: 'teto', anchor: { x: -0.25, y: 0 } }, b: { bodyId: 'contrapeso', anchor: CM }, via: ['movel', 'fixa'] },
    ],
  }
}

function pendulum(pivot: { x: number; y: number }, bob: { x: number; y: number }, vx?: number): Scene {
  return {
    version: 1,
    constants: { g: 9.81 },
    bodies: [
      groundBody(),
      { id: 'pivo', shape: 'circle', radius: 0.05, fixed: true, mass: 0, position: pivot, rotation: 0 },
      { id: 'bola', shape: 'circle', radius: 0.1, fixed: false, mass: 1, position: bob, rotation: 0, ...(vx === undefined ? {} : { vx }) },
    ],
    forces: [],
    contacts: [],
    constraints: [{ id: 'corda', kind: 'rope', a: { bodyId: 'pivo', anchor: CM }, b: { bodyId: 'bola', anchor: CM }, via: [] }],
  }
}

// L = 1, launched from the bottom with v₀² = 6gL: v_top² = 2gL > gL
const loopPendulum = (): Scene => pendulum({ x: 6, y: 4.5 }, { x: 6, y: 3.5 }, Math.sqrt(6 * 9.81))

// L = 2, θ₀ = 10°: T = 2π√(L/g)
function simplePendulum(): Scene {
  const L = 2
  const theta = (10 * Math.PI) / 180
  return pendulum({ x: 6, y: 7 }, { x: 6 + L * Math.sin(theta), y: 7 - L * Math.cos(theta) })
}

// Wall's right face at x = 4.1; spring from it to the block's left face at y = 0.2, x₀ = 1.5 → equilibrium x = 5.8
function horizontalSpring(c?: number): Scene {
  return {
    version: 1,
    constants: { g: 9.81 },
    bodies: [
      groundBody(),
      { id: 'parede', shape: 'rectangle', width: 0.2, height: 1, fixed: true, mass: 0, position: { x: 4, y: 0.5 }, rotation: 0 },
      { id: 'bloco', shape: 'rectangle', width: 0.4, height: 0.4, fixed: false, mass: 1, position: { x: 6.1, y: 0.2 }, rotation: 0 },
    ],
    forces: [],
    contacts: [],
    constraints: [
      {
        id: 'mola',
        kind: 'spring',
        a: { bodyId: 'parede', anchor: { x: 0.1, y: -0.3 } },
        b: { bodyId: 'bloco', anchor: { x: -0.2, y: 0 } },
        k: 40,
        x0: 1.5,
        ...(c === undefined ? {} : { c }),
      },
    ],
  }
}

// Released at natural length from the ceiling: oscillates about mg/k below it
function verticalSpring(): Scene {
  return {
    version: 1,
    constants: { g: 9.81 },
    bodies: [
      groundBody(),
      { id: 'teto', shape: 'rectangle', width: 4, height: 0.5, fixed: true, mass: 0, position: { x: 6, y: 8 }, rotation: 0 },
      { id: 'bloco', shape: 'rectangle', width: 0.4, height: 0.4, fixed: false, mass: 1, position: { x: 6, y: 7.75 - 1.5 - 0.2 }, rotation: 0 },
    ],
    forces: [],
    contacts: [],
    constraints: [{ id: 'mola', kind: 'spring', a: { bodyId: 'teto', anchor: { x: 0, y: -0.25 } }, b: { bodyId: 'bloco', anchor: TOP }, k: 40, x0: 1.5 }],
  }
}

const DYN = { area: 'mecanica', part: 'dinamica' } as const
const MHS = { area: 'ondulatoria', topic: 'mhs' } as const

export const PRESETS: Preset[] = [
  { id: 'wedge-flagship', ...DYN, topic: 'principios', position: 4, buildScene: wedgeFlagship },
  { id: 'incline-block', ...DYN, topic: 'atrito', position: 1, buildScene: inclineBlock },
  { id: 'projectile', ...DYN, topic: 'campo-uniforme', position: 2, buildScene: projectileLaunch },
  { id: 'free-fall', ...DYN, topic: 'campo-uniforme', position: 1, buildScene: freeFall },
  { id: 'atwood', ...DYN, topic: 'principios', position: 1, buildScene: atwood },
  { id: 'table-hanging', ...DYN, topic: 'principios', position: 2, buildScene: tableHanging },
  { id: 'movable-pulley', ...DYN, topic: 'principios', position: 3, buildScene: movablePulley },
  { id: 'loop-pendulum', ...DYN, topic: 'resultantes', position: 1, buildScene: loopPendulum },
  { id: 'spring-horizontal', ...MHS, position: 1, buildScene: () => horizontalSpring() },
  { id: 'spring-vertical', ...MHS, position: 2, buildScene: verticalSpring },
  { id: 'simple-pendulum', ...MHS, position: 3, buildScene: simplePendulum },
  { id: 'spring-damped', ...MHS, position: 4, buildScene: () => horizontalSpring(0.8) },
]

export function presetById(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id)
}

// Creates a NEW persisted entry from preset scene via existing persistence path (payload-first)
export function createPresetScene(
  storage: import('../persistence').Storage,
  preset: Preset,
  now = Date.now(),
): { entry: SceneIndexEntry; scene: Scene } | { reason: string } {
  const scene = preset.buildScene()
  const index = loadIndex(storage)
  let n = 1
  const ids = new Set(index.map((e) => e.id))
  while (ids.has(`cena-${n}`)) n++
  const id = `cena-${n}`
  const entry: SceneIndexEntry = { id, name: t(`preset.${preset.id}.name`), updatedAt: now }
  const pw = saveScene(storage, id, scene)
  if (pw) return { reason: pw }
  const iw = saveIndex(storage, [...index, entry])
  if (iw) {
    try {
      storage.removeItem(sceneKey(id))
    } catch {}
    return { reason: iw }
  }
  return { entry, scene }
}
