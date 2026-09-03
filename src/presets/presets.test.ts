import { describe, expect, it } from 'vitest'
import { collectWarnings, parse, serialize } from '../scene/codec'
import { PRESETS, createPresetScene } from './index'
import { createSimulator, TIMESTEP } from '../sim'
import { GALLERY_ACK_KEY, isGalleryAcked, loadIndex, loadScene, sceneKey, shouldShowGallery } from '../persistence'
import type { Storage } from '../persistence'

function memStorage(): Storage & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k) }
}

describe('presets: pure definitions via codec', () => {
  it('table: each preset parses, has ≥1 body, unique ids', () => {
    for (const p of PRESETS) {
      expect(p.id).toBeTruthy()
      expect(p.name).toBeTruthy()
      expect(p.description).toBeTruthy()
      const scene = p.buildScene()
      expect(() => parse(serialize(scene))).not.toThrow()
      const parsed = parse(serialize(scene))
      expect(parsed).toEqual(scene)
      expect(scene.bodies.length).toBeGreaterThanOrEqual(1)
      const ids = scene.bodies.map((b) => b.id)
      expect(new Set(ids).size).toBe(ids.length)
      // force bodyIds must exist
      for (const f of scene.forces) expect(ids).toContain(f.bodyId)
      for (const c of scene.contacts) {
        expect(ids).toContain(c.a)
        expect(ids).toContain(c.b)
      }
    }
    // preset ids unique
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length)
  })

  it('wedge flagship has hatched ground + correct F', () => {
    const preset = PRESETS.find((p) => p.id === 'wedge-flagship')!
    expect(preset.name).toMatch(/Cunha/)
    const scene = preset.buildScene()
    // ground id chao is hatched by draw.ts (data-driven)
    expect(scene.bodies.some((b) => b.id === 'chao' && b.fixed)).toBe(true)
    // physics: F = (M+m) g tanα
    const wedge = scene.bodies.find((b) => b.id === 'cunha')!
    const block = scene.bodies.find((b) => b.id === 'bloco')!
    const force = scene.forces.find((f) => f.bodyId === 'cunha')!
    const alpha = (wedge as Extract<typeof wedge, { shape: 'triangle' }>).alpha
    const expected = (wedge.mass + block.mass) * scene.constants.g * Math.tan((alpha * Math.PI) / 180)
    expect(Math.abs(force.magnitude - expected)).toBeLessThan(1e-9)
    expect(force.direction).toBe(180)
    // anchor at centroid
    const base = (wedge as Extract<typeof wedge, { shape: 'triangle' }>).base
    const H = base * Math.tan((alpha * Math.PI) / 180)
    expect(force.anchor.x).toBeCloseTo((2 * base) / 3, 9)
    expect(force.anchor.y).toBeCloseTo(H / 3, 9)
  })

  it('free-fall preset has a fixed ground under the falling Body', () => {
    const scene = PRESETS.find((p) => p.id === 'free-fall')!.buildScene()
    const ground = scene.bodies.find((b) => b.id === 'chao')
    expect(ground?.fixed).toBe(true)
    expect(ground?.shape).toBe('rectangle')
    const ball = scene.bodies.find((b) => b.id === 'bola')!
    expect(ball.position.y).toBeGreaterThan(0)
    // grounded scene must not cry wolf
    expect(collectWarnings(scene)).toStrictEqual([])
  })

  it('createPresetScene payload-first via existing persistence path', () => {
    const s = memStorage()
    const preset = PRESETS[0]!
    const res = createPresetScene(s, preset, 1000) as { entry: import('../persistence').SceneIndexEntry; scene: import('../scene/types').Scene }
    expect(res.entry.name).toBe(preset.name)
    expect(loadIndex(s)).toHaveLength(1)
    expect(loadScene(s, res.entry.id)).toEqual(preset.buildScene())
    // second preset creates distinct id, index grows
    const res2 = createPresetScene(s, PRESETS[1]!, 2000) as { entry: import('../persistence').SceneIndexEntry; scene: import('../scene/types').Scene }
    expect(res2.entry.id).not.toBe(res.entry.id)
    expect(loadIndex(s)).toHaveLength(2)
  })
})

describe('B1: flagship preset holds in simulator (60 frames drift + shared accel)', () => {
  it('PRESETS[0] wedge-flagship: block-wedge relative drift <=1cm and shared horizontal accel', async () => {
    const scene = PRESETS[0]!.buildScene()
    const wedgeDoc = scene.bodies.find((b) => b.id === 'cunha')!
    const blocoDoc = scene.bodies.find((b) => b.id === 'bloco')!
    const alpha = (wedgeDoc as Extract<typeof wedgeDoc, { shape: 'triangle' }>).alpha
    const A = scene.constants.g * Math.tan((alpha * Math.PI) / 180)
    // Builder-identity check: exact initial relative placement from builder math
    // (mirrors T3 tangency-guard pattern; ±0.1 m normal shift must fail here).
    const rad = (alpha * Math.PI) / 180
    const ux = Math.cos(rad)
    const uy = Math.sin(rad)
    const nx = -Math.sin(rad)
    const ny = Math.cos(rad)
    const D = 2.6
    const R = 0.5
    const expRelX = D * ux + R * nx
    const expRelY = D * uy + R * ny
    const docRelX = blocoDoc.position.x - wedgeDoc.position.x
    const docRelY = blocoDoc.position.y - wedgeDoc.position.y
    expect(Math.abs(docRelX - expRelX)).toBeLessThan(1e-9)
    expect(Math.abs(docRelY - expRelY)).toBeLessThan(1e-9)

    const sim = await createSimulator(scene)
    // Tick-1 tangency guard: exact face placement => no pop-out after first step
    const relOf = (m: Map<string, { position: { x: number; y: number } }>) => ({
      x: m.get('bloco')!.position.x - m.get('cunha')!.position.x,
      y: m.get('bloco')!.position.y - m.get('cunha')!.position.y,
    })
    const st0 = sim.readStates()
    const r0 = relOf(st0 as unknown as Map<string, { position: { x: number; y: number } }>)
    sim.step()
    const st1 = sim.readStates()
    const r1tick = relOf(st1 as unknown as Map<string, { position: { x: number; y: number } }>)
    expect(Math.hypot(r1tick.x - r0.x, r1tick.y - r0.y)).toBeLessThanOrEqual(0.002)

    for (let i = 0; i < 29; i++) sim.step()
    const s1 = sim.readStates()
    for (let i = 0; i < 60; i++) sim.step()
    const s2 = sim.readStates()
    const rel = (m: Map<string, { position: { x: number; y: number } }>) => ({
      x: m.get('bloco')!.position.x - m.get('cunha')!.position.x,
      y: m.get('bloco')!.position.y - m.get('cunha')!.position.y,
    })
    const r1 = rel(s1 as unknown as Map<string, { position: { x: number; y: number } }>)
    const r2 = rel(s2 as unknown as Map<string, { position: { x: number; y: number } }>)
    expect(Math.hypot(r2.x - r1.x, r2.y - r1.y)).toBeLessThanOrEqual(0.01)
    const dvxWedge = s2.get('cunha')!.linvel.x - s1.get('cunha')!.linvel.x
    const dvxBloco = s2.get('bloco')!.linvel.x - s1.get('bloco')!.linvel.x
    const expected = -A * (60 * TIMESTEP)
    expect(Math.abs(dvxWedge - expected)).toBeLessThanOrEqual(0.04 * A)
    expect(Math.abs(dvxBloco - expected)).toBeLessThanOrEqual(0.04 * A)
    expect(Math.abs(s2.get('bloco')!.linvel.x - s2.get('cunha')!.linvel.x)).toBeLessThanOrEqual(0.02 * A)
  })
})

describe('B2: gallery acknowledgement flag', () => {
  it('fresh storage -> gallery; singleton-but-acked -> no gallery', () => {
    const s = memStorage()
    // fresh: no index yet, shouldShowGallery false (no singleton); after seeding one entry it shows
    expect(shouldShowGallery(s)).toBe(false)
    createPresetScene(s, PRESETS[0]!, 1)
    expect(loadIndex(s)).toHaveLength(1)
    expect(shouldShowGallery(s)).toBe(true)
    expect(isGalleryAcked(s)).toBe(false)
    s.map.set(GALLERY_ACK_KEY, 'true')
    expect(isGalleryAcked(s)).toBe(true)
    expect(shouldShowGallery(s)).toBe(false)
    // ack persists even with singleton
    expect(loadIndex(s)).toHaveLength(1)
  })
  it('singleton without ack after reload still shows', () => {
    const s = memStorage()
    createPresetScene(s, PRESETS[0]!, 1)
    expect(shouldShowGallery(s)).toBe(true)
  })
})

describe('createPresetScene quota rollback (payload-first)', () => {
  function failOnSecondStorage(base: Storage & { map: Map<string, string> }): Storage {
    let calls = 0
    return {
      getItem: (k) => base.map.get(k) ?? null,
      setItem: (k, v) => {
        calls++
        if (calls === 2) throw new Error('QuotaExceededError: index full')
        base.map.set(k, v)
      },
      removeItem: (k) => base.map.delete(k),
    }
  }
  it('index quota -> payload removed and index unchanged', () => {
    const s = memStorage()
    createPresetScene(s, PRESETS[0]!, 1)
    const beforeIdx = loadIndex(s)
    const fs = failOnSecondStorage(s)
    const res = createPresetScene(fs, PRESETS[1]!, 2) as { reason: string }
    expect(res.reason).toMatch(/Quota/)
    expect(s.map.has(sceneKey('cena-2'))).toBe(false)
    expect(loadIndex(s)).toEqual(beforeIdx)
  })
})
