import { describe, expect, it } from 'vitest'
import type { Scene } from '../scene'
import { applyStates } from '../playback/view'
import {
  ARROW_MAX_PX,
  ARROW_MIN_PX,
  ARROW_SCALE_PX,
  computeAcceleration,
  NORMAL_LEN,
  vectorArrowLengthPx,
  appliedArrows,
  elasticArrows,
  initialVelocityArrows,
  normalArrows,
  tensionArrows,
  vectorLabels,
  weightArrows,
  type OverlayArrow,
} from './overlay'
import type { BodyState, ConstraintState, ContactPoint } from '../sim/simulator'
import { TIMESTEP } from '../sim/timestep'

const PPM = 60

function sceneWithBodies(bodies: Scene['bodies'], g = 9.81, forces: Scene['forces'] = []): Scene {
  return { version: 1, constants: { g }, bodies, forces, contacts: [] }
}

function stateAt(x: number, y: number): BodyState {
  return { position: { x, y }, rotation: 0, linvel: { x: 0, y: 0 }, angvel: 0 }
}

type InitialVelocityArrow = {
  from: { x: number; y: number }
  vec: { x: number; y: number }
  kind: string
}

type InitialVelocityArrowProducer = (view: Scene, pixelsPerMeter: number) => InitialVelocityArrow[]

async function produceInitialVelocityArrows(view: Scene, pixelsPerMeter: number): Promise<InitialVelocityArrow[]> {
  const { initialVelocityArrows } = await import('./overlay') as unknown as {
    initialVelocityArrows?: InitialVelocityArrowProducer
  }
  expect(typeof initialVelocityArrows, 'ticket 07 requires initialVelocityArrows(view, pixelsPerMeter)').toBe('function')
  if (!initialVelocityArrows) return []
  return initialVelocityArrows(view, pixelsPerMeter)
}

describe('weightArrows', () => {
  it('produces one arrow per dynamic body, fixed bodies skipped, length sized by the shared rule', () => {
    const scene = sceneWithBodies([
      { id: 'a', shape: 'circle', radius: 0.5, fixed: false, mass: 2, position: { x: 1, y: 3 }, rotation: 0 },
      { id: 'ground', shape: 'rectangle', width: 10, height: 1, fixed: true, mass: 0, position: { x: 0, y: -0.5 }, rotation: 0 },
    ])
    const states = new Map<string, BodyState>([
      ['a', stateAt(1, 3)],
      ['ground', stateAt(0, -0.5)],
    ])
    const arrows = weightArrows(scene, states, PPM)
    expect(arrows).toHaveLength(1)
    expect(arrows[0]!.from).toEqual({ x: 1, y: 3 })
    expect(arrows[0]!.vec.x).toBeCloseTo(0, 9)
    expect(arrows[0]!.vec.y).toBeCloseTo(-vectorArrowLengthPx(2 * 9.81) / PPM, 9)
    expect(arrows[0]!.kind).toBe('weight')
  })

  it('returns empty when no states or only fixed bodies', () => {
    const scene = sceneWithBodies([{ id: 'f', shape: 'circle', radius: 0.5, fixed: true, mass: 0, position: { x: 0, y: 0 }, rotation: 0 }])
    expect(weightArrows(scene, null, PPM)).toEqual([])
    expect(weightArrows(scene, new Map(), PPM)).toEqual([])
  })

  it('monotonic in weight magnitude: heavier body or stronger g never draws shorter', () => {
    const lenPx = (mass: number, g: number) => {
      const s = sceneWithBodies([{ id: 'b', shape: 'circle', radius: 0.5, fixed: false, mass, position: { x: 0, y: 0 }, rotation: 0 }], g)
      const st = new Map<string, BodyState>([['b', stateAt(0, 0)]])
      return Math.abs(weightArrows(s, st, PPM)[0]!.vec.y) * PPM
    }
    expect(lenPx(1, 10)).toBeLessThanOrEqual(lenPx(2, 10))
    expect(lenPx(2, 10)).toBeLessThan(lenPx(20, 10))
    expect(lenPx(1, 5)).toBeLessThanOrEqual(lenPx(1, 10))
  })
})

describe('appliedArrows', () => {
  it('maps anchor through bodyPointToWorld and direction through world frame, sized by the shared rule', () => {
    const view: Scene = {
      version: 1,
      constants: { g: 9.81 },
      bodies: [{ id: 'b', shape: 'rectangle', width: 2, height: 2, fixed: false, mass: 1, position: { x: 1, y: 2 }, rotation: Math.PI / 2 }],
      forces: [{ id: 'f1', bodyId: 'b', anchor: { x: 0.5, y: 0 }, magnitude: 10, direction: 0 }],
      contacts: [],
    }
    const arrows = appliedArrows(view, PPM)
    expect(arrows).toHaveLength(1)
    // anchor (0.5,0) rotated 90° CCW about (1,2) => (1, 2.5)
    expect(arrows[0]!.from.x).toBeCloseTo(1, 9)
    expect(arrows[0]!.from.y).toBeCloseTo(2.5, 9)
    expect(arrows[0]!.vec.x).toBeCloseTo(vectorArrowLengthPx(10) / PPM, 9)
    expect(arrows[0]!.vec.y).toBeCloseTo(0, 9)
  })

  it('handles multiple forces and ignores dangling bodyId', () => {
    const view: Scene = {
      version: 1,
      constants: { g: 9.81 },
      bodies: [{ id: 'a', shape: 'circle', radius: 0.5, fixed: false, mass: 1, position: { x: 0, y: 0 }, rotation: 0 }],
      forces: [
        { id: 'f1', bodyId: 'a', anchor: { x: 0, y: 0 }, magnitude: 5, direction: 90 },
        { id: 'f2', bodyId: 'ghost', anchor: { x: 0, y: 0 }, magnitude: 5, direction: 0 },
      ],
      contacts: [],
    }
    const arrows = appliedArrows(view, PPM)
    expect(arrows).toHaveLength(1)
    expect(arrows[0]!.vec.x).toBeCloseTo(0, 9)
    expect(arrows[0]!.vec.y).toBeCloseTo(vectorArrowLengthPx(5) / PPM, 9)
  })
})

describe('initialVelocityArrows', () => {
  it('anchors to the projected Body and points along stored world-frame v₀', async () => {
    const doc = sceneWithBodies([
      {
        id: 'shot',
        shape: 'circle',
        radius: 0.5,
        fixed: false,
        mass: 1,
        position: { x: 1, y: 2 },
        rotation: Math.PI / 2,
        vx: 3,
        vy: 4,
      },
    ])
    const view = applyStates(doc, new Map<string, BodyState>([
      ['shot', { ...stateAt(-7, 11), rotation: Math.PI / 2 }],
    ]))
    const arrows = await produceInitialVelocityArrows(view, PPM)

    expect(arrows).toHaveLength(1)
    expect(arrows[0]!.kind).toBe('initial-velocity')
    expect(arrows[0]!.from).toEqual({ x: -7, y: 11 })
    const lenM = vectorArrowLengthPx(5) / PPM
    expect(arrows[0]!.vec.x).toBeCloseTo((lenM * 3) / 5, 9)
    expect(arrows[0]!.vec.y).toBeCloseTo((lenM * 4) / 5, 9)
  })

  it('treats an absent component as zero', async () => {
    const view = sceneWithBodies([
      {
        id: 'x-only',
        shape: 'circle',
        radius: 0.5,
        fixed: false,
        mass: 1,
        position: { x: 1, y: 0 },
        rotation: 0,
        vx: -3,
      },
      {
        id: 'y-only',
        shape: 'circle',
        radius: 0.5,
        fixed: false,
        mass: 1,
        position: { x: 2, y: 0 },
        rotation: 0,
        vy: 4,
      },
    ])
    const arrows = await produceInitialVelocityArrows(view, PPM)

    expect(arrows).toHaveLength(2)
    const xLenM = vectorArrowLengthPx(3) / PPM
    expect(arrows[0]!.vec.x).toBeCloseTo(-xLenM, 9)
    expect(arrows[0]!.vec.y).toBeCloseTo(0, 9)
    const yLenM = vectorArrowLengthPx(4) / PPM
    expect(arrows[1]!.vec.x).toBeCloseTo(0, 9)
    expect(arrows[1]!.vec.y).toBeCloseTo(yLenM, 9)
  })

  it('suppresses exact zero velocity and Fixed-body arrows', async () => {
    const view = sceneWithBodies([
      {
        id: 'zero',
        shape: 'circle',
        radius: 0.5,
        fixed: false,
        mass: 1,
        position: { x: 1, y: 0 },
        rotation: 0,
        vx: 0,
        vy: 0,
      },
      {
        id: 'absent',
        shape: 'circle',
        radius: 0.5,
        fixed: false,
        mass: 1,
        position: { x: 2, y: 0 },
        rotation: 0,
      },
      {
        id: 'fixed',
        shape: 'rectangle',
        width: 2,
        height: 1,
        fixed: true,
        mass: 0,
        position: { x: 3, y: 0 },
        rotation: 0,
        vx: 9,
        vy: -12,
      },
      {
        id: 'moving',
        shape: 'circle',
        radius: 0.5,
        fixed: false,
        mass: 1,
        position: { x: 4, y: 0 },
        rotation: 0,
        vx: 1,
        vy: 0,
      },
    ])
    const arrows = await produceInitialVelocityArrows(view, PPM)

    expect(arrows).toHaveLength(1)
    expect(arrows[0]!.from).toEqual({ x: 4, y: 0 })
  })

  it('uses the shared bounded monotonic sizing rule for adversarial magnitudes', async () => {
    const magnitudes = [1e-9, 0.001, 1, 5, 500, 1e6]
    const view = sceneWithBodies(
      magnitudes.map((magnitude, i) => ({
        id: `v-${i}`,
        shape: 'circle' as const,
        radius: 0.5,
        fixed: false,
        mass: 1,
        position: { x: i, y: 0 },
        rotation: 0,
        vx: magnitude,
        vy: 0,
      })),
    )
    const arrows = await produceInitialVelocityArrows(view, PPM)
    const lengthsPx = arrows.map((arrow) => Math.hypot(arrow.vec.x, arrow.vec.y) * PPM)

    expect(arrows).toHaveLength(magnitudes.length)
    for (let i = 0; i < magnitudes.length; i++) {
      expect(lengthsPx[i]!).toBeCloseTo(vectorArrowLengthPx(magnitudes[i]!), 9)
      expect(lengthsPx[i]!).toBeGreaterThanOrEqual(ARROW_MIN_PX)
      expect(lengthsPx[i]!).toBeLessThanOrEqual(ARROW_MAX_PX)
      if (i > 0) expect(lengthsPx[i]!).toBeGreaterThanOrEqual(lengthsPx[i - 1]!)
    }
    // These are deliberately unlike raw-magnitude pixels and unlike a per-arrow constant.
    expect(lengthsPx[2]!).toBeLessThan(lengthsPx[3]!)
    expect(lengthsPx[3]!).toBeLessThan(lengthsPx[4]!)
  })
})

describe('vectorArrowLengthPx (the one shared sizing rule)', () => {
  it('monotonic: strictly larger magnitude never yields a shorter arrow', () => {
    const magnitudes = [0, 1e-9, 0.001, 0.5, 1, 2, 5, 10, 25, 36, 49, 100, 500, 5000, 1e6, Infinity]
    for (let i = 1; i < magnitudes.length; i++) {
      expect(vectorArrowLengthPx(magnitudes[i]!)).toBeGreaterThanOrEqual(vectorArrowLengthPx(magnitudes[i - 1]!))
    }
    // 1, 5, 500 N must land as three visibly different arrows.
    expect(vectorArrowLengthPx(1)).toBeLessThan(vectorArrowLengthPx(5))
    expect(vectorArrowLengthPx(5)).toBeLessThan(vectorArrowLengthPx(500))
  })

  it('bounded: hard pixel floor and ceiling for any magnitude including extremes', () => {
    for (const m of [0, 1e-9, 0.001, 1, 5, 25, 500, 1e6, Infinity]) {
      const len = vectorArrowLengthPx(m)
      expect(len).toBeGreaterThanOrEqual(ARROW_MIN_PX)
      expect(len).toBeLessThanOrEqual(ARROW_MAX_PX)
    }
    expect(vectorArrowLengthPx(NaN)).toBe(ARROW_MIN_PX)
    expect(vectorArrowLengthPx(-3)).toBe(ARROW_MIN_PX)
  })

  it('square-root shape pinned at an unclamped interior point', () => {
    // 25 N -> √25 · ARROW_SCALE_PX = 100 px, mid-range. A linear map would hit
    // the ceiling here (25 · 20 = 500 -> clamped 120), so this pins sqrt specifically.
    expect(vectorArrowLengthPx(25)).toBeCloseTo(ARROW_SCALE_PX * Math.sqrt(25), 9)
  })
})

describe('shared sizing rule across arrow kinds', () => {
  it('weight and applied arrows of equal magnitude draw identical lengths', () => {
    const F = 50
    const scene = sceneWithBodies(
      [{ id: 'a', shape: 'circle', radius: 0.5, fixed: false, mass: F / 9.81, position: { x: 0, y: 0 }, rotation: 0 }],
      9.81,
      [{ id: 'f1', bodyId: 'a', anchor: { x: 0, y: 0 }, magnitude: F, direction: 0 }],
    )
    const st = new Map<string, BodyState>([['a', stateAt(0, 0)]])
    const w = weightArrows(scene, st, PPM)[0]!
    const f = appliedArrows(scene, PPM)[0]!
    expect(Math.hypot(w.vec.x, w.vec.y) * PPM).toBeCloseTo(vectorArrowLengthPx(F), 9)
    expect(Math.hypot(f.vec.x, f.vec.y) * PPM).toBeCloseTo(vectorArrowLengthPx(F), 9)
  })

  it('extreme magnitudes stay inside pixel bounds through both producers', () => {
    const scene = sceneWithBodies(
      [{ id: 'a', shape: 'circle', radius: 0.5, fixed: false, mass: 1000, position: { x: 0, y: 0 }, rotation: 0 }],
      9.81,
      [{ id: 'f1', bodyId: 'a', anchor: { x: 0, y: 0 }, magnitude: 500, direction: 45 }],
    )
    const st = new Map<string, BodyState>([['a', stateAt(0, 0)]])
    for (const a of [...weightArrows(scene, st, PPM), ...appliedArrows(scene, PPM)]) {
      const px = Math.hypot(a.vec.x, a.vec.y) * PPM
      expect(px).toBeGreaterThanOrEqual(ARROW_MIN_PX)
      expect(px).toBeLessThanOrEqual(ARROW_MAX_PX)
    }
  })
})

describe('normalArrows', () => {
  it('fixed length in normal direction', () => {
    const contacts: ContactPoint[] = [{ aId: 'a', bId: 'b', point: { x: 1, y: 2 }, normal: { x: 0, y: 1 } }]
    const arrows = normalArrows(contacts)
    expect(arrows).toHaveLength(1)
    expect(arrows[0]!.from).toEqual({ x: 1, y: 2 })
    expect(arrows[0]!.vec).toEqual({ x: 0, y: NORMAL_LEN })
  })

  it('empty when no contacts', () => {
    expect(normalArrows([])).toEqual([])
  })
})

type SceneBody = Scene['bodies'][number]

function block(id: string, x: number, y: number, fixed = false): SceneBody {
  return { id, shape: 'rectangle', width: 0.4, height: 0.4, fixed, mass: fixed ? 0 : 1, position: { x, y }, rotation: 0 }
}

function rope(id: string, a: string, b: string, via: string[] = []): NonNullable<Scene['constraints']>[number] {
  return { id, kind: 'rope', a: { bodyId: a, anchor: { x: 0, y: 0 } }, b: { bodyId: b, anchor: { x: 0, y: 0 } }, via }
}

function spring(id: string, a: string, b: string, mass?: number): NonNullable<Scene['constraints']>[number] {
  return { id, kind: 'spring', a: { bodyId: a, anchor: { x: 0, y: 0 } }, b: { bodyId: b, anchor: { x: 0, y: 0 } }, k: 10, x0: 1, ...(mass === undefined ? {} : { mass }) }
}

function ropeState(id: string, segments: number[]): ConstraintState {
  const tension = Math.max(0, ...segments)
  return { id, kind: 'rope', tension, slack: tension === 0, segments }
}

function springState(id: string, a: number, b = a): ConstraintState {
  return { id, kind: 'spring', dx: 0, force: { a, b } }
}

/**
 * Atwood machine: pulley of radius 0.5 centered (0, 5) on the fixed ceiling,
 * blocks hanging at x = ±0.5 — both legs are the vertical lines x = ±0.5.
 */
function atwood(pulleyMass?: number): Scene {
  return {
    ...sceneWithBodies([block('teto', 0, 5, true), block('a', -0.5, 2), block('b', 0.5, 2)]),
    pulleys: [{ id: 'p', bodyId: 'teto', anchor: { x: 0, y: 0 }, radius: 0.5, ...(pulleyMass === undefined ? {} : { mass: pulleyMass }) }],
    constraints: [rope('r', 'a', 'b', ['p'])],
  }
}

function expectArrow(arrow: OverlayArrow | undefined, from: { x: number; y: number }, vec: { x: number; y: number }): void {
  expect(arrow).toBeDefined()
  expect(arrow!.from.x).toBeCloseTo(from.x, 9)
  expect(arrow!.from.y).toBeCloseTo(from.y, 9)
  expect(arrow!.vec.x).toBeCloseTo(vec.x, 9)
  expect(arrow!.vec.y).toBeCloseTo(vec.y, 9)
}

describe('tensionArrows', () => {
  it('Atwood: one T per dynamic end, at the anchor, toward the next path point; none on the fixed pulley', () => {
    const arrows = tensionArrows(atwood(), [ropeState('r', [12, 12])], PPM)
    const len = vectorArrowLengthPx(12) / PPM
    expect(arrows).toHaveLength(2)
    expect(arrows.every((a) => a.kind === 'tension')).toBe(true)
    expectArrow(arrows[0], { x: -0.5, y: 2 }, { x: 0, y: len })
    expectArrow(arrows[1], { x: 0.5, y: 2 }, { x: 0, y: len })
  })

  it('straight rope between two dynamic bodies: each end pulled toward the other', () => {
    const scene: Scene = { ...sceneWithBodies([block('a', 0, 0), block('b', 3, 4)]), constraints: [rope('r', 'a', 'b')] }
    const arrows = tensionArrows(scene, [ropeState('r', [5])], PPM)
    const len = vectorArrowLengthPx(5) / PPM
    expect(arrows).toHaveLength(2)
    expectArrow(arrows[0], { x: 0, y: 0 }, { x: 0.6 * len, y: 0.8 * len })
    expectArrow(arrows[1], { x: 3, y: 4 }, { x: -0.6 * len, y: -0.8 * len })
  })

  it('movable pulley: one arrow per adjacent segment at the pulley center; fixed ends get none', () => {
    // Pulley (0, 2) r 0.5 on the dynamic block, rope from the ceiling at x = -0.5
    // under the pulley and back up to x = +0.5: both legs vertical.
    const scene: Scene = {
      ...sceneWithBodies([block('esq', -0.5, 5, true), block('dir', 0.5, 5, true), block('bloco', 0, 2)]),
      pulleys: [{ id: 'm', bodyId: 'bloco', anchor: { x: 0, y: 0 }, radius: 0.5 }],
      constraints: [rope('r', 'esq', 'dir', ['m'])],
    }
    const arrows = tensionArrows(scene, [ropeState('r', [7, 7])], PPM)
    const len = vectorArrowLengthPx(7) / PPM
    expect(arrows).toHaveLength(2)
    expectArrow(arrows[0], { x: 0, y: 2 }, { x: 0, y: len })
    expectArrow(arrows[1], { x: 0, y: 2 }, { x: 0, y: len })
  })

  it('pulley with mass: each end sized by its own segment tension', () => {
    const arrows = tensionArrows(atwood(2), [ropeState('r', [10, 6])], PPM)
    expect(arrows).toHaveLength(2)
    expect(Math.hypot(arrows[0]!.vec.x, arrows[0]!.vec.y) * PPM).toBeCloseTo(vectorArrowLengthPx(10), 9)
    expect(Math.hypot(arrows[1]!.vec.x, arrows[1]!.vec.y) * PPM).toBeCloseTo(vectorArrowLengthPx(6), 9)
  })

  it('slack rope (T = 0) and a rope with no reading draw nothing', () => {
    expect(tensionArrows(atwood(), [ropeState('r', [0, 0])], PPM)).toEqual([])
    expect(tensionArrows(atwood(), [], PPM)).toEqual([])
  })
})

describe('elasticArrows', () => {
  it('stretched spring pulls each dynamic end toward the other; the fixed end gets none', () => {
    const scene: Scene = { ...sceneWithBodies([block('parede', 0, 0, true), block('m', 3, 0)]), constraints: [spring('s', 'parede', 'm')] }
    const arrows = elasticArrows(scene, [springState('s', 5)], PPM)
    expect(arrows).toHaveLength(1)
    expect(arrows[0]!.kind).toBe('elastic')
    expectArrow(arrows[0], { x: 3, y: 0 }, { x: -vectorArrowLengthPx(5) / PPM, y: 0 })
  })

  it('compressed spring pushes the ends apart, sized by |F_el|', () => {
    const scene: Scene = { ...sceneWithBodies([block('a', 0, 0), block('b', 0, 2)]), constraints: [spring('s', 'a', 'b')] }
    const arrows = elasticArrows(scene, [springState('s', -4)], PPM)
    const len = vectorArrowLengthPx(4) / PPM
    expect(arrows).toHaveLength(2)
    expectArrow(arrows[0], { x: 0, y: 0 }, { x: 0, y: -len })
    expectArrow(arrows[1], { x: 0, y: 2 }, { x: 0, y: len })
  })

  it('spring with mass (PHY-30): each end sized by its own F_el', () => {
    const scene: Scene = { ...sceneWithBodies([block('a', 0, 0), block('b', 0, 2)]), constraints: [spring('s', 'a', 'b', 0.2)] }
    const arrows = elasticArrows(scene, [springState('s', 9, 4)], PPM)
    expect(arrows).toHaveLength(2)
    expectArrow(arrows[0], { x: 0, y: 0 }, { x: 0, y: vectorArrowLengthPx(9) / PPM })
    expectArrow(arrows[1], { x: 0, y: 2 }, { x: 0, y: -vectorArrowLengthPx(4) / PPM })
  })

  it('ropes and springs with no reading are ignored', () => {
    const scene: Scene = { ...sceneWithBodies([block('a', 0, 0), block('b', 0, 2)]), constraints: [spring('s', 'a', 'b'), rope('r', 'a', 'b')] }
    expect(elasticArrows(scene, [ropeState('r', [3])], PPM)).toEqual([])
  })
})

describe('vectorLabels', () => {
  const labelsOf = (arrows: OverlayArrow[], lang: 'pt-BR' | 'en' = 'pt-BR') => {
    const labels = vectorLabels(arrows, lang)
    return arrows.map((a) => labels.get(a.key))
  }

  it('one of each kind: the bare symbol from the table, per language', () => {
    const scene: Scene = {
      ...sceneWithBodies(
        [{ ...block('a', 0, 0), vx: 1 }, block('parede', -3, 0, true)],
        9.81,
        [{ id: 'f', bodyId: 'a', anchor: { x: 0, y: 0 }, magnitude: 5, direction: 0 }],
      ),
      constraints: [spring('s', 'parede', 'a')],
    }
    const states = new Map<string, BodyState>([['a', stateAt(0, 0)]])
    const arrows = [
      ...weightArrows(scene, states, PPM),
      ...normalArrows([{ aId: 'a', bId: 'parede', point: { x: 0, y: 0 }, normal: { x: 0, y: 1 } }]),
      ...appliedArrows(scene, PPM),
      ...tensionArrows({ ...atwood() }, [ropeState('r', [3, 3])], PPM).slice(0, 1),
      ...elasticArrows(scene, [springState('s', 2)], PPM),
      ...initialVelocityArrows(scene, PPM),
    ]
    expect(labelsOf(arrows)).toEqual(['P', 'N', 'F', 'T', 'F_el', 'v₀'])
    expect(labelsOf(arrows, 'en')).toEqual(['W', 'N', 'F', 'T', 'F_s', 'v₀'])
  })

  it('two of a kind: numeric subscripts in document order', () => {
    const scene = sceneWithBodies([block('a', 0, 0), block('b', 1, 0)])
    const states = new Map<string, BodyState>([['a', stateAt(0, 0)], ['b', stateAt(1, 0)]])
    expect(labelsOf(weightArrows(scene, states, PPM))).toEqual(['P_1', 'P_2'])
    const springs: Scene = { ...scene, constraints: [spring('s1', 'a', 'b'), spring('s2', 'b', 'a')] }
    const arrows = elasticArrows(springs, [springState('s1', 1), springState('s2', 1)], PPM)
    expect(labelsOf(arrows)).toEqual(['F_el,1', 'F_el,1', 'F_el,2', 'F_el,2'])
    expect(labelsOf(arrows, 'en')).toEqual(['F_s,1', 'F_s,1', 'F_s,2', 'F_s,2'])
  })

  it('the same rope carries the same T at both ends', () => {
    expect(labelsOf(tensionArrows(atwood(), [ropeState('r', [9, 9])], PPM))).toEqual(['T', 'T'])
  })

  it('spring with mass (PHY-30): one F_el per end; massless, one for both', () => {
    const bodies = sceneWithBodies([block('a', 0, 0), block('b', 0, 2)])
    const massive: Scene = { ...bodies, constraints: [spring('s', 'a', 'b', 0.2)] }
    expect(labelsOf(elasticArrows(massive, [springState('s', 9, 4)], PPM))).toEqual(['F_el,1', 'F_el,2'])
    expect(labelsOf(elasticArrows(massive, [springState('s', 9, 4)], PPM), 'en')).toEqual(['F_s,1', 'F_s,2'])
    const ideal: Scene = { ...bodies, constraints: [spring('s', 'a', 'b', 0)] }
    expect(labelsOf(elasticArrows(ideal, [springState('s', 5)], PPM))).toEqual(['F_el', 'F_el'])
  })

  it('pulley with mass: one T per segment', () => {
    expect(labelsOf(tensionArrows(atwood(1), [ropeState('r', [9, 8])], PPM))).toEqual(['T_1', 'T_2'])
  })

  it('two ropes number apart; a slack rope loses its arrows and its label', () => {
    const scene: Scene = {
      ...sceneWithBodies([block('a', 0, 0), block('b', 1, 0), block('c', 2, 0)]),
      constraints: [rope('r1', 'a', 'b'), rope('r2', 'b', 'c')],
    }
    expect(labelsOf(tensionArrows(scene, [ropeState('r1', [2]), ropeState('r2', [3])], PPM))).toEqual(['T_1', 'T_1', 'T_2', 'T_2'])
    expect(labelsOf(tensionArrows(scene, [ropeState('r1', [0]), ropeState('r2', [3])], PPM))).toEqual(['T', 'T'])
  })

  it('the same Contact pair carries the same N at every point', () => {
    const contacts: ContactPoint[] = [
      { aId: 'a', bId: 'chao', point: { x: -0.2, y: 0 }, normal: { x: 0, y: 1 } },
      { aId: 'a', bId: 'chao', point: { x: 0.2, y: 0 }, normal: { x: 0, y: 1 } },
      { aId: 'chao', bId: 'b', point: { x: 3, y: 0 }, normal: { x: 0, y: 1 } },
    ]
    expect(labelsOf(normalArrows(contacts))).toEqual(['N_1', 'N_1', 'N_2'])
    expect(labelsOf(normalArrows(contacts.slice(0, 2)))).toEqual(['N', 'N'])
  })
})

describe('computeAcceleration', () => {
  const dt = TIMESTEP
  it('finite difference Δv/dt', () => {
    const prev = new Map<string, BodyState>([['b', { position: { x: 0, y: 0 }, rotation: 0, linvel: { x: 0, y: -9.81 * dt }, angvel: 0 }]])
    const curr = new Map<string, BodyState>([['b', { position: { x: 0, y: 0 }, rotation: 0, linvel: { x: 0, y: -9.81 * 2 * dt }, angvel: 0 }]])
    const acc = computeAcceleration(prev, curr, 'b', dt)
    expect(acc.y).toBeCloseTo(-9.81, 5)
    expect(acc.x).toBeCloseTo(0, 9)
  })

  it('zero when missing history or unknown id', () => {
    const curr = new Map<string, BodyState>([['b', { position: { x: 0, y: 0 }, rotation: 0, linvel: { x: 1, y: 0 }, angvel: 0 }]])
    expect(computeAcceleration(null, curr, 'b', dt)).toEqual({ x: 0, y: 0 })
    expect(computeAcceleration(curr, curr, 'ghost', dt)).toEqual({ x: 0, y: 0 })
    expect(computeAcceleration(curr, curr, 'b', 0)).toEqual({ x: 0, y: 0 })
  })

  it('table: various Δv', () => {
    const rows: Array<[number, number, number]> = [
      [0, 1, 60],
      [1, 0, -60],
      [2, 2, 0],
    ]
    for (const [vxPrev, vxCurr, expectedAx] of rows) {
      const prev = new Map<string, BodyState>([['b', { position: { x: 0, y: 0 }, rotation: 0, linvel: { x: vxPrev, y: 0 }, angvel: 0 }]])
      const curr = new Map<string, BodyState>([['b', { position: { x: 0, y: 0 }, rotation: 0, linvel: { x: vxCurr, y: 0 }, angvel: 0 }]])
      const acc = computeAcceleration(prev, curr, 'b', dt)
      expect(acc.x).toBeCloseTo(expectedAx, 9)
    }
  })

  it('multi-step elapsed: free-fall at 2× must still report ≈g, not ≈2g', async () => {
    // At 2× the scheduler emits n=2 steps per frame; Δv spans 2·TIMESTEP.
    // Dividing by a single TIMESTEP would double the estimate.
    const g = 9.81
    // Two consecutive batches of 2 steps each
    const prev = new Map<string, BodyState>([['b', { position: { x: 0, y: 0 }, rotation: 0, linvel: { x: 0, y: -g * 2 * dt }, angvel: 0 }]])
    const curr = new Map<string, BodyState>([['b', { position: { x: 0, y: 0 }, rotation: 0, linvel: { x: 0, y: -g * 4 * dt }, angvel: 0 }]])
    const accCorrect = computeAcceleration(prev, curr, 'b', 2 * dt)
    const accBuggy = computeAcceleration(prev, curr, 'b', dt)
    expect(accCorrect.y).toBeCloseTo(-g, 5)
    expect(accBuggy.y).toBeCloseTo(-2 * g, 5)
    // The bug would be ~2g; the fix must be ~g within 5%.
    expect(Math.abs(accCorrect.y + g) / g).toBeLessThan(0.05)
  })

  it('every speed notch covered: steps-per-frame via accumulator matches elapsed', async () => {
    const { advance, initialPlayback } = await import('../playback/scheduler')
    for (const speed of [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]) {
      let s = initialPlayback(speed)
      s = advance(s, { type: 'play' }).state
      let totalSteps = 0
      for (let i = 0; i < 20; i++) {
        const t = advance(s, { type: 'frame' })
        s = t.state
        const nextSteps = t.steps
        if (nextSteps > 0) {
          const prev = new Map<string, BodyState>([
            ['b', { position: { x: 0, y: 0 }, rotation: 0, linvel: { x: 0, y: -9.81 * totalSteps * dt }, angvel: 0 }],
          ])
          const curr = new Map<string, BodyState>([
            ['b', { position: { x: 0, y: 0 }, rotation: 0, linvel: { x: 0, y: -9.81 * (totalSteps + nextSteps) * dt }, angvel: 0 }],
          ])
          const acc = computeAcceleration(prev, curr, 'b', nextSteps * dt)
          expect(acc.y).toBeCloseTo(-9.81, 5)
        }
        totalSteps += nextSteps
      }
    }
  })
})
