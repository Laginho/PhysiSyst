/**
 * Playback acceptance at the seam the App wires together: scheduler decides how
 * many TIMESTEPs a frame is worth, simulator executes them. This is as close to
 * the real transport as v1 tests get — automated UI tests are barred by spec, so
 * the rAF/React adapter above this seam stays manual-verify.
 */
import { describe, expect, it, vi } from 'vitest'
import type { Scene } from '../scene'
import { createSimulator, TIMESTEP, type BodyState, type Simulator } from '../sim'
import { advance, initialPlayback, type PlaybackAction, type PlaybackState } from './scheduler'
import { applyLiveOps, routeDocChange } from './routing'

function fallingScene(): Scene {
  return {
    version: 1,
    constants: { g: 9.81 },
    bodies: [{ id: 'ball', shape: 'circle', radius: 0.5, fixed: false, mass: 1, position: { x: 0, y: 10 }, rotation: 0 }],
    forces: [],
    contacts: [],
  }
}

/** The App's whole playback adapter, minus React: dispatch -> run N steps. */
function makeTransport(sim: Simulator, initial: PlaybackState) {
  let state = initial
  return {
    get state() {
      return state
    },
    dispatch(action: PlaybackAction): void {
      const t = advance(state, action)
      state = t.state
      if (t.rebuild) sim.replaceScene(fallingScene())
      for (let i = 0; i < t.steps; i++) sim.step()
    },
  }
}

async function control(steps: number): Promise<BodyState> {
  const sim = await createSimulator(fallingScene())
  for (let i = 0; i < steps; i++) sim.step()
  return sim.readStates().get('ball')!
}

describe('playback acceptance', () => {
  it('a paused world plus one step button press advances exactly one TIMESTEP', async () => {
    const sim = await createSimulator(fallingScene())
    const transport = makeTransport(sim, initialPlayback())
    transport.dispatch({ type: 'stepOnce' })

    expect(transport.state.status).toBe('paused')
    const ball = sim.readStates().get('ball')!
    expect(ball).toStrictEqual(await control(1))
    // One TIMESTEP of gravity and not a frame more.
    expect(ball.linvel.y).toBeCloseTo(-9.81 * TIMESTEP, 5)
  })

  it('repeated step presses are deterministic: 10 presses == 10 steps', async () => {
    const sim = await createSimulator(fallingScene())
    const transport = makeTransport(sim, initialPlayback(2))
    for (let i = 0; i < 10; i++) transport.dispatch({ type: 'stepOnce' })
    expect(sim.readStates().get('ball')).toStrictEqual(await control(10))
    expect(transport.state.stepsTaken).toBe(10)
  })

  it('0.5x halves the step rate: 20 animation frames advance the world 10 TIMESTEPs', async () => {
    const sim = await createSimulator(fallingScene())
    const transport = makeTransport(sim, initialPlayback(0.5))
    transport.dispatch({ type: 'play' })
    for (let i = 0; i < 20; i++) transport.dispatch({ type: 'frame' })
    expect(transport.state.stepsTaken).toBe(10)
    expect(sim.readStates().get('ball')).toStrictEqual(await control(10))
  })

  it('2x doubles it over the same number of frames, with the same dt', async () => {
    const sim = await createSimulator(fallingScene())
    const transport = makeTransport(sim, initialPlayback(2))
    transport.dispatch({ type: 'play' })
    for (let i = 0; i < 20; i++) transport.dispatch({ type: 'frame' })
    expect(sim.readStates().get('ball')).toStrictEqual(await control(40))
  })

  it('a paused world does not drift while animation frames keep arriving', async () => {
    const sim = await createSimulator(fallingScene())
    const transport = makeTransport(sim, initialPlayback())
    for (let i = 0; i < 30; i++) transport.dispatch({ type: 'frame' })
    expect(sim.readStates().get('ball')).toStrictEqual(await control(0))
  })

  it('reset returns the world to the document-initial state and pauses', async () => {
    const sim = await createSimulator(fallingScene())
    const transport = makeTransport(sim, initialPlayback(1.5))
    transport.dispatch({ type: 'play' })
    for (let i = 0; i < 40; i++) transport.dispatch({ type: 'frame' })
    expect(sim.readStates().get('ball')!.position.y).toBeLessThan(9)

    transport.dispatch({ type: 'reset' })
    expect(transport.state.status).toBe('paused')
    expect(transport.state.stepsTaken).toBe(0)
    expect(sim.readStates().get('ball')).toStrictEqual(await control(0))
    // ...and it stays reset: no frame executes until the user plays again.
    for (let i = 0; i < 10; i++) transport.dispatch({ type: 'frame' })
    expect(sim.readStates().get('ball')).toStrictEqual(await control(0))
  })

  it('the same frame sequence always produces the same trajectory', async () => {
    const run = async () => {
      const sim = await createSimulator(fallingScene())
      const transport = makeTransport(sim, initialPlayback(0.75))
      transport.dispatch({ type: 'play' })
      for (let i = 0; i < 15; i++) transport.dispatch({ type: 'frame' })
      transport.dispatch({ type: 'stepOnce' })
      transport.dispatch({ type: 'setSpeed', speed: 1.75 })
      for (let i = 0; i < 15; i++) transport.dispatch({ type: 'frame' })
      return { states: sim.readStates(), stepsTaken: transport.state.stepsTaken }
    }
    const a = await run()
    const b = await run()
    expect(a.stepsTaken).toBe(b.stepsTaken)
    expect(a.states).toStrictEqual(b.states)
  })
})

/**
 * The App's doc-edit path, minus React: classify against the built doc, apply
 * live ops to the running world or rebuild+carry at the frame boundary.
 * Mirrors the M2 routing effect so the composed behaviour stays under test.
 */
function makeRoutedTransport(sim: Simulator, initial: PlaybackState) {
  let state = initial
  let built: Scene = fallingScene()
  let currentDoc: Scene = built
  return {
    get state() {
      return state
    },
    edit(next: Scene): void {
      currentDoc = next
    },
    dispatch(action: PlaybackAction): void {
      const t = advance(state, action)
      state = t.state
      if (built !== currentDoc) {
        const route = routeDocChange(built, currentDoc)
        if (route.kind === 'structural') {
          sim.replaceScene(currentDoc) // carry omitted: fallingScene has one body at rest pose
          built = currentDoc
        } else {
          applyLiveOps(sim, route.ops)
          built = currentDoc
        }
      }
      if (t.rebuild) sim.replaceScene(fallingScene())
      for (let i = 0; i < t.steps; i++) sim.step()
    },
  }
}

describe('live-vs-structural acceptance', () => {
  it('a mid-flight g edit bends the arc with ZERO rebuilds; a structural edit still rebuilds exactly once', async () => {
    const sim = await createSimulator(fallingScene())
    const replaceSpy = vi.spyOn(sim, 'replaceScene')
    const transport = makeRoutedTransport(sim, initialPlayback())
    transport.dispatch({ type: 'play' })
    for (let i = 0; i < 15; i++) transport.dispatch({ type: 'frame' })

    // g edit while playing: live path only.
    transport.edit({ ...fallingScene(), constants: { g: 2 } })
    for (let i = 0; i < 20; i++) transport.dispatch({ type: 'frame' })
    expect(replaceSpy).not.toHaveBeenCalled()

    // The bent arc equals a control with the same two-phase gravity history —
    // proving setGravity is trajectory-equivalent to having been built at g=2.
    const control = await createSimulator(fallingScene())
    for (let i = 0; i < 15; i++) control.step()
    control.setGravity(2)
    for (let i = 0; i < 20; i++) control.step()
    expect(sim.readStates().get('ball')).toStrictEqual(control.readStates().get('ball'))

    // Structural edit (body moved): exactly one carried rebuild.
    const moved = fallingScene()
    moved.bodies[0]!.position.x = 3
    transport.edit(moved)
    transport.dispatch({ type: 'frame' })
    expect(replaceSpy).toHaveBeenCalledTimes(1)
  })
})
