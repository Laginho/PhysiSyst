import type { Body, Vec2 } from '../scene'

export const CONTACT_SNAP_TOLERANCE_PX = 10

interface Segment {
  a: Vec2
  b: Vec2
}

function localToWorld(body: Body, point: Vec2): Vec2 {
  const c = Math.cos(body.rotation)
  const s = Math.sin(body.rotation)
  return {
    x: body.position.x + c * point.x - s * point.y,
    y: body.position.y + s * point.x + c * point.y,
  }
}

function polygonVertices(body: Body): Vec2[] {
  switch (body.shape) {
    case 'rectangle':
      return [
        { x: -body.width / 2, y: -body.height / 2 },
        { x: body.width / 2, y: -body.height / 2 },
        { x: body.width / 2, y: body.height / 2 },
        { x: -body.width / 2, y: body.height / 2 },
      ].map((point) => localToWorld(body, point))
    case 'triangle': {
      const height = body.base * Math.tan((body.alpha * Math.PI) / 180)
      return [
        { x: 0, y: 0 },
        { x: body.base, y: 0 },
        { x: body.base, y: height },
      ].map((point) => localToWorld(body, point))
    }
    case 'circle':
      return []
  }
}

function segments(body: Body): Segment[] {
  const vertices = polygonVertices(body)
  return vertices.map((a, index) => ({ a, b: vertices[(index + 1) % vertices.length]! }))
}

function closestPoint(point: Vec2, segment: Segment): Vec2 {
  const dx = segment.b.x - segment.a.x
  const dy = segment.b.y - segment.a.y
  const lengthSquared = dx * dx + dy * dy
  const t = Math.max(
    0,
    Math.min(1, ((point.x - segment.a.x) * dx + (point.y - segment.a.y) * dy) / lengthSquared),
  )
  return { x: segment.a.x + t * dx, y: segment.a.y + t * dy }
}

function normalizeAxisAngle(raw: number): number {
  let angle = raw
  while (angle >= Math.PI / 2) angle -= Math.PI
  while (angle < -Math.PI / 2) angle += Math.PI
  return angle
}

function axisAngle(segment: Segment): number {
  return normalizeAxisAngle(Math.atan2(segment.b.y - segment.a.y, segment.b.x - segment.a.x))
}

function contactOffset(dragged: Body, nx: number, ny: number): number {
  if (dragged.shape === 'circle') return dragged.radius
  if (dragged.shape === 'rectangle') return dragged.height / 2
  const nearestProjection = Math.min(
    ...polygonVertices(dragged).map(
      (vertex) => (vertex.x - dragged.position.x) * nx + (vertex.y - dragged.position.y) * ny,
    ),
  )
  return -nearestProjection
}

function snapCandidate(dragged: Body, position: Vec2, tolerance: number, rotation?: number) {
  const displacement = Math.hypot(position.x - dragged.position.x, position.y - dragged.position.y)
  if (displacement > tolerance) return null
  const body: Body =
    dragged.shape === 'rectangle'
      ? { ...dragged, position, rotation: rotation ?? dragged.rotation }
      : { ...dragged, position }
  return { body, displacement }
}

export interface ContactSnapResult {
  body: Body
  /** Id of the winning neighbor; null when no snap happened or snap is disabled. */
  neighborId: string | null
}

/** Pure editor seam: returns the dragged Body at its nearest valid Contact, plus which neighbor won. */
export function resolveContactSnap(
  dragged: Body,
  neighbors: readonly Body[],
  pixelsPerMeter: number,
  enabled: boolean,
): ContactSnapResult {
  if (!enabled) return { body: dragged, neighborId: null }

  const tolerance = CONTACT_SNAP_TOLERANCE_PX / pixelsPerMeter
  let best: { body: Body; displacement: number; neighborId: string } | null = null

  for (const neighbor of neighbors) {
    if (neighbor.id === dragged.id) continue
    if (neighbor.shape === 'circle') {
      const dx = dragged.position.x - neighbor.position.x
      const dy = dragged.position.y - neighbor.position.y
      const distance = Math.hypot(dx, dy)
      const nx = distance > 0 ? dx / distance : 1
      const ny = distance > 0 ? dy / distance : 0
      const draggedOffset = contactOffset(dragged, nx, ny)
      const position = {
        x: neighbor.position.x + nx * (neighbor.radius + draggedOffset),
        y: neighbor.position.y + ny * (neighbor.radius + draggedOffset),
      }
      const candidate = snapCandidate(
        dragged,
        position,
        tolerance,
        normalizeAxisAngle(Math.atan2(ny, nx) + Math.PI / 2),
      )
      if (candidate && (!best || candidate.displacement < best.displacement))
        best = { ...candidate, neighborId: neighbor.id }
      continue
    }
    for (const segment of segments(neighbor)) {
      const onSurface = closestPoint(dragged.position, segment)
      const dx = dragged.position.x - onSurface.x
      const dy = dragged.position.y - onSurface.y
      const distance = Math.hypot(dx, dy)
      const edgeDx = segment.b.x - segment.a.x
      const edgeDy = segment.b.y - segment.a.y
      const edgeLength = Math.hypot(edgeDx, edgeDy)
      const nx = distance > 0 ? dx / distance : -edgeDy / edgeLength
      const ny = distance > 0 ? dy / distance : edgeDx / edgeLength
      const surfaceOffset = contactOffset(dragged, nx, ny)
      const position = {
        x: onSurface.x + nx * surfaceOffset,
        y: onSurface.y + ny * surfaceOffset,
      }
      const candidate = snapCandidate(dragged, position, tolerance, axisAngle(segment))
      if (candidate && (!best || candidate.displacement < best.displacement))
        best = { ...candidate, neighborId: neighbor.id }
    }
  }

  return best ? { body: best.body, neighborId: best.neighborId } : { body: dragged, neighborId: null }
}
