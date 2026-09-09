/**
 * Generic undo/redo stack: `past` is entries older than the current value,
 * `future` is entries newer than it (populated only by `undo`). Callers pass
 * the CURRENT value into `undo`/`redo` so it can be stashed on the other
 * stack — the module holds no value of its own, only what surrounds it.
 */
export interface History<T> {
  readonly past: readonly T[]
  readonly future: readonly T[]
}

/** Oldest entries fall off past this many steps back. */
export const HISTORY_LIMIT = 50

export function initialHistory<T>(): History<T> {
  return { past: [], future: [] }
}

/** Records `entry` as the new most-recent past state; any redo branch is gone. */
export function push<T>(h: History<T>, entry: T): History<T> {
  return { past: [...h.past, entry].slice(-HISTORY_LIMIT), future: [] }
}

export function canUndo<T>(h: History<T>): boolean {
  return h.past.length > 0
}

export function canRedo<T>(h: History<T>): boolean {
  return h.future.length > 0
}

export interface HistoryStep<T> {
  readonly history: History<T>
  /** The value to make current now. */
  readonly entry: T
}

/** Pops the most recent past entry, stashing `current` onto future. Null when past is empty. */
export function undo<T>(h: History<T>, current: T): HistoryStep<T> | null {
  if (h.past.length === 0) return null
  const entry = h.past[h.past.length - 1] as T
  return { history: { past: h.past.slice(0, -1), future: [current, ...h.future] }, entry }
}

/** Pops the nearest future entry, stashing `current` onto past. Null when future is empty. */
export function redo<T>(h: History<T>, current: T): HistoryStep<T> | null {
  if (h.future.length === 0) return null
  const entry = h.future[0] as T
  return { history: { past: [...h.past, current], future: h.future.slice(1) }, entry }
}

export function clear<T>(): History<T> {
  return initialHistory()
}
