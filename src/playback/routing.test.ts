/**
 * Live-vs-structural routing (T7/M2): a pure classifier deciding whether a
 * document edit can be absorbed by the RUNNING world (live ops on existing
 * records + g) or needs a carried structural rebuild. Table-driven per PLAN.
 */
import { describe, expect, it } from 'vitest'
import type { Scene } from '../scene'
import type { Simulator } from '../sim'
import { applyLiveOps, routeDocChange } from './routing'

function base(): Scene {
  return {
    version: 1,
    constants: { g: 9.81 },
    bodies: [
      { id: 'a', shape: 'circle', radius: 0.5, fixed: false, mass: 1, position: { x: 0, y: 5 }, rotation: 0 },
      {
        id: 'floor',
        shape: 'rectangle',
        width: 10,
        height: 1,
        fixed: true,
        mass: 0,
        position: { x: 0, y: -0.5 },
        rotation: 0,
      },
    ],
    forces: [
      { id: 'f-1', bodyId: 'a', anchor: { x: 0, y: 0 }, magnitude: 10, direction: 90 },
      { id: 'w-1', bodyId: 'floor', anchor: { x: 1, y: 0 }, magnitude: 3, direction: 0 },
    ],
    contacts: [{ a: 'a', b: 'floor', muS: 0.3, muK: 0.25 }],
  }
}

const edit = (fn: (s: Scene) => void): Scene => {
  const s = base()
  fn(s)
  return s
}

describe('routeDocChange', () => {
  it('identical documents need no ops', () => {
    expect(routeDocChange(base(), base())).toStrictEqual({ kind: 'live', ops: [] })
  })

  it('LIVE: constants.g edit becomes one gravity op', () => {
    const next = edit((s) => {
      s.constants.g = 3.5
    })
    expect(routeDocChange(base(), next)).toStrictEqual({ kind: 'live', ops: [{ t: 'gravity', g: 3.5 }] })
  })

  it('LIVE: force magnitude/direction/anchor value edits become per-record ops in doc order', () => {
    const next = edit((s) => {
      s.forces[0]!.magnitude = 42
      s.forces[0]!.direction = 45
      s.forces[0]!.anchor = { x: 0.25, y: -1 }
    })
    expect(routeDocChange(base(), next)).toStrictEqual({
      kind: 'live',
      ops: [
        { t: 'forceMagnitude', id: 'f-1', v: 42 },
        { t: 'forceDirection', id: 'f-1', v: 45 },
        { t: 'forceAnchor', id: 'f-1', anchor: { x: 0.25, y: -1 } },
      ],
    })
  })

  it('LIVE: mixed g + several force edits accumulate into one op list', () => {
    const next = edit((s) => {
      s.constants.g = 1
      s.forces[0]!.magnitude = 7
      s.forces[0]!.anchor = { x: 2, y: 2 }
    })
    expect(routeDocChange(base(), next)).toStrictEqual({
      kind: 'live',
      ops: [
        { t: 'gravity', g: 1 },
        { t: 'forceMagnitude', id: 'f-1', v: 7 },
        { t: 'forceAnchor', id: 'f-1', anchor: { x: 2, y: 2 } },
      ],
    })
  })

  it('LIVE no-op subtlety: editing a force attached to a FIXED body emits nothing — the engine ignores those bindings, so the doc and world stay in parity', () => {
    const next = edit((s) => {
      s.forces[1]!.magnitude = 99
    })
    expect(routeDocChange(base(), next)).toStrictEqual({ kind: 'live', ops: [] })
  })

  it('STRUCTURAL: body added / removed (the stale-id case)', () => {
    const added = edit((s) => {
      s.bodies.push({ id: 'c', shape: 'circle', radius: 0.3, fixed: false, mass: 1, position: { x: 9, y: 9 }, rotation: 0 })
    })
    expect(routeDocChange(base(), added).kind).toBe('structural')
    const removed = edit((s) => {
      s.bodies.splice(0, 1)
      s.forces = []
      s.contacts = []
    })
    const r = routeDocChange(base(), removed)
    expect(r.kind).toBe('structural')
    expect((r as { reason: string }).reason).toContain("'a'")
  })

  it.each([
    ['radius', (b: Scene['bodies'][number]) => {
      if (b.shape === 'circle') b.radius = 0.9
    }],
    ['position', (b: Scene['bodies'][number]) => {
      b.position.x += 1
    }],
    ['rotation', (b: Scene['bodies'][number]) => {
      b.rotation += 0.1
    }],
    ['mass', (b: Scene['bodies'][number]) => {
      b.mass = 4
    }],
    ['fixed', (b: Scene['bodies'][number]) => {
      b.fixed = !b.fixed
    }],
  ])('STRUCTURAL: body %s change cannot go live', (_field, mutate) => {
    const next = edit((s) => mutate(s.bodies[0]!))
    expect(routeDocChange(base(), next).kind).toBe('structural')
  })

  it('STRUCTURAL: rectangle geometry change cannot go live', () => {
    const next = edit((s) => {
      const floor = s.bodies[1]!
      if (floor.shape === 'rectangle') floor.width = 4
    })
    expect(routeDocChange(base(), next).kind).toBe('structural')
  })

  it('STRUCTURAL: force record added or removed', () => {
    const added = edit((s) => {
      s.forces.push({ id: 'f-2', bodyId: 'a', anchor: { x: 0, y: 0 }, magnitude: 1, direction: 0 })
    })
    expect(routeDocChange(base(), added).kind).toBe('structural')
    const removed = edit((s) => {
      s.forces.splice(0, 1)
    })
    expect(routeDocChange(base(), removed).kind).toBe('structural')
  })

  it('STRUCTURAL: force retarget on an existing id (defensive — unreachable through the typed ForcePatch)', () => {
    const next = edit((s) => {
      ;(s.forces[0] as { bodyId: string }).bodyId = 'floor'
    })
    expect(routeDocChange(base(), next)).toStrictEqual({ kind: 'structural', reason: "force 'f-1' retargeted" })
  })

  it('STRUCTURAL (documented exception): contact mu edits ride the rebuild — mu drives the GLOBAL potential solve and the warnings set, not a local collider field', () => {
    const muChanged = edit((s) => {
      s.contacts[0]!.muK = 0.5
    })
    expect(routeDocChange(base(), muChanged).kind).toBe('structural')
    const contactRemoved = edit((s) => {
      s.contacts = []
    })
    expect(routeDocChange(base(), contactRemoved).kind).toBe('structural')
  })

  it('STRUCTURAL: particleMode toggled', () => {
    const next = edit((s) => {
      s.constants.particleMode = true
    })
    expect(routeDocChange(base(), next).kind).toBe('structural')
  })

  it('mixed transition: any structural trigger wins over live ops (a rebuild reads the whole doc anyway)', () => {
    const next = edit((s) => {
      s.constants.g = 1 // would be live...
      s.bodies.push({ id: 'c', shape: 'circle', radius: 0.3, fixed: false, mass: 1, position: { x: 9, y: 9 }, rotation: 0 }) // ...but this is structural
    })
    expect(routeDocChange(base(), next).kind).toBe('structural')
  })

  it('STRUCTURAL: scene version mismatch is never routable', () => {
    const next = edit((s) => {
      s.version = 2
    })
    expect(routeDocChange(base(), next)).toStrictEqual({ kind: 'structural', reason: 'version 1 -> 2' })
  })

  it('STRUCTURAL: shape swap on an existing body id', () => {
    const next = edit((s) => {
      s.bodies[0] = { id: 'a', shape: 'rectangle', width: 1, height: 1, fixed: false, mass: 1, position: { x: 0, y: 5 }, rotation: 0 }
    })
    expect(routeDocChange(base(), next).kind).toBe('structural')
  })

  it('STRUCTURAL: triangle geometry change cannot go live', () => {
    const prev = edit((s) => {
      s.bodies[0] = { id: 'a', shape: 'triangle', base: 2, alpha: 30, fixed: false, mass: 1, position: { x: 0, y: 5 }, rotation: 0 }
      s.forces = []
      s.contacts = []
    })
    const next = JSON.parse(JSON.stringify(prev)) as Scene
    ;(next.bodies[0] as { alpha: number }).alpha = 45
    expect(routeDocChange(prev, next).kind).toBe('structural')
  })

  it('applyLiveOps maps every op kind onto the seam in order', () => {
    const calls: string[] = []
    const sim = {
      setGravity: (g: number) => calls.push(`g=${g}`),
      setForceMagnitude: (id: string, v: number) => calls.push(`mag ${id}=${v}`),
      setForceDirection: (id: string, v: number) => calls.push(`dir ${id}=${v}`),
      setForceAnchor: (id: string, a: { x: number; y: number }) => calls.push(`anchor ${id}=${a.x},${a.y}`),
    } as unknown as Simulator // stub: only the four live setters are exercised
    applyLiveOps(sim, [
      { t: 'gravity', g: 2 },
      { t: 'forceMagnitude', id: 'f', v: 1 },
      { t: 'forceDirection', id: 'f', v: 45 },
      { t: 'forceAnchor', id: 'f', anchor: { x: 1, y: 2 } },
    ])
    expect(calls).toEqual(['g=2', 'mag f=1', 'dir f=45', 'anchor f=1,2'])
  })

  it('ticket 04: an Initial velocity edit is STRUCTURAL, never a silent no-op live route', () => {
    const next = edit((s) => {
      ;(s.bodies[0] as { vx?: number }).vx = 3
      ;(s.bodies[0] as { vy?: number }).vy = -1
    })
    const route = routeDocChange(base(), next)
    expect(route).toStrictEqual({ kind: 'structural', reason: expect.stringContaining("body 'a'") })
  })

  it('ticket 04: legacy bodies without Initial velocity stay routable (no false structural from absent fields)', () => {
    expect(routeDocChange(base(), base()).kind).toBe('live')
  })
})
