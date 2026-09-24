import { bodyPointToWorld, scenePath } from '../scene'
import type { Scene } from '../scene'
import { makeTransform, screenToWorld, worldToScreen, type Camera, type ScreenTransform } from './transform'

export interface DrawStyle {
  dynamicFill: string
  dynamicStroke: string
  fixedFill: string
  fixedStroke: string
  gridMinor: string
  gridMajor: string
}

const DEFAULT_STYLE: DrawStyle = {
  dynamicFill: '#ffffff',
  dynamicStroke: '#000000',
  fixedFill: '#c8ccd2',
  fixedStroke: '#5a5f66',
  gridMinor: '#e4e7ea',
  gridMajor: '#b9bec5',
}

const LABEL_FONT = 'italic 16px system-ui, sans-serif'

/**
 * Mass labels derived from the Scene on every render — never stored, never
 * hand-edited, so deleting a body re-flows the survivors automatically.
 * Triangles -> `M`, other shapes -> `m`; on collision within a letter class,
 * subscripts (`m_a`, `m_b`, ...) in creation order. Fixed bodies carry none.
 */
export function massLabels(scene: Scene): Map<string, string> {
  const letterOf = (shape: Scene['bodies'][number]['shape']): string => (shape === 'triangle' ? 'M' : 'm')
  const classCounts = new Map<string, number>()
  for (const b of scene.bodies) {
    if (b.fixed) continue
    const k = letterOf(b.shape)
    classCounts.set(k, (classCounts.get(k) ?? 0) + 1)
  }
  const seen = new Map<string, number>()
  const out = new Map<string, string>()
  for (const b of scene.bodies) {
    if (b.fixed) continue
    const k = letterOf(b.shape)
    const i = seen.get(k) ?? 0
    seen.set(k, i + 1)
    out.set(b.id, (classCounts.get(k) ?? 0) > 1 ? `${k}_${suffix(i)}` : k)
  }
  return out
}

/** Bijective base-26 subscript index: 0->a ... 25->z, 26->aa. Never runs out. */
function suffix(i: number): string {
  let s = ''
  i += 1
  while (i > 0) {
    i -= 1
    s = String.fromCharCode(97 + (i % 26)) + s
    i = Math.floor(i / 26)
  }
  return s
}

/**
 * 1-2-5 ladder spacing whose on-screen size lands in [40, 100) px.
 * A 1-2-5 ladder against target T provably yields px in [T, 2.5*T) — the
 * chosen step is the smallest ladder value >= T/ppm and consecutive ladder
 * values differ by at most 2.5x — so the originally drafted [40,80) envelope
 * is unachievable for ANY target; T=40 makes it exactly [40,100).
 */
export function gridSpacing(pixelsPerMeter: number): number {
  // Guard: non-finite/non-positive ppm would yield spacing <= 0 and drawGrid's
  // x += spacing loop would never advance. 1 m cells is the sane fallback.
  if (!Number.isFinite(pixelsPerMeter) || pixelsPerMeter <= 0) return 1
  const raw = 40 / pixelsPerMeter
  const pow = Math.pow(10, Math.floor(Math.log10(raw)))
  const mantissa = raw / pow
  const step = mantissa <= 1 ? 1 : mantissa <= 2 ? 2 : mantissa <= 5 ? 5 : 10
  return step * pow
}

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  width: number,
  height: number,
  style: DrawStyle = DEFAULT_STYLE,
): void {
  // screenToWorld divides by ppm, so an invalid camera poisons every bound
  // below with ±Infinity and the spacing loops never advance. An invalid
  // camera draws no grid — bail before touching ctx.
  if (!Number.isFinite(camera.pixelsPerMeter) || camera.pixelsPerMeter <= 0) return
  const t = makeTransform(camera, width, height)
  const spacing = gridSpacing(camera.pixelsPerMeter)
  const topLeft = screenToWorld(t, 0, 0)
  const bottomRight = screenToWorld(t, width, height)
  ctx.save()
  ctx.lineWidth = 1
  const startX = Math.floor(topLeft.x / spacing) * spacing
  const startY = Math.floor(bottomRight.y / spacing) * spacing
  ctx.strokeStyle = style.gridMinor
  ctx.beginPath()
  for (let x = startX; x <= bottomRight.x; x += spacing) {
    const sx = Math.round(worldToScreen(t, x, 0).x) + 0.5
    ctx.moveTo(sx, 0)
    ctx.lineTo(sx, height)
  }
  for (let y = startY; y <= topLeft.y; y += spacing) {
    const sy = Math.round(worldToScreen(t, 0, y).y) + 0.5
    ctx.moveTo(0, sy)
    ctx.lineTo(width, sy)
  }
  ctx.stroke()
  // World axes slightly stronger.
  const o = worldToScreen(t, 0, 0)
  ctx.strokeStyle = style.gridMajor
  ctx.beginPath()
  ctx.moveTo(0, o.y + 0.5)
  ctx.lineTo(width, o.y + 0.5)
  ctx.moveTo(o.x + 0.5, 0)
  ctx.lineTo(o.x + 0.5, height)
  ctx.stroke()
  ctx.restore()
}

function pathBody(ctx: CanvasRenderingContext2D, body: Scene['bodies'][number]): void {
  ctx.beginPath()
  switch (body.shape) {
    case 'rectangle':
      ctx.rect(-body.width / 2, -body.height / 2, body.width, body.height)
      break
    case 'circle':
      ctx.arc(0, 0, body.radius, 0, Math.PI * 2)
      break
    case 'triangle':
      ctx.moveTo(0, 0)
      ctx.lineTo(body.base, 0)
      ctx.lineTo(body.base, body.base * Math.tan((body.alpha * Math.PI) / 180))
      ctx.closePath()
      break
  }
}

/**
 * Hatching is data-driven and pure: any fixed rectangle body named `chao`
 * (the ground in presets/demo) gets a hatched strip below its bottom edge.
 * No extra schema field — the preset marks the ground by its id.
 */
function isHatchedGround(body: Scene['bodies'][number]): boolean {
  return body.fixed && body.shape === 'rectangle' && body.id === 'chao'
}

function drawHatch(ctx: CanvasRenderingContext2D, body: Extract<Scene['bodies'][number], { shape: 'rectangle' }>, ppm: number): void {
  const w = body.width
  const h = body.height
  ctx.save()
  ctx.strokeStyle = '#8a9199'
  ctx.lineWidth = 1.2 / ppm
  ctx.beginPath()
  const step = 0.35
  for (let x = -w / 2; x <= w / 2 + 0.01; x += step) {
    ctx.moveTo(x, -h / 2 - 0.03)
    ctx.lineTo(x - 0.28, -h / 2 - 0.38)
  }
  ctx.stroke()
  ctx.restore()
}

/**
 * Draws every scene body in one transform chain: translate to the body's
 * screen position, rotate by -rotation (screen y is flipped), then scale by
 * (ppm, -ppm) so shape geometry can be emitted in the simulator's own
 * body-origin frame in meters — triangle vertices (0,0),(base,0),(base,h),
 * origin at the alpha corner, per the settled anchor contract.
 */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  camera: Camera,
  width: number,
  height: number,
  style: DrawStyle = DEFAULT_STYLE,
  selectedId?: string | null,
): void {
  const t = makeTransform(camera, width, height)
  const labels = massLabels(scene)
  ctx.save()
  for (const body of scene.bodies) {
    const s = worldToScreen(t, body.position.x, body.position.y)
    ctx.save()
    ctx.translate(s.x, s.y)
    ctx.rotate(-body.rotation)
    ctx.scale(camera.pixelsPerMeter, -camera.pixelsPerMeter)
    pathBody(ctx, body)
    if (body.fixed) {
      ctx.fillStyle = style.fixedFill
      ctx.fill()
      // Fixed bodies are visually distinct via a dashed border.
      ctx.lineWidth = 2 / camera.pixelsPerMeter
      ctx.setLineDash([6 / camera.pixelsPerMeter, 4 / camera.pixelsPerMeter])
      ctx.strokeStyle = style.fixedStroke
      ctx.stroke()
      ctx.setLineDash([])
    } else {
      // Textbook figure: white fill, solid black outline.
      ctx.fillStyle = style.dynamicFill
      ctx.fill()
      ctx.lineWidth = 2 / camera.pixelsPerMeter
      ctx.strokeStyle = style.dynamicStroke
      ctx.stroke()
    }
    if (isHatchedGround(body)) drawHatch(ctx, body as Extract<Scene['bodies'][number], { shape: 'rectangle' }>, camera.pixelsPerMeter)
    if (body.id === selectedId) {
      // Selection outline: solid bright ring around the shape.
      ctx.lineWidth = 3 / camera.pixelsPerMeter
      ctx.strokeStyle = '#ff8c00'
      ctx.stroke()
    }
    ctx.restore()
    const label = labels.get(body.id)
    if (!label) continue
    // Text needs its own unscaled transform: the shape pass above draws under
    // scale(ppm, -ppm), which would mirror/shrink glyphs. Anchor in meters,
    // converted to px by hand; y negated for the screen's y-down frame.
    let ax = 0
    let ay = 0
    if (body.shape === 'triangle') {
      ax = (2 * body.base) / 3
      ay = (body.base * Math.tan((body.alpha * Math.PI) / 180)) / 3
    }
    ctx.save()
    ctx.translate(s.x + ax * camera.pixelsPerMeter, s.y - ay * camera.pixelsPerMeter)
    ctx.rotate(-body.rotation)
    ctx.font = LABEL_FONT
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = style.dynamicStroke
    ctx.fillText(label, 0, 0)
    ctx.restore()
  }
  drawRopes(ctx, scene, t, camera.pixelsPerMeter, style)
  ctx.restore()
}

/**
 * Pulleys as outlined circles with an axle dot, ropes as their tangent legs
 * plus the arc wrapped on each pulley (PHY-23), springs as zigzags (PHY-26).
 * Drawn in world meters under one y-flipped transform, so canvas arc angles
 * are the path's own angles.
 */
function drawRopes(ctx: CanvasRenderingContext2D, scene: Scene, t: ScreenTransform, ppm: number, style: DrawStyle): void {
  const pulleys = scene.pulleys ?? []
  const ropes = scene.constraints ?? []
  if (pulleys.length === 0 && ropes.length === 0) return
  const origin = worldToScreen(t, 0, 0)
  ctx.save()
  ctx.translate(origin.x, origin.y)
  ctx.scale(ppm, -ppm)
  ctx.lineWidth = 2 / ppm
  ctx.strokeStyle = style.dynamicStroke
  const bodies = new Map(scene.bodies.map((b) => [b.id, b]))
  for (const pulley of pulleys) {
    const mount = bodies.get(pulley.bodyId)
    if (!mount) continue
    const c = bodyPointToWorld(mount, pulley.anchor)
    ctx.beginPath()
    ctx.arc(c.x, c.y, pulley.radius, 0, Math.PI * 2)
    ctx.fillStyle = style.dynamicFill
    ctx.fill()
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(c.x, c.y, 3 / ppm, 0, Math.PI * 2)
    ctx.fillStyle = style.dynamicStroke
    ctx.fill()
  }
  for (const rope of ropes) {
    if (rope.kind === 'spring') {
      const a = bodies.get(rope.a.bodyId)
      const b = bodies.get(rope.b.bodyId)
      if (a && b) drawSpring(ctx, bodyPointToWorld(a, rope.a.anchor), bodyPointToWorld(b, rope.b.anchor), ppm)
      continue
    }
    const path = scenePath(scene, rope)
    if (!path) continue
    ctx.beginPath()
    path.segments.forEach((s, i) => {
      ctx.moveTo(s.from.x, s.from.y)
      ctx.lineTo(s.to.x, s.to.y)
      const arc = path.arcs[i]
      if (arc) ctx.arc(arc.center.x, arc.center.y, arc.radius, arc.start, arc.start + arc.direction * arc.sweep, arc.direction < 0)
    })
    ctx.stroke()
  }
  ctx.restore()
}

const SPRING_ZIGS = 10

/**
 * A spring (PHY-26) as a zigzag between its anchors: a straight lead at each
 * end and a fixed number of zigs, so stretching spreads them and compressing
 * packs them. Width in screen px, so it reads the same at any zoom.
 */
function drawSpring(ctx: CanvasRenderingContext2D, from: { x: number; y: number }, to: { x: number; y: number }, ppm: number): void {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy)
  if (length === 0) return
  const ux = dx / length
  const uy = dy / length
  const half = 7 / ppm
  const lead = 0.15 * length
  const pitch = (length - 2 * lead) / SPRING_ZIGS
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(from.x + lead * ux, from.y + lead * uy)
  for (let i = 0; i < SPRING_ZIGS; i++) {
    const along = lead + (i + 0.5) * pitch
    const side = i % 2 === 0 ? half : -half
    ctx.lineTo(from.x + along * ux - side * uy, from.y + along * uy + side * ux)
  }
  ctx.lineTo(to.x - lead * ux, to.y - lead * uy)
  ctx.lineTo(to.x, to.y)
  ctx.stroke()
}

export interface ArrowStyle {
  color: string
  widthPx: number
  headLenPx: number
}

/** Reusable overlay arrow from a world point along a world vector (for force vectors in T8).
 * Takes the ScreenTransform (not raw canvas dims) so it stays correct under DPR pre-scaling. */
export function drawArrow(
  ctx: CanvasRenderingContext2D,
  fromWorld: { x: number; y: number },
  vecWorld: { x: number; y: number },
  t: ScreenTransform,
  style?: Partial<ArrowStyle>,
): void {
  const s: ArrowStyle = { color: '#d97742', widthPx: 2, headLenPx: 10, ...style }
  const from = worldToScreen(t, fromWorld.x, fromWorld.y)
  const to = worldToScreen(t, fromWorld.x + vecWorld.x, fromWorld.y + vecWorld.y)
  const angle = Math.atan2(to.y - from.y, to.x - from.x)
  ctx.save()
  ctx.strokeStyle = s.color
  ctx.fillStyle = s.color
  ctx.lineWidth = s.widthPx
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(to.x, to.y)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(to.x, to.y)
  ctx.lineTo(to.x - s.headLenPx * Math.cos(angle - Math.PI / 6), to.y - s.headLenPx * Math.sin(angle - Math.PI / 6))
  ctx.lineTo(to.x - s.headLenPx * Math.cos(angle + Math.PI / 6), to.y - s.headLenPx * Math.sin(angle + Math.PI / 6))
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}
