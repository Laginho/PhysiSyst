import type { Body, Vec2 } from '../scene'
import { worldToScreen, type ScreenTransform } from '../render/transform'

/** Visual handle size in screen px (zoom-independent by construction). */
export const HANDLE_SIZE_PX = 8
/** Grab radius around a handle center — slightly larger than the visual for pointing comfort. */
export const HANDLE_HIT_RADIUS_PX = 10
/** Resize floor: any shape dimension stays strictly positive. */
export const MIN_SIZE = 0.05
/** α clamp: schema allows the open interval (0, 90); we keep a visible wedge. */
export const ALPHA_MIN_DEG = 0.5
export const ALPHA_MAX_DEG = 89.5

export type HandleKind = 'rotate' | 'resize' | 'alpha'

export interface Handle {
  kind: HandleKind
  sx: number
  sy: number
}

/** Forward body transform: R(rotation)·local + position (world, y-up meters). */
export function localToWorld(body: Body, lx: number, ly: number): Vec2 {
  const c = Math.cos(body.rotation)
  const s = Math.sin(body.rotation)
  return {
    x: body.position.x + c * lx - s * ly,
    y: body.position.y + s * lx + c * ly,
  }
}

interface LocalAnchor {
  kind: HandleKind
  lx: number
  ly: number
}

function localAnchors(body: Body): LocalAnchor[] {
  switch (body.shape) {
    case 'rectangle':
      return [
        { kind: 'rotate', lx: 0, ly: -body.height / 2 - 0.4 },
        { kind: 'resize', lx: body.width / 2, ly: body.height / 2 },
      ]
    case 'circle':
      return [
        { kind: 'rotate', lx: 0, ly: -body.radius - 0.4 },
        { kind: 'resize', lx: body.radius, ly: 0 },
      ]
    case 'triangle': {
      const h = body.base * Math.tan((body.alpha * Math.PI) / 180)
      return [
        { kind: 'rotate', lx: body.base / 2, ly: -0.4 },
        { kind: 'resize', lx: body.base, ly: 0 },
        // Sits ON the hypotenuse so dragging it reads as "tilt the incline".
        { kind: 'alpha', lx: body.base / 2, ly: h / 2 },
      ]
    }
  }
}

/** Handles for the selected body, projected into screen px (zoom-independent). */
export function getHandles(body: Body, t: ScreenTransform): Handle[] {
  return localAnchors(body).map(({ kind, lx, ly }) => {
    const w = localToWorld(body, lx, ly)
    const s = worldToScreen(t, w.x, w.y)
    return { kind, sx: s.x, sy: s.y }
  })
}

/** Closest handle within grab radius of a screen point, else null. */
export function pickHandle(handles: Handle[], sx: number, sy: number): Handle | null {
  let best: Handle | null = null
  let bestD = HANDLE_HIT_RADIUS_PX
  for (const h of handles) {
    const d = Math.hypot(h.sx - sx, h.sy - sy)
    if (d <= bestD) {
      best = h
      bestD = d
    }
  }
  return best
}

/** α clamp shared by α-handle drags and panel numeric entry. */
export function clampAlphaDeg(deg: number): number {
  return Math.min(ALPHA_MAX_DEG, Math.max(ALPHA_MIN_DEG, deg))
}

/** Dimension floor shared by resize handles and panel numeric entry. */
export function minDimension(v: number): number {
  return Math.max(MIN_SIZE, v)
}

/**
 * α (degrees) implied by a pointer position in the triangle's LOCAL frame:
 * the hypotenuse leaves the α-corner at angle α above +x, so α = atan2(y,x).
 * Clamped to [ALPHA_MIN_DEG, ALPHA_MAX_DEG] ⊂ schema's open (0°, 90°).
 */
export function alphaFromLocal(lx: number, ly: number): number {
  return clampAlphaDeg((Math.atan2(ly, lx) * 180) / Math.PI)
}
