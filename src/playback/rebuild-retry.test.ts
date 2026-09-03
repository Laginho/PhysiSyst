import { describe, expect, it } from 'vitest'
import type { Scene } from '../scene'
import { createSimulator, type Simulator } from '../sim'
import { carryOver } from './view'
import { routeDocChange } from './routing'

function fallingScene(mass = 1): Scene {
  return {
    version: 1,
    constants: { g: 9.81 },
    bodies: [{ id: 'ball', shape: 'circle', radius: 0.5, fixed: false, mass, position: { x: 0, y: 10 }, rotation: 0 }],
    forces: [],
    contacts: [],
  }
}

function makeAppLike(sim: Simulator, doc: Scene) {
  let builtDoc: Scene = doc
  let currentDoc: Scene = doc
  let pending = false
  let states: ReturnType<Simulator['readStates']> | null = sim.readStates()
  let error: string | null = null
  return {
    get builtDoc() { return builtDoc },
    get pending() { return pending },
    get error() { return error },
    get doc() { return currentDoc },
    edit(next: Scene) {
      currentDoc = next
      const route = routeDocChange(builtDoc, currentDoc)
      if (route.kind === 'structural') {
        states = carryOver(states, builtDoc, currentDoc)
        pending = true
      }
    },
    syncWorld(): boolean {
      if (!pending) return true
      try {
        sim.replaceScene(currentDoc, states ?? undefined)
        builtDoc = currentDoc
        states = sim.readStates()
        pending = false
        error = null
        return true
      } catch (e) {
        error = e instanceof Error ? e.message : String(e)
        pending = true
        return false
      }
    },
    runSteps(n: number) {
      if (!n) return
      if (!this.syncWorld()) return
      for (let i = 0; i < n; i++) sim.step()
      states = sim.readStates()
    },
    reset(): void {
      try {
        sim.replaceScene(currentDoc)
        builtDoc = currentDoc
        states = null
        pending = false
        error = null
      } catch (e) {
        error = e instanceof Error ? e.message : String(e)
        pending = true
      }
    },
  }
}

describe('failed structural rebuild must not clear retry flag (T7-M2 blocker)', () => {
  it('(a) structural edit to invalid doc while paused — step without editing must NOT advance old world against new doc', async () => {
    const sim = await createSimulator(fallingScene(1))
    const app = makeAppLike(sim, fallingScene(1))
    // build some velocity via the app transport
    app.runSteps(30)
    const yHealthy = sim.readStates().get('ball')!.position.y
    expect(yHealthy).toBeLessThan(10)

    // structural edit to invalid mass while paused
    app.edit(fallingScene(-2))
    expect(app.pending).toBe(true)
    expect(app.syncWorld()).toBe(false)
    expect(app.pending).toBe(true)
    expect(app.error).toMatch(/mass/i)
    expect(app.builtDoc).toStrictEqual(fallingScene(1))

    const yBeforeStep = sim.readStates().get('ball')!.position.y
    expect(yBeforeStep).toBe(yHealthy)
    app.runSteps(1)
    expect(app.pending).toBe(true)
    expect(sim.readStates().get('ball')!.position.y).toBe(yBeforeStep)

    // fix → next step rebuilds successfully from carried state and continues falling
    app.edit(fallingScene(1))
    const yBeforeFix = sim.readStates().get('ball')!.position.y
    app.runSteps(1)
    expect(app.pending).toBe(false)
    expect(app.error).toBeNull()
    expect(sim.readStates().get('ball')!.position.y).toBeLessThan(yBeforeFix)
  })

  it('(b) reset-to-invalid-doc preserves pending and does not diverge on next step', async () => {
    const sim = await createSimulator(fallingScene(1))
    const app = makeAppLike(sim, fallingScene(1))
    app.runSteps(10)
    const healthyY = sim.readStates().get('ball')!.position.y

    app.edit(fallingScene(-2))
    app.reset()
    expect(app.pending).toBe(true)
    expect(app.error).toMatch(/mass/i)
    expect(app.builtDoc).toStrictEqual(fallingScene(1))

    const yBefore = sim.readStates().get('ball')!.position.y
    app.runSteps(1)
    expect(app.pending).toBe(true)
    expect(sim.readStates().get('ball')!.position.y).toBe(yBefore)
    expect(yBefore).toBe(healthyY)

    app.edit(fallingScene(1))
    app.reset()
    expect(app.pending).toBe(false)
    expect(app.error).toBeNull()
    expect(sim.readStates().get('ball')!.position.y).toBe(10)
  })
})
