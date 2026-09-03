import type { Scene } from '../scene/types'
import { groundBody, loadIndex, saveIndex, saveScene, sceneKey, type SceneIndexEntry } from '../persistence'

// Preset = pure definition returning Scene literal via single codec path
export interface Preset {
  id: string
  name: string
  description: string
  buildScene(): Scene
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
  const H = BASE * Math.tan((ALPHA * Math.PI) / 180)
  const F = (MW + MB) * G * Math.tan((ALPHA * Math.PI) / 180)
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
  return {
    version: 1,
    constants: { g: 9.81 },
    bodies: [{ id: 'projetil', shape: 'circle', radius: 0.3, fixed: false, mass: 1, position: { x: 2, y: 4 }, rotation: 0 }],
    forces: [{ id: 'lancamento', bodyId: 'projetil', anchor: { x: 0, y: 0 }, magnitude: 25, direction: 35 }],
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

export const PRESETS: Preset[] = [
  { id: 'wedge-flagship', name: 'Cunha empurrada (clássico)', description: 'Bloco em equilíbrio sobre cunha — F=(M+m)g·tanα mantém o bloco parado', buildScene: wedgeFlagship },
  { id: 'incline-block', name: 'Bloco na rampa', description: 'Bloco deslizando sobre rampa inclinada com atrito', buildScene: inclineBlock },
  { id: 'projectile', name: 'Projétil oblíquo', description: 'Lançamento oblíquo com força inicial', buildScene: projectileLaunch },
  { id: 'free-fall', name: 'Queda livre', description: 'Queda livre sem atrito', buildScene: freeFall },
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
  const entry: SceneIndexEntry = { id, name: preset.name, updatedAt: now }
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
