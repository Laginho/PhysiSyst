/**
 * Playback scheduler — the transport logic behind play/pause/reset, the speed
 * slider and the single-frame step button.
 *
 * This module is deliberately React-free and side-effect-free: it decides HOW
 * MANY fixed TIMESTEPs the simulator must execute and which record to show. The rAF
 * wiring in App stays a thin adapter (read state -> advance() -> show the record
 * or run sim.step() calls -> paint), with the transport rules testable directly.
 *
 * Core invariant (spec, ADR-0001): the speed multiplier scales STEPS PER FRAME,
 * never the timestep. `acc += speed` per animation frame, then whole steps are
 * withdrawn and the remainder carries to the next frame. So 0.5x steps on every
 * other frame with the SAME dt as 1x. From zero credit, N frames at a fixed speed
 * consume exactly floor(N * speed) recorded or live timesteps; only credit left
 * after replay advances the live world and increments stepsTaken.
 */

/** Slider bounds from the spec (story 17). */
export const SPEED_MIN = 0.25
export const SPEED_MAX = 2
/**
 * Slider granularity. Every notch is a multiple of 1/4, hence exactly
 * representable in binary floating point — the accumulator sums these, so
 * step counts stay bit-reproducible across runs.
 */
export const SPEED_STEP = 0.25
export const DEFAULT_SPEED = 1

export type PlaybackStatus = 'paused' | 'playing'

export interface PlaybackState {
  readonly status: PlaybackStatus
  readonly speed: number
  /** Sub-step credit carried over from previous frames, in [0, 1). */
  readonly acc: number
  /** TIMESTEPs executed since the last reset (monotonic; UI/test observable). */
  readonly stepsTaken: number
  /** Displayed record, or null for the live world at the tip. */
  readonly cursor: number | null
}

export type PlaybackAction =
  | { readonly type: 'seek'; readonly index: number; readonly length: number }
  | { readonly type: 'play' }
  | { readonly type: 'pause' }
  /** Discard the running world and rebuild it from the document. */
  | { readonly type: 'reset' }
  | { readonly type: 'setSpeed'; readonly speed: number }
  /** One animation frame elapsed. Length is needed when replaying a record. */
  | { readonly type: 'frame'; readonly length?: number }
  /** Advance one recorded or live TIMESTEP; length is needed for replay. */
  | { readonly type: 'stepOnce'; readonly length?: number }

export interface PlaybackTransition {
  readonly state: PlaybackState
  /** TIMESTEPs the caller must run on the simulator now. */
  readonly steps: number
  /** Caller must rebuild the world from the document before stepping again. */
  readonly rebuild: boolean
}

/**
 * Speed is a rate multiplier, so it must stay strictly positive: 0 and negative
 * values mean "stopped" and "rewind", neither of which this transport models
 * (stopped is `pause`). Garbage from a widget (NaN/Infinity) falls back to 1x
 * rather than freezing or exploding playback.
 */
export function clampSpeed(speed: number): number {
  if (!Number.isFinite(speed)) return DEFAULT_SPEED
  return Math.min(SPEED_MAX, Math.max(SPEED_MIN, speed))
}

export function initialPlayback(speed: number = DEFAULT_SPEED): PlaybackState {
  return { status: 'paused', speed: clampSpeed(speed), acc: 0, stepsTaken: 0, cursor: null }
}

const NO_OP = { steps: 0, rebuild: false } as const

/** Spend whole-step credit on recorded frames before advancing the live world. */
function advanceCursor(state: PlaybackState, credit: number, length: number): PlaybackTransition {
  const next = state.cursor === null ? null : state.cursor + credit
  const last = Math.max(0, length - 1)
  const cursor = next !== null && next < last ? next : null
  const steps = next === null ? credit : Math.max(0, next - last)
  return { state: { ...state, cursor, stepsTaken: state.stepsTaken + steps }, steps, rebuild: false }
}

export function advance(state: PlaybackState, action: PlaybackAction): PlaybackTransition {
  switch (action.type) {
    case 'seek': {
      const last = Math.max(0, action.length - 1)
      const index = Math.min(last, Math.max(0, Math.trunc(action.index) || 0))
      return { state: { ...state, status: 'paused', acc: 0, cursor: index === last ? null : index }, ...NO_OP }
    }

    case 'play':
      // Idempotent, and the accumulator starts clean: stale sub-step credit
      // from before a pause would make the first resumed frame non-reproducible.
      if (state.status === 'playing') return { state, ...NO_OP }
      return { state: { ...state, status: 'playing', acc: 0 }, ...NO_OP }

    case 'pause':
      if (state.status === 'paused') return { state, ...NO_OP }
      return { state: { ...state, status: 'paused', acc: 0 }, ...NO_OP }

    case 'reset':
      // Pauses on purpose: a reset that kept running would immediately walk
      // away from the doc-initial state the user asked to look at. Speed
      // survives — it is a view preference, not world state.
      return { state: { ...state, status: 'paused', acc: 0, stepsTaken: 0, cursor: null }, steps: 0, rebuild: true }

    case 'setSpeed':
      // `acc` is deliberately preserved: a slider drag fires many change events
      // per frame, and zeroing the accumulator on each one would stall playback
      // at sub-1x speeds. The new rate applies from the very next frame.
      return { state: { ...state, speed: clampSpeed(action.speed) }, ...NO_OP }

    case 'frame': {
      if (state.status !== 'playing') return { state, ...NO_OP }
      const credit = state.acc + state.speed
      const steps = Math.floor(credit)
      return advanceCursor({ ...state, acc: credit - steps }, steps, action.length ?? 1)
    }

    case 'stepOnce':
      // Exactly one recorded or live TIMESTEP, in either status, and it resets
      // no live-world state: fractional credit and status ride through untouched.
      return advanceCursor(state, 1, action.length ?? 1)
  }
}
