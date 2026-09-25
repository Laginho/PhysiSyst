import { describe, expect, it } from 'vitest'
import { collectWarnings, parse, serialize } from '../scene/codec'
import { PRESETS, TREE, createPresetScene, type Preset, type TopicNode } from './index'
import { createSimulator, TIMESTEP, type RopeState } from '../sim'
import { setLang, t } from '../i18n'
import { en } from '../i18n/en'
import type { ConstraintEnd, Scene } from '../scene/types'
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
    expect(t(`preset.${preset.id}.name`)).toMatch(/Cunha/)
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

  it('projectile preset is a grounded diagonal Initial-velocity launch without forces', () => {
    const preset = PRESETS.find((p) => p.id === 'projectile')!
    const scene = preset.buildScene()
    const ground = scene.bodies.find((b) => b.id === 'chao')
    const projectile = scene.bodies.find((b) => b.id === 'projetil')
    expect(scene.bodies).toHaveLength(2)
    expect(ground?.fixed).toBe(true)
    expect(ground?.shape).toBe('rectangle')
    expect(projectile?.shape).toBe('circle')
    expect(projectile?.fixed).toBe(false)
    expect(projectile?.vx).toBeGreaterThan(0)
    expect(projectile?.vy).toBeGreaterThan(0)
    expect(scene.forces).toStrictEqual([])

    const groundRect = ground as Extract<NonNullable<typeof ground>, { shape: 'rectangle' }>
    const ball = projectile as Extract<NonNullable<typeof projectile>, { shape: 'circle' }>
    const groundTop = groundRect.position.y + groundRect.height / 2
    expect(ball.position.y).toBeCloseTo(groundTop + ball.radius, 9)
    expect(collectWarnings(scene)).toStrictEqual([])
    expect(parse(serialize(scene))).toStrictEqual(scene)
  })

  it('projectile preset keeps ground, Initial velocity, and empty forces through persistence', () => {
    const preset = PRESETS.find((p) => p.id === 'projectile')!
    const s = memStorage()
    const res = createPresetScene(s, preset, 3000)
    expect('entry' in res).toBe(true)
    if (!('entry' in res)) return

    const loaded = loadScene(s, res.entry.id)
    expect(loaded).toStrictEqual(preset.buildScene())
    const loadedGround = loaded?.bodies.find((b) => b.id === 'chao')
    const loadedProjectile = loaded?.bodies.find((b) => b.id === 'projetil')
    const expectedProjectile = preset.buildScene().bodies.find((b) => b.id === 'projetil')
    expect(loadedGround?.fixed).toBe(true)
    expect(loadedProjectile?.vx).toBe(expectedProjectile?.vx)
    expect(loadedProjectile?.vy).toBe(expectedProjectile?.vy)
    expect(loaded?.forces).toStrictEqual([])
  })

  it('createPresetScene payload-first via existing persistence path', () => {
    const s = memStorage()
    const preset = PRESETS[0]!
    const res = createPresetScene(s, preset, 1000) as { entry: import('../persistence').SceneIndexEntry; scene: import('../scene/types').Scene }
    expect(res.entry.name).toBe(t(`preset.${preset.id}.name`))
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

/**
 * PHY-31: the gallery as a tree (area → part → topic, as in *Tópicos de
 * Física*) and the eight constraint presets. Each new preset is read back
 * from its own scene and held to the closed form of its acceptance family,
 * at the tolerance of the physics ticket that proved the family.
 */
describe('PHY-31: presets em árvore', () => {
  type Sim = Awaited<ReturnType<typeof createSimulator>>
  type SpringDoc = Extract<NonNullable<Scene['constraints']>[number], { kind: 'spring' }>
  const sameNode = (a: TopicNode, b: TopicNode): boolean => a.area === b.area && a.part === b.part && a.topic === b.topic
  const byId = (id: string): Preset => {
    const p = PRESETS.find((x) => x.id === id)
    if (!p) throw new Error(`missing preset ${id}`)
    return p
  }
  const load = (scene: Scene): Promise<Sim> => createSimulator(parse(serialize(scene)))
  const body = (scene: Scene, id: string) => {
    const b = scene.bodies.find((x) => x.id === id)
    if (!b) throw new Error(`missing body ${id}`)
    return b
  }
  const constraint = (scene: Scene, id: string) => {
    const c = scene.constraints?.find((x) => x.id === id)
    if (!c) throw new Error(`missing constraint ${id}`)
    return c
  }
  const spring = (scene: Scene): SpringDoc => constraint(scene, 'mola') as SpringDoc
  // Every preset body starts unrotated, so an anchor is a plain offset.
  const world = (scene: Scene, end: ConstraintEnd) => {
    const b = body(scene, end.bodyId)
    return { x: b.position.x + end.anchor.x, y: b.position.y + end.anchor.y }
  }
  function run(sim: Sim, steps: number, read: () => number): number[] {
    const out = [read()]
    for (let i = 0; i < steps; i++) {
      sim.step()
      out.push(read())
    }
    return out
  }
  function upCrossings(samples: readonly number[], level: number): number[] {
    const out: number[] = []
    for (let i = 1; i < samples.length; i++) {
      const p = samples[i - 1]! - level
      const q = samples[i]! - level
      if (p < 0 && q >= 0) out.push((i - 1 + -p / (q - p)) * TIMESTEP)
    }
    return out
  }
  function peakTicks(samples: readonly number[]): number[] {
    const out: number[] = []
    for (let i = 1; i < samples.length - 1; i++) {
      if (samples[i]! > 0 && samples[i]! >= samples[i - 1]! && samples[i]! > samples[i + 1]!) out.push(i)
    }
    return out
  }
  /** Δv of `read` between tick 30 and tick 90: one second, past the start-up transient. */
  async function dvOverOneSecond(scene: Scene, read: (s: ReturnType<Sim['readStates']>) => number): Promise<number> {
    const sim = await load(scene)
    for (let i = 0; i < 30; i++) sim.step()
    const v1 = read(sim.readStates())
    for (let i = 0; i < 60; i++) sim.step()
    return read(sim.readStates()) - v1
  }
  /** Horizontal spring from a wall to the block: the block's x at which Δx = 0. */
  const horizontalEquilibrium = (scene: Scene): number => world(scene, spring(scene).a).x + spring(scene).x0 - spring(scene).b.anchor.x

  it('the ticket table: each preset on its node (1)', () => {
    const DYN = { area: 'mecanica', part: 'dinamica' }
    const MHS = { area: 'ondulatoria', topic: 'mhs' }
    const table: Record<string, TopicNode> = {
      'wedge-flagship': { ...DYN, topic: 'principios' },
      'incline-block': { ...DYN, topic: 'atrito' },
      projectile: { ...DYN, topic: 'campo-uniforme' },
      'free-fall': { ...DYN, topic: 'campo-uniforme' },
      atwood: { ...DYN, topic: 'principios' },
      'table-hanging': { ...DYN, topic: 'principios' },
      'movable-pulley': { ...DYN, topic: 'principios' },
      'loop-pendulum': { ...DYN, topic: 'resultantes' },
      'simple-pendulum': MHS,
      'spring-horizontal': MHS,
      'spring-vertical': MHS,
      'spring-damped': MHS,
    }
    expect(PRESETS.map((p) => p.id).sort()).toStrictEqual(Object.keys(table).sort())
    for (const p of PRESETS) expect(sameNode(p, table[p.id]!), p.id).toBe(true)
  })

  it('every preset declares area, part when there is one, and topic of a node in the tree, plus a position unique in its topic (1)', () => {
    for (const p of PRESETS) {
      expect(TREE.some((n) => sameNode(n, p)), p.id).toBe(true)
      expect(Number.isInteger(p.position), p.id).toBe(true)
    }
    for (const n of TREE) {
      const positions = PRESETS.filter((p) => sameNode(p, n)).map((p) => p.position)
      expect(new Set(positions).size, n.topic).toBe(positions.length)
    }
  })

  it('the tree holds only the nodes some preset uses, each once (2)', () => {
    for (const n of TREE) expect(PRESETS.some((p) => sameNode(p, n)), n.topic).toBe(true)
    const keys = TREE.map((n) => `${n.area}/${n.part ?? ''}/${n.topic}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('no preset text lives in the code: a preset carries no name or description (3)', () => {
    for (const p of PRESETS) {
      expect(p, p.id).not.toHaveProperty('name')
      expect(p, p.id).not.toHaveProperty('description')
    }
  })

  it('the 12 presets parse, round-trip and simulate 2 s without an unexpected warning (5)', async () => {
    expect(PRESETS).toHaveLength(12)
    for (const p of PRESETS) {
      const scene = p.buildScene()
      expect(parse(serialize(scene)), p.id).toStrictEqual(scene)
      expect(collectWarnings(scene), p.id).toStrictEqual([])
      const sim = await load(scene)
      expect(sim.warnings, p.id).toStrictEqual([])
      for (let i = 0; i < 120; i++) sim.step()
      for (const [id, s] of sim.readStates()) {
        expect(Number.isFinite(s.position.x) && Number.isFinite(s.position.y), `${p.id}/${id}`).toBe(true)
      }
    }
  })

  it('creating a scene from a preset names it in the current language (7)', () => {
    try {
      setLang('en')
      const res = createPresetScene(memStorage(), byId('atwood'), 1)
      expect('entry' in res && res.entry.name).toBe((en as Record<string, string>)['preset.atwood.name'])
    } finally {
      setLang('pt-BR')
    }
  })

  describe('each new preset reproduces its family (6)', () => {
    it('Atwood: a = (m₁−m₂)g/(m₁+m₂) within 2% (PHY-23)', async () => {
      const scene = byId('atwood').buildScene()
      const m1 = body(scene, 'bloco-1').mass
      const m2 = body(scene, 'bloco-2').mass
      expect(m1).toBeGreaterThan(m2)
      const a = ((m1 - m2) * scene.constants.g) / (m1 + m2)
      const dv = await dvOverOneSecond(scene, (s) => s.get('bloco-1')!.linvel.y)
      expect(Math.abs(-dv - a)).toBeLessThanOrEqual(0.02 * a)
    })

    it('block on the table pulled by a hanging block: a = (m₂ − μₖm₁)g/(m₁+m₂) within 5% (PHY-23)', async () => {
      const scene = byId('table-hanging').buildScene()
      const m1 = body(scene, 'bloco').mass
      const m2 = body(scene, 'pendurado').mass
      const contact = scene.contacts.find((c) => c.a === 'bloco' || c.b === 'bloco')!
      const a = ((m2 - contact.muK * m1) * scene.constants.g) / (m1 + m2)
      expect(contact.muK).toBeGreaterThan(0)
      expect(a).toBeGreaterThan(0)
      const dv = await dvOverOneSecond(scene, (s) => s.get('bloco')!.linvel.x)
      expect(Math.abs(dv - a)).toBeLessThanOrEqual(0.05 * a)
    })

    it('movable pulley: a_load = (2m − M)g/(M + 4m) within 2% (PHY-24)', async () => {
      const scene = byId('movable-pulley').buildScene()
      const M = body(scene, 'carga').mass
      const m = body(scene, 'contrapeso').mass
      const aLoad = ((2 * m - M) * scene.constants.g) / (M + 4 * m)
      const dv = await dvOverOneSecond(scene, (s) => s.get('carga')!.linvel.y)
      expect(Math.abs(dv - aLoad)).toBeLessThanOrEqual(0.02 * Math.abs(aLoad))
    })

    it('full-circle pendulum: v_top² > gL, goes all the way round with T > 0 and the rope at L (±1 mm) (PHY-24)', async () => {
      const scene = byId('loop-pendulum').buildScene()
      const pivot = world(scene, constraint(scene, 'corda').a)
      const bob = body(scene, 'bola')
      const L = Math.hypot(bob.position.x - pivot.x, bob.position.y - pivot.y)
      const v0 = Math.hypot(bob.vx ?? 0, bob.vy ?? 0)
      // Released at the bottom: v_top² = v₀² − 4gL.
      expect(bob.position.y).toBeLessThan(pivot.y)
      expect(v0 ** 2 - 4 * scene.constants.g * L).toBeGreaterThan(scene.constants.g * L)
      const sim = await load(scene)
      let swept = 0
      let prev = Math.atan2(bob.position.y - pivot.y, bob.position.x - pivot.x)
      let worst = 0
      let minT = Infinity
      for (let i = 0; Math.abs(swept) < 2 * Math.PI && i < 300; i++) {
        sim.step()
        const p = sim.readStates().get('bola')!.position
        const phi = Math.atan2(p.y - pivot.y, p.x - pivot.x)
        let d = phi - prev
        if (d < -Math.PI) d += 2 * Math.PI
        if (d > Math.PI) d -= 2 * Math.PI
        swept += d
        prev = phi
        const r = sim.readConstraints().find((c) => c.id === 'corda') as RopeState
        minT = Math.min(minT, r.slack ? 0 : r.tension)
        worst = Math.max(worst, Math.abs(Math.hypot(p.x - pivot.x, p.y - pivot.y) - L))
      }
      expect(Math.abs(swept)).toBeGreaterThanOrEqual(2 * Math.PI)
      expect(minT).toBeGreaterThan(0)
      expect(worst).toBeLessThanOrEqual(0.001)
    })

    it('simple pendulum, θ₀ ≤ 10°: period 2π√(L/g) within 2% over 3 oscillations (PHY-24)', async () => {
      const scene = byId('simple-pendulum').buildScene()
      const pivot = world(scene, constraint(scene, 'corda').a)
      const bob = body(scene, 'bola')
      const L = Math.hypot(bob.position.x - pivot.x, bob.position.y - pivot.y)
      expect(Math.abs(bob.position.x - pivot.x)).toBeGreaterThan(0)
      expect(Math.asin(Math.abs(bob.position.x - pivot.x) / L)).toBeLessThanOrEqual((10 * Math.PI) / 180 + 1e-9)
      const period = 2 * Math.PI * Math.sqrt(L / scene.constants.g)
      const sim = await load(scene)
      const x = run(sim, Math.ceil((4 * period) / TIMESTEP), () => sim.readStates().get('bola')!.position.x)
      const up = upCrossings(x, pivot.x)
      expect(up.length).toBeGreaterThanOrEqual(4)
      expect(Math.abs((up[3]! - up[0]!) / 3 - period)).toBeLessThanOrEqual(0.02 * period)
    })

    it('horizontal mass-spring: period 2π√(m/k) and amplitude after 5 periods within 2% (PHY-26)', async () => {
      const scene = byId('spring-horizontal').buildScene()
      const m = body(scene, 'bloco').mass
      const eq = horizontalEquilibrium(scene)
      const A = Math.abs(body(scene, 'bloco').position.x - eq)
      expect(A).toBeGreaterThan(0)
      const period = 2 * Math.PI * Math.sqrt(m / spring(scene).k)
      const sim = await load(scene)
      const x = run(sim, Math.ceil((6 * period) / TIMESTEP), () => sim.readStates().get('bloco')!.position.x)
      const up = upCrossings(x, eq)
      expect(up.length).toBeGreaterThanOrEqual(6)
      expect(Math.abs((up[5]! - up[0]!) / 5 - period)).toBeLessThanOrEqual(0.02 * period)
      const fifth = x.slice(Math.floor((4 * period) / TIMESTEP), Math.ceil((5 * period) / TIMESTEP) + 1)
      expect(Math.abs((Math.max(...fifth) - Math.min(...fifth)) / 2 - A)).toBeLessThanOrEqual(0.02 * A)
    })

    it('vertical mass-spring: equilibrium mg/k below the natural length and period 2π√(m/k) within 2% (PHY-26)', async () => {
      const scene = byId('spring-vertical').buildScene()
      const s = spring(scene)
      const m = body(scene, 'bloco').mass
      const top = world(scene, s.a).y
      const drop = (m * scene.constants.g) / s.k
      const period = 2 * Math.PI * Math.sqrt(m / s.k)
      const sim = await load(scene)
      const stretch = run(sim, Math.ceil((4 * period) / TIMESTEP), () => top - (sim.readStates().get('bloco')!.position.y + s.b.anchor.y) - s.x0)
      const whole = stretch.slice(0, Math.round((3 * period) / TIMESTEP) + 1)
      expect(Math.abs((Math.max(...whole) + Math.min(...whole)) / 2 - drop)).toBeLessThanOrEqual(0.02 * drop)
      const up = upCrossings(stretch, drop)
      expect(up.length).toBeGreaterThanOrEqual(4)
      expect(Math.abs((up[3]! - up[0]!) / 3 - period)).toBeLessThanOrEqual(0.02 * period)
    })

    it('damped mass-spring: successive peaks follow A·e^(−ct/2m) within 5% (PHY-26)', async () => {
      const scene = byId('spring-damped').buildScene()
      const s = spring(scene)
      const m = body(scene, 'bloco').mass
      const c = s.c ?? 0
      expect(c).toBeGreaterThan(0)
      const eq = horizontalEquilibrium(scene)
      const A = body(scene, 'bloco').position.x - eq
      expect(A).toBeGreaterThan(0)
      const damped = (2 * Math.PI) / Math.sqrt(s.k / m - (c / (2 * m)) ** 2)
      const sim = await load(scene)
      const d = run(sim, Math.ceil((5.5 * damped) / TIMESTEP), () => sim.readStates().get('bloco')!.position.x - eq)
      const peaks = peakTicks(d)
      expect(peaks.length).toBeGreaterThanOrEqual(5)
      for (const i of peaks) {
        const envelope = A * Math.exp((-c * i * TIMESTEP) / (2 * m))
        expect(Math.abs(d[i]! - envelope)).toBeLessThanOrEqual(0.05 * envelope)
      }
    })
  })
})
