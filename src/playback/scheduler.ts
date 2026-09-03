/**
 * Playback scheduler — the transport logic behind play/pause/reset, the speed
 * slider and the single-frame step button.
 *
 * This module is deliberately React-free and side-effect-free: it decides HOW
 * MANY fixed TIMESTEPs the simulator must execute, and nothing else. The rAF
 * wiring in App stays a thin adapter (read state -> advance() -> run that many
 * sim.step() calls -> paint), which is what makes playback testable at all in a
 * project that bars automated UI tests.
 *
 * Core invariant (spec, ADR-0001): the speed multiplier scales STEPS PER FRAME,
 * never the timestep. `acc += speed` per animation frame, then whole steps are
 * withdrawn and the remainder carries to the next frame. So 0.5x steps on every
 * other frame with the SAME dt as 1x, and after N frames the world has advanced
 * exactly floor(N * speed) timesteps.
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
}

export type PlaybackAction =
  | { readonly type: 'play' }
  | { readonly type: 'pause' }
  /** Discard the running world and rebuild it from the document. */
  | { readonly type: 'reset' }
  | { readonly type: 'setSpeed'; readonly speed: number }
  /** One animation frame elapsed. */
  | { readonly type: 'frame' }
  /** Single-frame step button: exactly one TIMESTEP, whatever the speed. */
  | { readonly type: 'stepOnce' }

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
  return { status: 'paused', speed: clampSpeed(speed), acc: 0, stepsTaken: 0 }
}

const NO_OP = { steps: 0, rebuild: false } as const

export function advance(state: PlaybackState, action: PlaybackAction): PlaybackTransition {
  switch (action.type) {
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
      return { state: { ...state, status: 'paused', acc: 0, stepsTaken: 0 }, steps: 0, rebuild: true }

    case 'setSpeed':
      // `acc` is deliberately preserved: a slider drag fires many change events
      // per frame, and zeroing the accumulator on each one would stall playback
      // at sub-1x speeds. The new rate applies from the very next frame.
      return { state: { ...state, speed: clampSpeed(action.speed) }, ...NO_OP }

    case 'frame': {
      if (state.status !== 'playing') return { state, ...NO_OP }
      const credit = state.acc + state.speed
      const steps = Math.floor(credit)
      return {
        state: { ...state, acc: credit - steps, stepsTaken: state.stepsTaken + steps },
        steps,
        rebuild: false,
      }
    }

    case 'stepOnce':
      // Exactly one TIMESTEP, at any speed and in either status, and it resets
      // nothing — the fractional credit and the status ride through untouched.
      return { state: { ...state, stepsTaken: state.stepsTaken + 1 }, steps: 1, rebuild: false }
  }
}
