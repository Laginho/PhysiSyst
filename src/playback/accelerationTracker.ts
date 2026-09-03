import { TIMESTEP, type BodyState } from '../sim'
import { computeAcceleration } from '../render/overlay'

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
}

export function initialTracker(): AccelTracker {
  return { prev: null, curr: null, elapsed: TIMESTEP }
}

export function onSteps(_tracker: AccelTracker, n: number, prevCurr: Map<string, BodyState> | null, nextCurr: Map<string, BodyState> | null): AccelTracker {
  return { prev: prevCurr, curr: nextCurr, elapsed: n * TIMESTEP }
}

export function onRebuild(_tracker: AccelTracker, prevCurr: Map<string, BodyState> | null, nextCurr: Map<string, BodyState> | null): AccelTracker {
  return { prev: prevCurr, curr: nextCurr, elapsed: TIMESTEP }
}

export function onReset(): AccelTracker {
  return initialTracker()
}

export function getAcceleration(tracker: AccelTracker, id: string, paused: boolean): { x: number; y: number } {
  if (paused) return { x: 0, y: 0 }
  return computeAcceleration(tracker.prev, tracker.curr, id, tracker.elapsed)
}
