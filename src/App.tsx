import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppliedForce, Body, ConstraintEnd, Pulley, Rope, Scene, Spring, Vec2 } from './scene'
import { bodyPointToWorld, collectWarnings, scenePath, serialize } from './scene'
import {
  advance,
  applyLiveOps,
  applyStates,
  carryOver,
  initialPlayback,
  routeDocChange,
  SPEED_MAX,
  SPEED_MIN,
  SPEED_STEP,
  type PlaybackAction,
  type PlaybackState,
} from './playback'
import { DEMO_SCENE } from './scene/demo'
import { createPresetScene, PRESETS } from './presets'
// Types only: the simulator (Rapier + its wasm) is imported dynamically in
// ensureSim so it lands in a late chunk and the shell paints without it.
import type { BodyState, ConstraintState, ContactPoint, Simulator } from './sim'
import {
  addContact,
  addForce,
  addPulley,
  addRope,
  addSpring,
  duplicateBody,
  freshId,
  removeBodyAndDependents,
  removeConstraint,
  removeContact,
  removeForce,
  removePulleyAndDependents,
  setSpringDx,
  springDx,
  updateBody,
  updateContact,
  updateForce,
  updateG,
  updateParticleMode,
  updatePulley,
  updateSpring,
  type BodyPatch,
  type MutationResult,
} from './editor/doc'
import { bodyAtPoint, pulleyAtPoint, ropeAtPoint, springAtPoint, worldToLocal } from './editor/hitTest'
import { anchorSnap } from './editor/anchorSnap'
import { resolveContactSnap } from './editor/contactSnap'
import { pointInTrash, trashRect, type Rect } from './editor/trash'
import {
  canRedo,
  canUndo,
  clear as clearHistory,
  initialHistory,
  push as pushHistory,
  redo as redoHistory,
  undo as undoHistory,
  type History,
} from './editor/history'
import { actionForKey, type ShortcutAction } from './editor/shortcuts'
import {
  alphaFromLocal,
  clampAlphaDeg,
  getHandles,
  HANDLE_HIT_RADIUS_PX,
  HANDLE_SIZE_PX,
  minDimension,
  pickHandle,
} from './editor/handles'
import { cartesianToPolar, polarToCartesian } from './editor/initialVelocity'
import { drawArrow, drawGrid, drawScene } from './render/draw'
import { makeTransform, pixelsPerMeterForWidth, screenToWorld, worldToScreen, type Camera, type ScreenTransform } from './render/transform'
import { CANVAS_MIN_WIDTH, fitCanvas } from './render/fitCanvas'
import { appliedArrows, initialVelocityArrows, normalArrows, weightArrows } from './render/overlay'
import { getAcceleration, initialTracker, onRebuild, onReset, onSteps } from './playback/accelerationTracker'
import { messageAt } from './render/loadingMessage'
import { getLang, setLang as persistLang, t, type Lang } from './i18n'
import {
  AUTOSAVE_DELAY_MS,
  DebouncedSaver,
  ackGallery,
  blankScene,
  createNewScene,
  deleteScene as deletePersistedScene,
  duplicateScene as duplicatePersistedScene,
  exportScene,
  importScene,
  loadCurrentSceneId,
  loadIndex,
  loadIndexResult,
  loadSceneOrBlank,
  saveCurrentSceneId,
  saveIndex,
  saveScene,
  shouldShowGallery,
  touchScene,
  type SceneIndexEntry,
  type Storage,
} from './persistence'

const LOADING_MESSAGE_COUNT = 10
const LOADING_MESSAGE_INTERVAL_MS = 1500
/** Grab distance around a spring's or rope's line, about the spring zigzag's half-width. */
const LINE_HIT_TOLERANCE_PX = 8

/**
 * A palette tool between its palette click and the edit it makes: `a` is the
 * first anchor once clicked, `via` the rope's pulleys so far, in click order.
 */
type Tool = { kind: 'spring'; a: ConstraintEnd | null } | { kind: 'pulley' } | { kind: 'rope'; a: ConstraintEnd | null; via: string[] } | null

const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉'
/** `T₁`, `T₂`, … for the rope's legs in path order. */
function subscript(n: number): string {
  return String(n).replace(/\d/g, (d) => SUBSCRIPT_DIGITS[Number(d)]!)
}

/** Camera/transform/trash-zone for the canvas's current logical size. */
function geometryFor(width: number, height: number): { camera: Camera; transform: ScreenTransform; trash: Rect } {
  const camera: Camera = { centerX: 6, centerY: 4, pixelsPerMeter: pixelsPerMeterForWidth(width) }
  return { camera, transform: makeTransform(camera, width, height), trash: trashRect(width, height) }
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * The single paint path, used by both the editor and the playback loop.
 *
 * `states` (the simulator readback, `null` before anything has been stepped) is
 * projected over the document, so selection handles and force arrows ride the
 * moving body without any playback-specific drawing code.
 */
/** What the editor has selected: one body, one constraint (spring or rope), one pulley, or nothing. */
type Selection = { kind: 'body' | 'constraint' | 'pulley'; id: string } | null

function selectedOf(selection: Selection, kind: NonNullable<Selection>['kind']): string | null {
  return selection?.kind === kind ? selection.id : null
}

/** A screen-px circle at a screen point: filled in `color`, or stroked at `strokeWidth` when given. */
function screenCircle(ctx: CanvasRenderingContext2D, at: { x: number; y: number }, radius: number, color: string, strokeWidth?: number): void {
  ctx.save()
  ctx.beginPath()
  ctx.arc(at.x, at.y, radius, 0, Math.PI * 2)
  if (strokeWidth === undefined) {
    ctx.fillStyle = color
    ctx.fill()
  } else {
    ctx.strokeStyle = color
    ctx.lineWidth = strokeWidth
    ctx.stroke()
  }
  ctx.restore()
}

function paint(
  ctx: CanvasRenderingContext2D,
  doc: Scene,
  selection: Selection,
  states: ReadonlyMap<string, BodyState> | null,
  geometry: { camera: Camera; transform: ScreenTransform; trash: Rect },
  opts?: {
    showGlobal: boolean
    contacts?: readonly ContactPoint[]
    draggingBody?: boolean
    /** The spring or rope tool's first anchor, until the tool finishes. */
    pendingAnchor?: ConstraintEnd | null
  },
): void {
  const { camera, transform, trash } = geometry
  const view = applyStates(doc, states)
  const selectedId = selectedOf(selection, 'body')
  ctx.clearRect(0, 0, transform.width, transform.height)
  drawGrid(ctx, camera, transform.width, transform.height)
  drawScene(ctx, view, camera, transform.width, transform.height, undefined, selectedId, selectedOf(selection, 'constraint'), selectedOf(selection, 'pulley'))

  const pendingBody = opts?.pendingAnchor && view.bodies.find((b) => b.id === opts.pendingAnchor!.bodyId)
  if (pendingBody) {
    const p = bodyPointToWorld(pendingBody, opts.pendingAnchor!.anchor)
    screenCircle(ctx, worldToScreen(transform, p.x, p.y), 5, '#ff8c00')
  }

  // Trash target: invisible except while a Body is actively being dragged.
  if (opts?.draggingBody) {
    const cx = trash.x + trash.w / 2
    const cy = trash.y + trash.h / 2
    ctx.save()
    ctx.fillStyle = '#fdecea'
    ctx.strokeStyle = '#b00'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.roundRect(trash.x, trash.y, trash.w, trash.h, 6)
    ctx.fill()
    ctx.stroke()
    ctx.font = '20px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#b00'
    ctx.fillText('🗑', cx, cy)
    ctx.font = '10px system-ui, sans-serif'
    ctx.fillText(t('editor.trash'), cx, trash.y - 6)
    ctx.restore()
  }

  // Vector overlay: global mode draws scene-wide, otherwise selection-only.
  if (opts?.showGlobal) {
    for (const a of weightArrows(doc, states, camera.pixelsPerMeter)) drawArrow(ctx, a.from, a.vec, transform, { color: '#2e7d32', widthPx: 2, headLenPx: 8 })
    for (const a of initialVelocityArrows(view, camera.pixelsPerMeter)) drawArrow(ctx, a.from, a.vec, transform, { color: '#43a047', widthPx: 2, headLenPx: 8 })
    for (const a of appliedArrows(view, camera.pixelsPerMeter)) drawArrow(ctx, a.from, a.vec, transform, { color: '#d97742', widthPx: 2, headLenPx: 10 })
    for (const a of normalArrows(opts.contacts ?? [])) drawArrow(ctx, a.from, a.vec, transform, { color: '#1565c0', widthPx: 2, headLenPx: 8 })
  } else {
    const sel = view.bodies.find((b) => b.id === selectedId)
    if (sel) {
      const selView: Scene = { ...view, bodies: [sel], forces: view.forces.filter((f) => f.bodyId === sel.id) }
      for (const a of initialVelocityArrows(selView, camera.pixelsPerMeter)) drawArrow(ctx, a.from, a.vec, transform, { color: '#43a047', widthPx: 2, headLenPx: 8 })
      for (const a of appliedArrows(selView, camera.pixelsPerMeter)) {
        drawArrow(ctx, a.from, a.vec, transform)
        // The application point is draggable (PHY-27): a ring marks the grip.
        screenCircle(ctx, worldToScreen(transform, a.from.x, a.from.y), HANDLE_SIZE_PX / 2, '#d97742', 1.5)
      }
    }
  }

  const selected = view.bodies.find((b) => b.id === selectedId)
  if (!selected) return
  for (const h of getHandles(selected, transform)) {
    ctx.save()
    ctx.translate(h.sx, h.sy)
    if (h.kind === 'rotate') {
      ctx.strokeStyle = '#2f7d32'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(0, 0, HANDLE_SIZE_PX / 2, 0, Math.PI * 2)
      ctx.stroke()
    } else {
      ctx.fillStyle = h.kind === 'alpha' ? '#7b4bd9' : '#ffffff'
      ctx.strokeStyle = '#333'
      ctx.lineWidth = 1.5
      if (h.kind === 'alpha') ctx.rotate(Math.PI / 4)
      ctx.fillRect(-HANDLE_SIZE_PX / 2, -HANDLE_SIZE_PX / 2, HANDLE_SIZE_PX, HANDLE_SIZE_PX)
      ctx.strokeRect(-HANDLE_SIZE_PX / 2, -HANDLE_SIZE_PX / 2, HANDLE_SIZE_PX, HANDLE_SIZE_PX)
    }
    ctx.restore()
  }
}

/** Number field that only forwards real numbers (empty input is ignored). */
function NumField({
  label,
  value,
  step,
  onChange,
}: {
  label: string
  value: number
  step?: number
  onChange: (v: number) => void
}) {
  return (
    <label style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
      {label}
      <input
        type="number"
        step={step ?? 'any'}
        value={value}
        style={{ width: 80 }}
        onChange={(e) => {
          const v = e.target.valueAsNumber
          if (!Number.isNaN(v)) onChange(v)
        }}
      />
    </label>
  )
}

/**
 * Properties panel for the selected body. Rotation is edited in DEGREES in the
 * UI and converted to the document's radians here (deg * PI/180 on apply,
 * rad * 180/PI on display); alpha stays degrees end-to-end per schema.
 * Numeric entry applies the SAME clamps as the handle drags (clampAlphaDeg /
 * minDimension): typed values can never produce a hard-invalid doc
 * (e.g. alpha > 90 would flip tan's sign at T9 export time).
 */
function PropertiesPanel({
  body,
  onPatch,
}: {
  body: Body
  onPatch: (patch: BodyPatch) => void
}) {
  const pos = (p: Vec2, axis: 'x' | 'y') => p[axis]
  const [velocityMode, setVelocityMode] = useState<'cartesian' | 'polar'>('cartesian')
  const polar = cartesianToPolar(body.vx ?? 0, body.vy ?? 0)
  return (
    <fieldset style={{ width: 220 }}>
      <legend>{body.id}</legend>
      <NumField label={t('properties.mass')} value={body.mass} onChange={(v) => onPatch({ mass: v })} />
      <label style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
        {t('properties.fixed')}
        <input type="checkbox" checked={body.fixed} onChange={(e) => onPatch({ fixed: e.target.checked })} />
      </label>
      {!body.fixed && (
        <>
          <label style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
            {t('properties.velocityMode')}
            <select value={velocityMode} onChange={(e) => setVelocityMode(e.target.value as 'cartesian' | 'polar')}>
              <option value="cartesian">{t('properties.velocityCartesian')}</option>
              <option value="polar">{t('properties.velocityPolar')}</option>
            </select>
          </label>
          {velocityMode === 'cartesian' ? (
            <>
              <NumField label={t('properties.vx')} value={body.vx ?? 0} onChange={(v) => onPatch({ vx: v })} />
              <NumField label={t('properties.vy')} value={body.vy ?? 0} onChange={(v) => onPatch({ vy: v })} />
            </>
          ) : (
            <>
              <NumField
                label={t('properties.v0Magnitude')}
                value={polar.magnitude}
                onChange={(v) => onPatch(polarToCartesian(v, polar.angleDeg))}
              />
              <NumField
                label={t('properties.v0Angle')}
                value={polar.angleDeg}
                onChange={(v) => onPatch(polarToCartesian(polar.magnitude, v))}
              />
            </>
          )}
        </>
      )}
      <details>
        <summary>{t('properties.more')}</summary>
        <NumField label={t('properties.posX')} value={pos(body.position, 'x')} onChange={(v) => onPatch({ position: { ...body.position, x: v } })} />
        <NumField label={t('properties.posY')} value={pos(body.position, 'y')} onChange={(v) => onPatch({ position: { ...body.position, y: v } })} />
        <NumField
          label={t('properties.rotation')}
          value={(body.rotation * 180) / Math.PI}
          onChange={(v) => onPatch({ rotation: (v * Math.PI) / 180 })}
        />
        {body.shape === 'rectangle' && (
          <>
            <NumField label={t('properties.width')} value={body.width} onChange={(v) => onPatch({ width: minDimension(v) })} />
            <NumField label={t('properties.height')} value={body.height} onChange={(v) => onPatch({ height: minDimension(v) })} />
          </>
        )}
        {body.shape === 'circle' && (
          <NumField label={t('properties.radius')} value={body.radius} onChange={(v) => onPatch({ radius: minDimension(v) })} />
        )}
        {body.shape === 'triangle' && (
          <>
            <NumField label={t('properties.base')} value={body.base} onChange={(v) => onPatch({ base: minDimension(v) })} />
            <NumField label={t('properties.alpha')} value={body.alpha} onChange={(v) => onPatch({ alpha: clampAlphaDeg(v) })} />
          </>
        )}
      </details>
    </fieldset>
  )
}

/**
 * Force editor for the selected body. Anchor is BODY-LOCAL and ORIGIN-relative
 * (T3 contract); direction is WORLD-frame degrees CCW from +x — labelled so
 * users know it does not rotate with the body. Magnitude is clamped >= 0
 * UI-side (negative is only a SOFT codec warning).
 */
function ForcesPanel({
  bodyId,
  forces,
  onAdd,
  onPatch,
  onRemove,
}: {
  bodyId: string
  forces: AppliedForce[]
  onAdd: () => string | null
  onPatch: (id: string, patch: Partial<Omit<AppliedForce, 'id' | 'bodyId'>>) => void
  onRemove: (id: string) => void
}) {
  const [error, setError] = useState<string | null>(null)
  return (
    <fieldset style={{ width: 220 }}>
      <legend>{t('forces.title', { id: bodyId })}</legend>
      {forces.length === 0 && <div style={{ fontSize: 12, color: '#777' }}>{t('forces.empty')}</div>}
      {forces.map((f) => (
        <div key={f.id} style={{ borderTop: '1px solid #ddd', paddingTop: 4, marginTop: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span>{f.id}</span>
            <button onClick={() => onRemove(f.id)} title={t('forces.removeTitle')}>✕</button>
          </div>
          <NumField label={t('forces.magnitude')} value={f.magnitude} onChange={(v) => onPatch(f.id, { magnitude: Math.max(0, v) })} />
          <NumField label={t('forces.direction')} value={f.direction} onChange={(v) => onPatch(f.id, { direction: v })} />
          <NumField label={t('forces.anchorX')} value={f.anchor.x} onChange={(v) => onPatch(f.id, { anchor: { ...f.anchor, x: v } })} />
          <NumField label={t('forces.anchorY')} value={f.anchor.y} onChange={(v) => onPatch(f.id, { anchor: { ...f.anchor, y: v } })} />
        </div>
      ))}
      <button style={{ marginTop: 6 }} onClick={() => setError(onAdd())}>{t('forces.add')}</button>
      {error && <div style={{ fontSize: 12, color: '#b00' }}>{t(error)}</div>}
    </fieldset>
  )
}

/** Scene-level auditable contact list; add via two body dropdowns. */
function ContactsPanel({
  doc,
  onAdd,
  onPatch,
  onRemove,
}: {
  doc: Scene
  onAdd: (a: string, b: string) => string | null
  onPatch: (a: string, b: string, patch: { muS?: number; muK?: number }) => void
  onRemove: (a: string, b: string) => void
}) {
  const [newA, setNewA] = useState(doc.bodies[0]?.id ?? '')
  const [newB, setNewB] = useState(doc.bodies[1]?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  return (
    <fieldset style={{ width: 220 }}>
      <legend>{t('contacts.title')}</legend>
      {doc.contacts.length === 0 && <div style={{ fontSize: 12, color: '#777' }}>{t('contacts.empty')}</div>}
      {doc.contacts.map((c) => (
        <div key={`${c.a}|${c.b}`} style={{ borderBottom: '1px solid #ddd', paddingBottom: 4, marginBottom: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span>{c.a} ↔ {c.b}</span>
            <button onClick={() => onRemove(c.a, c.b)} title={t('contacts.removeTitle')}>✕</button>
          </div>
          <NumField label={t('contacts.muS')} value={c.muS} step={0.05} onChange={(v) => onPatch(c.a, c.b, { muS: v })} />
          <NumField label={t('contacts.muK')} value={c.muK} step={0.05} onChange={(v) => onPatch(c.a, c.b, { muK: v })} />
        </div>
      ))}
      <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
        <select value={newA} onChange={(e) => setNewA(e.target.value)} style={{ minWidth: 70 }}>
          {doc.bodies.map((b) => <option key={b.id} value={b.id}>{b.id}</option>)}
        </select>
        <select value={newB} onChange={(e) => setNewB(e.target.value)} style={{ minWidth: 70 }}>
          {doc.bodies.map((b) => <option key={b.id} value={b.id}>{b.id}</option>)}
        </select>
      </div>
      <button
        style={{ marginTop: 4 }}
        onClick={() => setError(onAdd(newA, newB))}
      >
        {t('contacts.add')}
      </button>
      {error && <div style={{ fontSize: 12, color: '#b00' }}>{t(error)}</div>}
    </fieldset>
  )
}

/**
 * Inspector for the selected spring (PHY-27). `onEdit` refuses an edit the
 * codec would reject (k ≤ 0, x₀ ≤ 0, c < 0) and returns false; the panel then
 * shows one warning line until the next accepted edit. Keyed by spring id,
 * so the warning never carries over to another spring.
 */
function SpringPanel({
  spring,
  dx,
  onEdit,
  onDelete,
}: {
  spring: Spring
  dx: number
  onEdit: (edit: (d: Scene) => Scene) => boolean
  onDelete: () => void
}) {
  const [invalid, setInvalid] = useState(false)
  const edit = (e: (d: Scene) => Scene) => setInvalid(!onEdit(e))
  return (
    <fieldset style={{ width: 220 }}>
      <legend>{spring.id}</legend>
      <NumField label={t('spring.k')} value={spring.k} onChange={(v) => edit((d) => updateSpring(d, spring.id, { k: v }))} />
      <NumField label={t('spring.x0')} value={spring.x0} step={0.01} onChange={(v) => edit((d) => updateSpring(d, spring.id, { x0: v }))} />
      <NumField label={t('spring.dx')} value={dx} step={0.01} onChange={(v) => edit((d) => setSpringDx(d, spring.id, v))} />
      <NumField label={t('spring.c')} value={spring.c ?? 0} step={0.1} onChange={(v) => edit((d) => updateSpring(d, spring.id, { c: v }))} />
      {invalid && <div style={{ fontSize: 12, color: '#b00' }}>{t('spring.invalid')}</div>}
      <button style={{ marginTop: 6 }} onClick={onDelete}>{t('panel.delete')}</button>
    </fieldset>
  )
}

/**
 * Inspector for the selected pulley (PHY-28). Same clamps as the body panel
 * and the force magnitude, so a typed value never makes an unparseable doc.
 */
function PulleyPanel({ pulley, onPatch, onDelete }: { pulley: Pulley; onPatch: (patch: { radius?: number; mass?: number }) => void; onDelete: () => void }) {
  return (
    <fieldset style={{ width: 220 }}>
      <legend>{pulley.id}</legend>
      <NumField label={t('properties.radius')} value={pulley.radius} step={0.05} onChange={(v) => onPatch({ radius: minDimension(v) })} />
      <NumField label={t('properties.mass')} value={pulley.mass ?? 0} onChange={(v) => onPatch({ mass: Math.max(0, v) })} />
      <button style={{ marginTop: 6 }} onClick={onDelete}>{t('panel.delete')}</button>
    </fieldset>
  )
}

/** Inspector for the selected rope (PHY-28): its path and L, both read-only — L is derived, never stored. */
function RopePanel({ rope, length, onDelete }: { rope: Rope; length: number | null; onDelete: () => void }) {
  return (
    <fieldset style={{ width: 220 }}>
      <legend>{rope.id}</legend>
      <div style={{ fontSize: 12 }}>
        {t('rope.path')}: {[rope.a.bodyId, ...rope.via, rope.b.bodyId].join(' → ')}
      </div>
      {length !== null && <div style={{ fontSize: 12 }}>L: {length.toFixed(3)} m</div>}
      <button style={{ marginTop: 6 }} onClick={onDelete}>{t('panel.delete')}</button>
    </fieldset>
  )
}

function getAppStorage(): Storage {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage as unknown as Storage
  } catch {}
  const m = new Map<string, string>()
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }
}

// Fixed width of the inspector column plus the row's gap between columns —
// the room the canvas column gives up when the two sit side by side.
const INSPECTOR_WIDTH = 270
const ROW_GAP = 12

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const canvasBoxRef = useRef<HTMLDivElement>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const [size, setSize] = useState(() => fitCanvas(900, 600))
  // Below CANVAS_MIN_WIDTH, the canvas column stacks above/below the inspector
  // instead of sharing the row, so fitCanvas's floor never draws the canvas
  // wider than the column that contains it. Hysteresis (stack below the floor,
  // unstack only once there's room for the floor AND the inspector) keeps the
  // two thresholds apart — a single shared one would oscillate every frame: the
  // stacked box measures the full row, which clears "unstack", so it unstacks
  // and immediately measures the squeezed width again, which re-triggers "stack".
  const [stacked, setStacked] = useState(false)
  const { camera, transform, trash: trashRectValue } = geometryFor(size.width, size.height)
  const storageRef = useRef<Storage | null>(null)
  if (!storageRef.current) storageRef.current = getAppStorage()
  const storage = storageRef.current
  let initialSeedWarning: string | null = null
  const [sceneIndex, setSceneIndex] = useState<SceneIndexEntry[]>(() => {
    const res = loadIndexResult(storage)
    if (res.kind === 'missing') {
      const entry: SceneIndexEntry = { id: 'cena-1', name: 'Cena 1', updatedAt: Date.now() }
      const pw = saveScene(storage, entry.id, DEMO_SCENE)
      if (pw) {
        initialSeedWarning = pw
        return []
      }
      const iw = saveIndex(storage, [entry])
      if (iw) {
        try {
          storage.removeItem(`physics-sim:scene:${entry.id}`)
        } catch {}
        initialSeedWarning = iw
        return []
      }
      return [entry]
    }
    if (res.kind === 'corrupt') {
      return []
    }
    return res.index
  })
  const [currentId, setCurrentId] = useState<string>(() => {
    const res = loadIndexResult(storage)
    if (res.kind === 'missing') {
      // Seed succeeded above → 'cena-1', else fallback
      return 'cena-1'
    }
    if (res.kind === 'corrupt') return 'cena-1'
    return loadCurrentSceneId(storage, res.index) ?? res.index[0]?.id ?? 'cena-1'
  })
  const [doc, setDoc] = useState<Scene>(() => {
    const res = loadIndexResult(storage)
    if (res.kind === 'missing') {
      return loadIndex(storage).length > 0 ? DEMO_SCENE : blankScene()
    }
    if (res.kind === 'corrupt') return blankScene()
    if (res.index.length === 0) return blankScene()
    // Reads `currentId` from the initializer above — load-bearing declaration
    // order: this useState must stay below the one that sets `currentId`.
    const { scene } = loadSceneOrBlank(storage, currentId)
    return scene
  })
  const [selection, setSelection] = useState<Selection>(null)
  const selectedId = selectedOf(selection, 'body')
  const selectedConstraintId = selectedOf(selection, 'constraint')
  const selectedPulleyId = selectedOf(selection, 'pulley')
  const [tool, setTool] = useState<Tool>(null)
  const [toolError, setToolError] = useState<string | null>(null)
  const toolRef = useRef<Tool>(tool)
  const [history, setHistory] = useState<History<Scene>>(initialHistory)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [contactSnapEnabled, setContactSnapEnabled] = useState(true)
  const [showGlobal, setShowGlobal] = useState(false)
  const [storageWarning, setStorageWarning] = useState<string | null>(initialSeedWarning)
  const [corruptWarningKey, setCorruptWarningKey] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [showGallery, setShowGallery] = useState(() => shouldShowGallery(storage))
  const [selectedPreset, setSelectedPreset] = useState<string | null>(PRESETS[0]?.id ?? null)
  const [lang, setLangState] = useState<Lang>(() => getLang(storage))
  const lastSavedRef = useRef<Map<string, string>>(new Map([[currentId, JSON.stringify(serialize(doc))]]))
  /**
   * Transport mirror for the controls. The AUTHORITATIVE transport state lives
   * in `playbackRef`: animation frames advance it without touching React state,
   * because re-rendering the whole editor 60x/second to move an accumulator
   * would be pure waste. Only discrete actions (play/pause/reset/speed/step)
   * go through `dispatch`, which keeps this mirror in sync.
   */
  const [playback, setPlayback] = useState<PlaybackState>(initialPlayback)
  const [simError, setSimError] = useState<string | null>(null)
  const [readout, setReadout] = useState<{ x: number; y: number; vx: number; vy: number; ax: number; ay: number; approximate: boolean } | null>(null)
  const [constraintReadout, setConstraintReadout] = useState<ConstraintState | null>(null)
  const [stepsTick, setStepsTick] = useState(0)
  const [bootState, setBootState] = useState<'booting' | 'ready' | 'error'>('booting')
  const [messageTick, setMessageTick] = useState(0)
  // Lazy initialiser: rolled once for the session, not on every render.
  const [bootSeed] = useState(() => Math.floor(Math.random() * 0x7fffffff))
  const playbackRef = useRef<PlaybackState>(playback)
  const simRef = useRef<Simulator | null>(null)
  const simBootRef = useRef<Promise<Simulator | null> | null>(null)
  /** Last simulator readback; `null` means "nothing simulated, show the doc". */
  const statesRef = useRef<Map<string, BodyState> | null>(null)
  const accelRef = useRef(initialTracker())
  const contactsRef = useRef<ContactPoint[]>([])
  /** Document the running world was built from — the carry-over baseline. */
  const builtDocRef = useRef<Scene>(doc)
  const pendingRebuildRef = useRef(false)
  // Mirrors so the imperative rAF loop reads the latest document without
  // re-subscribing every render.
  const docRef = useRef<Scene>(doc)
  const selectionRef = useRef<Selection>(selection)
  const showGlobalRef = useRef(showGlobal)
  const historyRef = useRef<History<Scene>>(history)
  const showShortcutsRef = useRef(showShortcuts)
  const saverRef = useRef<DebouncedSaver | null>(null)
  if (!saverRef.current) {
    saverRef.current = new DebouncedSaver(AUTOSAVE_DELAY_MS, (id, scene) => {
      const payload = JSON.stringify(serialize(scene))
      if (lastSavedRef.current.get(id) === payload) return
      const warn = saveScene(storage, id, scene)
      if (warn) {
        setStorageWarning(warn)
        return
      }
      lastSavedRef.current.set(id, payload)
      const touchWarn = touchScene(storage, id)
      if (touchWarn) setStorageWarning(touchWarn)
      else setSceneIndex(loadIndex(storage))
    })
  }
  const switchToScene = useCallback(
    (id: string) => {
      saverRef.current?.flush()
      const { scene, warning } = loadSceneOrBlank(storage, id)
      if (warning) setStorageWarning(warning)
      lastSavedRef.current.set(id, JSON.stringify(serialize(scene)))
      setSceneIndex(loadIndex(storage))
      setCurrentId(id)
      saveCurrentSceneId(storage, id)
      setDoc(scene)
      setSelection(null)
      setImportError(null)
      // Switching/importing/creating/deleting a scene starts a fresh document
      // identity — undo history from the PREVIOUS scene makes no sense here.
      setHistory(clearHistory())
    },
    [storage],
  )

  /**
   * Every doc mutation that should be one undo step routes through here: it
   * snapshots the doc as it stood BEFORE the edit onto the history stack, then
   * applies the edit. A drag is the one exception — it calls `setDoc` directly
   * on every pointermove and pushes a single history entry on pointer-up
   * instead (see onPointerUp), so an in-progress drag isn't 50 undo steps.
   */
  const commitDoc = useCallback((next: Scene | ((d: Scene) => Scene)) => {
    const prev = docRef.current
    const resolved = typeof next === 'function' ? (next as (d: Scene) => Scene)(prev) : next
    if (resolved === prev) return
    setHistory((h) => pushHistory(h, prev))
    setDoc(resolved)
  }, [])

  /** Shared by the Delete/Backspace shortcut and the panel's own delete button. */
  const deleteSelected = useCallback(() => {
    const sel = selectionRef.current
    if (!sel) return
    const remove = sel.kind === 'constraint' ? removeConstraint : sel.kind === 'pulley' ? removePulleyAndDependents : removeBodyAndDependents
    commitDoc((d) => remove(d, sel.id))
    setSelection(null)
  }, [commitDoc])

  // Drag interaction: kind + per-kind payload captured at pointer-down.
  // Only Body movement consumes Contact snap; handle drags stay unsnapped.
  const dragRef = useRef<
    | { kind: 'move'; id: string; offX: number; offY: number; neighborId: string | null; startDoc: Scene }
    | { kind: 'rotate'; id: string; startAngle: number; startRotation: number; startDoc: Scene }
    | { kind: 'resize' | 'alpha'; id: string; startDoc: Scene }
    | { kind: 'forceAnchor'; id: string; forceId: string; startDoc: Scene }
    | null
  >(null)

  const repaint = useCallback(() => {
    const ctx = ctxRef.current
    if (ctx)
      paint(ctx, docRef.current, selectionRef.current, statesRef.current, geometryFor(size.width, size.height), {
        showGlobal: showGlobalRef.current,
        contacts: contactsRef.current,
        draggingBody: dragRef.current?.kind === 'move',
        pendingAnchor: toolRef.current && 'a' in toolRef.current ? toolRef.current.a : null,
      })
  }, [size.width, size.height])

  // The container's own size drives the canvas — measured on mount and on
  // every resize (window resize/maximize, layout changes during playback).
  useEffect(() => {
    const box = canvasBoxRef.current
    if (!box) return
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const width = entry.contentRect.width
      setStacked((wasStacked) =>
        wasStacked ? width < CANVAS_MIN_WIDTH + INSPECTOR_WIDTH + ROW_GAP : width < CANVAS_MIN_WIDTH,
      )
      setSize(fitCanvas(width, entry.contentRect.height))
    })
    ro.observe(box)
    return () => ro.disconnect()
  }, [])

  // Backing store (and the world<->screen transform derived from it) is
  // reallocated whenever the logical size changes — a resize legitimately
  // clears the buffer, so this repaints right after.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    // Backing store must be whole device pixels, so scale by what it ACTUALLY
    // got (w/size.width) rather than by dpr: a fractional dpr would otherwise
    // draw off the truncated buffer's edge and resample the whole canvas.
    const w = Math.round(size.width * dpr)
    const h = Math.round(size.height * dpr)
    canvas.width = w
    canvas.height = h
    ctx.setTransform(w / size.width, 0, 0, h / size.height, 0, 0)
    ctxRef.current = ctx
    repaint()
  }, [size.width, size.height, repaint])

  /** Pauses playback and surfaces a world-building failure to the user. */
  const fail = useCallback((e: unknown) => {
    setSimError(messageOf(e))
    const t = advance(playbackRef.current, { type: 'pause' })
    playbackRef.current = t.state
    setPlayback(t.state)
  }, [])

  useEffect(() => {
    historyRef.current = history
  }, [history])

  useEffect(() => {
    showShortcutsRef.current = showShortcuts
  }, [showShortcuts])

  useEffect(() => {
    docRef.current = doc
    showGlobalRef.current = showGlobal
    if (simRef.current && builtDocRef.current !== doc) {
      // Live-vs-structural routing (T7/M2): value edits on existing records
      // and g mutate the RUNNING world right now; everything else rebuilds at
      // the frame boundary with carried kinematic state.
      const route = routeDocChange(builtDocRef.current, doc)
      if (route.kind === 'structural') {
        // Bodies whose pose the user changed lose their carried state right
        // now, so an explicit placement is visible immediately instead of
        // being overpainted by the simulated position it replaces.
        statesRef.current = carryOver(statesRef.current, builtDocRef.current, doc)
        pendingRebuildRef.current = true
      } else {
        try {
          applyLiveOps(simRef.current, route.ops)
          builtDocRef.current = doc
        } catch (e) {
          fail(e)
          // Keep builtDoc as-is: the next frame-boundary rebuild reconciles
          // world and document from the correct baseline.
          pendingRebuildRef.current = true
        }
      }
    }
    repaint()
  }, [doc, showGlobal, repaint, fail])

  useEffect(() => {
    selectionRef.current = selection
    toolRef.current = tool
    repaint()
  }, [selection, tool, repaint])

  // Autosave: DOC-only, debounced ~400 ms, soft warning on quota failure.
  // Flush is explicit on scene transitions (switchToScene/delete); this effect only debounces doc edits.
  useEffect(() => {
    saverRef.current?.schedule(currentId, doc)
    return () => saverRef.current?.cancel()
  }, [doc, currentId])

  // Hydration recovery: structured key stored, translated at render time so language switches re-render correctly
  useEffect(() => {
    const idxRes = loadIndexResult(storage)
    if (idxRes.kind === 'corrupt') setCorruptWarningKey('error.indiceCorrompido')
    const { warning } = loadSceneOrBlank(storage, currentId)
    if (warning) setStorageWarning((prev) => (prev?.includes(warning) ? prev : prev ? `${prev} | ${warning}` : warning))
  }, [])

  // Low-frequency readout: polls refs without 60Hz React churn.
  useEffect(() => {
    const id = setInterval(() => {
      setStepsTick(playbackRef.current.stepsTaken)
      const constraintSel = selectedOf(selectionRef.current, 'constraint')
      if (constraintSel) {
        // A world awaiting its rebuild still holds the old constraints: no reading.
        const sim = pendingRebuildRef.current ? null : simRef.current
        setConstraintReadout(sim?.readConstraints().find((c) => c.id === constraintSel) ?? null)
      } else {
        setConstraintReadout(null)
      }
      const sel = selectedOf(selectionRef.current, 'body')
      if (!sel) {
        setReadout(null)
        return
      }
      const curr = statesRef.current
      const s = curr?.get(sel)
      if (!s) {
        // Not yet simulated — use the document pose, initial velocity, and
        // analytic acceleration until a measured simulator sample exists.
        const docBody = docRef.current.bodies.find((b) => b.id === sel)
        if (!docBody) {
          setReadout(null)
          return
        }
        const acc = getAcceleration(accelRef.current, docRef.current, sel, playbackRef.current.status === 'paused')
        setReadout({ x: docBody.position.x, y: docBody.position.y, vx: docBody.vx ?? 0, vy: docBody.vy ?? 0, ax: acc.x, ay: acc.y, approximate: acc.approximate })
        return
      }
      const acc = getAcceleration(accelRef.current, docRef.current, sel, playbackRef.current.status === 'paused')
      setReadout({ x: s.position.x, y: s.position.y, vx: s.linvel.x, vy: s.linvel.y, ax: acc.x, ay: acc.y, approximate: acc.approximate })
    }, 100)
    return () => clearInterval(id)
  }, [])

  /**
   * Applies pending document edits by rebuilding the world at a frame boundary,
   * carrying surviving bodies' kinematic state across (T7 rebuild policy).
   * Returns false when the new document cannot be simulated at all.
   */
  const syncWorld = useCallback((): boolean => {
    const sim = simRef.current
    if (!sim || !pendingRebuildRef.current) return true
    try {
      const prev = statesRef.current
      sim.replaceScene(docRef.current, prev ?? undefined)
      builtDocRef.current = docRef.current
      const next = sim.readStates()
      accelRef.current = onRebuild(accelRef.current, prev, next)
      statesRef.current = next
      contactsRef.current = sim.readContacts()
      pendingRebuildRef.current = false
      setSimError(null)
      return true
    } catch (e) {
      fail(e)
      pendingRebuildRef.current = true
      return false
    }
  }, [fail])

  /** Runs `n` fixed TIMESTEPs on the running world, then repaints once. */
  const runSteps = useCallback(
    (n: number) => {
      const sim = simRef.current
      if (!sim || n <= 0) return
      if (!syncWorld()) return
      try {
        for (let i = 0; i < n; i++) sim.step()
        const prev = statesRef.current
        const next = sim.readStates()
        accelRef.current = onSteps(accelRef.current, n, prev, next)
        statesRef.current = next
        contactsRef.current = sim.readContacts()
      } catch (e) {
        fail(e)
        return
      }
      repaint()
    },
    [fail, repaint, syncWorld],
  )

  /** Discrete transport actions: pure decision in `advance`, effects here. */
  const dispatch = useCallback(
    (action: PlaybackAction) => {
      const t = advance(playbackRef.current, action)
      playbackRef.current = t.state
      setPlayback(t.state)
      if (t.rebuild) {
        // Reset: fresh world straight from document, nothing carried — commit
        // refs only on success so a failed reset preserves the old baseline.
        try {
          simRef.current?.replaceScene(docRef.current)
          pendingRebuildRef.current = false
          accelRef.current = onReset()
          statesRef.current = null
          contactsRef.current = simRef.current ? simRef.current.readContacts() : []
          builtDocRef.current = docRef.current
          setSimError(null)
        } catch (e) {
          setSimError(messageOf(e))
          pendingRebuildRef.current = true
        }
        repaint()
      }
      if (t.steps > 0) runSteps(t.steps)
    },
    [repaint, runSteps],
  )

  /**
   * Boots the WASM world on first use; concurrent callers share one boot.
   * The overlay's state is driven from HERE, not from the call sites: mount,
   * play, step and the retry button all boot through this one function, so a
   * boot any of them starts takes the overlay with it. Driving it from a
   * single caller left the opaque error panel sitting on top of a world that
   * had since booted fine.
   */
  const ensureSim = useCallback((): Promise<Simulator | null> => {
    if (simRef.current) return Promise.resolve(simRef.current)
    if (!simBootRef.current) {
      const bootDoc = docRef.current
      setBootState('booting')
      // A failed chunk fetch rejects into the same error branch as a failed
      // boot. Retry re-issues the import, but browsers keep a failed module
      // fetch in the module map, so only a reload recovers that case (CLEAN-01).
      simBootRef.current = import('./sim').then(({ createSimulator }) => createSimulator(bootDoc)).then(
        (sim) => {
          simRef.current = sim
          builtDocRef.current = bootDoc
          contactsRef.current = sim.readContacts()
          // Edits made while WASM was booting land at the next frame boundary.
          pendingRebuildRef.current = docRef.current !== bootDoc
          setSimError(null)
          setBootState('ready')
          return sim
        },
        () => {
          // The overlay's fixed message is the only error surface for a boot
          // failure — no fail(e) here, or the raw exception text would also
          // show up in the simError side panel at the same time.
          simBootRef.current = null // let the user fix the scene and retry
          setBootState('error')
          return null
        },
      )
    }
    return simBootRef.current
  }, [])

  /** Retries a failed boot, restarting the joke rotation from the top. */
  const retryBoot = useCallback(() => {
    setMessageTick(0)
    void ensureSim()
  }, [ensureSim])

  // Boot starts at mount (T-PHY-16), not at the first play, so playback never
  // waits on it once the student presses play.
  useEffect(() => {
    void ensureSim()
  }, [])

  // Rotates the loading joke every 1.5s while booting; the timer is cleared
  // the moment boot leaves 'booting' (ready or error), never ticking an
  // overlay that is no longer showing a joke.
  useEffect(() => {
    if (bootState !== 'booting') return
    const id = setInterval(() => setMessageTick((t) => t + 1), LOADING_MESSAGE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [bootState])

  // The playback loop. Deliberately thin: the scheduler decides how many
  // TIMESTEPs this frame is worth, this only executes them.
  useEffect(() => {
    if (playback.status !== 'playing') return
    let live = true
    let handle = 0
    const tick = () => {
      if (!live) return
      if (syncWorld()) {
        const t = advance(playbackRef.current, { type: 'frame' })
        playbackRef.current = t.state
        runSteps(t.steps)
      }
      if (live) handle = requestAnimationFrame(tick)
    }
    handle = requestAnimationFrame(tick)
    return () => {
      live = false
      cancelAnimationFrame(handle)
    }
  }, [playback.status, runSteps, syncWorld])

  const undo = useCallback(() => {
    const step = undoHistory(historyRef.current, docRef.current)
    if (!step) return
    dispatch({ type: 'pause' })
    setHistory(step.history)
    setDoc(step.entry)
  }, [dispatch])

  const redo = useCallback(() => {
    const step = redoHistory(historyRef.current, docRef.current)
    if (!step) return
    dispatch({ type: 'pause' })
    setHistory(step.history)
    setDoc(step.entry)
  }, [dispatch])

  // The single keyboard-shortcut listener for the whole editor (T-PHY-14):
  // reads latest state off refs so it never needs re-subscribing on every
  // keystroke, the same pattern the rAF loop above uses for the same reason.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName
      const inTextField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!(e.target as HTMLElement | null)?.isContentEditable
      const action: ShortcutAction | null = actionForKey({
        key: e.key,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
        inTextField,
        targetHandlesKeyNatively: tag === 'BUTTON',
      })
      if (!action) return
      e.preventDefault()
      switch (action) {
        case 'undo':
          undo()
          break
        case 'redo':
          redo()
          break
        case 'delete':
          deleteSelected()
          break
        case 'togglePlay':
          togglePlay()
          break
        case 'stepOnce':
          stepOnce()
          break
        case 'reset':
          dispatch({ type: 'reset' })
          break
        case 'deselectOrClose':
          if (showShortcutsRef.current) setShowShortcuts(false)
          else if (toolRef.current) {
            setTool(null)
            setToolError(null)
          } else {
            setSelection(null)
          }
          break
        case 'toggleHelp':
          setShowShortcuts((v) => !v)
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo, deleteSelected, dispatch])

  function togglePlay() {
    if (playbackRef.current.status === 'playing') {
      dispatch({ type: 'pause' })
      return
    }
    void ensureSim().then((sim) => {
      if (sim) dispatch({ type: 'play' })
    })
  }

  function stepOnce() {
    void ensureSim().then((sim) => {
      if (sim) dispatch({ type: 'stepOnce' })
    })
  }

  /**
   * Bodies at their CURRENT poses (simulated once the world is running), so
   * hit-testing and handle pivots match what the user actually sees on canvas.
   */
  function liveBodies(): Body[] {
    return applyStates(docRef.current, statesRef.current).bodies
  }

  function eventToWorld(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    return screenToWorld(transform, e.clientX - rect.left, e.clientY - rect.top)
  }

  function eventToScreen(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    return { sx: e.clientX - r.left, sy: e.clientY - r.top }
  }

  /**
   * Palette tool click, every body anchor through Anchor snap. Pulley: one
   * click on a body. Spring: anchor A, then anchor B. Rope: anchor A, then the
   * pulleys in order, then anchor B. A click off every body is ignored, and so
   * is one that would join A's body to itself with nothing in between.
   */
  function onToolClick(w: Vec2) {
    const tool = toolRef.current
    if (!tool) return
    const view = applyStates(docRef.current, statesRef.current)
    if (tool.kind === 'rope') {
      const pulley = pulleyAtPoint(view, w)
      if (pulley) {
        // A pulley never ends a rope, and clicked twice in a row it counts once.
        if (tool.a && tool.via[tool.via.length - 1] !== pulley.id) setTool({ ...tool, via: [...tool.via, pulley.id] })
        return
      }
    }
    const hit = bodyAtPoint(view.bodies, w)
    if (!hit) return
    const anchor = anchorSnap(hit, w, transform)
    if (tool.kind === 'pulley') {
      finishTool(addPulley(docRef.current, hit.id, anchor), 'pulley')
      return
    }
    const end: ConstraintEnd = { bodyId: hit.id, anchor }
    if (!tool.a) {
      setTool({ ...tool, a: end })
      return
    }
    if (tool.a.bodyId === hit.id && (tool.kind === 'spring' || tool.via.length === 0)) return
    finishTool(tool.kind === 'spring' ? addSpring(docRef.current, tool.a, end) : addRope(docRef.current, tool.a, tool.via, end), 'constraint')
  }

  /** Commits what a tool built and selects it; a refusal stays on the tool's hint line. */
  function finishTool(res: MutationResult, selects: 'constraint' | 'pulley') {
    if (res.error) {
      setToolError(res.error)
      return
    }
    commitDoc(res.doc)
    setTool(null)
    setToolError(null)
    setSelection(res.newId ? { kind: selects, id: res.newId } : null)
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const w = eventToWorld(e)
    if (toolRef.current) {
      onToolClick(w)
      return
    }
    const { sx, sy } = eventToScreen(e)
    const view = applyStates(docRef.current, statesRef.current)
    const selected = view.bodies.find((b) => b.id === selectedId)

    // Handles win over body hit-testing while a body is selected.
    if (selected) {
      const handle = pickHandle(getHandles(selected, transform), sx, sy)
      if (handle) {
        e.currentTarget.setPointerCapture(e.pointerId)
        if (handle.kind === 'rotate') {
          dragRef.current = {
            kind: 'rotate',
            id: selected.id,
            startAngle: Math.atan2(w.y - selected.position.y, w.x - selected.position.x),
            startRotation: selected.rotation,
            startDoc: docRef.current,
          }
        } else {
          dragRef.current = { kind: handle.kind, id: selected.id, startDoc: docRef.current }
        }
        return
      }
      // Then the application points of its forces, which drag with Anchor snap.
      const grabbed = docRef.current.forces.find((f) => {
        if (f.bodyId !== selected.id) return false
        const p = bodyPointToWorld(selected, f.anchor)
        const s = worldToScreen(transform, p.x, p.y)
        return Math.hypot(s.x - sx, s.y - sy) <= HANDLE_HIT_RADIUS_PX
      })
      if (grabbed) {
        e.currentTarget.setPointerCapture(e.pointerId)
        dragRef.current = { kind: 'forceAnchor', id: selected.id, forceId: grabbed.id, startDoc: docRef.current }
        return
      }
    }

    // A pulley is drawn over its mount body and wins over it. A body under the
    // pointer wins over a spring or rope end anchored on it; lines are picked
    // where they cross open space.
    const pulley = pulleyAtPoint(view, w)
    if (pulley) {
      setSelection({ kind: 'pulley', id: pulley.id })
      return
    }
    const hit = bodyAtPoint(view.bodies, w)
    if (hit) {
      setSelection({ kind: 'body', id: hit.id })
      dragRef.current = { kind: 'move', id: hit.id, offX: w.x - hit.position.x, offY: w.y - hit.position.y, neighborId: null, startDoc: docRef.current }
      e.currentTarget.setPointerCapture(e.pointerId)
      repaint() // reveal the trash target immediately, even before the first move
      return
    }
    const tolerance = LINE_HIT_TOLERANCE_PX / camera.pixelsPerMeter
    const line = springAtPoint(view, w, tolerance) ?? ropeAtPoint(view, w, tolerance)
    setSelection(line ? { kind: 'constraint', id: line.id } : null)
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current
    if (!drag) return
    const raw = eventToWorld(e)

    if (drag.kind === 'move') {
      setDoc((d) => {
        const body = d.bodies.find((candidate) => candidate.id === drag.id)
        if (!body) return d
        const proposed = {
          ...body,
          position: { x: raw.x - drag.offX, y: raw.y - drag.offY },
        }
        const { body: snapped, neighborId } = resolveContactSnap(proposed, d.bodies, camera.pixelsPerMeter, contactSnapEnabled)
        drag.neighborId = neighborId
        return updateBody(d, drag.id, { position: snapped.position, rotation: snapped.rotation })
      })
      return
    }

    const body = liveBodies().find((b) => b.id === drag.id)
    if (!body) return

    if (drag.kind === 'rotate') {
      const angle = Math.atan2(raw.y - body.position.y, raw.x - body.position.x)
      setDoc((d) => updateBody(d, drag.id, { rotation: drag.startRotation + angle - drag.startAngle }))
      return
    }

    if (drag.kind === 'forceAnchor') {
      setDoc((d) => updateForce(d, drag.forceId, { anchor: anchorSnap(body, raw, transform) }))
      return
    }

    if (drag.kind === 'alpha') {
      // α is an angle input - snapping the pointer position would fight the atan2.
      const local = worldToLocal(body, raw)
      setDoc((d) => updateBody(d, drag.id, { alpha: alphaFromLocal(local.x, local.y) }))
      return
    }

    // Resize follows the pointer exactly; Contact snap applies only to Body movement.
    const local = worldToLocal(body, raw)
    switch (body.shape) {
      case 'rectangle':
        setDoc((d) =>
          updateBody(d, drag.id, {
            width: minDimension(2 * Math.abs(local.x)),
            height: minDimension(2 * Math.abs(local.y)),
          }),
        )
        break
      case 'circle':
        setDoc((d) => updateBody(d, drag.id, { radius: minDimension(Math.hypot(local.x, local.y)) }))
        break
      case 'triangle':
        // Dragging the base handle edits base only; height derives from α.
        setDoc((d) => updateBody(d, drag.id, { base: minDimension(local.x) }))
        break
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current
    // One complete drag (move/rotate/resize/alpha) is a single undo step:
    // push the pre-drag snapshot ONCE, here, never on pointermove.
    if (drag && drag.startDoc !== docRef.current) {
      setHistory((h) => pushHistory(h, drag.startDoc))
    }
    if (drag?.kind === 'move') {
      const { sx, sy } = eventToScreen(e)
      if (pointInTrash(trashRectValue, sx, sy)) {
        setDoc((d) => removeBodyAndDependents(d, drag.id))
        setSelection(null)
      } else if (drag.neighborId) {
        // Contact is declared here, on drop, never mid-drag; duplicate pairs
        // are a silent no-op (addContact's own guard).
        setDoc((d) => addContact(d, drag.id, drag.neighborId!).doc)
      }
    }
    dragRef.current = null
    repaint() // hide the trash target
  }

  /** Palette creation: sensible dynamic defaults at the exact view center. */
  function addShape(shape: Body['shape']) {
    const prefix = shape === 'rectangle' ? 'retangulo' : shape === 'circle' ? 'bola' : 'cunha'
    const center = screenToWorld(transform, size.width / 2, size.height / 2)
    const position = center
    const id = freshId(doc, prefix)
    const common = { id, position, mass: 1, fixed: false, rotation: 0 } as const
    const body: Body =
      shape === 'rectangle'
        ? { ...common, shape, width: 1.5, height: 1 }
        : shape === 'circle'
          ? { ...common, shape, radius: 0.75 }
          : { ...common, shape, base: 2, alpha: 30 }
    commitDoc({ ...doc, bodies: [...doc.bodies, body] })
    setSelection({ kind: 'body', id })
  }

  /** Arms a palette tool; selection yields to it until it finishes or Esc cancels. */
  function armTool(next: Tool) {
    setTool(next)
    setToolError(null)
    setSelection(null)
  }

  /** Refuses a spring edit that would not survive the codec (PHY-27, proxy decision on criterion 3). */
  function commitSpringEdit(edit: (d: Scene) => Scene): boolean {
    const next = edit(docRef.current)
    const s = next.constraints?.find((c) => c.id === selectedConstraintId)
    if (s?.kind !== 'spring' || !(s.k > 0 && s.x0 > 0 && (s.c ?? 0) >= 0)) return false
    commitDoc(next)
    return true
  }

  const selected = selectedId ? (doc.bodies.find((b) => b.id === selectedId) ?? null) : null
  const selectedSpring = doc.constraints?.find((c): c is Spring => c.id === selectedConstraintId && c.kind === 'spring') ?? null
  const selectedRope = doc.constraints?.find((c): c is Rope => c.id === selectedConstraintId && c.kind === 'rope') ?? null
  const selectedPulley = doc.pulleys?.find((p) => p.id === selectedPulleyId) ?? null
  // T differs per leg only across a pulley with mass (PHY-25).
  const ropePerLeg = !!selectedRope && selectedRope.via.some((id) => (doc.pulleys?.find((p) => p.id === id)?.mass ?? 0) > 0)
  const selectedConstraint = selectedSpring ?? selectedRope
  const warnings = collectWarnings(doc)

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column', gap: 8, minHeight: '100vh', boxSizing: 'border-box', padding: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <h1 style={{ fontSize: 18, margin: 8 }}>{t('app.title')}</h1>
        <label style={{ fontSize: 12 }}>
          {t('lang.label')}{' '}
          <select
            value={lang}
            onChange={(e) => {
              const next = e.target.value as Lang
              persistLang(next, storage)
              setLangState(next)
            }}
          >
            <option value="pt-BR">{t('lang.pt-BR')}</option>
            <option value="en">{t('lang.en')}</option>
          </select>
        </label>
      </div>
      {/* Let the viewport allocate the row, independently of either column's
          intrinsic content size (including the canvas's previous size). */}
      <div style={{ display: 'flex', flexDirection: stacked ? 'column' : 'row', gap: ROW_GAP, flex: 1, minHeight: 0, width: '100%', contain: 'size' }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            // Side by side, this column's basis is 0% so it shares the row's
            // width fairly with the fixed-width inspector (existing PHY-15/18
            // behaviour, untouched). Stacked, flex-shrink:0 with an auto basis
            // makes this column's own height come from its own content — the
            // canvas floor below, plus the controls. Neither column shrinks
            // when stacked, so the row simply overflows downwards and the page
            // scrolls; what matters is that this one never collapses under the
            // canvas it contains, which is what painted it over the inspector.
            flex: stacked ? '1 0 auto' : 1,
            minWidth: 0,
            minHeight: 0,
          }}
        >
          <div
            ref={canvasBoxRef}
            // Height comes from the row (stretch), NEVER from the canvas: sizing the
            // canvas off a box that shrink-wraps it is a feedback loop that grows
            // the canvas a few px every frame until it overflows.
            // Keep the scene at the top of the available canvas area.
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 0,
              display: 'flex',
              alignItems: 'flex-start',
              // Centering split any width-floor overflow evenly left and
              // right — the left half landed at a negative rect.left, which
              // no amount of horizontal scrolling can reach (scrolling only
              // exposes positive overflow). flex-start pins the canvas's left
              // edge inside the viewport and pushes all the overflow right,
              // where it's at least reachable.
              justifyContent: stacked ? 'flex-start' : 'center',
              overflow: 'visible',
              position: 'relative',
            }}
          >
            <canvas
              ref={canvasRef}
              style={{
                width: size.width,
                height: size.height,
                border: '1px solid #999',
                background: '#fafbfc',
                touchAction: 'none',
                cursor: tool ? 'crosshair' : selected ? 'grab' : 'default',
              }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            />
            {bootState === 'booting' && (
              // A small badge, not a full-canvas cover: the student can see
              // and edit the scene while the engine loads. pointerEvents:
              // 'none' is only safe to rely on because the badge doesn't hide
              // the canvas underneath it — an opaque full-cover overlay set
              // to pointer-events:none would let the student drag bodies
              // they can't see.
              <div
                style={{
                  position: 'absolute',
                  top: 8,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  maxWidth: '80%',
                  textAlign: 'center',
                  padding: '6px 14px',
                  borderRadius: 6,
                  background: 'rgba(250, 251, 252, 0.92)',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                  pointerEvents: 'none',
                }}
              >
                {t(`loading.msg.${String(messageAt(bootSeed, messageTick, LOADING_MESSAGE_COUNT) + 1).padStart(2, '0')}`)}
              </div>
            )}
            {bootState === 'error' && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  textAlign: 'center',
                  padding: 16,
                  background: 'rgba(250, 251, 252, 0.92)',
                }}
              >
                <div>{t('loading.error')}</div>
                <button onClick={retryBoot}>{t('loading.retry')}</button>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={togglePlay} style={{ minWidth: 110 }}>
              {playback.status === 'playing' ? t('playback.pause') : t('playback.play')}
            </button>
            <button onClick={stepOnce} title={t('playback.stepTitle')}>
              {t('playback.step')}
            </button>
            <button onClick={() => dispatch({ type: 'reset' })} title={t('playback.resetTitle')}>
              {t('playback.reset')}
            </button>
            <button onClick={undo} disabled={!canUndo(history)} title={t('playback.undoTitle')}>
              ↶
            </button>
            <button onClick={redo} disabled={!canRedo(history)} title={t('playback.redoTitle')}>
              ↷
            </button>
            <span style={{ position: 'relative' }}>
              <button onClick={() => setShowShortcuts((v) => !v)} title={t('shortcuts.title')}>
                ?
              </button>
              {showShortcuts && (
                <div
                  onClick={() => setShowShortcuts(false)}
                  style={{ position: 'fixed', inset: 0, zIndex: 1 }}
                >
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: 'absolute',
                      top: 24,
                      left: 0,
                      background: '#fff',
                      border: '1px solid #999',
                      borderRadius: 4,
                      padding: 10,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                      fontSize: 12,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <strong>{t('shortcuts.title')}</strong>
                    <table style={{ marginTop: 6, borderSpacing: '0 4px' }}>
                      <tbody>
                        <tr><td style={{ paddingRight: 12 }}>Ctrl+Z</td><td>{t('shortcuts.undo')}</td></tr>
                        <tr><td style={{ paddingRight: 12 }}>Ctrl+Shift+Z / Ctrl+Y</td><td>{t('shortcuts.redo')}</td></tr>
                        <tr><td style={{ paddingRight: 12 }}>Delete / Backspace</td><td>{t('shortcuts.delete')}</td></tr>
                        <tr><td style={{ paddingRight: 12 }}>{t('shortcuts.keySpace')}</td><td>{t('shortcuts.togglePlay')}</td></tr>
                        <tr><td style={{ paddingRight: 12 }}>→</td><td>{t('shortcuts.stepOnce')}</td></tr>
                        <tr><td style={{ paddingRight: 12 }}>R</td><td>{t('shortcuts.reset')}</td></tr>
                        <tr><td style={{ paddingRight: 12 }}>Esc</td><td>{t('shortcuts.deselectOrClose')}</td></tr>
                        <tr><td style={{ paddingRight: 12 }}>?</td><td>{t('shortcuts.toggleHelp')}</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
              {t('playback.speedLabel')}
              <input
                type="range"
                min={SPEED_MIN}
                max={SPEED_MAX}
                step={SPEED_STEP}
                value={playback.speed}
                onChange={(e) => dispatch({ type: 'setSpeed', speed: e.target.valueAsNumber })}
              />
              <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: 44 }}>
                {playback.speed.toFixed(2)}×
              </span>
            </label>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => addShape('rectangle')}>{t('palette.rectangle')}</button>
            <button onClick={() => addShape('circle')}>{t('palette.circle')}</button>
            <button onClick={() => addShape('triangle')}>{t('palette.triangle')}</button>
            <button onClick={() => armTool({ kind: 'spring', a: null })}>{t('palette.spring')}</button>
            <button onClick={() => armTool({ kind: 'pulley' })}>{t('palette.pulley')}</button>
            <button onClick={() => armTool({ kind: 'rope', a: null, via: [] })}>{t('palette.rope')}</button>
          </div>
          {tool && (
            <div style={{ fontSize: 12, color: '#555' }}>
              {t(tool.kind === 'pulley' ? 'tool.pulley' : tool.kind === 'spring' ? (tool.a ? 'tool.springSecond' : 'tool.springFirst') : tool.a ? 'tool.ropeNext' : 'tool.ropeFirst')}
              {toolError && <span style={{ color: '#b00' }}> — {t(toolError)}</span>}
            </div>
          )}
        </div>
        {/* The row sets the panel height; excess content scrolls independently.
            The width is fixed because the panel's content width changes with the
            selection and the canvas rectangle must not follow it: without it the
            canvas narrows 15 px at 1280 on selection and the PHY-18 tests fail. */}
        <div style={{ display: 'grid', gap: 8, width: stacked ? '100%' : INSPECTOR_WIDTH, flexShrink: 0, overflowY: 'auto', alignContent: 'start' }}>
          <label style={{ fontSize: 14 }}>
            <input
              type="checkbox"
              checked={contactSnapEnabled}
              onChange={(e) => setContactSnapEnabled(e.target.checked)}
            />{' '}
            {t('panel.contactSnap')}
          </label>
          <label style={{ fontSize: 14 }}>
            <input
              type="checkbox"
              checked={showGlobal}
              onChange={(e) => setShowGlobal(e.target.checked)}
            />{' '}
            {t('panel.showVectors')}
          </label>
          <fieldset style={{ width: 220 }}>
            <legend>{t('scenes.title')}</legend>
            <select
              value={currentId}
              onChange={(e) => {
                const id = e.target.value
                switchToScene(id)
              }}
              style={{ width: '100%', marginBottom: 4 }}
            >
              {sceneIndex.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <button
                onClick={() => {
                  const res = createNewScene(storage)
                  if ('reason' in res) {
                    setStorageWarning(res.reason)
                    return
                  }
                  switchToScene(res.entry.id)
                }}
              >
                {t('scenes.new')}
              </button>
              <button
                onClick={() => {
                  const res = duplicatePersistedScene(storage, currentId, doc)
                  if ('reason' in res) {
                    setStorageWarning(res.reason)
                    return
                  }
                  switchToScene(res.entry.id)
                }}
              >
                {t('scenes.duplicate')}
              </button>
              <button
                onClick={() => {
                  if (saverRef.current?.getPendingId() === currentId) saverRef.current?.flush()
                  else saverRef.current?.cancel()
                  const res = deletePersistedScene(storage, currentId)
                  if (res !== null && typeof res === 'object' && 'reason' in res) {
                    setStorageWarning((res as { reason: string }).reason)
                    return
                  }
                  const next = res as import('./persistence').SceneIndexEntry[]
                  if (next.length === 0) {
                    const r2 = createNewScene(storage)
                    if ('reason' in r2) {
                      setStorageWarning(r2.reason)
                      return
                    }
                    switchToScene(r2.entry.id)
                  } else {
                    switchToScene(next[0]!.id)
                  }
                }}
              >
                {t('scenes.delete')}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
              <button
                onClick={() => {
                  const txt = exportScene(doc)
                  const blob = new Blob([txt], { type: 'application/json' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `${currentId}.json`
                  a.click()
                  URL.revokeObjectURL(url)
                }}
              >
                {t('scenes.export')}
              </button>
              <label style={{ fontSize: 12, border: '1px solid #999', padding: '2px 6px', cursor: 'pointer' }}>
                {t('scenes.import')}
                <input
                  type="file"
                  accept=".json,application/json"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const reader = new FileReader()
                    reader.onload = () => {
                      const text = String(reader.result ?? '')
                      const res = importScene(storage, text)
                      if ('reason' in res) {
                        if (res.reason.toLowerCase().includes('quota')) setStorageWarning(res.reason)
                        else setImportError(res.reason)
                      } else {
                        setImportError(null)
                        switchToScene(res.entry.id)
                      }
                    }
                    reader.readAsText(file)
                    e.target.value = ''
                  }}
                />
              </label>
            </div>
            {importError && <div style={{ fontSize: 12, color: '#b00', marginTop: 4 }}>{importError}</div>}
            {corruptWarningKey && <div style={{ fontSize: 12, color: '#d9a441', marginTop: 4 }}>{t(corruptWarningKey)}</div>}
            {storageWarning && <div style={{ fontSize: 12, color: '#d9a441', marginTop: 4 }}>{storageWarning}</div>}
            <div style={{ marginTop: 6 }}>
              <button
                onClick={() =>
                  setShowGallery((v) => {
                    if (v) ackGallery(storage)
                    return !v
                  })
                }
              >
                {showGallery ? t('scenes.galleryClose') : t('scenes.galleryOpen')}
              </button>
            </div>
          </fieldset>
          {showGallery && (
            <fieldset style={{ width: 220 }}>
              <legend>{t('gallery.title')}</legend>
              <div style={{ display: 'grid', gap: 6 }}>
                {PRESETS.map((p) => (
                  <label key={p.id} style={{ display: 'flex', gap: 6, border: selectedPreset === p.id ? '1px solid #4a90d9' : '1px solid #ddd', padding: 4, cursor: 'pointer' }}>
                    <input type="radio" name="preset" checked={selectedPreset === p.id} onChange={() => setSelectedPreset(p.id)} />
                    <span style={{ fontSize: 12 }}>
                      <strong>{t(`preset.${p.id}.name`)}</strong>
                      <br />
                      <span style={{ color: '#555' }}>{t(`preset.${p.id}.description`)}</span>
                    </span>
                  </label>
                ))}
                <button
                  onClick={() => {
                    const preset = PRESETS.find((x) => x.id === selectedPreset)
                    if (!preset) return
                    const res = createPresetScene(storage, preset)
                    if ('reason' in res) {
                      setStorageWarning(res.reason)
                      return
                    }
                    ackGallery(storage)
                    switchToScene(res.entry.id)
                    setShowGallery(false)
                  }}
                >
                  {t('gallery.useSelected')}
                </button>
                <button
                  onClick={() => {
                    const res = createNewScene(storage)
                    if ('reason' in res) {
                      setStorageWarning(res.reason)
                      return
                    }
                    ackGallery(storage)
                    switchToScene(res.entry.id)
                    setShowGallery(false)
                  }}
                >
                  {t('gallery.blank')}
                </button>
              </div>
            </fieldset>
          )}
          <fieldset style={{ width: 220 }}>
            <legend>
              {selected ?? selectedConstraint ?? selectedPulley
                ? t('readout.title', { id: (selected ?? selectedConstraint ?? selectedPulley)!.id })
                : t('readout.titleEmpty')}
            </legend>
            <div style={{ fontSize: 12, lineHeight: 1.6 }}>
              <div>{t('readout.steps')}: {stepsTick}</div>
              <div>{t('readout.speed')}: {playback.speed.toFixed(2)}×</div>
              {selected && readout && (
                <>
                  <div>
                    {t('readout.position')}: ({readout.x.toFixed(2)}, {readout.y.toFixed(2)}) m
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {t('readout.velocityMagnitude')}: {Math.hypot(readout.vx, readout.vy).toFixed(2)} m/s
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {t('readout.accelerationMagnitude')}: {readout.approximate ? '≈ ' : ''}{Math.hypot(readout.ax, readout.ay).toFixed(2)} m/s²
                  </div>
                  <details>
                    <summary>{t('readout.more')}</summary>
                    <div>
                      {t('readout.velocity')}: ({readout.vx.toFixed(2)}, {readout.vy.toFixed(2)}) m/s
                    </div>
                    <div>
                      {t('readout.acceleration')}: ({readout.ax.toFixed(2)}, {readout.ay.toFixed(2)}) m/s²
                    </div>
                  </details>
                </>
              )}
              {selected && !readout && <div style={{ color: '#777' }}>{t('readout.noData')}</div>}
              {selectedSpring && constraintReadout?.kind === 'spring' && (
                <>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {t('readout.springForce')}: {constraintReadout.force.a.toFixed(2)} N
                  </div>
                  <div>
                    {t('readout.springDx')}: {constraintReadout.dx.toFixed(3)} m
                  </div>
                </>
              )}
              {selectedRope && constraintReadout?.kind === 'rope' && (
                <>
                  {(ropePerLeg ? constraintReadout.segments : [constraintReadout.tension]).map((T, i) => (
                    <div key={i} style={{ fontWeight: 600, fontSize: 14 }}>
                      {t('readout.ropeTension')}{ropePerLeg ? subscript(i + 1) : ''}: {T.toFixed(2)} N
                    </div>
                  ))}
                  {constraintReadout.slack && <div>{t('readout.ropeSlack')}</div>}
                </>
              )}
              {((selectedConstraint && constraintReadout?.kind !== selectedConstraint.kind) || selectedPulley) && (
                <div style={{ color: '#777' }}>{t('readout.noData')}</div>
              )}
              {!selected && !selectedConstraint && !selectedPulley && <div style={{ color: '#777' }}>{t('panel.selectBodyEmpty')}</div>}
            </div>
          </fieldset>
          <NumField label={t('panel.gLabel')} value={doc.constants.g} step={0.01} onChange={(v) => commitDoc((d) => updateG(d, v))} />
          <label style={{ fontSize: 14 }}>
            <input
              type="checkbox"
              checked={doc.constants.particleMode ?? false}
              onChange={(e) => commitDoc((d) => updateParticleMode(d, e.target.checked))}
            />{' '}
            {t('panel.particleMode')}
          </label>
          {selected && (
            <>
              <PropertiesPanel body={selected} onPatch={(patch) => commitDoc((d) => updateBody(d, selected.id, patch))} />
              <ForcesPanel
                bodyId={selected.id}
                forces={doc.forces.filter((f) => f.bodyId === selected.id)}
                onAdd={() => {
                  const res = addForce(doc, { bodyId: selected.id, anchor: { x: 0, y: 0 }, magnitude: 10, direction: 0 })
                  commitDoc(res.doc)
                  return res.error
                }}
                onPatch={(id, patch) => commitDoc((d) => updateForce(d, id, patch))}
                onRemove={(id) => commitDoc((d) => removeForce(d, id))}
              />
            </>
          )}
          {selectedSpring && (
            <SpringPanel
              key={selectedSpring.id}
              spring={selectedSpring}
              dx={springDx(doc, selectedSpring)}
              onEdit={commitSpringEdit}
              onDelete={deleteSelected}
            />
          )}
          {selectedRope && <RopePanel rope={selectedRope} length={scenePath(doc, selectedRope)?.length ?? null} onDelete={deleteSelected} />}
          {selectedPulley && (
            <PulleyPanel pulley={selectedPulley} onPatch={(patch) => commitDoc((d) => updatePulley(d, selectedPulley.id, patch))} onDelete={deleteSelected} />
          )}
          <ContactsPanel
            doc={doc}
            onAdd={(a, b) => {
              const res = addContact(doc, a, b)
              commitDoc(res.doc)
              return res.error
            }}
            onPatch={(a, b, patch) => commitDoc((d) => updateContact(d, a, b, patch))}
            onRemove={(a, b) => commitDoc((d) => removeContact(d, a, b))}
          />
          {simError && (
            <fieldset style={{ width: 220, borderColor: '#b00' }}>
              <legend>{t('simError.title')}</legend>
              <div style={{ fontSize: 12, color: '#b00' }}>{simError}</div>
            </fieldset>
          )}
          {warnings.length > 0 && (
            <fieldset style={{ width: 220, borderColor: '#d9a441' }}>
              <legend>{t('warnings.title')}</legend>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: '#8a6414' }}>
                {warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </fieldset>
          )}
          {selected && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => {
                  const { doc: next, newId } = duplicateBody(doc, selected.id)
                  commitDoc(next)
                  if (newId) setSelection({ kind: 'body', id: newId })
                }}
              >
                {t('panel.duplicate')}
              </button>
              <button onClick={deleteSelected}>{t('panel.delete')}</button>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
