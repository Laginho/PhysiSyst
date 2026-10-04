import { bodyEnergy, systemEnergy, type BodyEnergy, type SystemEnergy } from './sim/energy'
import type { PulleyState } from './sim/simulator'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppliedForce, Body, ConstraintEnd, Pulley, Rope, Scene, Spring, Vec2 } from './scene'
import { bodyPointToWorld, collectWarnings, scenePath, serialize } from './scene'
import {
  advance,
  applyLiveOps,
  applyStates,
  initialPlayback,
  Recording,
  RECORDING_CAP,
  routeDocChange,
  SPEED_MAX,
  SPEED_MIN,
  SPEED_STEP,
  type PlaybackAction,
  type PlaybackState,
} from './playback'
import { TIMESTEP } from './sim/timestep'
import { DEMO_SCENE } from './scene/demo'
import { createPresetScene, galleryGroups, nodeLabelKeys, presetById, type Preset } from './presets'
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
import { AXLE_HIT_RADIUS_PX, bodyAtPoint, pulleyAtPoint, ropeAtPoint, springAtPoint, worldToLocal } from './editor/hitTest'
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
import { drawArrow, drawGrid, drawScene, massLabels, selectedOf, type ArrowStyle, type Selection } from './render/draw'
import { makeTransform, pixelsPerMeterForWidth, screenToWorld, worldToScreen, type Camera, type ScreenTransform } from './render/transform'
import { CANVAS_MIN_WIDTH, fitCanvas } from './render/fitCanvas'
import {
  appliedArrows,
  elasticArrows,
  initialVelocityArrows,
  normalArrows,
  numberedSymbol,
  tensionArrows,
  vectorLabels,
  weightArrows,
  type OverlayArrow,
} from './render/overlay'
import { getAcceleration, initialTracker, onRebuild, onReset, onSteps } from './playback/accelerationTracker'
import { messageAt } from './render/loadingMessage'
import { fmtNum, getLang, setLang as persistLang, t, type Lang } from './i18n'
import { drawGraph, graphLayout, indexAtX, seriesFor, GRAPH_KINDS, type GraphKind } from './render/graph'
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
  loadCanvasSize,
  loadControlsScale,
  loadIndex,
  loadIndexResult,
  loadSceneOrBlank,
  saveCurrentSceneId,
  saveCanvasSize,
  saveControlsScale,
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
 * first anchor once clicked (a pulley never has one), `via` the rope's pulleys
 * so far, in click order.
 */
type Tool =
  | { kind: 'spring'; a: ConstraintEnd | null }
  | { kind: 'pulley'; a?: never }
  | { kind: 'rope'; a: ConstraintEnd | null; via: string[] }
  | null

/** The hint-line key for an armed tool: what its next click does. */
function toolHint(tool: NonNullable<Tool>): string {
  if (tool.kind === 'pulley') return 'tool.pulley'
  if (tool.kind === 'spring') return tool.a ? 'tool.springSecond' : 'tool.springFirst'
  return tool.a ? 'tool.ropeNext' : 'tool.ropeFirst'
}

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

// In the editor the readings go stale (refreshed only at boot, reset and rebuild): the rope there follows the
// document, and only a simulated frame's readings shape its drawing and its T arrows (PHY-56) and click (CLEAN-27).
function ropeReadingsOf(states: ReadonlyMap<string, BodyState> | null, readings: readonly ConstraintState[]): readonly ConstraintState[] {
  return states !== null ? readings : []
}

function paint(
  ctx: CanvasRenderingContext2D,
  doc: Scene,
  selection: Selection,
  states: ReadonlyMap<string, BodyState> | null,
  geometry: { camera: Camera; transform: ScreenTransform; trash: Rect },
  opts?: {
    showGlobal: boolean
    stepsTaken: number
    contacts?: readonly ContactPoint[]
    constraints?: readonly ConstraintState[]
    lang?: Lang
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
  const ropeReadings = ropeReadingsOf(states, opts?.constraints ?? [])
  drawScene(ctx, view, camera, transform.width, transform.height, { selection, readings: ropeReadings })

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
  // Vector labels number over the whole scene's arrows, so a selected vector
  // reads the same letter it has in global mode.
  const ppm = camera.pixelsPerMeter
  const constraints = opts?.constraints ?? []
  const showInitialVelocity = (opts?.stepsTaken ?? 0) === 0
  const layers: Array<{ arrows: OverlayArrow[]; style: Partial<ArrowStyle> }> = [
    { arrows: weightArrows(doc, states, ppm), style: { color: '#2e7d32', widthPx: 2, headLenPx: 8 } },
    { arrows: showInitialVelocity ? initialVelocityArrows(view, ppm) : [], style: { color: '#43a047', widthPx: 2, headLenPx: 8 } },
    { arrows: appliedArrows(view, ppm), style: { color: '#d97742', widthPx: 2, headLenPx: 10 } },
    { arrows: normalArrows(opts?.contacts ?? []), style: { color: '#1565c0', widthPx: 2, headLenPx: 8 } },
    { arrows: tensionArrows(view, ropeReadings, ppm), style: { color: '#6a1b9a', widthPx: 2, headLenPx: 8 } },
    { arrows: elasticArrows(view, constraints, ppm), style: { color: '#00838f', widthPx: 2, headLenPx: 8 } },
  ]
  const labels = vectorLabels(layers.flatMap((l) => l.arrows), opts?.lang ?? 'pt-BR')
  if (opts?.showGlobal) {
    for (const { arrows, style } of layers) for (const a of arrows) drawArrow(ctx, a.from, a.vec, transform, style, labels(a))
  } else {
    const sel = view.bodies.find((b) => b.id === selectedId)
    if (sel) {
      const selView: Scene = { ...view, bodies: [sel], forces: view.forces.filter((f) => f.bodyId === sel.id) }
      if (showInitialVelocity) {
        for (const a of initialVelocityArrows(selView, ppm)) drawArrow(ctx, a.from, a.vec, transform, layers[1]!.style, labels(a))
      }
      for (const a of appliedArrows(selView, ppm)) {
        drawArrow(ctx, a.from, a.vec, transform, undefined, labels(a))
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

/** Rejected or incomplete numbers stay local until blur; accepted edits still apply immediately. */
function NumField({
  label,
  value,
  step,
  disabled,
  title,
  onChange,
}: {
  label: string
  value: number
  step?: number
  disabled?: boolean
  title?: string
  onChange: (v: number) => boolean | void
}) {
  const [draft, setDraft] = useState<{ value: number; text: string } | null>(null)
  if (draft && draft.value !== value) setDraft(null)
  return (
    <label style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
      {label}
      <input
        type="number"
        disabled={disabled}
        title={title}
        step={step ?? 'any'}
        value={draft?.text ?? value}
        style={{ width: 80 }}
        onChange={(e) => {
          const v = e.target.valueAsNumber
          if (Number.isFinite(v) && onChange(v) !== false) setDraft(null)
          else setDraft({ value, text: e.target.value })
        }}
        onBlur={() => setDraft(null)}
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
  disabled,
  onPatch,
}: {
  body: Body
  disabled: boolean
  onPatch: (patch: BodyPatch) => void
}) {
  const pos = (p: Vec2, axis: 'x' | 'y') => p[axis]
  const [velocityMode, setVelocityMode] = useState<'cartesian' | 'polar'>('cartesian')
  const polar = cartesianToPolar(body.vx ?? 0, body.vy ?? 0)
  return (
    <fieldset disabled={disabled} style={{ width: 220 }}>
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
  structuralLocked,
  liveLocked,
  onAdd,
  onPatch,
  onRemove,
}: {
  bodyId: string
  forces: AppliedForce[]
  structuralLocked: boolean
  liveLocked: boolean
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
            <button disabled={structuralLocked} onClick={() => onRemove(f.id)} title={t('forces.removeTitle')}>✕</button>
          </div>
          <NumField disabled={liveLocked} title={liveLocked ? t('playback.scrubbedEditHint') : undefined} label={t('forces.magnitude')} value={f.magnitude} onChange={(v) => onPatch(f.id, { magnitude: Math.max(0, v) })} />
          <NumField disabled={liveLocked} title={liveLocked ? t('playback.scrubbedEditHint') : undefined} label={t('forces.direction')} value={f.direction} onChange={(v) => onPatch(f.id, { direction: v })} />
          <NumField disabled={liveLocked} title={liveLocked ? t('playback.scrubbedEditHint') : undefined} label={t('forces.anchorX')} value={f.anchor.x} onChange={(v) => onPatch(f.id, { anchor: { ...f.anchor, x: v } })} />
          <NumField disabled={liveLocked} title={liveLocked ? t('playback.scrubbedEditHint') : undefined} label={t('forces.anchorY')} value={f.anchor.y} onChange={(v) => onPatch(f.id, { anchor: { ...f.anchor, y: v } })} />
        </div>
      ))}
      <button disabled={structuralLocked} style={{ marginTop: 6 }} onClick={() => setError(onAdd())}>{t('forces.add')}</button>
      {error && <div style={{ fontSize: 12, color: '#b00' }}>{t(error)}</div>}
    </fieldset>
  )
}

/** Each pair is editable from either body, retaining its stored endpoint order. */
function BodyContactsPanel({
  doc,
  bodyId,
  disabled,
  onAdd,
  onPatch,
  onRemove,
}: {
  doc: Scene
  bodyId: string
  disabled: boolean
  onAdd: (a: string, b: string) => string | null
  onPatch: (a: string, b: string, patch: { muS?: number; muK?: number; e?: number }) => void
  onRemove: (a: string, b: string) => void
}) {
  const contacts = doc.contacts.filter(c => c.a === bodyId || c.b === bodyId)
  const paired = new Set(contacts.map(c => c.a === bodyId ? c.b : c.a))
  const partners = doc.bodies.filter(b => b.id !== bodyId && !paired.has(b.id))
  const [chosenPartner, setChosenPartner] = useState('')
  // A successful add, deletion or scene edit can invalidate the previous choice.
  const partnerId = partners.some(b => b.id === chosenPartner) ? chosenPartner : partners[0]?.id ?? ''
  const [error, setError] = useState<string | null>(null)
  const labels = massLabels(doc)
  const fixedCounts = new Map<Body['shape'], number>()
  for (const body of doc.bodies) {
    if (!body.fixed) continue
    const n = (fixedCounts.get(body.shape) ?? 0) + 1
    fixedCounts.set(body.shape, n)
    labels.set(body.id, t('contacts.fixedLabel', { shape: t(`palette.${body.shape}`), n }))
  }
  return (
    <fieldset disabled={disabled} style={{ width: 220 }}>
      <legend>{t('contacts.of', { label: labels.get(bodyId) ?? bodyId })}</legend>
      {contacts.length === 0 && <div style={{ fontSize: 12, color: '#777' }}>{t('contacts.empty')}</div>}
      {contacts.map((c) => (
        <div key={`${c.a}|${c.b}`} style={{ borderBottom: '1px solid #ddd', paddingBottom: 4, marginBottom: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span>{labels.get(c.a === bodyId ? c.b : c.a)}</span>
            <button onClick={() => onRemove(c.a, c.b)} title={t('contacts.removeTitle')}>✕</button>
          </div>
          <NumField label={t('contacts.muS')} value={c.muS} step={0.05} onChange={(v) => onPatch(c.a, c.b, { muS: v })} />
          <NumField label={t('contacts.muK')} value={c.muK} step={0.05} onChange={(v) => onPatch(c.a, c.b, { muK: v })} />
          <NumField label={t('contacts.e')} value={c.e ?? 0} step={0.05} onChange={(v) => onPatch(c.a, c.b, { e: v })} />
        </div>
      ))}
      <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
        <select aria-label={t('contacts.add')} disabled={partners.length === 0} value={partnerId} onChange={(e) => setChosenPartner(e.target.value)} style={{ minWidth: 70 }}>
          {partners.map((b) => <option key={b.id} value={b.id}>{labels.get(b.id)}</option>)}
        </select>
      </div>
      <button
        disabled={partners.length === 0}
        style={{ marginTop: 4 }}
        onClick={() => setError(onAdd(bodyId, partnerId))}
      >
        {t('contacts.add')}
      </button>
      {error && <div style={{ fontSize: 12, color: '#b00' }}>{t(error)}</div>}
    </fieldset>
  )
}

/**
 * Inspector for the selected spring (PHY-27). `onEdit` refuses an edit the
 * codec would reject (k ≤ 0, x₀ ≤ 0, c < 0, mₛ < 0) and returns false; the panel then
 * shows one warning line until the next accepted edit. Keyed by spring id,
 * so the warning never carries over to another spring.
 */
function SpringPanel({
  spring,
  dx,
  disabled,
  onEdit,
  onDelete,
}: {
  spring: Spring
  dx: number
  disabled: boolean
  onEdit: (edit: (d: Scene) => Scene) => boolean
  onDelete: () => void
}) {
  const [invalid, setInvalid] = useState(false)
  const edit = (e: (d: Scene) => Scene) => {
    const accepted = onEdit(e)
    setInvalid(!accepted)
    return accepted
  }
  return (
    <fieldset disabled={disabled} style={{ width: 220 }}>
      <legend>{spring.id}</legend>
      <NumField label={t('spring.k')} value={spring.k} onChange={(v) => edit((d) => updateSpring(d, spring.id, { k: v }))} />
      <NumField label={t('spring.x0')} value={spring.x0} step={0.01} onChange={(v) => edit((d) => updateSpring(d, spring.id, { x0: v }))} />
      <NumField label={t('spring.dx')} value={dx} step={0.01} onChange={(v) => edit((d) => setSpringDx(d, spring.id, v))} />
      <NumField label={t('spring.c')} value={spring.c ?? 0} step={0.1} onChange={(v) => edit((d) => updateSpring(d, spring.id, { c: v }))} />
      <NumField label={t('spring.mass')} value={spring.mass ?? 0} step={0.01} onChange={(v) => edit((d) => updateSpring(d, spring.id, { mass: v }))} />
      {invalid && <div style={{ fontSize: 12, color: '#b00' }}>{t('spring.invalid')}</div>}
      <button style={{ marginTop: 6 }} onClick={onDelete}>{t('panel.delete')}</button>
    </fieldset>
  )
}

/**
 * Inspector for the selected pulley (PHY-28). Same clamps as the body panel
 * and the force magnitude, so a typed value never makes an unparseable doc.
 */
function PulleyPanel({ pulley, disabled, onPatch, onDelete }: { pulley: Pulley; disabled: boolean; onPatch: (patch: { radius?: number; mass?: number }) => void; onDelete: () => void }) {
  return (
    <fieldset disabled={disabled} style={{ width: 220 }}>
      <legend>{pulley.id}</legend>
      <NumField label={t('properties.radius')} value={pulley.radius} step={0.05} onChange={(v) => onPatch({ radius: minDimension(v) })} />
      <NumField label={t('properties.mass')} value={pulley.mass ?? 0} onChange={(v) => onPatch({ mass: Math.max(0, v) })} />
      <button style={{ marginTop: 6 }} onClick={onDelete}>{t('panel.delete')}</button>
    </fieldset>
  )
}

/** Inspector for the selected rope (PHY-28): its path and L, both read-only — L is derived, never stored. */
function RopePanel({ rope, length, lang, disabled, onDelete }: { rope: Rope; lang: Lang; length: number | null; disabled: boolean; onDelete: () => void }) {
  return (
    <fieldset disabled={disabled} style={{ width: 220 }}>
      <legend>{rope.id}</legend>
      <div style={{ fontSize: 12 }}>
        {t('rope.path')}: {[rope.a.bodyId, ...rope.via, rope.b.bodyId].join(' → ')}
      </div>
      {length !== null && <div style={{ fontSize: 12 }}>L: {fmtNum(length, 3, lang)} m</div>}
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
// Two 32px buttons with 6px of space beside the scaled controls.
const CONTROLS_SIZER_WIDTH = 38

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
  const [controlsScale, setControlsScale] = useState(() => loadControlsScale(storage))
  const preferredWidthRef = useRef(loadCanvasSize(storage))
  const canvasContainerRef = useRef({ width: 900, height: 600 })
  const resizeDragRef = useRef<{ pointerId: number; startX: number; width: number } | null>(null)
  useEffect(() => saveControlsScale(storage, controlsScale), [storage, controlsScale])
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
    const saved = loadCurrentSceneId(storage, res.index)
    if (saved?.startsWith('preset:')) {
      return presetById(saved.slice(7)) ? saved : res.index[0]?.id ?? 'cena-1'
    }
    return saved ?? res.index[0]?.id ?? 'cena-1'
  })
  const openPreset = currentId.startsWith('preset:') ? presetById(currentId.slice(7)) : undefined
  const openPresetRef = useRef(openPreset)
  const [doc, setDoc] = useState<Scene>(() => {
    if (openPreset) return openPreset.buildScene()
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
  const [lang, setLangState] = useState<Lang>(() => getLang(storage))
  const lastSavedRef = useRef<Map<string, string>>(new Map([[currentId, JSON.stringify(serialize(doc))]]))
  /**
   * Transport mirror for the controls. The AUTHORITATIVE transport state lives
   * in `playbackRef`: live animation frames keep accumulator updates out of
   * React state. Discrete actions go through `dispatch`; replay frames also
   * update this mirror when the cursor changes, keeping controls and edit locks
   * aligned with the displayed record.
   */
  const [playback, setPlayback] = useState<PlaybackState>(initialPlayback)
  const [simError, setSimError] = useState<string | null>(null)
  const [simWarnings, setSimWarnings] = useState<readonly string[]>([])
  const [readout, setReadout] = useState<{ x: number; y: number; vx: number; vy: number; ax: number; ay: number; approximate: boolean } | null>(null)
  const [energyReadout, setEnergyReadout] = useState<{
    body: BodyEnergy | null; system: SystemEnergy | null; hasSpring: boolean
  }>({ body: null, system: null, hasSpring: false })
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
  // Display refs may point into history; the live frame always stays at the tip.
  type RecordedFrame = {
    scene: Scene
    states: Map<string, BodyState> | null
    contacts: ContactPoint[]
    constraints: ConstraintState[]
    pulleys: PulleyState[]
    acceleration: ReturnType<typeof initialTracker>
  }
  const liveFrameRef = useRef<RecordedFrame>({ scene: doc, states: null, contacts: [], constraints: [], pulleys: [], acceleration: initialTracker() })
  const recordingRef = useRef<Recording<RecordedFrame> | null>(null)
  if (!recordingRef.current) recordingRef.current = new Recording(liveFrameRef.current)
  const [recordingLength, setRecordingLength] = useState(1)
  const [graphOpen, setGraphOpen] = useState(false)
  const [graphKind, setGraphKind] = useState<GraphKind>('energy')
  const graphCanvasRef = useRef<HTMLCanvasElement>(null)
  const graphKindRef = useRef<GraphKind>('energy')
  const graphBodyId = selectedOf(selection, 'body')
  const effectiveGraphKind = graphBodyId === null && graphKind !== 'energy' && graphKind !== 'momentum' ? 'energy' : graphKind
  if (graphKind !== effectiveGraphKind) setGraphKind(effectiveGraphKind)
  const contactsRef = useRef<ContactPoint[]>([])
  /** Rope and spring readings, refreshed with the contacts, for the rope's drawing and click and the T and F_el arrows. */
  const constraintsRef = useRef<ConstraintState[]>([])
  const captureFrame = useCallback((): RecordedFrame => ({
    scene: docRef.current,
    states: statesRef.current ?? simRef.current?.readStates() ?? null,
    contacts: contactsRef.current,
    constraints: constraintsRef.current,
    pulleys: simRef.current?.readPulleys() ?? [],
    acceleration: accelRef.current,
  }), [])
  const showFrame = useCallback((frame: RecordedFrame) => {
    statesRef.current = playbackRef.current.cursor === 0 ? null : frame.states
    contactsRef.current = frame.contacts
    constraintsRef.current = frame.constraints
    accelRef.current = frame.acceleration
  }, [])
  const resetRecording = useCallback(() => {
    liveFrameRef.current = captureFrame()
    recordingRef.current!.reset(liveFrameRef.current)
    setRecordingLength(1)
  }, [captureFrame])
  /** Document the running world was built from, for live-edit routing. */
  const builtDocRef = useRef<Scene>(doc)
  const pendingRebuildRef = useRef(false)
  const resetOnEditRef = useRef(false)
  // Mirrors so the imperative rAF loop reads the latest document without
  // re-subscribing every render.
  const docRef = useRef<Scene>(doc)
  const selectionRef = useRef<Selection>(selection)
  const showGlobalRef = useRef(showGlobal)
  const langRef = useRef(lang)
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
  const liveLocked = playback.cursor !== null && playback.cursor > 0
  const structuralLocked = playback.cursor !== 0 && (playback.stepsTaken > 0 || stepsTick > 0)
  const canEditDoc = useCallback((next: Scene) => {
    const { cursor, stepsTaken } = playbackRef.current
    if (cursor !== null) return cursor === 0
    return stepsTaken === 0 || routeDocChange(docRef.current, next).kind === 'live'
  }, [])

  /** Rebind identity without replacing the running world or clearing its undo history. */
  const copyOpenPreset = useCallback((): boolean => {
    const preset = openPresetRef.current
    if (!preset) return true
    const result = createPresetScene(storage, preset)
    if ('reason' in result) {
      setStorageWarning(result.reason)
      return false
    }
    const { entry, scene } = result
    lastSavedRef.current.set(entry.id, JSON.stringify(serialize(scene)))
    openPresetRef.current = undefined
    setCurrentId(entry.id)
    saveCurrentSceneId(storage, entry.id)
    setSceneIndex(loadIndex(storage))
    return true
  }, [storage])

  /** All edits share this guard; scene transitions reset playback separately. */
  const editDoc = useCallback((next: Scene | ((d: Scene) => Scene), recordHistory = false): boolean => {
    const prev = docRef.current
    const resolved = typeof next === 'function' ? next(prev) : next
    if (resolved === prev) return true
    // Immutable patches can preserve every value (for example g: 9.810).
    // Materialize a preset only when its persisted content actually changes.
    if (openPresetRef.current && JSON.stringify(resolved) === JSON.stringify(prev)) return true
    if (!canEditDoc(resolved)) {
      setToolError(playbackRef.current.cursor !== null ? 'playback.scrubbedEditHint' : 'editor.resetToEdit')
      return false
    }
    if (!copyOpenPreset()) return false
    if (playbackRef.current.cursor === 0) resetOnEditRef.current = true
    if (recordHistory) setHistory((h) => pushHistory(h, prev))
    docRef.current = resolved
    setDoc(resolved)
    setToolError(null)
    return true
  }, [canEditDoc, copyOpenPreset])

  // Discrete edits push once here; drags push their initial doc on pointer-up.
  const commitDoc = useCallback((next: Scene | ((d: Scene) => Scene)) => editDoc(next, true), [editDoc])

  /** Shared by the Delete/Backspace shortcut and the panel's own delete button. */
  const deleteSelected = useCallback(() => {
    const sel = selectionRef.current
    if (!sel) return
    const remove = sel.kind === 'constraint' ? removeConstraint : sel.kind === 'pulley' ? removePulleyAndDependents : removeBodyAndDependents
    if (commitDoc((d) => remove(d, sel.id))) setSelection(null)
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

  const displayedScene = useCallback((): Scene => {
    const cursor = playbackRef.current.cursor
    return cursor === null ? docRef.current : recordingRef.current!.at(cursor)!.scene
  }, [])

  const repaintGraph = useCallback(() => {
    const canvas = graphCanvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(size.width * dpr)
    canvas.height = Math.round(180 * dpr)
    ctx.setTransform(canvas.width / size.width, 0, 0, canvas.height / 180, 0, 0)
    const recording = recordingRef.current!
    const frames = Array.from({ length: recording.length }, (_, i) => recording.at(i)!)
    const bodyId = selectedOf(selectionRef.current, 'body')
    const kind = bodyId === null && graphKindRef.current !== 'energy' && graphKindRef.current !== 'momentum' ? 'energy' : graphKindRef.current
    const series = seriesFor(kind, frames, bodyId, displayedScene())
    drawGraph(ctx, graphLayout(series, Math.max(1, (recording.length - 1) * TIMESTEP), size.width, 180), series,
      (playbackRef.current.cursor ?? recording.length - 1) * TIMESTEP, langRef.current)
  }, [size.width, displayedScene])

  useEffect(() => {
    graphKindRef.current = effectiveGraphKind
    repaintGraph()
  }, [graphOpen, effectiveGraphKind, graphBodyId, repaintGraph])

  const repaint = useCallback(() => {
    // The simulator mutates its warning array; publish a snapshot only when its content changes.
    const nextWarnings = simRef.current?.warnings ?? []
    setSimWarnings((prev) =>
      prev.length === nextWarnings.length && prev.every((warning, i) => warning === nextWarnings[i])
        ? prev
        : [...nextWarnings],
    )
    const ctx = ctxRef.current
    if (ctx)
      paint(ctx, displayedScene(), selectionRef.current, statesRef.current, geometryFor(size.width, size.height), {
        showGlobal: showGlobalRef.current,
        stepsTaken: playbackRef.current.cursor ?? playbackRef.current.stepsTaken,
        contacts: contactsRef.current,
        constraints: constraintsRef.current,
        lang: langRef.current,
        draggingBody: dragRef.current?.kind === 'move',
        pendingAnchor: toolRef.current?.a ?? null,
      })
    repaintGraph()
  }, [size.width, size.height, displayedScene, repaintGraph])

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
      canvasContainerRef.current = { width, height: entry.contentRect.height }
      setSize(fitCanvas(width, entry.contentRect.height, preferredWidthRef.current))
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
    selectionRef.current = selection
    toolRef.current = tool
    repaint()
  }, [selection, tool, repaint])

  // Vector labels follow the language (P→W, F_el→F_s) without waiting for a frame.
  useEffect(() => {
    langRef.current = lang
    repaint()
  }, [lang, repaint])

  // Autosave: DOC-only, debounced ~400 ms, soft warning on quota failure.
  // Flush is explicit on scene transitions (switchToScene/delete); this effect only debounces doc edits.
  useEffect(() => {
    if (!openPreset) saverRef.current?.schedule(currentId, doc)
    return () => saverRef.current?.cancel()
  }, [doc, currentId, openPreset])

  // Leaving the page (F5, tab close, CLEAN-01's chunk reload) must not drop the edit still inside the debounce.
  useEffect(() => {
    const flush = () => saverRef.current?.flush()
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
  }, [])

  // Hydration recovery: structured key stored, translated at render time so language switches re-render correctly
  useEffect(() => {
    const idxRes = loadIndexResult(storage)
    if (idxRes.kind === 'corrupt') setCorruptWarningKey('error.indiceCorrompido')
    if (openPreset) return
    const { warning } = loadSceneOrBlank(storage, currentId)
    if (warning) setStorageWarning((prev) => (prev?.includes(warning) ? prev : prev ? `${prev} | ${warning}` : warning))
  }, [])

  // Low-frequency readout: polls refs without 60Hz React churn.
  useEffect(() => {
    const id = setInterval(() => {
      setStepsTick(playbackRef.current.cursor ?? playbackRef.current.stepsTaken)
      setRecordingLength(recordingRef.current!.length)
      const constraintSel = selectedOf(selectionRef.current, 'constraint')
      if (constraintSel) {
        // A world awaiting its rebuild still holds the old constraints: no reading.
        setConstraintReadout(pendingRebuildRef.current ? null : constraintsRef.current.find((c) => c.id === constraintSel) ?? null)
      } else {
        setConstraintReadout(null)
      }
      const sel = selectedOf(selectionRef.current, 'body')
      const scene = displayedScene()
      const cursor = playbackRef.current.cursor
      const frame = cursor === null ? liveFrameRef.current : recordingRef.current!.at(cursor)!
      // A pending/failed rebuild (or boot) leaves no valid energy frame for
      // this document. Derive its initial state without publishing fake
      // constraint readings or replacing valid historical snapshots.
      const fromDocument = !frame.states || (pendingRebuildRef.current && (cursor === null || cursor === 0))
      const energyStates = fromDocument ? new Map<string, BodyState>(scene.bodies.map(b => [b.id, {
        position: b.position, rotation: b.rotation,
        linvel: { x: b.vx ?? 0, y: b.vy ?? 0 }, angvel: 0,
      }])) : frame.states!
      const energyConstraints: ConstraintState[] = fromDocument
        ? (scene.constraints ?? []).filter((c): c is Spring => c.kind === 'spring').map(c => ({
          id: c.id, kind: 'spring', dx: springDx(scene, c), force: { a: 0, b: 0 },
        })) : frame.constraints
      const body = scene.bodies.find(b => b.id === sel)
      const state = body && energyStates.get(body.id)
      setEnergyReadout({
        body: body && state ? bodyEnergy(scene, body, state) : null,
        system: scene.bodies.some(b => !b.fixed)
          ? systemEnergy(scene, energyStates, energyConstraints, fromDocument ? [] : frame.pulleys) : null,
        hasSpring: (scene.constraints ?? []).some(c => c.kind === 'spring'),
      })
      if (!sel) {
        setReadout(null)
        return
      }
      const curr = statesRef.current
      const s = curr?.get(sel)
      if (!s) {
        // Not yet simulated — use the document pose, initial velocity, and
        // analytic acceleration until a measured simulator sample exists.
        const docBody = scene.bodies.find((b) => b.id === sel)
        if (!docBody) {
          setReadout(null)
          return
        }
        const acc = getAcceleration(accelRef.current, scene, sel, playbackRef.current.status === 'paused')
        setReadout({ x: docBody.position.x, y: docBody.position.y, vx: docBody.vx ?? 0, vy: docBody.vy ?? 0, ax: acc.x, ay: acc.y, approximate: acc.approximate })
        return
      }
      const acc = getAcceleration(accelRef.current, scene, sel, playbackRef.current.status === 'paused')
      setReadout({ x: s.position.x, y: s.position.y, vx: s.linvel.x, vy: s.linvel.y, ax: acc.x, ay: acc.y, approximate: acc.approximate })
    }, 100)
    return () => clearInterval(id)
  }, [displayedScene])

  /**
   * Applies pending document edits by rebuilding from the document at a frame boundary.
   * Returns false when the new document cannot be simulated at all.
   */
  const syncWorld = useCallback((): boolean => {
    const sim = simRef.current
    if (!sim || !pendingRebuildRef.current) return true
    try {
      const prev = statesRef.current
      sim.replaceScene(docRef.current)
      builtDocRef.current = docRef.current
      const next = sim.readStates()
      accelRef.current = onRebuild(accelRef.current, prev, next)
      statesRef.current = next
      contactsRef.current = sim.readContacts()
      constraintsRef.current = sim.readConstraints()
      pendingRebuildRef.current = false
      resetRecording()
      setSimError(null)
      return true
    } catch (e) {
      fail(e)
      pendingRebuildRef.current = true
      return false
    }
  }, [fail, resetRecording])

  /** Runs `n` fixed TIMESTEPs on the running world, then repaints once. */
  const runSteps = useCallback(
    (n: number) => {
      const sim = simRef.current
      if (!sim || n <= 0) return
      if (!syncWorld()) return
      try {
        for (let i = 0; i < n; i++) {
          const prev = statesRef.current ?? sim.readStates()
          sim.step()
          const next = sim.readStates()
          accelRef.current = onSteps(accelRef.current, 1, prev, next)
          statesRef.current = next
          contactsRef.current = sim.readContacts()
          constraintsRef.current = sim.readConstraints()
          liveFrameRef.current = captureFrame()
          recordingRef.current!.push(liveFrameRef.current)
        }
      } catch (e) {
        fail(e)
        return
      }
      repaint()
      // The first simulated frame locks the editor immediately, without
      // making React follow every later animation frame.
      if (playbackRef.current.stepsTaken === n) setStepsTick(playbackRef.current.stepsTaken)
    },
    [fail, repaint, syncWorld, captureFrame],
  )

  /** Discrete transport actions: pure decision in `advance`, effects here. */
  const dispatch = useCallback(
    (action: PlaybackAction) => {
      const previousCursor = playbackRef.current.cursor
      const t = advance(playbackRef.current, action)
      playbackRef.current = t.state
      setPlayback(t.state)
      setStepsTick(t.state.cursor ?? t.state.stepsTaken)
      if (action.type === 'seek' || previousCursor !== t.state.cursor) {
        showFrame(t.state.cursor === null ? liveFrameRef.current : recordingRef.current!.at(t.state.cursor)!)
      }
      if (t.rebuild) {
        setToolError(null)
        // Clear readings before rebuilding: a failed reset must still show the document.
        accelRef.current = onReset()
        statesRef.current = null
        contactsRef.current = []
        constraintsRef.current = []
        setReadout(null)
        setConstraintReadout(null)
        try {
          simRef.current?.replaceScene(docRef.current)
          pendingRebuildRef.current = false
          contactsRef.current = simRef.current ? simRef.current.readContacts() : []
          constraintsRef.current = simRef.current ? simRef.current.readConstraints() : []
          builtDocRef.current = docRef.current
          setSimError(null)
        } catch (e) {
          setSimError(messageOf(e))
          pendingRebuildRef.current = true
        }
        resetRecording()
      }
      repaint()
      if (t.steps > 0) runSteps(t.steps)
      setRecordingLength(recordingRef.current!.length)
    },
    [repaint, runSteps, showFrame, resetRecording],
  )

  function seekGraph(canvas: HTMLCanvasElement, clientX: number) {
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0) return
    const length = recordingRef.current!.length
    const tMax = (length - 1) * TIMESTEP
    const layout = graphLayout([], tMax, size.width, 180)
    const x = (clientX - rect.left) * size.width / rect.width
    dispatch({ type: 'seek', index: indexAtX(layout, x, tMax), length })
  }

  useEffect(() => {
    docRef.current = doc
    showGlobalRef.current = showGlobal
    if (resetOnEditRef.current) {
      resetOnEditRef.current = false
      dispatch({ type: 'reset' })
    }
    if (simRef.current && builtDocRef.current !== doc) {
      // Live edits mutate the running world; structural edits rebuild at t = 0 (PHY-39).
      const route = routeDocChange(builtDocRef.current, doc)
      if (route.kind === 'structural') {
        statesRef.current = null
        pendingRebuildRef.current = true
      } else {
        try {
          applyLiveOps(simRef.current, route.ops)
          builtDocRef.current = doc
          if (playbackRef.current.stepsTaken === 0) resetRecording()
        } catch (e) {
          dispatch({ type: 'reset' })
          setSimError(messageOf(e))
        }
      }
    }
    repaint()
  }, [doc, showGlobal, repaint, dispatch, resetRecording])

  const switchToScene = useCallback(
    (id: string) => {
      saverRef.current?.flush()
      const { scene, warning } = loadSceneOrBlank(storage, id)
      if (warning) setStorageWarning(warning)
      lastSavedRef.current.set(id, JSON.stringify(serialize(scene)))
      setSceneIndex(loadIndex(storage))
      openPresetRef.current = undefined
      setCurrentId(id)
      saveCurrentSceneId(storage, id)
      setDoc(scene)
      setSelection(null)
      setTool(null)
      setToolError(null)
      setImportError(null)
      // Switching/importing/creating/deleting a scene starts a fresh document
      // identity — undo history from the PREVIOUS scene makes no sense here.
      setHistory(clearHistory())
      // Reset playback against the new document (PHY-36).
      docRef.current = scene
      dispatch({ type: 'reset' })
    },
    [storage, dispatch],
  )

  const openGalleryPreset = useCallback((preset: Preset) => {
    if (openPresetRef.current?.id === preset.id) return
    saverRef.current?.flush()
    const scene = preset.buildScene()
    const id = `preset:${preset.id}`
    openPresetRef.current = preset
    setCurrentId(id)
    saveCurrentSceneId(storage, id)
    ackGallery(storage)
    setDoc(scene)
    setSelection(null)
    setTool(null)
    setToolError(null)
    setImportError(null)
    setHistory(clearHistory())
    docRef.current = scene
    dispatch({ type: 'reset' })
  }, [storage, dispatch])

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
          setSimWarnings([...sim.warnings])
          builtDocRef.current = bootDoc
          contactsRef.current = sim.readContacts()
          constraintsRef.current = sim.readConstraints()
          resetRecording()
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
  }, [resetRecording])

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

  // The playback loop displays the scheduler's chosen record, then executes
  // any remaining live TIMESTEPs.
  useEffect(() => {
    if (playback.status !== 'playing') return
    let live = true
    let handle = 0
    const tick = () => {
      if (!live) return
      if (syncWorld()) {
        const previous = playbackRef.current
        const t = advance(playbackRef.current, { type: 'frame', length: recordingRef.current!.length })
        playbackRef.current = t.state
        if (previous.cursor !== t.state.cursor) {
          // Restore the live snapshot before surplus steps so acceleration uses
          // the actual preceding live step, not the previously displayed record.
          showFrame(t.state.cursor === null ? liveFrameRef.current : recordingRef.current!.at(t.state.cursor)!)
          repaint()
        }
        if (previous.cursor !== t.state.cursor || previous.status !== t.state.status) setPlayback(t.state)
        runSteps(t.steps)
        if (previous.status !== t.state.status) {
          setStepsTick(t.state.cursor ?? t.state.stepsTaken)
          setRecordingLength(recordingRef.current!.length)
        }
      }
      if (live && playbackRef.current.status === 'playing') handle = requestAnimationFrame(tick)
    }
    handle = requestAnimationFrame(tick)
    return () => {
      live = false
      cancelAnimationFrame(handle)
    }
  }, [playback.status, runSteps, syncWorld, showFrame, repaint])

  const undo = useCallback(() => {
    const step = undoHistory(historyRef.current, docRef.current)
    if (!step || !editDoc(step.entry)) return
    dispatch({ type: 'pause' })
    setHistory(step.history)
  }, [dispatch, editDoc])

  const redo = useCallback(() => {
    const step = redoHistory(historyRef.current, docRef.current)
    if (!step || !editDoc(step.entry)) return
    dispatch({ type: 'pause' })
    setHistory(step.history)
  }, [dispatch, editDoc])

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
        case 'stepBack':
          stepBack()
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
      if (sim) dispatch({ type: 'play', length: recordingRef.current!.length })
    })
  }

  function stepBack() {
    const length = recordingRef.current!.length
    const index = playbackRef.current.cursor ?? length - 1
    if (index > 0) dispatch({ type: 'seek', index: index - 1, length })
  }

  function stepOnce() {
    void ensureSim().then((sim) => {
      if (sim) dispatch({ type: 'stepOnce', length: recordingRef.current!.length })
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
   * pulleys in order, then anchor B. A click off every body is ignored;
   * rejected constraints show the document's refusal on the tool's hint line.
   */
  function onToolClick(w: Vec2) {
    const tool = toolRef.current
    if (!tool) return
    const view = applyStates(docRef.current, statesRef.current)
    if (tool.kind === 'rope') {
      const pulley = pulleyAtPoint(view, w, AXLE_HIT_RADIUS_PX / camera.pixelsPerMeter)
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
      finishTool(addPulley(docRef.current, hit.id, anchor))
      return
    }
    const end: ConstraintEnd = { bodyId: hit.id, anchor }
    if (!tool.a) {
      setTool({ ...tool, a: end })
      return
    }
    finishTool(tool.kind === 'spring' ? addSpring(docRef.current, tool.a, end) : addRope(docRef.current, tool.a, tool.via, end))
  }

  /** Commits what a tool built and selects it; a refusal stays on the tool's hint line. */
  function finishTool(res: MutationResult) {
    if (res.error) {
      setToolError(res.error)
      return
    }
    // Ids are scoped per list, so a pulley may share the new constraint's id: the list that grew says which it is.
    const kind = (res.doc.pulleys?.length ?? 0) > (docRef.current.pulleys?.length ?? 0) ? 'pulley' : 'constraint'
    if (!commitDoc(res.doc)) return
    setTool(null)
    setToolError(null)
    setSelection(res.newId ? { kind, id: res.newId } : null)
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
      const grabbed = displayedScene().forces.find((f) => {
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

    // A pulley is drawn over the bodies and wins over them, except over its
    // own mount body away from the axle. A body under the pointer wins over a
    // spring or rope end anchored on it; lines are picked where they cross open space.
    const pulley = pulleyAtPoint(view, w, AXLE_HIT_RADIUS_PX / camera.pixelsPerMeter)
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
    const line = springAtPoint(view, w, tolerance) ?? ropeAtPoint(view, w, tolerance, ropeReadingsOf(statesRef.current, constraintsRef.current))
    setSelection(line ? { kind: 'constraint', id: line.id } : null)
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current
    if (!drag) return
    const raw = eventToWorld(e)

    if (drag.kind === 'move') {
      editDoc((d) => {
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
      editDoc((d) => updateBody(d, drag.id, { rotation: drag.startRotation + angle - drag.startAngle }))
      return
    }

    if (drag.kind === 'forceAnchor') {
      editDoc((d) => updateForce(d, drag.forceId, { anchor: anchorSnap(body, raw, transform) }))
      return
    }

    if (drag.kind === 'alpha') {
      // α is an angle input - snapping the pointer position would fight the atan2.
      const local = worldToLocal(body, raw)
      editDoc((d) => updateBody(d, drag.id, { alpha: alphaFromLocal(local.x, local.y) }))
      return
    }

    // Resize follows the pointer exactly; Contact snap applies only to Body movement.
    const local = worldToLocal(body, raw)
    switch (body.shape) {
      case 'rectangle':
        editDoc((d) =>
          updateBody(d, drag.id, {
            width: minDimension(2 * Math.abs(local.x)),
            height: minDimension(2 * Math.abs(local.y)),
          }),
        )
        break
      case 'circle':
        editDoc((d) => updateBody(d, drag.id, { radius: minDimension(Math.hypot(local.x, local.y)) }))
        break
      case 'triangle':
        // Dragging the base handle edits base only; height derives from α.
        editDoc((d) => updateBody(d, drag.id, { base: minDimension(local.x) }))
        break
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current
    if (drag?.kind === 'move') {
      const { sx, sy } = eventToScreen(e)
      if (pointInTrash(trashRectValue, sx, sy)) {
        if (editDoc((d) => removeBodyAndDependents(d, drag.id))) setSelection(null)
      } else if (drag.neighborId) {
        // Contact is declared here, on drop, never mid-drag; duplicate pairs
        // are a silent no-op (addContact's own guard).
        editDoc((d) => addContact(d, drag.id, drag.neighborId!).doc)
      }
    }
    // Include drop-only removal/contact in the same single undo entry.
    if (drag && drag.startDoc !== docRef.current) {
      setHistory((h) => pushHistory(h, drag.startDoc))
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
    if (commitDoc({ ...doc, bodies: [...doc.bodies, body] })) setSelection({ kind: 'body', id })
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
    if (s?.kind !== 'spring' || !(s.k > 0 && s.x0 > 0 && (s.c ?? 0) >= 0 && (s.mass ?? 0) >= 0)) return false
    return commitDoc(next)
  }

  const selected = selectedId ? (doc.bodies.find((b) => b.id === selectedId) ?? null) : null
  const selectedSpring = doc.constraints?.find((c): c is Spring => c.id === selectedConstraintId && c.kind === 'spring') ?? null
  const selectedRope = doc.constraints?.find((c): c is Rope => c.id === selectedConstraintId && c.kind === 'rope') ?? null
  const selectedPulley = doc.pulleys?.find((p) => p.id === selectedPulleyId) ?? null
  // T differs per leg only across a pulley with mass (PHY-25).
  const ropePerLeg = !!selectedRope && selectedRope.via.some((id) => (doc.pulleys?.find((p) => p.id === id)?.mass ?? 0) > 0)
  const selectedConstraint = selectedSpring ?? selectedRope
  const selectedItem = selected ?? selectedConstraint ?? selectedPulley
  const warnings = [...collectWarnings(doc), ...simWarnings]

  return (
    // Account for the body's two default 8px margins so the row is bounded
    // by the viewport, including the dock and the main element's padding.
    <main style={{ fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column', gap: 8, height: 'calc(100vh - 16px)', boxSizing: 'border-box', padding: 8 }}>
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
              // Reserve the two border pixels and fitCanvas's possible 1px
              // rounding up; ResizeObserver reports the remaining content box.
              paddingBottom: 3,
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
            <button
              type="button"
              title={t('canvas.resize')}
              aria-label={t('canvas.resize')}
              style={{
                position: 'absolute',
                left: stacked ? size.width - 18 : `calc(50% + ${size.width / 2 - 18}px)`,
                top: size.height - 18,
                width: 20,
                height: 20,
                padding: 0,
                border: 0,
                background: 'transparent',
                color: '#666',
                cursor: 'nwse-resize',
                touchAction: 'none',
              }}
              onPointerDown={(event) => {
                if (event.button !== 0) return
                event.preventDefault()
                event.stopPropagation()
                resizeDragRef.current = { pointerId: event.pointerId, startX: event.clientX, width: size.width }
                event.currentTarget.setPointerCapture(event.pointerId)
              }}
              onPointerMove={(event) => {
                const drag = resizeDragRef.current
                if (!drag || drag.pointerId !== event.pointerId) return
                const container = canvasContainerRef.current
                const next = fitCanvas(container.width, container.height, drag.width + event.clientX - drag.startX)
                const auto = fitCanvas(container.width, container.height)
                preferredWidthRef.current = next.width === auto.width ? null : next.width
                setSize(next)
                saveCanvasSize(storage, preferredWidthRef.current)
              }}
              onPointerUp={(event) => {
                if (resizeDragRef.current?.pointerId !== event.pointerId) return
                resizeDragRef.current = null
                event.currentTarget.releasePointerCapture(event.pointerId)
              }}
              onLostPointerCapture={() => { resizeDragRef.current = null }}
              onPointerCancel={() => { resizeDragRef.current = null }}
            >
              ◢
            </button>
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
          {/* Match the scene canvas's side borders while preserving its logical
              width. The dock is a sibling of the measured canvas area. */}
          <div style={{
            width: size.width, borderInline: '1px solid transparent',
            alignSelf: stacked ? 'flex-start' : 'center', flexShrink: 0,
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start' }}>
              <div style={{ zoom: controlsScale, width: (size.width - CONTROLS_SIZER_WIDTH) / controlsScale, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                  {/* Keep the preset hint on its own row at every controls scale. */}
                  {openPreset && <span style={{ fontSize: 12, flexBasis: '100%' }}>{t('preset.readOnlyHint')}</span>}
                  <button onClick={togglePlay} disabled={recordingLength >= RECORDING_CAP && playback.cursor === null} style={{ minWidth: 110 }}>
                    {playback.status === 'playing' ? t('playback.pause') : t('playback.play')}
                  </button>
                  <button onClick={stepBack} disabled={(playback.cursor ?? recordingLength - 1) === 0} title={t('playback.stepBackTitle')}>
                    {t('playback.stepBack')}
                  </button>
                  <button onClick={stepOnce} disabled={recordingLength >= RECORDING_CAP && playback.cursor === null} title={t('playback.stepTitle')}>
                    {t('playback.step')}
                  </button>
                  <button onClick={() => dispatch({ type: 'reset' })} title={t('playback.resetTitle')}>
                    {t('playback.reset')}
                  </button>
                  <button onClick={undo} disabled={liveLocked || !canUndo(history) || (structuralLocked && !canEditDoc(history.past.at(-1)!))} title={t('playback.undoTitle')}>
                    ↶
                  </button>
                  <button onClick={redo} disabled={liveLocked || !canRedo(history) || (structuralLocked && !canEditDoc(history.future[0]!))} title={t('playback.redoTitle')}>
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
                              <tr><td style={{ paddingRight: 12 }}>←</td><td>{t('shortcuts.stepBack')}</td></tr>
                              <tr><td style={{ paddingRight: 12 }}>R</td><td>{t('shortcuts.reset')}</td></tr>
                              <tr><td style={{ paddingRight: 12 }}>Esc</td><td>{t('shortcuts.deselectOrClose')}</td></tr>
                              <tr><td style={{ paddingRight: 12 }}>?</td><td>{t('shortcuts.toggleHelp')}</td></tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </span>
                  <button aria-pressed={graphOpen} aria-controls="recording-graph" onClick={() => setGraphOpen(open => !open)}>{t('graph.toggle')}</button>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, flex: '1 1 100%', minWidth: 0 }}>
                    {t('playback.speedLabel')}
                    <input
                      type="range"
                      min={SPEED_MIN}
                      max={SPEED_MAX}
                      step={SPEED_STEP}
                      style={{ flex: 1, minWidth: 0 }}
                      value={playback.speed}
                      onChange={(e) => dispatch({ type: 'setSpeed', speed: e.target.valueAsNumber })}
                    />
                    <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: 44 }}>
                      {fmtNum(playback.speed, 2, lang)}×
                    </span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 100%', minWidth: 0 }}>
                    {t('playback.timeLabel')}
                    <input type="range" min={0} max={recordingLength - 1} step={1} style={{ flex: 1, minWidth: 0 }}
                      value={playback.cursor ?? recordingLength - 1}
                      onChange={(e) => dispatch({ type: 'seek', index: e.target.valueAsNumber, length: recordingRef.current!.length })}
                    />
                    <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      t = {((playback.cursor ?? stepsTick) * TIMESTEP).toLocaleString(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} s
                    </span>
                  </label>
                  {recordingLength >= RECORDING_CAP && <span role="status" style={{ fontSize: 12, flexBasis: '100%' }}>{t('playback.recordingFull')}</span>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button disabled={structuralLocked} onClick={() => addShape('rectangle')}>{t('palette.rectangle')}</button>
                  <button disabled={structuralLocked} onClick={() => addShape('circle')}>{t('palette.circle')}</button>
                  <button disabled={structuralLocked} onClick={() => addShape('triangle')}>{t('palette.triangle')}</button>
                  <button disabled={structuralLocked} onClick={() => armTool({ kind: 'spring', a: null })}>{t('palette.spring')}</button>
                  <button disabled={structuralLocked} onClick={() => armTool({ kind: 'pulley' })}>{t('palette.pulley')}</button>
                  <button disabled={structuralLocked} onClick={() => armTool({ kind: 'rope', a: null, via: [] })}>{t('palette.rope')}</button>
                </div>
                {(tool || toolError) && (
                  <div style={{ fontSize: 12, color: '#555' }}>
                    {tool && t(toolHint(tool))}
                    {toolError && <span style={{ color: '#b00' }}>{tool && ' — '}{t(toolError)}</span>}
                  </div>
                )}
              </div>
              <div style={{ width: CONTROLS_SIZER_WIDTH, paddingLeft: 6, boxSizing: 'border-box', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button type="button" aria-label={t('controls.bigger')} title={t('controls.sizeTitle', { pct: Math.round(controlsScale * 100) })}
                  disabled={controlsScale >= 1.6} onClick={() => setControlsScale(scale => Math.min(1.6, Math.round((scale + 0.1) * 10) / 10))}
                  style={{ width: 32, height: 24, padding: 0 }}>+</button>
                <button type="button" aria-label={t('controls.smaller')} title={t('controls.sizeTitle', { pct: Math.round(controlsScale * 100) })}
                  disabled={controlsScale <= 0.7} onClick={() => setControlsScale(scale => Math.max(0.7, Math.round((scale - 0.1) * 10) / 10))}
                  style={{ width: 32, height: 24, padding: 0 }}>−</button>
              </div>
            </div>
            {graphOpen && <div id="recording-graph" style={{ position: 'relative', width: size.width, height: 180 }}>
              <select aria-label={t('graph.kindLabel')} value={effectiveGraphKind}
                onChange={e => setGraphKind(e.target.value as GraphKind)} style={{ position: 'absolute', top: 0, left: 0 }}>
                {GRAPH_KINDS.map(kind => <option key={kind} value={kind}
                  disabled={graphBodyId === null && kind !== 'energy' && kind !== 'momentum'}>{t(`graph.kind.${kind}`)}</option>)}
              </select>
              <canvas ref={graphCanvasRef} role="img" aria-label={t('graph.aria', { kind: t(`graph.kind.${effectiveGraphKind}`), id: graphBodyId ?? t('readout.system') })}
                onPointerDown={e => {
                  if (e.button !== 0) return
                  e.currentTarget.setPointerCapture(e.pointerId)
                  seekGraph(e.currentTarget, e.clientX)
                }}
                onPointerMove={e => {
                  if (e.buttons & 1) seekGraph(e.currentTarget, e.clientX)
                }}
                style={{ display: 'block', width: size.width, height: 180, touchAction: 'none' }} />
            </div>}
          </div>
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
              {openPreset && <option value={currentId} disabled>{t('scenes.presetOption', { name: t(`preset.${openPreset.id}.name`) })}</option>}
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
                  if (openPresetRef.current) {
                    copyOpenPreset()
                    return
                  }
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
                disabled={!!openPreset}
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
                {galleryGroups().map(({ node, presets }) => {
                  const keys = nodeLabelKeys(node)
                  const path = keys.map((k) => t(k)).join(' / ')
                  return (
                    <div key={keys[keys.length - 1]} role="group" aria-label={path} style={{ display: 'grid', gap: 6 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#555' }}>{path}</div>
                      {presets.map((p) => (
                        <button type="button" key={p.id} onClick={() => openGalleryPreset(p)} aria-pressed={openPreset?.id === p.id}
                          style={{ display: 'flex', textAlign: 'left', gap: 6, border: openPreset?.id === p.id ? '1px solid #4a90d9' : '1px solid #ddd', padding: 4, cursor: 'pointer' }}>
                          <span style={{ fontSize: 12 }}>
                            <strong>{t(`preset.${p.id}.name`)}</strong>
                            <br />
                            <span style={{ color: '#555' }}>{t(`preset.${p.id}.description`)}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )
                })}
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
              {selectedItem ? t('readout.title', { id: selectedItem.id }) : t('readout.titleEmpty')}
            </legend>
            <div style={{ fontSize: 12, lineHeight: 1.6 }}>
              <div>{t('readout.steps')}: {stepsTick}</div>
              <div>{t('readout.speed')}: {fmtNum(playback.speed, 2, lang)}×</div>
              {selected && readout && (
                <>
                  <div>
                    {t('readout.position')}: ({fmtNum(readout.x, 2, lang)}, {fmtNum(readout.y, 2, lang)}) m
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {t('readout.velocityMagnitude')}: {fmtNum(Math.hypot(readout.vx, readout.vy), 2, lang)} m/s
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {t('readout.accelerationMagnitude')}: {readout.approximate ? '≈ ' : ''}{fmtNum(Math.hypot(readout.ax, readout.ay), 2, lang)} m/s²
                  </div>
                  <details>
                    <summary>{t('readout.more')}</summary>
                    <div>
                      {t('readout.velocity')}: ({fmtNum(readout.vx, 2, lang)}, {fmtNum(readout.vy, 2, lang)}) m/s
                    </div>
                    <div>
                      {t('readout.acceleration')}: ({fmtNum(readout.ax, 2, lang)}, {fmtNum(readout.ay, 2, lang)}) m/s²
                    </div>
                    {energyReadout.body && <>
                      <div>{t('readout.kinetic')}: {fmtNum(energyReadout.body.Ec, 2, lang)} J</div>
                      <div>{t('readout.potential')}: {fmtNum(energyReadout.body.Epg, 2, lang)} J</div>
                      <div>{t('readout.momentum')}: {fmtNum(Math.hypot(energyReadout.body.p.x, energyReadout.body.p.y), 2, lang)} kg·m/s</div>
                    </>}
                  </details>
                </>
              )}
              {selected && !readout && <div style={{ color: '#777' }}>{t('readout.noData')}</div>}
              {selectedSpring && constraintReadout?.kind === 'spring' && (
                <>
                  {/* F_el differs per end only on a spring with mass (PHY-30), labelled as its arrows. */}
                  {(selectedSpring.mass ?? 0) > 0 ? (
                    [constraintReadout.force.a, constraintReadout.force.b].map((F, i) => (
                      <div key={i} style={{ fontWeight: 600, fontSize: 14 }}>
                        {numberedSymbol(t('readout.springForce'), i + 1)}: {fmtNum(F, 2, lang)} N
                      </div>
                    ))
                  ) : (
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {t('readout.springForce')}: {fmtNum(constraintReadout.force.a, 2, lang)} N
                    </div>
                  )}
                  <div>
                    {t('readout.springDx')}: {fmtNum(constraintReadout.dx, 3, lang)} m
                  </div>
                </>
              )}
              {selectedRope && constraintReadout?.kind === 'rope' && (
                <>
                  {(ropePerLeg ? constraintReadout.segments : [constraintReadout.tension]).map((T, i) => (
                    <div key={i} style={{ fontWeight: 600, fontSize: 14 }}>
                      {t('readout.ropeTension')}{ropePerLeg ? subscript(i + 1) : ''}: {fmtNum(T, 2, lang)} N
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
          <fieldset style={{ width: 220 }}>
            <legend>{t('readout.system')}</legend>
            <div style={{ fontSize: 12, lineHeight: 1.6 }}>
              {energyReadout.system ? <>
                <div>{t('readout.kinetic')}: {fmtNum(energyReadout.system.Ec, 2, lang)} J</div>
                <div>{t('readout.potential')}: {fmtNum(energyReadout.system.Epg, 2, lang)} J</div>
                {energyReadout.hasSpring && <div>{t('readout.elastic')}: {fmtNum(energyReadout.system.Eel, 2, lang)} J</div>}
                <div><strong>{t('readout.mechanical')}: {fmtNum(energyReadout.system.Emec, 2, lang)} J</strong></div>
                <div>{t('readout.momentum')}: {fmtNum(Math.hypot(energyReadout.system.p.x, energyReadout.system.p.y), 2, lang)} kg·m/s</div>
                <details>
                  <summary>{t('readout.more')}</summary>
                  <div>{t('readout.momentumX')}: {fmtNum(energyReadout.system.p.x, 2, lang)} kg·m/s</div>
                  <div>{t('readout.momentumY')}: {fmtNum(energyReadout.system.p.y, 2, lang)} kg·m/s</div>
                </details>
              </> : <div style={{ color: '#777' }}>{t('readout.noData')}</div>}
            </div>
          </fieldset>
          <NumField disabled={liveLocked} title={liveLocked ? t('playback.scrubbedEditHint') : undefined} label={t('panel.gLabel')} value={doc.constants.g} step={0.01} onChange={(v) => commitDoc((d) => updateG(d, v))} />
          <label style={{ fontSize: 14 }}>
            <input
              type="checkbox"
              checked={doc.constants.particleMode ?? false}
              disabled={structuralLocked}
              onChange={(e) => commitDoc((d) => updateParticleMode(d, e.target.checked))}
            />{' '}
            {t('panel.particleMode')}
          </label>
          {selected && (
            <>
              <PropertiesPanel body={selected} disabled={structuralLocked} onPatch={(patch) => commitDoc((d) => updateBody(d, selected.id, patch))} />
              <ForcesPanel
                bodyId={selected.id}
                structuralLocked={structuralLocked}
                liveLocked={liveLocked}
                forces={doc.forces.filter((f) => f.bodyId === selected.id)}
                onAdd={() => {
                  const res = addForce(doc, { bodyId: selected.id, anchor: { x: 0, y: 0 }, magnitude: 10, direction: 0 })
                  commitDoc(res.doc)
                  return res.error
                }}
                onPatch={(id, patch) => commitDoc((d) => updateForce(d, id, patch))}
                onRemove={(id) => commitDoc((d) => removeForce(d, id))}
              />
              <BodyContactsPanel
                key={selected.id}
                bodyId={selected.id}
                doc={doc}
                disabled={structuralLocked}
                onAdd={(a, b) => {
                  const res = addContact(doc, a, b)
                  commitDoc(res.doc)
                  return res.error
                }}
                onPatch={(a, b, patch) => commitDoc((d) => updateContact(d, a, b, patch))}
                onRemove={(a, b) => commitDoc((d) => removeContact(d, a, b))}
              />
            </>
          )}
          {selectedSpring && (
            <SpringPanel
              key={selectedSpring.id}
              spring={selectedSpring}
              disabled={structuralLocked}
              dx={springDx(doc, selectedSpring)}
              onEdit={commitSpringEdit}
              onDelete={deleteSelected}
            />
          )}
          {selectedRope && <RopePanel lang={lang} rope={selectedRope} disabled={structuralLocked} length={scenePath(doc, selectedRope)?.length ?? null} onDelete={deleteSelected} />}
          {selectedPulley && (
            <PulleyPanel pulley={selectedPulley} disabled={structuralLocked} onPatch={(patch) => commitDoc((d) => updatePulley(d, selectedPulley.id, patch))} onDelete={deleteSelected} />
          )}
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
                disabled={structuralLocked}
                onClick={() => {
                  const { doc: next, newId } = duplicateBody(doc, selected.id)
                  if (commitDoc(next) && newId) setSelection({ kind: 'body', id: newId })
                }}
              >
                {t('panel.duplicate')}
              </button>
              <button disabled={structuralLocked} onClick={deleteSelected}>{t('panel.delete')}</button>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
