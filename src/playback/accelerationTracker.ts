import type { Scene } from '../scene'
import { TIMESTEP, type BodyState } from '../sim'
import { computeAcceleration } from '../render/overlay'

export interface AccelerationReadout {
  x: number
  y: number
  approximate: boolean
}

/**
 * Elapsed-carry bookkeeping for the acceleration readout.
 * The readout is Δv/elapsed where elapsed = n·TIMESTEP for the last batch
 * (n steps per frame at the current speed). Rebuild/reset reset the history.
 * Pure — App holds one instance in a ref and drives it from runSteps/syncWorld.
 */
export interface AccelTracker {
  prev: Map<string, BodyState> | null
  curr: Map<string, BodyState> | null
  elapsed: number
  measured: Map<string, { x: number; y: number }>
}

export function initialTracker(): AccelTracker {
  return { prev: null, curr: null, elapsed: TIMESTEP, measured: new Map() }
}

export function onSteps(tracker: AccelTracker, n: number, prevCurr: Map<string, BodyState> | null, nextCurr: Map<string, BodyState> | null): AccelTracker {
  const measured = new Map(tracker.measured)
  if (n > 0 && prevCurr && nextCurr) {
    for (const id of nextCurr.keys()) {
      const acceleration = computeAcceleration(prevCurr, nextCurr, id, n * TIMESTEP)
      if (Number.isFinite(acceleration.x) && Number.isFinite(acceleration.y) && prevCurr.has(id)) measured.set(id, acceleration)
    }
  }
  return { prev: prevCurr, curr: nextCurr, elapsed: n * TIMESTEP, measured }
}

export function onRebuild(tracker: AccelTracker, prevCurr: Map<string, BodyState> | null, nextCurr: Map<string, BodyState> | null): AccelTracker {
  const measured = new Map<string, { x: number; y: number }>()
  for (const id of nextCurr?.keys() ?? []) {
    const value = tracker.measured.get(id)
    if (value) measured.set(id, value)
  }
  return { prev: prevCurr, curr: nextCurr, elapsed: TIMESTEP, measured }
}

export function onReset(): AccelTracker {
  return initialTracker()
}

export function estimateAnalyticAcceleration(scene: Scene, id: string): { x: number; y: number } {
  const body = scene.bodies.find((candidate) => candidate.id === id)
  if (!body || body.fixed || body.mass <= 0) return { x: 0, y: 0 }

  let forceX = 0
  let forceY = -body.mass * scene.constants.g
  for (const force of scene.forces) {
    if (force.bodyId !== id) continue
    const direction = (force.direction * Math.PI) / 180
    forceX += force.magnitude * Math.cos(direction)
    forceY += force.magnitude * Math.sin(direction)
  }
  return { x: forceX / body.mass, y: forceY / body.mass }
}

export function getAcceleration(tracker: AccelTracker, scene: Scene, id: string, paused: boolean): AccelerationReadout {
  // Pausing freezes the world, but must not erase its last measured sample.
  void paused
  const measured = tracker.measured.get(id)
  if (measured) return { ...measured, approximate: false }
  const body = scene.bodies.find((candidate) => candidate.id === id)
  const analytic = estimateAnalyticAcceleration(scene, id)
  const approximate = Boolean(body && !body.fixed && body.mass > 0 && scene.contacts.some((contact) => contact.a === id || contact.b === id))
  return { ...analytic, approximate }
}
