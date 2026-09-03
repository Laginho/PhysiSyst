import { parse, serialize, SceneParseError } from '../scene/codec'
import type { Body, Scene } from '../scene/types'

export const INDEX_KEY = 'physics-sim:scenes'
export const SCENE_KEY_PREFIX = 'physics-sim:scene:'
export const GALLERY_ACK_KEY = 'physics-sim:galleryAck'
export const AUTOSAVE_DELAY_MS = 400

export function isGalleryAcked(storage: Storage): boolean {
  return storage.getItem(GALLERY_ACK_KEY) === 'true'
}
export function ackGallery(storage: Storage): void {
  try {
    storage.setItem(GALLERY_ACK_KEY, 'true')
  } catch {}
}
export function shouldShowGallery(storage: Storage): boolean {
  if (isGalleryAcked(storage)) return false
  return loadIndex(storage).length === 1
}

export interface Storage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface SceneIndexEntry {
  id: string
  name: string
  updatedAt: number
}

export function sceneKey(id: string): string {
  return `${SCENE_KEY_PREFIX}${id}`
}

export function nextCenaName(index: readonly SceneIndexEntry[]): string {
  let max = 0
  for (const e of index) {
    const m = e.name.match(/^Cena (\d+)$/)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `Cena ${max + 1}`
}

/**
 * The hatched ground recipe shared by blankScene and the presets. Hatch is
 * data-driven from fixed+rectangle+id 'chao' (draw.ts) — keep all three.
 * Key order mirrors parse()'s canonical output so blankScene round-trips
 * byte-stably through serialize→parse→serialize (isDirty compares strings).
 */
export function groundBody(): Body {
  return { shape: 'rectangle', width: 20, height: 1, id: 'chao', fixed: true, mass: 0, position: { x: 6, y: -0.5 }, rotation: 0 }
}

export function blankScene(): Scene {
  return { version: 1, constants: { g: 9.81 }, bodies: [groundBody()], forces: [], contacts: [] }
}

export type IndexLoadResult =
  | { kind: 'ok'; index: SceneIndexEntry[] }
  | { kind: 'missing'; index: [] }
  | { kind: 'corrupt'; index: []; raw: string; error: string }

export function loadIndexResult(storage: Storage): IndexLoadResult {
  const raw = storage.getItem(INDEX_KEY)
  if (raw === null) return { kind: 'missing', index: [] }
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return { kind: 'corrupt', index: [], raw, error: 'formato de índice inválido' }
    const filtered = parsed.filter(
      (e): e is SceneIndexEntry => typeof e?.id === 'string' && typeof e?.name === 'string' && typeof e?.updatedAt === 'number',
    )
    if (filtered.length !== parsed.length) return { kind: 'corrupt', index: [], raw, error: 'entrada de índice inválida' }
    return { kind: 'ok', index: filtered }
  } catch (e) {
    return { kind: 'corrupt', index: [], raw, error: e instanceof Error ? e.message : String(e) }
  }
}

export function loadIndex(storage: Storage): SceneIndexEntry[] {
  const res = loadIndexResult(storage)
  return res.index
}

export function saveIndex(storage: Storage, index: readonly SceneIndexEntry[]): string | null {
  try {
    storage.setItem(INDEX_KEY, JSON.stringify(index))
    return null
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

export function loadScene(storage: Storage, id: string): Scene | null {
  const raw = storage.getItem(sceneKey(id))
  if (!raw) return null
  try {
    const json = JSON.parse(raw)
    return parse(json)
  } catch {
    return null
  }
}

/**
 * Persists DOC only (never transient sim states). Returns warning string on quota failure, null on success.
 * Uses the single codec serialize path (Seam 2).
 */
export function saveScene(storage: Storage, id: string, scene: Scene): string | null {
  try {
    const payload = JSON.stringify(serialize(scene))
    storage.setItem(sceneKey(id), payload)
    return null
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

export function removeScene(storage: Storage, id: string): void {
  storage.removeItem(sceneKey(id))
}

/**
 * Creates a new blank scene entry with auto-name. Payload first, index second only on success.
 * Returns the new entry and blank doc, or a reason on quota failure.
 */
export function createNewScene(storage: Storage, now = Date.now()): { entry: SceneIndexEntry; scene: Scene } | { reason: string } {
  const index = loadIndex(storage)
  const id = freshId(index)
  const name = nextCenaName(index)
  const entry: SceneIndexEntry = { id, name, updatedAt: now }
  const scene = blankScene()
  const payloadWarn = saveScene(storage, id, scene)
  if (payloadWarn) return { reason: payloadWarn }
  const idxWarn = saveIndex(storage, [...index, entry])
  if (idxWarn) {
    // Roll back orphan payload
    try {
      removeScene(storage, id)
    } catch {}
    return { reason: idxWarn }
  }
  return { entry, scene }
}

export function duplicateScene(storage: Storage, _sourceId: string, sourceScene: Scene, now = Date.now()): { entry: SceneIndexEntry; scene: Scene } | { reason: string } {
  const index = loadIndex(storage)
  const id = freshId(index)
  const name = nextCenaName(index)
  const entry: SceneIndexEntry = { id, name, updatedAt: now }
  const clone: Scene = JSON.parse(JSON.stringify(sourceScene)) as Scene
  const payloadWarn = saveScene(storage, id, clone)
  if (payloadWarn) return { reason: payloadWarn }
  const idxWarn = saveIndex(storage, [...index, entry])
  if (idxWarn) {
    try {
      removeScene(storage, id)
    } catch {}
    return { reason: idxWarn }
  }
  return { entry, scene: clone }
}

export function deleteScene(storage: Storage, id: string): SceneIndexEntry[] | { reason: string } {
  const index = loadIndex(storage)
  const next = index.filter((e) => e.id !== id)
  const idxWarn = saveIndex(storage, next)
  if (idxWarn) return { reason: idxWarn }
  removeScene(storage, id)
  return next
}

export function touchScene(storage: Storage, id: string, now = Date.now()): string | null {
  const index = loadIndex(storage)
  const next = index.map((e) => (e.id === id ? { ...e, updatedAt: now } : e))
  return saveIndex(storage, next)
}

function freshId(index: readonly SceneIndexEntry[]): string {
  let n = 1
  const ids = new Set(index.map((e) => e.id))
  while (ids.has(`cena-${n}`)) n++
  return `cena-${n}`
}

/**
 * Export via the same serialize path. Returns JSON string (caller triggers download).
 */
export function exportScene(scene: Scene): string {
  return JSON.stringify(serialize(scene), null, 2)
}

/**
 * Maps low-level parse errors to distinct pt-BR strings for import feedback.
 */
function toPtBrReason(e: unknown, rawText: string): string {
  if (e instanceof SceneParseError) {
    const msg = e.message
    if (msg.includes('unsupported scene version')) return 'versão não suportada'
    if (msg.includes('constants.g')) return 'g inválido'
    if (msg.includes('alpha')) return 'ângulo α inválido'
    if (msg.includes('must be a finite number') || msg.includes('must be a positive')) return 'valor numérico inválido'
    if (msg.includes('missing key') || msg.includes('unknown key') || msg.includes('unknown shape')) return 'formato de cena inválido'
    return `cena inválida: ${msg}`
  }
  // JSON parse failure
  try {
    JSON.parse(rawText)
  } catch (je) {
    return `json inválido: ${je instanceof Error ? je.message : String(je)}`
  }
  return e instanceof Error ? e.message : String(e)
}

export function classifyImport(text: string): { ok: true; scene: Scene } | { ok: false; reason: string } {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (e) {
    return { ok: false, reason: `json inválido: ${e instanceof Error ? e.message : String(e)}` }
  }
  try {
    const scene = parse(json)
    return { ok: true, scene }
  } catch (e) {
    return { ok: false, reason: toPtBrReason(e, text) }
  }
}

export function importScene(storage: Storage, text: string, now = Date.now()): { entry: SceneIndexEntry; scene: Scene } | { reason: string } {
  const res = classifyImport(text)
  if (!res.ok) return { reason: res.reason }
  const index = loadIndex(storage)
  const id = freshId(index)
  const name = nextCenaName(index)
  const entry: SceneIndexEntry = { id, name, updatedAt: now }
  const payloadWarn = saveScene(storage, id, res.scene)
  if (payloadWarn) return { reason: payloadWarn }
  const idxWarn = saveIndex(storage, [...index, entry])
  if (idxWarn) {
    try {
      removeScene(storage, id)
    } catch {}
    return { reason: idxWarn }
  }
  return { entry, scene: res.scene }
}

/**
 * Helpers for dirty autosave and hydration.
 */
export function isDirty(storage: Storage, id: string, scene: Scene): boolean {
  const payload = JSON.stringify(serialize(scene))
  const stored = storage.getItem(sceneKey(id))
  return stored !== payload
}

export function loadSceneOrBlank(storage: Storage, id: string): { scene: Scene; warning: string | null } {
  const raw = storage.getItem(sceneKey(id))
  if (raw === null) return { scene: blankScene(), warning: `cena "${id}" não encontrada — nova cena em branco carregada` }
  try {
    const json = JSON.parse(raw)
    return { scene: parse(json), warning: null }
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e)
    return { scene: blankScene(), warning: `cena "${id}" corrompida (${reason}) — nova cena em branco carregada` }
  }
}

/**
 * Debounced autosave helper. Holds the pending pair so flush() can
 * synchronously persist the previous (id,doc) on scene transitions.
 * Cancel is only for unmount.
 */
export class DebouncedSaver {
  private timer: ReturnType<typeof setTimeout> | null = null
  private pendingId: string | null = null
  private pendingScene: Scene | null = null

  constructor(
    private readonly delayMs: number,
    private readonly save: (id: string, scene: Scene) => void,
  ) {}

  schedule(id: string, scene: Scene): void {
    this.pendingId = id
    this.pendingScene = scene
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      const pid = this.pendingId
      const pscene = this.pendingScene
      this.timer = null
      this.pendingId = null
      this.pendingScene = null
      if (pid && pscene) this.save(pid, pscene)
    }, this.delayMs)
  }

  getPendingId(): string | null {
    return this.pendingId
  }

  cancel(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.pendingId = null
    this.pendingScene = null
  }

  flush(): void {
    if (this.pendingId && this.pendingScene) {
      const pid = this.pendingId
      const pscene = this.pendingScene
      this.cancel()
      this.save(pid, pscene)
    }
  }
}
