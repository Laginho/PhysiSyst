import { describe, expect, it } from 'vitest'
import {
  advance,
  clampSpeed,
  DEFAULT_SPEED,
  initialPlayback,
  SPEED_MAX,
  SPEED_MIN,
  SPEED_STEP,
  type PlaybackAction,
  type PlaybackState,
} from './scheduler'

/** Runs `frames` 'frame' actions and returns the per-frame step counts. */
function frameSteps(state: PlaybackState, frames: number): number[] {
  const out: number[] = []
  let s = state
  for (let i = 0; i < frames; i++) {
    const t = advance(s, { type: 'frame' })
    out.push(t.steps)
    s = t.state
  }
  return out
}

describe('speed clamping', () => {
  const cases: Array<[label: string, input: number, expected: number]> = [
    ['keeps the minimum', 0.25, 0.25],
    ['keeps the maximum', 2, 2],
    ['keeps an in-range value', 0.75, 0.75],
    ['clamps below the minimum', 0.1, 0.25],
    ['clamps zero (a stopped world is pause, not speed 0)', 0, 0.25],
    ['clamps negative (no time reversal)', -1.5, 0.25],
    ['clamps above the maximum', 12, 2],
    ['falls back to default on NaN', Number.NaN, DEFAULT_SPEED],
    ['falls back to default on +Infinity', Number.POSITIVE_INFINITY, DEFAULT_SPEED],
    ['falls back to default on -Infinity', Number.NEGATIVE_INFINITY, DEFAULT_SPEED],
  ]
  for (const [label, input, expected] of cases) {
    it(label, () => {
      expect(clampSpeed(input)).toBe(expected)
    })
  }

  it('exposes a slider range whose every notch is an exact binary fraction', () => {
    expect([SPEED_MIN, SPEED_MAX, SPEED_STEP, DEFAULT_SPEED]).toEqual([0.25, 2, 0.25, 1])
    for (let v = SPEED_MIN; v <= SPEED_MAX + 1e-12; v += SPEED_STEP) {
      // Exactness matters: the accumulator sums these, and 0.25-multiples are
      // representable, so step counts stay reproducible run to run.
      expect(v * 4).toBe(Math.round(v * 4))
    }
  })
})

describe('initial state', () => {
  it('starts paused at rest with no accumulated credit', () => {
    expect(initialPlayback()).toEqual({ status: 'paused', speed: DEFAULT_SPEED, acc: 0, stepsTaken: 0, cursor: null })
  })

  it('clamps a caller-provided speed', () => {
    expect(initialPlayback(99).speed).toBe(SPEED_MAX)
  })
})

describe('paused world', () => {
  it('ignores frames entirely (same state, no steps, no rebuild)', () => {
    const s = initialPlayback()
    const t = advance(s, { type: 'frame' })
    expect(t.steps).toBe(0)
    expect(t.rebuild).toBe(false)
    expect(t.state).toBe(s)
  })

  it('still advances exactly one TIMESTEP per step-once, staying paused', () => {
    const t = advance(initialPlayback(), { type: 'stepOnce' })
    expect(t.steps).toBe(1)
    expect(t.state.status).toBe('paused')
    expect(t.state.stepsTaken).toBe(1)
  })
})

describe('accumulator: speed scales STEPS PER FRAME, never dt', () => {
  const cases: Array<[speed: number, frames: number, expected: number[]]> = [
    [1, 4, [1, 1, 1, 1]],
    [0.5, 6, [0, 1, 0, 1, 0, 1]],
    [0.25, 8, [0, 0, 0, 1, 0, 0, 0, 1]],
    [0.75, 4, [0, 1, 1, 1]],
    [1.5, 4, [1, 2, 1, 2]],
    [1.75, 4, [1, 2, 2, 2]],
    [2, 3, [2, 2, 2]],
  ]
  for (const [speed, frames, expected] of cases) {
    it(`speed ${speed}x yields ${JSON.stringify(expected)}`, () => {
      const playing = advance(initialPlayback(speed), { type: 'play' }).state
      expect(frameSteps(playing, frames)).toEqual(expected)
    })
  }

  it('halves the step rate exactly at 0.5x: N frames produce floor(N/2) steps', () => {
    const playing = advance(initialPlayback(0.5), { type: 'play' }).state
    let s = playing
    for (let n = 1; n <= 40; n++) {
      s = advance(s, { type: 'frame' }).state
      expect(s.stepsTaken).toBe(Math.floor(n / 2))
    }
  })

  it('total steps after N frames is exactly floor(N * speed) for every slider notch', () => {
    for (let speed = SPEED_MIN; speed <= SPEED_MAX + 1e-12; speed += SPEED_STEP) {
      const playing = advance(initialPlayback(speed), { type: 'play' }).state
      let s = playing
      for (let n = 1; n <= 24; n++) {
        s = advance(s, { type: 'frame' }).state
        expect(s.stepsTaken).toBe(Math.floor(n * speed))
      }
    }
  })

  it('carries the sub-step remainder across frames instead of dropping it', () => {
    const playing = advance(initialPlayback(0.25), { type: 'play' }).state
    const after = advance(playing, { type: 'frame' })
    expect(after.steps).toBe(0)
    expect(after.state.acc).toBe(0.25)
  })
})

describe('transport controls', () => {
  it('play starts from a clean accumulator', () => {
    const mid = advance(advance(initialPlayback(0.5), { type: 'play' }).state, { type: 'frame' }).state
    expect(mid.acc).toBe(0.5)
    const paused = advance(mid, { type: 'pause' }).state
    expect(paused).toEqual({ ...mid, status: 'paused', acc: 0 })
    expect(advance(paused, { type: 'play' }).state.acc).toBe(0)
  })

  it('play while already playing is a no-op (double-click cannot perturb the accumulator)', () => {
    const mid = advance(advance(initialPlayback(), { type: 'play' }).state, { type: 'frame' }).state
    const t = advance(mid, { type: 'play' })
    expect(t.state).toBe(mid)
    expect(t.steps).toBe(0)
  })

  it('pause while already paused is a no-op', () => {
    const s = initialPlayback()
    const t = advance(s, { type: 'pause' })
    expect(t.state).toBe(s)
  })

  it('step-once keeps the fractional credit and the playing status untouched', () => {
    const mid = advance(advance(initialPlayback(0.75), { type: 'play' }).state, { type: 'frame' }).state
    expect(mid.acc).toBe(0.75)
    const t = advance(mid, { type: 'stepOnce' })
    expect(t.steps).toBe(1)
    expect(t.state.acc).toBe(0.75)
    expect(t.state.status).toBe('playing')
    expect(t.state.stepsTaken).toBe(mid.stepsTaken + 1)
    expect(t.rebuild).toBe(false)
  })

  it('step-once advances exactly one TIMESTEP regardless of the speed setting', () => {
    for (const speed of [SPEED_MIN, 1, SPEED_MAX]) {
      expect(advance(initialPlayback(speed), { type: 'stepOnce' }).steps).toBe(1)
    }
  })

  it('reset pauses, zeroes the clock and asks the caller for a fresh world', () => {
    let s = advance(initialPlayback(1.5), { type: 'play' }).state
    for (let i = 0; i < 5; i++) s = advance(s, { type: 'frame' }).state
    expect(s.stepsTaken).toBeGreaterThan(0)
    const t = advance(s, { type: 'reset' })
    expect(t.rebuild).toBe(true)
    expect(t.steps).toBe(0)
    // Speed survives a reset: it is a view preference, not world state.
    expect(t.state).toEqual({ status: 'paused', speed: 1.5, acc: 0, stepsTaken: 0, cursor: null })
  })

  it('setSpeed clamps, keeps the accumulator, and never changes status', () => {
    const mid = advance(advance(initialPlayback(), { type: 'play' }).state, { type: 'frame' }).state
    // Keeping `acc` is what lets a slider drag (many change events per frame)
    // keep stepping instead of stalling at a perpetually reset accumulator.
    const t = advance({ ...mid, acc: 0.6 }, { type: 'setSpeed', speed: 9 })
    expect(t.state.speed).toBe(SPEED_MAX)
    expect(t.state.acc).toBe(0.6)
    expect(t.state.status).toBe('playing')
    expect(t.steps).toBe(0)
    expect(t.rebuild).toBe(false)
  })

  it('a mid-drag speed change re-rates the very next frame', () => {
    const playing = advance(initialPlayback(2), { type: 'play' }).state
    const slowed = advance(playing, { type: 'setSpeed', speed: 0.25 }).state
    expect(frameSteps(slowed, 4)).toEqual([0, 0, 0, 1])
  })
})

describe('purity', () => {
  const actions: PlaybackAction[] = [
    { type: 'play' },
    { type: 'pause' },
    { type: 'reset' },
    { type: 'frame' },
    { type: 'stepOnce' },
    { type: 'setSpeed', speed: 0.5 },
  ]
  for (const action of actions) {
    it(`'${action.type}' does not mutate the state it is given`, () => {
      const before: PlaybackState = { status: 'playing', speed: 1.5, acc: 0.75, stepsTaken: 7, cursor: null }
      const frozen = Object.freeze({ ...before })
      advance(frozen, action)
      expect(frozen).toEqual(before)
    })
  }

  it('is a function of (state, action) only: same input, same output', () => {
    const s: PlaybackState = { status: 'playing', speed: 0.75, acc: 0.5, stepsTaken: 3, cursor: null }
    expect(advance(s, { type: 'frame' })).toEqual(advance(s, { type: 'frame' }))
  })
})


describe('recording cursor (PHY-64)', () => {
  it.each([[-4, 0], [0, 0], [2, 2], [4, null], [9, null]])('seek %s pauses and clamps to %s', (index, cursor) => {
    const before = { ...initialPlayback(0.5), status: 'playing' as const, acc: 0.5, stepsTaken: 20 }
    const result = advance(before, { type: 'seek', index: index!, length: 5 })
    expect(result).toEqual({ state: { ...before, status: 'paused', acc: 0, cursor }, steps: 0, rebuild: false })
    expect(advance(result.state, { type: 'frame' }).state).toBe(result.state)
  })

  it('a recording with only its initial state stays live', () => {
    expect(advance(initialPlayback(), { type: 'seek', index: 0, length: 1 }).state.cursor).toBeNull()
  })

  it.each(['reset'] as const)('%s returns to the live world before acting', (type) => {
    const live = { ...initialPlayback(1.5), stepsTaken: 20 }
    expect(advance({ ...live, cursor: 3 }, { type })).toEqual(advance(live, { type }))
    expect(advance({ ...live, cursor: 3 }, { type }).state.cursor).toBeNull()
  })
})

describe('recorded replay (PHY-65)', () => {
  it('play keeps the selected record and pause preserves the replay position', () => {
    const selected = { ...initialPlayback(0.5), cursor: 2, stepsTaken: 20 }
    const playing = advance(selected, { type: 'play' })
    expect(playing).toEqual({ state: { ...selected, status: 'playing' }, steps: 0, rebuild: false })
    expect(advance({ ...playing.state, acc: 0.5 }, { type: 'pause' }).state).toEqual(selected)
  })

  it.each([
    [0, 0.5, 0, 0, 0, 0.5],
    [0, 0.5, 0.5, 1, 0, 0],
    [1, 2, 0, 3, 0, 0],
    [3, 1, 0, null, 0, 0],
    [3, 2, 0, null, 1, 0],
    [2, 1.75, 0.75, null, 0, 0.5],
  ])('frame at %s with speed %s and credit %s consumes history before live steps', (cursor, speed, acc, next, steps, remainder) => {
    const state = { ...initialPlayback(speed!), status: 'playing' as const, cursor: cursor!, acc: acc!, stepsTaken: 20 }
    const action = { type: 'frame' as const, length: 5 }
    expect(advance(state, action)).toEqual({
      state: { ...state, cursor: next, acc: remainder, stepsTaken: 20 + steps! }, steps, rebuild: false,
    })
  })

  it.each(['paused', 'playing'] as const)('stepOnce replays one record in status %s and retains fractional credit', (status) => {
    const state = { ...initialPlayback(0.25), status, cursor: 1, acc: 0.75, stepsTaken: 20 }
    const action = { type: 'stepOnce' as const, length: 4 }
    const first = advance(state, action)
    expect(first).toEqual({ state: { ...state, cursor: 2 }, steps: 0, rebuild: false })
    const tip = advance(first.state, action)
    expect(tip).toEqual({ state: { ...state, cursor: null }, steps: 0, rebuild: false })
    expect(advance(tip.state, action)).toEqual({ state: { ...state, cursor: null, stepsTaken: 21 }, steps: 1, rebuild: false })
  })

  it.each([0, 1, 5])('live transport ignores recording length %s', (length) => {
    const state = { ...initialPlayback(1.5), status: 'playing' as const, acc: 0.75, stepsTaken: 20 }
    for (const type of ['frame', 'stepOnce', 'play'] as const) {
      const action = { type, length }
      expect(advance(state, action)).toEqual(advance(state, { type }))
    }
  })
})

describe('full recording pauses transport (PHY-77)', () => {
  it.each([
    [600, 1, 0, 0, 'paused', 0],
    [601, 0.25, 0.5, 0, 'paused', 0],
    [599, 2, 0, 1, 'paused', 0],
    [598, 2, 0, 2, 'paused', 0],
    [597, 2, 0, 2, 'playing', 0],
    [599, 0.5, 0, 0, 'playing', 0.5],
    [599, 1.75, 0, 1, 'paused', 0],
  ] as const)('frame with length %s, speed %s and accumulator %s stops at the cap', (length, speed, acc, steps, status, remainder) => {
    const state = { ...initialPlayback(speed), status: 'playing' as const, acc, stepsTaken: length - 1 }
    expect(advance(state, { type: 'frame', length })).toEqual({
      state: { ...state, status, acc: remainder, stepsTaken: state.stepsTaken + steps }, steps, rebuild: false,
    })
  })

  it.each([600, 601])('play at the full live tip of length %s leaves paused state untouched', (length) => {
    const state = { ...initialPlayback(), acc: 0.5, stepsTaken: 599 }
    const action = { type: 'play' as const, length }
    expect(advance(state, action)).toEqual({ state, steps: 0, rebuild: false })
    expect(advance(state, action).state).toBe(state)
  })

  it.each([599, undefined])('play below the cap or without length (%s) still starts playback', (length) => {
    const state = { ...initialPlayback(), acc: 0.5 }
    const action = { type: 'play' as const, length }
    expect(advance(state, action)).toEqual({ state: { ...state, status: 'playing', acc: 0 }, steps: 0, rebuild: false })
  })

  it.each(['paused', 'playing'] as const)('stepOnce at the full live tip preserves %s state and credit', (status) => {
    const state = { ...initialPlayback(), status, acc: 0.75, stepsTaken: 599 }
    expect(advance(state, { type: 'stepOnce', length: 600 })).toEqual({ state, steps: 0, rebuild: false })
    expect(advance(state, { type: 'stepOnce', length: 600 }).state).toBe(state)
  })

  it('stepOnce filling the recording pauses and discards fractional credit', () => {
    const state = { ...initialPlayback(), status: 'playing' as const, acc: 0.75, stepsTaken: 598 }
    expect(advance(state, { type: 'stepOnce', length: 599 })).toEqual({
      state: { ...state, status: 'paused', acc: 0, stepsTaken: 599 }, steps: 1, rebuild: false,
    })
  })

  it.each([
    [598, 1, 0, null, 'paused', 0],
    [597, 2, 0, null, 'paused', 0],
    [598, 2, 0, null, 'paused', 0],
    [598, 1.75, 0, null, 'paused', 0],
    [10, 1, 0, 11, 'playing', 0],
    [598, 0.5, 0, 598, 'playing', 0.5],
  ] as const)('full replay from %s at speed %s and accumulator %s spends no surplus on physics', (cursor, speed, acc, next, status, remainder) => {
    const state = { ...initialPlayback(speed), status: 'playing' as const, cursor, acc, stepsTaken: 599 }
    expect(advance(state, { type: 'frame', length: 600 })).toEqual({
      state: { ...state, cursor: next, status, acc: remainder }, steps: 0, rebuild: false,
    })
  })

  it('play allows replay inside a full recording', () => {
    const state = { ...initialPlayback(), cursor: 590, stepsTaken: 599 }
    const action = { type: 'play' as const, length: 600 }
    expect(advance(state, action)).toEqual({ state: { ...state, status: 'playing' }, steps: 0, rebuild: false })
  })

  it.each(['paused', 'playing'] as const)('stepOnce reaches the last full record from %s without a live step', (status) => {
    const state = { ...initialPlayback(), status, cursor: 598, acc: 0.75, stepsTaken: 599 }
    expect(advance(state, { type: 'stepOnce', length: 600 })).toEqual({
      state: { ...state, status: 'paused', cursor: null, acc: 0 }, steps: 0, rebuild: false,
    })
  })

  it.each([1, 597, 598])('live transport below the cap (%s) preserves the existing action behavior', (length) => {
    for (const status of ['paused', 'playing'] as const) {
      const state = { ...initialPlayback(0.75), status, acc: 0.5, stepsTaken: 20 }
      const actions = [
        { type: 'play' }, { type: 'pause' }, { type: 'reset' }, { type: 'frame' },
        { type: 'stepOnce' }, { type: 'setSpeed', speed: 1.5 },
      ] as const
      for (const action of actions) expect(advance(state, { ...action, length })).toEqual(advance(state, action))
      expect(advance(state, { type: 'seek', index: length - 1, length })).toEqual({
        state: { ...state, status: 'paused', acc: 0 }, steps: 0, rebuild: false,
      })
    }
  })
})
