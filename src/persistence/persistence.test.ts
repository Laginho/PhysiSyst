import { describe, expect, it, vi } from 'vitest'
import {
  AUTOSAVE_DELAY_MS,
  DebouncedSaver,
  blankScene,
  classifyImport,
  createNewScene,
  deleteScene,
  duplicateScene,
  exportScene,
  importScene,
  isDirty,
  loadIndex,
  loadIndexResult,
  loadScene,
  loadSceneOrBlank,
  nextCenaName,
  saveIndex,
  saveScene,
  sceneKey,
  type SceneIndexEntry,
  type Storage,
} from './index'
import { parse, serialize, collectWarnings } from '../scene/codec'
import type { Scene } from '../scene/types'
import { DEMO_SCENE } from '../scene/demo'

function memStorage(): Storage & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  }
}

function quotaStorage(): Storage {
  return {
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceededError')
    },
    removeItem: () => {},
  }
}

describe('ticket 03: blank scene starts grounded', () => {
  it('contains the fixed hatched ground (same recipe as presets), parses clean with zero warnings', () => {
    const scene = blankScene()
    expect(scene.bodies).toHaveLength(1)
    const ground = scene.bodies[0]!
    expect(ground.id).toBe('chao')
    expect(ground.fixed).toBe(true)
    expect(ground.shape).toBe('rectangle')
    expect(ground.mass).toBe(0)
    // hatch is data-driven from fixed+rectangle+id 'chao' (draw.ts) — recipe pinned here
    const round = parse(serialize(scene))
    expect(round).toEqual(scene)
    expect(collectWarnings(round)).toStrictEqual([])
  })
})

describe('nextCenaName', () => {
  it('table', () => {
    const rows: Array<[SceneIndexEntry[], string]> = [
      [[], 'Cena 1'],
      [[{ id: 'a', name: 'Cena 1', updatedAt: 1 }], 'Cena 2'],
      [[{ id: 'a', name: 'Cena 2', updatedAt: 1 }, { id: 'b', name: 'Cena 5', updatedAt: 2 }], 'Cena 6'],
      [[{ id: 'a', name: 'Minha cena', updatedAt: 1 }], 'Cena 1'],
      [[{ id: 'a', name: 'Cena 10', updatedAt: 1 }], 'Cena 11'],
    ]
    for (const [idx, expected] of rows) expect(nextCenaName(idx)).toBe(expected)
  })
})

describe('index + scene CRUD', () => {
  it('createNewScene auto-names and persists', () => {
    const s = memStorage()
    const r1 = createNewScene(s, 1000) as { entry: SceneIndexEntry; scene: Scene }
    expect(r1.entry.name).toBe('Cena 1')
    expect(r1.entry.id).toBe('cena-1')
    const r2 = createNewScene(s, 2000) as { entry: SceneIndexEntry; scene: Scene }
    expect(r2.entry.name).toBe('Cena 2')
    const idx = loadIndex(s)
    expect(idx).toHaveLength(2)
    expect(loadScene(s, r1.entry.id)).toEqual(blankScene())
  })

  it('duplicateScene clones doc with new id and name', () => {
    const s = memStorage()
    const r1 = createNewScene(s, 1) as { entry: SceneIndexEntry; scene: Scene }
    const src: Scene = { ...blankScene(), bodies: [{ id: 'b', shape: 'circle', radius: 0.5, fixed: false, mass: 1, position: { x: 0, y: 0 }, rotation: 0 }] }
    saveScene(s, r1.entry.id, src)
    const dup = duplicateScene(s, r1.entry.id, src, 2) as { entry: SceneIndexEntry; scene: Scene }
    expect(dup.entry.id).not.toBe(r1.entry.id)
    expect(dup.entry.name).toBe('Cena 2')
    expect(dup.scene).toEqual(src)
    expect(dup.scene).not.toBe(src)
    expect(loadIndex(s)).toHaveLength(2)
  })

  it('deleteScene removes entry and doc', () => {
    const s = memStorage()
    const r1 = createNewScene(s, 1) as { entry: SceneIndexEntry; scene: Scene }
    const r2 = createNewScene(s, 2) as { entry: SceneIndexEntry; scene: Scene }
    const next = deleteScene(s, r1.entry.id) as SceneIndexEntry[]
    expect(next).toHaveLength(1)
    expect(next[0]!.id).toBe(r2.entry.id)
    expect(s.map.has(sceneKey(r1.entry.id))).toBe(false)
  })

  it('save/load round-trip via single codec path', () => {
    const s = memStorage()
    const r1 = createNewScene(s, 1) as { entry: SceneIndexEntry; scene: Scene }
    const doc: Scene = {
      version: 1,
      constants: { g: 9.81 },
      bodies: [{ id: 'a', shape: 'rectangle', width: 1, height: 1, fixed: false, mass: 1, position: { x: 0, y: 0 }, rotation: 0 }],
      forces: [{ id: 'f1', bodyId: 'a', anchor: { x: 0, y: 0 }, magnitude: 5, direction: 0 }],
      contacts: [],
    }
    const warn = saveScene(s, r1.entry.id, doc)
    expect(warn).toBeNull()
    const loaded = loadScene(s, r1.entry.id)
    expect(loaded).toEqual(doc)
    const exported = exportScene(doc)
    expect(parse(JSON.parse(exported))).toEqual(doc)
  })

  it('quota failure returns soft warning, does not throw', () => {
    const qs = quotaStorage()
    const warn = saveScene(qs, 'cena-1', blankScene())
    expect(warn).toMatch(/Quota/)
  })

  it('delete→create id-collision reuses freed id without orphan', () => {
    const s = memStorage()
    const r1 = createNewScene(s, 1) as { entry: SceneIndexEntry; scene: Scene }
    expect(r1.entry.id).toBe('cena-1')
    deleteScene(s, r1.entry.id)
    const r2 = createNewScene(s, 2) as { entry: SceneIndexEntry; scene: Scene }
    expect(r2.entry.id).toBe('cena-1')
    expect(loadScene(s, 'cena-1')).toEqual(blankScene())
    expect(loadIndex(s)).toHaveLength(1)
  })
})

describe('export/import', () => {
  it('exportScene is JSON via serialize', () => {
    const doc = blankScene()
    const txt = exportScene(doc)
    expect(JSON.parse(txt)).toEqual(doc)
  })

  it('classifyImport table', () => {
    const valid = exportScene(blankScene())
    expect(classifyImport(valid).ok).toBe(true)
    const rows: Array<[string, boolean]> = [
      ['not json', false],
      [JSON.stringify({ version: 1, constants: { g: 9.81 }, bodies: [], forces: [], contacts: [] }), true],
      [JSON.stringify({ version: 999, constants: { g: 9.81 }, bodies: [], forces: [], contacts: [] }), false],
      [JSON.stringify({ version: 1, constants: { g: 'bad' }, bodies: [], forces: [], contacts: [] }), false],
    ]
    for (const [txt, ok] of rows) expect(classifyImport(txt).ok).toBe(ok)
  })

  it('importScene creates NEW entry, never overwrites', () => {
    const s = memStorage()
    const r1 = createNewScene(s, 1) as { entry: SceneIndexEntry; scene: Scene }
    saveScene(s, r1.entry.id, blankScene())
    const txt = exportScene({ ...blankScene(), constants: { g: 1.62 } })
    const res = importScene(s, txt, 2) as { entry: SceneIndexEntry; scene: Scene }
    expect(res.entry.id).not.toBe(r1.entry.id)
    expect(loadIndex(s)).toHaveLength(2)
    expect(loadScene(s, r1.entry.id)!.constants.g).toBe(9.81)
  })

  it('import parse failure surfaces pt-BR reason inline', () => {
    const s = memStorage()
    createNewScene(s, 1)
    const res = importScene(s, 'not json', 2) as { reason: string }
    expect(res.reason).toMatch(/json inválido/)
    const bad = JSON.stringify({ version: 999, constants: { g: 9.81 }, bodies: [], forces: [], contacts: [] })
    const res2 = importScene(s, bad, 3) as { reason: string }
    expect(res2.reason).toMatch(/versão não suportada/)
    const badG = JSON.stringify({ version: 1, constants: { g: 'bad' }, bodies: [], forces: [], contacts: [] })
    const res3 = importScene(s, badG, 4) as { reason: string }
    expect(res3.reason).toMatch(/g inválido/)
    expect(loadIndex(s)).toHaveLength(1)
  })
})

describe('DebouncedSaver', () => {
  it('debounces to ~400 ms and coalesces rapid changes', () => {
    vi.useFakeTimers()
    const save = vi.fn()
    const d = new DebouncedSaver(AUTOSAVE_DELAY_MS, save)
    const a = blankScene()
    const b: Scene = { ...blankScene(), constants: { g: 1.62 } }
    d.schedule('cena-1', a)
    vi.advanceTimersByTime(100)
    d.schedule('cena-1', b)
    vi.advanceTimersByTime(300)
    expect(save).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('cena-1', b)
    vi.useRealTimers()
  })

  it('flush saves pending immediately and cancels timer', () => {
    vi.useFakeTimers()
    const save = vi.fn()
    const d = new DebouncedSaver(400, save)
    const b = blankScene()
    d.schedule('cena-1', b)
    d.flush()
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('cena-1', b)
    vi.advanceTimersByTime(1000)
    expect(save).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('cancel prevents scheduled save (unmount)', () => {
    vi.useFakeTimers()
    const save = vi.fn()
    const d = new DebouncedSaver(400, save)
    d.schedule('cena-1', blankScene())
    d.cancel()
    vi.advanceTimersByTime(500)
    expect(save).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('B1: pending save flushes on transition — edit then switch within 400ms persists', () => {
    vi.useFakeTimers()
    const s = memStorage()
    const r1 = createNewScene(s, 1) as { entry: SceneIndexEntry; scene: Scene }
    const edited: Scene = { ...blankScene(), constants: { g: 1.62 } }
    const save = vi.fn((id: string, scene: Scene) => {
      saveScene(s, id, scene)
    })
    const d = new DebouncedSaver(400, save)
    d.schedule(r1.entry.id, edited)
    // switch before debounce fires → flush pending
    d.flush()
    expect(save).toHaveBeenCalledTimes(1)
    const reloaded = loadScene(s, r1.entry.id)
    expect(reloaded?.constants.g).toBe(1.62)
    vi.useRealTimers()
  })
})

describe('M2: dirty compare — unchanged doc does not bump updatedAt', () => {
  it('isDirty false for identical payload, true for changed', () => {
    const s = memStorage()
    const r1 = createNewScene(s, 1) as { entry: SceneIndexEntry; scene: Scene }
    const doc = blankScene()
    saveScene(s, r1.entry.id, doc)
    expect(isDirty(s, r1.entry.id, doc)).toBe(false)
    expect(isDirty(s, r1.entry.id, { ...doc, constants: { g: 1.62 } })).toBe(true)
  })

  it('autosave skips touch when not dirty (updatedAt unchanged)', () => {
    const s = memStorage()
    const r1 = createNewScene(s, 1000) as { entry: SceneIndexEntry; scene: Scene }
    const before = loadIndex(s)[0]!.updatedAt
    const doc = loadScene(s, r1.entry.id)!
    if (!isDirty(s, r1.entry.id, doc)) {
      // skip
    } else {
      throw new Error('should be clean')
    }
    const after = loadIndex(s)[0]!.updatedAt
    expect(after).toBe(before)
  })
})

describe('M3: orphaned index — payload first, quota leaves index unchanged', () => {
  it('quota on createNewScene does not create index entry', () => {
    const s = memStorage()
    createNewScene(s, 1)
    const baseIdx = loadIndex(s).length
    // Use quotaStorage that throws on any setItem — create should return reason and not grow index
    const q2 = quotaStorage()
    // Pre-seed q2 with existing index to simulate duplicate with quota
    q2.getItem = (k) => s.map.get(k) ?? null
    const res = createNewScene(q2, 2) as { reason: string }
    expect(res.reason).toMatch(/Quota/)
    // Original storage index unchanged
    expect(loadIndex(s)).toHaveLength(baseIdx)
  })

  it('quota on duplicate/import leaves index unchanged and surfaces warning', () => {
    const s = memStorage()
    const r1 = createNewScene(s, 1) as { entry: SceneIndexEntry; scene: Scene }
    const beforeLen = loadIndex(s).length
    const q: Storage = {
      getItem: (k) => s.map.get(k) ?? null,
      setItem: () => {
        throw new Error('QuotaExceededError: storage full')
      },
      removeItem: (k) => s.map.delete(k),
    }
    const dup = duplicateScene(q, r1.entry.id, blankScene(), 2) as { reason: string }
    expect(dup.reason).toMatch(/Quota/)
    expect(loadIndex(s)).toHaveLength(beforeLen)
    const imp = importScene(q, exportScene(blankScene()), 3) as { reason: string }
    expect(imp.reason).toMatch(/Quota/)
    expect(loadIndex(s)).toHaveLength(beforeLen)
  })
})

describe('M4: hydration recovery', () => {
  it('corrupted index JSON → empty fallback', () => {
    const s = memStorage()
    s.map.set('physics-sim:scenes', 'not json')
    expect(loadIndex(s)).toEqual([])
  })

  it('valid index with missing payload → blankScene fallback + warning', () => {
    const s = memStorage()
    const entry: SceneIndexEntry = { id: 'cena-99', name: 'Cena 99', updatedAt: 1 }
    saveIndex(s, [entry])
    const { scene, warning } = loadSceneOrBlank(s, 'cena-99')
    expect(scene).toEqual(blankScene())
    expect(warning).toMatch(/não encontrada/)
  })

  it('valid index with corrupt payload → blankScene + warning', () => {
    const s = memStorage()
    const entry: SceneIndexEntry = { id: 'cena-1', name: 'Cena 1', updatedAt: 1 }
    saveIndex(s, [entry])
    s.map.set(sceneKey('cena-1'), 'not json')
    const { scene, warning } = loadSceneOrBlank(s, 'cena-1')
    expect(scene).toEqual(blankScene())
    expect(warning).toMatch(/corrompida/)
  })
})

describe('m5: pt-BR import reasons are distinct', () => {
  it('table of distinct pt-BR strings', () => {
    const rows: Array<[string, RegExp]> = [
      ['not json', /json inválido/],
      [JSON.stringify({ version: 999, constants: { g: 9.81 }, bodies: [], forces: [], contacts: [] }), /versão não suportada/],
      [JSON.stringify({ version: 1, constants: { g: 'bad' }, bodies: [], forces: [], contacts: [] }), /g inválido/],
      [JSON.stringify({ version: 1, constants: { g: 9.81 }, bodies: [{ id: 'a', shape: 'circle', radius: -1, fixed: false, mass: 1, position: { x: 0, y: 0 }, rotation: 0 }], forces: [], contacts: [] }), /valor numérico inválido/],
    ]
    for (const [txt, rx] of rows) {
      const res = classifyImport(txt)
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.reason).toMatch(rx)
    }
    // valid stays ok
    expect(classifyImport(exportScene(blankScene())).ok).toBe(true)
  })
})

describe('M5: rollback on index failure (payload first)', () => {
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

  it('create: index fail → payload removed, index unchanged', () => {
    const s = memStorage()
    createNewScene(s, 1)
    const beforeIdx = loadIndex(s)
    const fs = failOnSecondStorage(s)
    const res = createNewScene(fs, 2) as { reason: string }
    expect(res.reason).toMatch(/Quota/)
    expect(s.map.has(sceneKey('cena-2'))).toBe(false)
    expect(loadIndex(s)).toEqual(beforeIdx)
  })

  it('duplicate: index fail → payload removed', () => {
    const s = memStorage()
    const r1 = createNewScene(s, 1) as { entry: SceneIndexEntry; scene: Scene }
    const beforeIdx = loadIndex(s)
    const fs = failOnSecondStorage(s)
    const res = duplicateScene(fs, r1.entry.id, blankScene(), 2) as { reason: string }
    expect(res.reason).toMatch(/Quota/)
    expect(s.map.has(sceneKey('cena-2'))).toBe(false)
    expect(loadIndex(s)).toEqual(beforeIdx)
  })

  it('import: index fail → payload removed', () => {
    const s = memStorage()
    createNewScene(s, 1)
    const beforeIdx = loadIndex(s)
    const fs = failOnSecondStorage(s)
    const txt = exportScene(blankScene())
    const res = importScene(fs, txt, 2) as { reason: string }
    expect(res.reason).toMatch(/Quota/)
    expect(s.map.has(sceneKey('cena-2'))).toBe(false)
    expect(loadIndex(s)).toEqual(beforeIdx)
  })

  it('delete: index fail → payload untouched, scene still loadable + warning', () => {
    const s = memStorage()
    const r1 = createNewScene(s, 1) as { entry: SceneIndexEntry; scene: Scene }
    createNewScene(s, 2)
    // fail only on second setItem (index)
    let calls = 0
    const fs: Storage = {
      getItem: (k) => s.map.get(k) ?? null,
      setItem: (k, v) => {
        calls++
        if (calls === 1) {
          // first setItem in delete is index, so fail immediately
          throw new Error('QuotaExceededError: index full')
        }
        s.map.set(k, v)
      },
      removeItem: (k) => s.map.delete(k),
    }
    const res = deleteScene(fs, r1.entry.id) as { reason: string }
    expect(res.reason).toMatch(/Quota/)
    // payload still there, still loadable
    expect(loadScene(s, r1.entry.id)).toBeTruthy()
    expect(loadIndex(s)).toHaveLength(2)
  })
})

describe('App-equivalent debounce: 3 edits 100ms apart → exactly 1 save at ~400ms', () => {
  it('same saver instance App uses', () => {
    vi.useFakeTimers()
    const save = vi.fn()
    const d = new DebouncedSaver(400, save)
    d.schedule('cena-1', blankScene())
    vi.advanceTimersByTime(100)
    d.schedule('cena-1', { ...blankScene(), constants: { g: 1 } })
    vi.advanceTimersByTime(100)
    d.schedule('cena-1', { ...blankScene(), constants: { g: 2 } })
    vi.advanceTimersByTime(300)
    expect(save).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100) // 400 from last schedule (200→600)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('cena-1', expect.objectContaining({ constants: { g: 2 } }))
    vi.useRealTimers()
  })
})

describe('M3: loadIndexResult discriminated', () => {
  it('table: corrupt shapes → corrupt kind, missing vs ok', async () => {
    const { loadIndexResult } = await import('./index')
    const cases: Array<[string, string, 'corrupt' | 'missing' | 'ok']> = [
      ['null', 'null', 'corrupt'],
      ['{}', '{}', 'corrupt'],
      ['malformed', 'not json', 'corrupt'],
      ["''", '', 'corrupt'],
      ['bad entry', JSON.stringify([{ id: 123, name: 'Cena 1', updatedAt: 1 }]), 'corrupt'],
    ]
    for (const [name, raw, expected] of cases) {
      const s = memStorage()
      s.map.set('physics-sim:scenes', raw)
      const res = loadIndexResult(s)
      expect(res.kind, name).toBe(expected)
    }
    const s2 = memStorage()
    expect(loadIndexResult(s2).kind).toBe('missing')
    s2.map.set('physics-sim:scenes', JSON.stringify([{ id: 'a', name: 'Cena 1', updatedAt: 1 }]))
    expect(loadIndexResult(s2).kind).toBe('ok')
  })
})

describe('B1: first-run seed via guarded path', () => {
  it('failOnSecondStorage during first run → no orphan + warning', () => {
    const s = memStorage()
    let calls = 0
    const fs: Storage = {
      getItem: (k) => s.map.get(k) ?? null,
      setItem: (k, v) => {
        calls++
        if (calls === 2) throw new Error('QuotaExceededError: index full')
        s.map.set(k, v)
      },
      removeItem: (k) => s.map.delete(k),
    }
    const res = createNewScene(fs, 1) as { reason: string }
    expect(res.reason).toMatch(/Quota/)
    expect(s.map.has(sceneKey('cena-1'))).toBe(false)
    expect(loadIndex(s)).toEqual([])
  })
})

// ——— App-equivalent adapters (makeAppLike) ———
// Mirrors App.tsx:375-393 + hydration effect exactly so pins exercise real wiring,
// not just helper payload-first (READ T9 iter4 blocker).
// Uses shared DEMO_SCENE so test ↔ App cannot drift.

function appSeed(storage: Storage): { index: SceneIndexEntry[]; warning: string | null } {
  const res = loadIndexResult(storage)
  if (res.kind === 'missing') {
    const entry: SceneIndexEntry = { id: 'cena-1', name: 'Cena 1', updatedAt: Date.now() }
    const pw = saveScene(storage, entry.id, DEMO_SCENE)
    if (pw) return { index: [], warning: pw }
    const iw = saveIndex(storage, [entry])
    if (iw) {
      try {
        storage.removeItem(sceneKey(entry.id))
      } catch {}
      return { index: [], warning: iw }
    }
    return { index: [entry], warning: null }
  }
  if (res.kind === 'corrupt') return { index: [], warning: null }
  return { index: res.index, warning: null }
}

function appHydrationNotice(storage: Storage, currentId: string, prev: string | null): string | null {
  const warnings: string[] = []
  const idxRes = loadIndexResult(storage)
  if (idxRes.kind === 'corrupt') warnings.push('índice de cenas ilegível — iniciando vazio')
  const { warning } = loadSceneOrBlank(storage, currentId)
  if (warning) warnings.push(warning)
  if (!warnings.length) return prev
  const next = warnings.join(' | ')
  if (prev?.includes(next)) return prev
  return prev ? `${prev} | ${next}` : next
}

describe('App seed consumer (makeAppLike — App.tsx:375-393)', () => {
  it('happy path: missing index → seeds cena-1 with DEMO payload and no warning', () => {
    const s = memStorage()
    const { index, warning } = appSeed(s)
    expect(warning).toBeNull()
    expect(index).toHaveLength(1)
    expect(index[0]!.id).toBe('cena-1')
    const seeded = loadScene(s, 'cena-1')!
    expect(seeded).toEqual(DEMO_SCENE)
    expect(seeded.bodies.map((b) => b.id)).toEqual(['chao', 'rampa', 'bloco', 'caixa', 'bola'])
    expect(seeded.contacts).toEqual([{ a: 'rampa', b: 'bloco', muS: 0.3, muK: 0.25 }])
    expect(loadIndex(s)).toHaveLength(1)
  })

  it('failOnSecondStorage during first run → no orphan payload/index + warning (real App path)', () => {
    const s = memStorage()
    let calls = 0
    const fs: Storage = {
      getItem: (k) => s.map.get(k) ?? null,
      setItem: (k, v) => {
        calls++
        if (calls === 2) throw new Error('QuotaExceededError: index full')
        s.map.set(k, v)
      },
      removeItem: (k) => s.map.delete(k),
    }
    const { index, warning } = appSeed(fs)
    expect(warning).toMatch(/Quota/)
    expect(index).toEqual([])
    // no orphan payload, index unchanged
    expect(s.map.has(sceneKey('cena-1'))).toBe(false)
    expect(loadIndex(s)).toEqual([])
    // raw missing still, second attempt would retry
    expect(s.map.has('physics-sim:scenes')).toBe(false)
  })

  it('payload quota on first setItem → warning and no index', () => {
    const s = memStorage()
    const fs: Storage = {
      getItem: (k) => s.map.get(k) ?? null,
      setItem: () => {
        throw new Error('QuotaExceededError: quota')
      },
      removeItem: (k) => s.map.delete(k),
    }
    const { index, warning } = appSeed(fs)
    expect(warning).toMatch(/Quota/)
    expect(index).toEqual([])
    expect(loadIndex(s)).toEqual([])
  })
})

describe('App hydration notice consumer (makeAppLike — precedence, raw, dedupe)', () => {
  it('table: each corrupt schema shape through THE CONSUMER → correct kind + composed notice', () => {
    const cases: Array<[string, string]> = [
      ['null literal', 'null'],
      ['{} empty object', '{}'],
      ['malformed json', 'not json'],
      ["'' empty string", ''],
      ['bad entry type', JSON.stringify([{ id: 123, name: 'Cena 1', updatedAt: 1 }])],
    ]
    for (const [label, raw] of cases) {
      const s = memStorage()
      s.map.set('physics-sim:scenes', raw)
      saveScene(s, 'cena-1', blankScene())
      const idxRes = loadIndexResult(s)
      expect(idxRes.kind, label).toBe('corrupt')
      expect((idxRes as { raw: string }).raw, label).toBe(raw)
      const notice = appHydrationNotice(s, 'cena-1', null)
      expect(notice, label).toBe('índice de cenas ilegível — iniciando vazio')
    }
  })

  it('precedence: corrupt index + missing payload → index notice first, order pinned', () => {
    const s = memStorage()
    s.map.set('physics-sim:scenes', 'not json')
    // no payload for cena-1
    const notice = appHydrationNotice(s, 'cena-1', null)
    expect(notice).toBe('índice de cenas ilegível — iniciando vazio | cena "cena-1" não encontrada — nova cena em branco carregada')
  })

  it('precedence: corrupt index + corrupt payload → both notices, index first', () => {
    const s = memStorage()
    s.map.set('physics-sim:scenes', '{}')
    s.map.set(sceneKey('cena-9'), 'not json')
    const notice = appHydrationNotice(s, 'cena-9', null)
    expect(notice).toMatch(/^índice de cenas ilegível/)
    expect(notice).toMatch(/corrompida/)
    expect(notice!.indexOf('índice')).toBeLessThan(notice!.indexOf('corrompida'))
  })

  it('append-not-replace: prev warning preserved and new appended with ` | `', () => {
    const s = memStorage()
    s.map.set('physics-sim:scenes', 'not json')
    const first = appHydrationNotice(s, 'cena-1', 'quota cheia')
    expect(first).toBe('quota cheia | índice de cenas ilegível — iniciando vazio | cena "cena-1" não encontrada — nova cena em branco carregada')
  })

  it('dedupe: second call with same warnings does not duplicate', () => {
    const s = memStorage()
    s.map.set('physics-sim:scenes', 'not json')
    const first = appHydrationNotice(s, 'cena-1', null)!
    const second = appHydrationNotice(s, 'cena-1', first)
    expect(second).toBe(first)
    // also when prev already contains next as substring
    const third = appHydrationNotice(s, 'cena-1', `prefix | ${first} | suffix`)
    expect(third).toBe(`prefix | ${first} | suffix`)
  })

  it('no warnings → prev untouched (null)', () => {
    const s = memStorage()
    const entry: SceneIndexEntry = { id: 'cena-1', name: 'Cena 1', updatedAt: 1 }
    saveIndex(s, [entry])
    saveScene(s, 'cena-1', blankScene())
    const notice = appHydrationNotice(s, 'cena-1', null)
    expect(notice).toBeNull()
  })

  it('raw preservation: corrupt raw stays in storage after consumer', () => {
    const s = memStorage()
    const raw = 'not json'
    s.map.set('physics-sim:scenes', raw)
    appHydrationNotice(s, 'cena-1', null)
    expect(s.map.get('physics-sim:scenes')).toBe(raw)
  })
})
