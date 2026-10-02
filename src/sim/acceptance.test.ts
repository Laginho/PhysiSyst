import { describe, expect, it } from 'vitest'
import { createSimulator, TIMESTEP } from './index'
import { parse, scenePath } from '../scene'
import type { RopePath, Scene } from '../scene'
import type { ConstraintState, RopeState } from './index'
import { groundBody } from '../persistence'

const G = 9.81

/**
 * PHY-45: the grid every Atwood scene runs. Bodies are 0.4 × 0.4 squares with
 * the rope on the top face; the pulley axle is at y = 5.25. Energy is the
 * blocks' ½mv² + ½Iω² + mgy, I = m(w² + h²)/12, written here and not read from
 * the simulator. A block must never cross x = 0 while it is above the axle.
 */
const PHY45_PULLEY_Y = 5.25
const PHY45_GRID = [
  ...[3, 4, 5, 6, 7, 8, 10].map((vy) => ({ name: `2/2, a launched at vy = ${vy}`, m1: 2, m2: 2, vy })),
  ...[
    [1, 2],
    [1, 3],
    [1, 4],
    [2, 1],
    [2, 3],
    [3, 1],
  ].map(([m1, m2]) => ({ name: `${m1}/${m2} from rest`, m1: m1!, m2: m2!, vy: undefined as number | undefined })),
]

async function phy45Run(scene: Scene, vy: number | undefined): Promise<{ energyGain: number; crossings: string[] }> {
  if (vy !== undefined) scene.bodies.find((body) => body.id === 'a')!.vy = vy
  const sim = await createSimulator(parse(scene))
  const energy = (): number => {
    let total = 0
    for (const [id, state] of sim.readStates()) {
      if (id === 'teto') continue
      const m = scene.bodies.find((body) => body.id === id)!.mass
      total += 0.5 * m * (state.linvel.x ** 2 + state.linvel.y ** 2) + 0.5 * ((m * (0.4 ** 2 + 0.4 ** 2)) / 12) * state.angvel ** 2 + m * G * state.position.y
    }
    return total
  }
  const e0 = energy()
  let energyGain = 0
  const crossings: string[] = []
  for (let step = 1; step <= 600; step++) {
    sim.step()
    energyGain = Math.max(energyGain, energy() - e0)
    for (const [id, side] of [['a', -1], ['b', 1]] as const) {
      const s = sim.readStates().get(id)!
      const top = { x: s.position.x - Math.sin(s.rotation) * 0.2, y: s.position.y + Math.cos(s.rotation) * 0.2 }
      if (top.y > PHY45_PULLEY_Y && top.x * side < 0) crossings.push(`${id} at step ${step}`)
    }
  }
  return { energyGain, crossings }
}

function slopeFrame(alphaDeg: number): { ux: number; uy: number; nx: number; ny: number } {
  const r = (alphaDeg * Math.PI) / 180
  return { ux: Math.cos(r), uy: Math.sin(r), nx: -Math.sin(r), ny: Math.cos(r) }
}

describe('acceptance: block on incline WITH friction', () => {
  interface Row {
    name: string
    alpha: number
    muK: number
  }
  // Closed-form expectations written BEFORE running (see aClosed below).
  // Circle-block caveat: a disc on an incline rolls instead of sliding unless
  // the contact stays kinetic. Kinetic regime holds iff muK < tan(alpha)/3
  // (rolling threshold for a uniform disc, I = m r^2 / 2). Every row satisfies
  // this with margin, so translational accel is exactly g*(sin - muK*cos).
  const ROWS: Row[] = [
    { name: '30deg mu .15', alpha: 30, muK: 0.15 },
    { name: '45deg mu .20', alpha: 45, muK: 0.2 },
    { name: '20deg mu .08', alpha: 20, muK: 0.08 },
  ]

  it.each(ROWS)('$name slides at a = g(sinA - muK cosA)', async ({ alpha, muK }) => {
    const rad = (alpha * Math.PI) / 180
    expect(muK).toBeLessThan(Math.tan(rad) / 3)
    const aClosed = G * (Math.sin(rad) - muK * Math.cos(rad))
    const f = slopeFrame(alpha)
    const D = 30
    const RADIUS = 0.5
    const sim = await createSimulator({
      version: 1,
      constants: { g: G },
      bodies: [
        {
          id: 'incline',
          shape: 'triangle',
          base: 80,
          alpha,
          fixed: true,
          mass: 50,
          position: { x: -40, y: 0 },
          rotation: 0,
        },
        {
          id: 'ball',
          shape: 'circle',
          radius: RADIUS,
          fixed: false,
          mass: 2,
          position: { x: -40 + D * f.ux + RADIUS * f.nx, y: D * f.uy + RADIUS * f.ny },
          rotation: 0,
        },
      ],
      forces: [],
      contacts: [{ a: 'incline', b: 'ball', muS: muK, muK }],
    })
    const vsAt = (): number => {
      const s = sim.readStates().get('ball')!
      return s.linvel.x * f.ux + s.linvel.y * f.uy
    }
    // Initial-tangency guard: exact face placement (center = p_face + R*n)
    // must produce no pop-out — after one tick the block has moved under
    // gravity only, below 2 mm. Catches pre-penetration placement bugs that
    // a settle window would otherwise silently absorb.
    const p0 = sim.readStates().get('ball')!.position
    sim.step()
    const p1 = sim.readStates().get('ball')!.position
    expect(Math.hypot(p1.x - p0.x, p1.y - p0.y)).toBeLessThanOrEqual(0.002)
    for (let i = 0; i < 29; i++) sim.step()
    const v1 = vsAt()
    for (let i = 0; i < 60; i++) sim.step()
    const dv = v1 - vsAt()
    // Settle-transient done: block genuinely sliding down-slope.
    expect(v1).toBeLessThan(-0.3)
    // Tolerance 5% of a: solver normal-force noise on curved contact plus
    // minor stick-slip jitter (per-tick Euler velocity updates are exact).
    // Window = 60 ticks = 1 s, matching the M2 incline pattern.
    expect(Math.abs(dv - aClosed * (60 * TIMESTEP))).toBeLessThanOrEqual(0.05 * aClosed)
  })
})

describe('acceptance: projectile', () => {
  interface Row {
    name: string
    speed: number
    thetaDeg: number
  }
  const ROWS: Row[] = [
    { name: 'v=10 th=30deg', speed: 10, thetaDeg: 30 },
    { name: 'v=12 th=52deg', speed: 12, thetaDeg: 52 },
  ]

  it.each(ROWS)('$name follows y(x) parabola and lands at v^2 sin(2A)/g', async ({ speed, thetaDeg }) => {
    const rad = (thetaDeg * Math.PI) / 180
    const v0x = speed * Math.cos(rad)
    const v0y = speed * Math.sin(rad)
    const MASS = 2
    const radius = 0.3
    const ground = groundBody()
    const groundRect = ground as Extract<typeof ground, { shape: 'rectangle' }>
    const launchHeight = groundRect.position.y + groundRect.height / 2
    const launchPosition = { x: 0, y: launchHeight + radius }
    const sim = await createSimulator({
      version: 1,
      constants: { g: G },
      bodies: [
        ground,
        {
          id: 'shot',
          shape: 'circle',
          radius,
          fixed: false,
          mass: MASS,
          position: launchPosition,
          rotation: 0,
          vx: v0x,
          vy: v0y,
        },
      ],
      forces: [],
      contacts: [],
    })

    const s0 = sim.readStates().get('shot')!
    expect(Math.abs(s0.linvel.x - v0x)).toBeLessThanOrEqual(1e-6)
    expect(Math.abs(s0.linvel.y - v0y)).toBeLessThanOrEqual(1e-6)

    // Parabola sampled at 3 points (closed form, written before running):
    //   y(x) = x tan(theta) - g x^2 / (2 v0x^2)
    // Rapier's semi-implicit fixed-timestep integration lags the closed form
    // by at most 1/2*g*TIMESTEP*t in y; retain only a small solver slack.
    let stepped = 0
    for (const totalTicks of [18, 30, 42]) {
      while (stepped < totalTicks) {
        sim.step()
        stepped++
      }
      const s = sim.readStates().get('shot')!
      const xr = s.position.x - s0.position.x
      const yr = s.position.y - s0.position.y
      const yPred = xr * Math.tan(rad) - (G * xr * xr) / (2 * v0x * v0x)
      const integrationSlack = 0.5 * G * TIMESTEP * (totalTicks * TIMESTEP)
      expect(Math.abs(yr - yPred)).toBeLessThanOrEqual(0.01 + integrationSlack)
    }

    // Range at re-crossing of launch height: R = v^2 sin(2 theta)/g, which is
    // identically 2 v0x v0y / g. The launch Body must descend into the shared
    // ground collider; a bottomless Scene that merely falls below its start
    // height is not an accepted landing.
    const rangeExpected = (2 * v0x * v0y) / G
    let prev = s0
    let descending = false
    let landed = false
    let xAtHeight: number | undefined
    const hasGroundContact = (): boolean =>
      sim.readContacts().some((c) => {
        const pair = new Set([c.aId, c.bId])
        return pair.has('shot') && pair.has('chao')
      })
    for (let guard = 0; !landed && guard < 400; guard++) {
      sim.step()
      const cur = sim.readStates().get('shot')!
      if (!descending && cur.position.y < prev.position.y) descending = true
      if (descending && xAtHeight === undefined && prev.position.y > s0.position.y && cur.position.y <= s0.position.y + 0.002) {
        const denom = prev.position.y - cur.position.y
        const frac = denom === 0 ? 0 : (prev.position.y - s0.position.y) / denom
        xAtHeight = prev.position.x + Math.max(0, Math.min(1, frac)) * (cur.position.x - prev.position.x)
      }
      if (descending && hasGroundContact()) {
        const xLand = xAtHeight ?? cur.position.x
        expect(cur.position.y).toBeGreaterThanOrEqual(s0.position.y - 0.01)
        expect(Math.abs(xLand - s0.position.x - rangeExpected)).toBeLessThanOrEqual(0.02 * rangeExpected)
        landed = true
      } else {
        prev = cur
      }
    }
    expect(descending).toBe(true)
    expect(landed).toBe(true)
  })
})

describe('acceptance: wedge equilibrium (flagship)', () => {
  it('F=(M+m)g tanA on the wedge holds the block fixed on its face; both share a=F/(M+m)', async () => {
    // Closed forms (written before running):
    //   A = g*tan(alpha)          required wedge accel for face-equilibrium
    //   F = (M+m)*A               horizontal force achieving it system-wide
    // Geometry: slope rises to +x, so equilibrium needs acceleration in -x
    // (pseudo-force +A*x then balances gravity along the slope).
    const ALPHA = 30
    const rad = (ALPHA * Math.PI) / 180
    const A = G * Math.tan(rad)
    const MW = 10
    const MB = 2
    const F = (MW + MB) * A
    const BASE = 24
    const H = BASE * Math.tan(rad)
    const f = slopeFrame(ALPHA)
    const D = 8
    const RADIUS = 0.5
    const sim = await createSimulator({
      version: 1,
      constants: { g: G },
      bodies: [
        { id: 'ground', shape: 'rectangle', width: 800, height: 2, fixed: true, mass: 1000, position: { x: 0, y: -1 }, rotation: 0 },
        { id: 'wedge', shape: 'triangle', base: BASE, alpha: ALPHA, fixed: false, mass: MW, position: { x: -12, y: 0 }, rotation: 0 },
        {
          id: 'ball',
          shape: 'circle',
          radius: RADIUS,
          fixed: false,
          mass: MB,
          position: {
            x: -12 + D * f.ux + RADIUS * f.nx,
            y: D * f.uy + RADIUS * f.ny,
          },
          rotation: 0,
        },
      ],
      forces: [
        {
          id: 'push',
          bodyId: 'wedge',
          // The triangle's COM sits at its centroid, NOT the body origin;
          // pushing at the origin would apply spurious torque. Anchor at the
          // centroid so the force is torque-free.
          anchor: { x: (2 * BASE) / 3, y: H / 3 },
          magnitude: F,
          direction: 180,
        },
      ],
      contacts: [
        { a: 'ground', b: 'wedge', muS: 0, muK: 0 },
        { a: 'wedge', b: 'ball', muS: 0, muK: 0 },
      ],
    })
    // Initial-tangency guard (relative form): exact placement means the
    // block-to-wedge offset cannot move meaningfully in one tick — no
    // pop-out from pre-penetration hiding in the settle window.
    const st0 = sim.readStates()
    const rel0x = st0.get('ball')!.position.x - st0.get('wedge')!.position.x
    const rel0y = st0.get('ball')!.position.y - st0.get('wedge')!.position.y
    sim.step()
    const stT1 = sim.readStates()
    const rel1x = stT1.get('ball')!.position.x - stT1.get('wedge')!.position.x
    const rel1y = stT1.get('ball')!.position.y - stT1.get('wedge')!.position.y
    expect(Math.hypot(rel1x - rel0x, rel1y - rel0y)).toBeLessThanOrEqual(0.002)
    for (let i = 0; i < 29; i++) sim.step()
    const s1 = sim.readStates()
    for (let i = 0; i < 60; i++) sim.step()
    const s2 = sim.readStates()
    // Face-position hold: block-to-wedge offset drifts < 1 cm over the 1 s window.
    const relX1 = s1.get('ball')!.position.x - s1.get('wedge')!.position.x
    const relY1 = s1.get('ball')!.position.y - s1.get('wedge')!.position.y
    const relX2 = s2.get('ball')!.position.x - s2.get('wedge')!.position.x
    const relY2 = s2.get('ball')!.position.y - s2.get('wedge')!.position.y
    expect(Math.hypot(relX2 - relX1, relY2 - relY1)).toBeLessThanOrEqual(0.01)
    // Shared horizontal accel: dvx = -A per window second, 4% tolerance
    // (contact-transient noise at start of window dominates).
    const dvxWedge = s2.get('wedge')!.linvel.x - s1.get('wedge')!.linvel.x
    const dvxBall = s2.get('ball')!.linvel.x - s1.get('ball')!.linvel.x
    expect(Math.abs(dvxWedge + A * (60 * TIMESTEP))).toBeLessThanOrEqual(0.04 * A)
    expect(Math.abs(dvxBall + A * (60 * TIMESTEP))).toBeLessThanOrEqual(0.04 * A)
    // Rigid coupling: block and wedge velocities agree to 2% of A.
    expect(Math.abs(s2.get('ball')!.linvel.x - s2.get('wedge')!.linvel.x)).toBeLessThanOrEqual(0.02 * A)
  })
})

describe('acceptance: perfectly-inelastic 1D collision', () => {
  it('head-on circles stick: v_post = momentum-conserving, dKE = 1/2 m_red v_rel^2', async () => {
    // Closed forms (written before running): with restitution 0 (engine
    // default, set explicitly in simulator.ts), post-impact velocities equal
    //   v'  = (m1 v1 + m2 v2)/(m1 + m2)         momentum conservation
    //   dKE = 1/2 * m_red * v_rel^2             m_red = m1 m2/(m1+m2)
    // Zero-g scene keeps the collision purely 1D (no ground needed); the
    // codec soft-warns on g=0, which is expected and harmless here.
    const M1 = 3
    const M2 = 2
    const V1 = 4
    const V2 = -2
    const LAUNCH_TICKS = 6
    const tImp = LAUNCH_TICKS * TIMESTEP
    const sim = await createSimulator({
      version: 1,
      constants: { g: 0 },
      bodies: [
        { id: 'c1', shape: 'circle', radius: 0.5, fixed: false, mass: M1, position: { x: -6, y: 0 }, rotation: 0 },
        { id: 'c2', shape: 'circle', radius: 0.5, fixed: false, mass: M2, position: { x: 6, y: 0 }, rotation: 0 },
      ],
      forces: [
        { id: 'l1', bodyId: 'c1', anchor: { x: 0, y: 0 }, magnitude: (M1 * V1) / tImp, direction: 0 },
        { id: 'l2', bodyId: 'c2', anchor: { x: 0, y: 0 }, magnitude: (-M2 * V2) / tImp, direction: 180 },
      ],
      contacts: [{ a: 'c1', b: 'c2', muS: 0, muK: 0 }],
    })
    for (let i = 0; i < LAUNCH_TICKS; i++) sim.step()
    sim.setForceMagnitude('l1', 0)
    sim.setForceMagnitude('l2', 0)

    // Impact-time granularity trick: PRE velocities are captured at the last
    // tick BEFORE center distance closes past touching (one-tick slop), and
    // POST is detected by velocity convergence rather than a fixed tick
    // offset, so the unknown exact impact tick never biases either sample.
    let prev = sim.readStates()
    let preV1 = 0
    let preV2 = 0
    let impactSeen = false
    let settled = false
    let post: ReturnType<typeof sim.readStates> | undefined
    for (let guard = 0; !settled && guard < 400; guard++) {
      sim.step()
      const cur = sim.readStates()
      const dx = cur.get('c2')!.position.x - cur.get('c1')!.position.x
      if (!impactSeen && dx <= 1.02) {
        impactSeen = true
        preV1 = prev.get('c1')!.linvel.x
        preV2 = prev.get('c2')!.linvel.x
      }
      if (impactSeen && Math.abs(cur.get('c1')!.linvel.x - cur.get('c2')!.linvel.x) <= 0.05) {
        settled = true
        post = cur
      } else {
        prev = cur
      }
    }
    expect(impactSeen).toBe(true)
    expect(settled).toBe(true)
    expect(preV1).toBeGreaterThan(V1 * 0.95)
    expect(preV2).toBeLessThan(V2 * 0.95)

    const vPrime = (M1 * preV1 + M2 * preV2) / (M1 + M2)
    // Tolerance 3% of |v'|: impulse resolution spans 1-2 solver ticks.
    expect(Math.abs(post!.get('c1')!.linvel.x - vPrime)).toBeLessThanOrEqual(0.03 * Math.abs(vPrime))
    expect(Math.abs(post!.get('c2')!.linvel.x - vPrime)).toBeLessThanOrEqual(0.03 * Math.abs(vPrime))

    const kePre = 0.5 * M1 * preV1 * preV1 + 0.5 * M2 * preV2 * preV2
    const kePost = 0.5 * M1 * post!.get('c1')!.linvel.x ** 2 + 0.5 * M2 * post!.get('c2')!.linvel.x ** 2
    const dkeTheory = 0.5 * ((M1 * M2) / (M1 + M2)) * (preV1 - preV2) ** 2
    // Tolerance 4% of dKE: same 1-2 tick impact-resolution window.
    expect(Math.abs(kePre - kePost - dkeTheory)).toBeLessThanOrEqual(0.04 * dkeTheory)
  })
})

/**
 * PHY-23 rope tracer. Both families hang from one pulley on a fixed body.
 * Closed forms written before running; rope length along the path is also
 * computed in closed form from the figure (vertical legs, horizontal leg,
 * wrapped arc), independent of the simulator's own geometry code.
 */
describe('acceptance: rope over a fixed pulley (PHY-23)', () => {
  const R = 0.25
  const PULLEY_Y = 5.25
  const HALF = 0.2 // blocks are 0.4 × 0.4; anchors sit mid top face

  function atwoodScene(m1: number, m2: number): Scene {
    return {
      version: 1,
      constants: { g: G },
      bodies: [
        { shape: 'rectangle', width: 4, height: 0.5, id: 'teto', fixed: true, mass: 0, position: { x: 0, y: 6 }, rotation: 0 },
        { shape: 'rectangle', width: 0.4, height: 0.4, id: 'a', fixed: false, mass: m1, position: { x: -R, y: 2 }, rotation: 0 },
        { shape: 'rectangle', width: 0.4, height: 0.4, id: 'b', fixed: false, mass: m2, position: { x: R, y: 1 }, rotation: 0 },
      ],
      forces: [],
      contacts: [],
      pulleys: [{ id: 'p', bodyId: 'teto', anchor: { x: 0, y: -0.75 }, radius: R }],
      constraints: [
        { id: 'corda', kind: 'rope', a: { bodyId: 'a', anchor: { x: 0, y: HALF } }, b: { bodyId: 'b', anchor: { x: 0, y: HALF } }, via: ['p'] },
      ],
    }
  }

  // Both legs hang vertically below the pulley's side tangent points.
  function atwoodLength(ya: number, yb: number): number {
    return PULLEY_Y - (ya + HALF) + Math.PI * R + (PULLEY_Y - (yb + HALF))
  }

  const tension = (sim: Awaited<ReturnType<typeof createSimulator>>) => sim.readConstraints().find((c) => c.id === 'corda') as RopeState

  it.each([
    { m1: 3, m2: 2 },
    { m1: 2.5, m2: 1.5 },
  ])('Atwood m1=$m1 m2=$m2: a = (m1−m2)g/(m1+m2), T = 2m1m2g/(m1+m2), rope length held', async ({ m1, m2 }) => {
    const aClosed = ((m1 - m2) * G) / (m1 + m2)
    const tClosed = (2 * m1 * m2 * G) / (m1 + m2)
    const sim = await createSimulator(atwoodScene(m1, m2))
    const L = atwoodLength(2, 1)
    let maxLengthError = 0
    const tick = (): void => {
      sim.step()
      const s = sim.readStates()
      maxLengthError = Math.max(maxLengthError, Math.abs(atwoodLength(s.get('a')!.position.y, s.get('b')!.position.y) - L))
    }
    for (let i = 0; i < 30; i++) tick()
    const s1 = sim.readStates()
    const tensions: number[] = []
    for (let i = 0; i < 60; i++) {
      tick()
      tensions.push(tension(sim).tension)
    }
    const s2 = sim.readStates()
    const dvA = s2.get('a')!.linvel.y - s1.get('a')!.linvel.y
    const dvB = s2.get('b')!.linvel.y - s1.get('b')!.linvel.y
    // Heavier block down, lighter up, both at the same |a|; window = 1 s.
    expect(Math.abs(-dvA - aClosed * 60 * TIMESTEP)).toBeLessThanOrEqual(0.02 * aClosed)
    expect(Math.abs(dvB - aClosed * 60 * TIMESTEP)).toBeLessThanOrEqual(0.02 * aClosed)
    for (const t of tensions) expect(Math.abs(t - tClosed)).toBeLessThanOrEqual(0.02 * tClosed)
    expect(tension(sim).slack).toBe(false)
    expect(maxLengthError).toBeLessThan(0.001)
  })

  it.each([
    { m1: 2, m2: 1, muK: 0.2 },
    { m1: 2, m2: 1, muK: 0.1 },
  ])('block on table m1=$m1 pulled by hanging m2=$m2, muK=$muK: a = (m2 − muK m1)g/(m1+m2), T = m2(g − a)', async ({ m1, m2, muK }) => {
    const aClosed = ((m2 - muK * m1) * G) / (m1 + m2)
    const tClosed = m2 * (G - aClosed)
    // Table top at y = 0, right edge at x = 4. Pulley (r = 0.2) past the edge
    // at (4.2, 0), so the rope leaves the block horizontally at y = 0.2, wraps
    // a quarter turn and drops to the hanging block clear of the table.
    const r = 0.2
    const HB = 0.15 // hanging block is 0.3 × 0.3
    const sim = await createSimulator({
      version: 1,
      constants: { g: G },
      bodies: [
        { shape: 'rectangle', width: 8, height: 1, id: 'mesa', fixed: true, mass: 0, position: { x: 0, y: -0.5 }, rotation: 0 },
        { shape: 'rectangle', width: 0.4, height: 0.4, id: 'a', fixed: false, mass: m1, position: { x: -2, y: 0.2 }, rotation: 0 },
        { shape: 'rectangle', width: 0.3, height: 0.3, id: 'b', fixed: false, mass: m2, position: { x: 4.4, y: -1.5 }, rotation: 0 },
      ],
      forces: [],
      contacts: [{ a: 'mesa', b: 'a', muS: muK, muK }],
      pulleys: [{ id: 'p', bodyId: 'mesa', anchor: { x: 4.2, y: 0.5 }, radius: r }],
      constraints: [
        { id: 'corda', kind: 'rope', a: { bodyId: 'a', anchor: { x: 0.2, y: 0 } }, b: { bodyId: 'b', anchor: { x: 0, y: HB } }, via: ['p'] },
      ],
    })
    const pathLength = (xa: number, yb: number): number => 4.2 - (xa + 0.2) + (Math.PI / 2) * r + (0 - (yb + HB))
    const L = pathLength(-2, -1.5)
    let maxLengthError = 0
    const tick = (): void => {
      sim.step()
      const s = sim.readStates()
      maxLengthError = Math.max(maxLengthError, Math.abs(pathLength(s.get('a')!.position.x, s.get('b')!.position.y) - L))
    }
    for (let i = 0; i < 30; i++) tick()
    const s1 = sim.readStates()
    const tensions: number[] = []
    for (let i = 0; i < 60; i++) {
      tick()
      tensions.push(tension(sim).tension)
    }
    const s2 = sim.readStates()
    const dvA = s2.get('a')!.linvel.x - s1.get('a')!.linvel.x
    const dvB = s2.get('b')!.linvel.y - s1.get('b')!.linvel.y
    expect(Math.abs(dvA - aClosed * 60 * TIMESTEP)).toBeLessThanOrEqual(0.05 * aClosed)
    expect(Math.abs(-dvB - aClosed * 60 * TIMESTEP)).toBeLessThanOrEqual(0.05 * aClosed)
    for (const t of tensions) expect(Math.abs(t - tClosed)).toBeLessThanOrEqual(0.05 * tClosed)
    // The block stays on the table: the rope pulls along it, never lifts it.
    expect(Math.abs(s2.get('a')!.position.y - 0.2)).toBeLessThan(0.005)
    expect(maxLengthError).toBeLessThan(0.001)
  })

  it('the constraint readout lists every rope by id, taut with T > 0 once the scene runs', async () => {
    const sim = await createSimulator(atwoodScene(3, 2))
    sim.step()
    expect(sim.readConstraints()).toStrictEqual([
      { id: 'corda', kind: 'rope', tension: expect.any(Number), slack: false, segments: [expect.any(Number), expect.any(Number)], path: expect.any(Object) },
    ])
    expect(tension(sim).tension).toBeGreaterThan(0)
    // PHY-25: over a massless pulley every segment reads the one T.
    expect(tension(sim).segments).toStrictEqual([tension(sim).tension, tension(sim).tension])
  })

  it.each(PHY45_GRID)('PHY-45: $name over an ideal pulley gains no energy and the block stays on its side of the disk', async ({ m1, m2, vy }) => {
    const { energyGain, crossings } = await phy45Run(atwoodScene(m1, m2), vy)
    expect(energyGain).toBeLessThanOrEqual(0.5)
    expect(crossings).toStrictEqual([])
  })

  /**
   * PHY-54: the table scene, table top at y = 0 and right edge at x = 4, a pulley
   * (r = 0.2) past the edge at (4.2, 0). Block `a` (0.4 × 0.4) is pulled to the
   * pulley by `b` (0.3 × 0.3) hanging clear of the table, and rides over the pulley.
   */
  function tableScene(m1: number, m2: number, mu: number, vx?: number): Scene {
    return {
      version: 1,
      constants: { g: G },
      bodies: [
        { shape: 'rectangle', width: 8, height: 1, id: 'mesa', fixed: true, mass: 0, position: { x: 0, y: -0.5 }, rotation: 0 },
        { shape: 'rectangle', width: 0.4, height: 0.4, id: 'a', fixed: false, mass: m1, position: { x: -2, y: 0.2 }, rotation: 0, ...(vx === undefined ? {} : { vx }) },
        { shape: 'rectangle', width: 0.3, height: 0.3, id: 'b', fixed: false, mass: m2, position: { x: 4.4, y: -1.5 }, rotation: 0 },
      ],
      forces: [],
      contacts: [{ a: 'mesa', b: 'a', muS: mu, muK: mu }],
      pulleys: [{ id: 'p', bodyId: 'mesa', anchor: { x: 4.2, y: 0.5 }, radius: 0.2 }],
      constraints: [
        { id: 'corda', kind: 'rope', a: { bodyId: 'a', anchor: { x: 0.2, y: 0 } }, b: { bodyId: 'b', anchor: { x: 0, y: 0.15 } }, via: ['p'] },
      ],
    }
  }

  /** The movable rectangles' ½mv² + ½Iω² + mgy, I = m(w² + h²)/12, written here and not read from the simulator. */
  function movableEnergy(sim: Awaited<ReturnType<typeof createSimulator>>, scene: Scene): number {
    let total = 0
    for (const [id, state] of sim.readStates()) {
      const body = scene.bodies.find((b) => b.id === id)!
      if (body.fixed || body.shape !== 'rectangle') continue
      const inertia = (body.mass * (body.width ** 2 + body.height ** 2)) / 12
      total += 0.5 * body.mass * (state.linvel.x ** 2 + state.linvel.y ** 2) + 0.5 * inertia * state.angvel ** 2 + body.mass * G * state.position.y
    }
    return total
  }

  async function maxEnergyGain(scene: Scene): Promise<number> {
    const sim = await createSimulator(parse(scene))
    const e0 = movableEnergy(sim, scene)
    let gain = -Infinity
    for (let step = 1; step <= 600; step++) {
      sim.step()
      gain = Math.max(gain, movableEnergy(sim, scene) - e0)
    }
    return gain
  }

  it.each([
    ...[2, 3, 4].map((m2) => ({ m1: 1, m2, mu: 3, vx: undefined as number | undefined })),
    { m1: 2, m2: 3, mu: 3, vx: undefined },
    { m1: 1, m2: 1.5, mu: 3, vx: undefined },
    { m1: 1, m2: 2, mu: 1, vx: undefined },
    { m1: 1, m2: 2, mu: 0.5, vx: undefined },
    { m1: 2, m2: 1, mu: 0.2, vx: undefined },
    { m1: 2, m2: 1, mu: 0.2, vx: 6 },
    { m1: 1, m2: 2, mu: 3, vx: 4 },
    { m1: 1, m2: 1, mu: 0.1, vx: 8 },
  ])('PHY-54: table $m1/$m2, μ = $mu, vx = $vx: the block rides over an ideal pulley and the blocks never gain more than 0.5 J', async ({ m1, m2, mu, vx }) => {
    expect(await maxEnergyGain(tableScene(m1, m2, mu, vx))).toBeLessThanOrEqual(0.5)
  })

  it('PHY-54: a rope solved in a group with a tether never reaches past its length once the block rides over the pulley', async () => {
    // Block `c` trails `a` on a short rope, so the two ropes share `a` and are solved together; the energy
    // cannot show a rope that stretches here (the correction only drains it), so the ends' distance does.
    const scene = tableScene(2, 1, 0.2)
    scene.bodies.push({ shape: 'rectangle', width: 0.4, height: 0.4, id: 'c', fixed: false, mass: 0.5, position: { x: -3, y: 0.2 }, rotation: 0 })
    scene.contacts.push({ a: 'mesa', b: 'c', muS: 0.2, muK: 0.2 })
    scene.constraints!.push({ id: 'cabo', kind: 'rope', a: { bodyId: 'c', anchor: { x: 0.2, y: 0 } }, b: { bodyId: 'a', anchor: { x: -0.2, y: 0 } }, via: [] })
    const sim = await createSimulator(parse(scene))
    const anchor = (id: string, local: { x: number; y: number }): { x: number; y: number } => {
      const s = sim.readStates().get(id)!
      return {
        x: s.position.x + local.x * Math.cos(s.rotation) - local.y * Math.sin(s.rotation),
        y: s.position.y + local.x * Math.sin(s.rotation) + local.y * Math.cos(s.rotation),
      }
    }
    // 6 m along the table to the pulley's top, a quarter turn of r = 0.2, 1.35 m down to b.
    const L = 6 + (Math.PI / 2) * 0.2 + 1.35
    let farthest = 0
    for (let step = 1; step <= 600; step++) {
      sim.step()
      const a = anchor('a', { x: 0.2, y: 0 })
      const b = anchor('b', { x: 0, y: 0.15 })
      farthest = Math.max(farthest, Math.hypot(a.x - b.x, a.y - b.y))
    }
    expect(farthest).toBeLessThanOrEqual(L + 0.01)
  })

  /**
   * CLEAN-25: the table scene with a second ideal pulley `q` (r = 0.2) on the
   * table at (4.6, −0.6) in the world. The rope goes over `p`, down the right
   * side of `q`, and drops straight to `b` at (4.8, −1.8).
   */
  function twoPulleyTableScene(m1: number, m2: number, mu: number, vx?: number): Scene {
    const scene = tableScene(m1, m2, mu, vx)
    scene.bodies = scene.bodies.map((body) => (body.id === 'b' ? { ...body, position: { x: 4.8, y: -1.8 } } : body))
    scene.pulleys!.push({ id: 'q', bodyId: 'mesa', anchor: { x: 4.6, y: -0.1 }, radius: 0.2 })
    scene.constraints = scene.constraints!.map((c) => (c.id === 'corda' ? { ...c, via: ['p', 'q'] } : c))
    return scene
  }

  it.each([
    { m1: 1, m2: 3, mu: 3 },
    { m1: 2, m2: 1, mu: 0.2 },
  ])('CLEAN-25: table $m1/$m2, μ = $mu, over two ideal pulleys: the blocks never gain more than 0.5 J', async ({ m1, m2, mu }) => {
    expect(await maxEnergyGain(twoPulleyTableScene(m1, m2, mu))).toBeLessThanOrEqual(0.5)
  })

  const pathOf = (sim: Awaited<ReturnType<typeof createSimulator>>) => (tension(sim) as RopeState & { path?: RopePath }).path

  it.each([
    { name: 'the PHY-54 table, 1/2 with μ = 3', scene: () => tableScene(1, 2, 3) },
    { name: 'the PHY-23 Atwood, 3/2', scene: () => atwoodScene(3, 2) },
  ])('PHY-56: before any step, the readout path of $name is the scenePath of the document', async ({ scene }) => {
    const doc = parse(scene())
    const sim = await createSimulator(doc)
    const rope = doc.constraints!.find((c) => c.kind === 'rope')!
    expect(pathOf(sim)).toStrictEqual(scenePath(doc, rope as Extract<typeof rope, { kind: 'rope' }>))
  })

  it('PHY-56: the table rope comes loose from the pulley and the readout path is the straight rope between the anchors the bodies show', async () => {
    const sim = await createSimulator(parse(tableScene(1, 2, 3)))
    const anchor = (id: string, local: { x: number; y: number }): { x: number; y: number } => {
      const s = sim.readStates().get(id)!
      return {
        x: s.position.x + local.x * Math.cos(s.rotation) - local.y * Math.sin(s.rotation),
        y: s.position.y + local.x * Math.sin(s.rotation) + local.y * Math.cos(s.rotation),
      }
    }
    let firstLoose = -1
    for (let step = 1; step <= 600; step++) {
      sim.step()
      const path = pathOf(sim)!
      const a = anchor('a', { x: 0.2, y: 0 })
      const b = anchor('b', { x: 0, y: 0.15 })
      expect(Math.abs(path.segments[0]!.from.x - a.x)).toBeLessThanOrEqual(1e-9)
      expect(Math.abs(path.segments[0]!.from.y - a.y)).toBeLessThanOrEqual(1e-9)
      expect(Math.abs(path.segments.at(-1)!.to.x - b.x)).toBeLessThanOrEqual(1e-9)
      expect(Math.abs(path.segments.at(-1)!.to.y - b.y)).toBeLessThanOrEqual(1e-9)
      if (path.arcs[0]!.sweep < 0) {
        if (firstLoose < 0) firstLoose = step
        expect(Math.abs(path.length - Math.hypot(a.x - b.x, a.y - b.y))).toBeLessThanOrEqual(1e-9)
      }
    }
    expect(firstLoose).toBeGreaterThan(0)
    expect(firstLoose).toBeLessThan(200)
  })

  /**
   * PHY-55: the PHY-54 and CLEAN-25 scenes with a disk of mass 2 on the pulley `grip`, so the rope grips it
   * (PHY-25). `vxB` launches `b` sideways. `arc` is the index of the grip's arc in the rope's path.
   */
  const gripScene = (scene: Scene, grip: 'p' | 'q', vxB?: number): Scene => {
    scene.pulleys = scene.pulleys!.map((pulley) => (pulley.id === grip ? { ...pulley, mass: 2 } : pulley))
    if (vxB !== undefined) scene.bodies = scene.bodies.map((body) => (body.id === 'b' ? { ...body, vx: vxB } : body))
    return scene
  }

  interface Phy55Run {
    m1: number
    m2: number
    mu: number
    vx: number | undefined
  }
  const PHY55_TABLE: Phy55Run[] = [
    ...[2, 3, 4].map((m2) => ({ m1: 1, m2, mu: 3, vx: undefined as number | undefined })),
    { m1: 2, m2: 3, mu: 3, vx: undefined },
    { m1: 1, m2: 1.5, mu: 3, vx: undefined },
    { m1: 1, m2: 2, mu: 1, vx: undefined },
    { m1: 1, m2: 2, mu: 0.5, vx: undefined },
    { m1: 2, m2: 1, mu: 0.2, vx: undefined },
    { m1: 2, m2: 1, mu: 0.2, vx: 6 },
    { m1: 1, m2: 2, mu: 3, vx: 4 },
    { m1: 1, m2: 1, mu: 0.1, vx: 8 },
  ]
  const PHY55_AWAY: Phy55Run[] = [
    { m1: 5, m2: 0.5, mu: 0, vx: 7 },
    { m1: 5, m2: 0.5, mu: 0, vx: 9 },
    { m1: 3, m2: 1, mu: 0, vx: 8 },
    { m1: 2, m2: 1, mu: 0.2, vx: 8 },
    { m1: 5, m2: 1, mu: 3, vx: 8 },
    { m1: 5, m2: 1, mu: 3, vx: 10 },
    { m1: 50, m2: 1, mu: 3, vx: 9 },
  ]
  const phy55Label = ({ m1, m2, mu, vx }: Phy55Run): string => `${m1}/${m2}, μ = ${mu}${vx === undefined ? '' : `, vx = ${vx}`}`
  const PHY55_TABLE_RUNS = PHY55_TABLE.map((run) => ({
    name: `table ${phy55Label(run)}`,
    arc: 0,
    scene: () => gripScene(tableScene(run.m1, run.m2, run.mu, run.vx), 'p'),
  }))
  const PHY55_MIXED_RUNS = (['A', 'B'] as const).flatMap((rope) =>
    PHY55_TABLE.filter((run) => !(rope === 'A' && run.m1 === 1 && run.m2 === 1 && run.mu === 0.1 && run.vx === 8)).map((run) => ({
      name: `rope ${rope}, ${phy55Label(run)}`,
      arc: rope === 'A' ? 1 : 0,
      scene: () => gripScene(twoPulleyTableScene(run.m1, run.m2, run.mu, run.vx), rope === 'A' ? 'q' : 'p'),
    })),
  )
  const PHY55_AWAY_RUNS = PHY55_AWAY.map((run) => ({
    name: `b launched, ${run.m1}/${run.m2}, μ = ${run.mu}, vx of b = ${run.vx}`,
    arc: 0,
    scene: () => gripScene(tableScene(run.m1, run.m2, run.mu), 'p', run.vx),
  }))

  it.each(PHY55_TABLE_RUNS)('PHY-55: $name: the block rides over a pulley with mass and the blocks never gain more than 0.5 J', async ({ scene }) => {
    expect(await maxEnergyGain(scene())).toBeLessThanOrEqual(0.5)
  })

  it.each(PHY55_MIXED_RUNS)('PHY-55: $name: over a pulley with mass and an ideal one, the blocks never gain more than 0.5 J', async ({ scene }) => {
    expect(await maxEnergyGain(scene())).toBeLessThanOrEqual(0.5)
  })

  it.each(PHY55_AWAY_RUNS)('PHY-55: $name: the rope leaves the disk and comes back, and the blocks never gain more than 0.5 J', async ({ scene }) => {
    expect(await maxEnergyGain(scene())).toBeLessThanOrEqual(0.5)
  })

  it.each([...PHY55_TABLE_RUNS, ...PHY55_MIXED_RUNS, ...PHY55_AWAY_RUNS])(
    'PHY-55: $name: while the rope is off the disk, every leg reads the one tension',
    async ({ scene, arc }) => {
      const sim = await createSimulator(parse(scene()))
      let loose = 0
      let split = 0
      for (let step = 1; step <= 600; step++) {
        sim.step()
        const rope = tension(sim)
        if (pathOf(sim)!.arcs[arc]!.sweep >= 0) continue
        loose++
        const legs = pathOf(sim)!.arcs.length + 1
        if (rope.segments.length !== legs || rope.segments.some((t) => t !== rope.tension)) split++
      }
      expect(loose).toBeGreaterThan(0)
      expect(split).toBe(0)
    },
  )

  /** PHY-57: the PHY-55 table 5/0.5, μ = 0, with `b` launched at `vxB` and a disk of mass `M` on the pulley. */
  const phy57Scene = (M: number, vxB: number): Scene => {
    const scene = gripScene(tableScene(5, 0.5, 0), 'p', vxB)
    scene.pulleys = scene.pulleys!.map((pulley) => ({ ...pulley, mass: M }))
    return scene
  }

  it.each([2, 5])('PHY-57: M = %d: the rope that comes back to the disk turns it again, (T_b − T_a) = (M/2)·aₓ', async (M) => {
    const sim = await createSimulator(parse(phy57Scene(M, 7)))
    let vxBefore = sim.readStates().get('a')!.linvel.x
    let worst = 0
    let checked = 0
    for (let step = 1; step <= 600; step++) {
      sim.step()
      const vx = sim.readStates().get('a')!.linvel.x
      const ax = (vx - vxBefore) / TIMESTEP
      vxBefore = vx
      if (step < 90 || step > 200) continue
      const [ta, tb] = tension(sim).segments
      if (ta! <= 0.5 || tb! <= 0.5) continue
      checked++
      worst = Math.max(worst, Math.abs(tb! - ta! - (M / 2) * ax))
    }
    expect(checked).toBeGreaterThanOrEqual(100)
    expect(worst).toBeLessThanOrEqual(0.05)
  })

  it.each([2, 5])('PHY-57: M = %d: the rope that comes back onto the disk is not short of L once it pulls', async (M) => {
    const sim = await createSimulator(parse(phy57Scene(M, 9)))
    const L = 6 + (Math.PI / 2) * 0.2 + 1.35
    let worst = 0
    for (let step = 1; step <= 600; step++) {
      sim.step()
      if (step < 95 || step > 195) continue
      const rope = tension(sim)
      if (rope.tension > 0.5) worst = Math.max(worst, Math.abs(pathOf(sim)!.length - L))
    }
    expect(worst).toBeLessThanOrEqual(0.1)
  })
})

/**
 * PHY-24: the general rope — pendulum, loop, slack, movable pulley, pulleys in
 * series. Every scene goes through the codec first, so a document the codec
 * rejects cannot pass here. Closed forms written before running; anchors sit
 * on each body's center of mass (PHY-34: an off-center rope end spins up).
 */
describe('acceptance: general rope (PHY-24)', () => {
  type Sim = Awaited<ReturnType<typeof createSimulator>>
  const load = (scene: Scene): Promise<Sim> => createSimulator(parse(scene))
  const rope = (sim: Sim) => sim.readConstraints().find((c) => c.id === 'corda') as RopeState
  const CM = { x: 0, y: 0 }

  it('two ropes supporting one particle hold equilibrium within 1 mm and each T within 1% of 49.29 N for 300 steps (PHY-41)', async () => {
    const sim = await load({
      version: 1,
      constants: { g: G, particleMode: true },
      bodies: [
        { shape: 'circle', radius: 0.02, id: 'esquerda', fixed: true, mass: 0, position: { x: -1, y: 0.1 }, rotation: 0 },
        { shape: 'circle', radius: 0.02, id: 'direita', fixed: true, mass: 0, position: { x: 1, y: 0.1 }, rotation: 0 },
        { shape: 'circle', radius: 0.05, id: 'bola', fixed: false, mass: 1, position: CM, rotation: 0 },
      ],
      forces: [],
      contacts: [],
      constraints: [
        { id: 'fio-esquerdo', kind: 'rope', a: { bodyId: 'esquerda', anchor: CM }, b: { bodyId: 'bola', anchor: CM }, via: [] },
        { id: 'fio-direito', kind: 'rope', a: { bodyId: 'direita', anchor: CM }, b: { bodyId: 'bola', anchor: CM }, via: [] },
      ],
    })
    // Textbook equilibrium: 2T sin(arctan(0.1)) = mg, T = 49.29 N.
    let maxDisplacement = 0
    let maxTensionError = 0
    let wentSlack = false
    for (let tick = 1; tick <= 300; tick++) {
      sim.step()
      const p = sim.readStates().get('bola')!.position
      maxDisplacement = Math.max(maxDisplacement, Math.hypot(p.x, p.y))
      for (const id of ['fio-esquerdo', 'fio-direito']) {
        const state = sim.readConstraints().find((c) => c.id === id) as RopeState
        wentSlack ||= state.slack
        if (tick >= 10) maxTensionError = Math.max(maxTensionError, Math.abs(state.tension - 49.29))
      }
    }
    expect(maxDisplacement).toBeLessThan(0.001)
    expect(maxTensionError).toBeLessThan(0.01 * 49.29)
    expect(wentSlack).toBe(false)
  })

  it('two collinear ropes keep their supported particle within 1 mm for 300 steps (PHY-41 R1)', async () => {
    const sim = await load({
      version: 1,
      constants: { g: G, particleMode: true },
      bodies: [
        { shape: 'circle', radius: 0.02, id: 'perto', fixed: true, mass: 0, position: { x: 0, y: 1 }, rotation: 0 },
        { shape: 'circle', radius: 0.02, id: 'longe', fixed: true, mass: 0, position: { x: 0, y: 2 }, rotation: 0 },
        { shape: 'circle', radius: 0.05, id: 'bola', fixed: false, mass: 1, position: CM, rotation: 0 },
      ],
      forces: [],
      contacts: [],
      constraints: [
        { id: 'fio-perto', kind: 'rope', a: { bodyId: 'perto', anchor: CM }, b: { bodyId: 'bola', anchor: CM }, via: [] },
        { id: 'fio-longe', kind: 'rope', a: { bodyId: 'longe', anchor: CM }, b: { bodyId: 'bola', anchor: CM }, via: [] },
      ],
    })
    let maxDisplacement = 0
    for (let tick = 0; tick < 300; tick++) {
      sim.step()
      const p = sim.readStates().get('bola')!.position
      maxDisplacement = Math.max(maxDisplacement, Math.hypot(p.x, p.y))
    }
    // Redundant ropes need not split mg uniquely, but must still support it.
    expect(maxDisplacement).toBeLessThan(0.001)
  })

  function anchoredParticleScene(length: number, angles: number[]): Scene {
    return {
      version: 1,
      constants: { g: G, particleMode: true },
      bodies: [
        ...angles.map((angle): Scene['bodies'][number] => ({
          shape: 'circle', radius: 0.02, id: `anchor-${angle}`, fixed: true, mass: 0,
          position: { x: length * Math.cos(angle * Math.PI / 180), y: length * Math.sin(angle * Math.PI / 180) }, rotation: 0,
        })),
        { shape: 'circle', radius: 0.05, id: 'bola', fixed: false, mass: 1, position: CM, rotation: 0 },
      ],
      forces: [],
      contacts: [],
      constraints: angles.map((angle) => ({
        id: `rope-${angle}`, kind: 'rope', a: { bodyId: `anchor-${angle}`, anchor: CM }, b: { bodyId: 'bola', anchor: CM }, via: [],
      })),
    }
  }

  it.each([
    { length: 1, angles: [90, 240, 300], tensions: [9.81, 0, 0] },
    { length: 10, angles: [200, 110, 300, 250], tensions: [0, 28.247, 19.322, 0] },
  ])('PHY-46: ropes at $angles hold equilibrium within 1 mm and tensions within 1% for 300 steps', async ({ length, angles, tensions }) => {
    const sim = await load(anchoredParticleScene(length, angles))
    let maxDisplacement = 0
    const errors = tensions.map(() => 0)
    const wentSlack = tensions.map(() => false)
    for (let tick = 1; tick <= 300; tick++) {
      sim.step()
      const p = sim.readStates().get('bola')!.position
      maxDisplacement = Math.max(maxDisplacement, Math.hypot(p.x, p.y))
      for (const [i, angle] of angles.entries()) {
        const state = sim.readConstraints().find((c) => c.id === `rope-${angle}`) as RopeState
        wentSlack[i] ||= state.slack
        if (tick >= 10) errors[i] = Math.max(errors[i]!, Math.abs(state.tension - tensions[i]!))
      }
    }
    expect(maxDisplacement).toBeLessThan(0.001)
    for (const [i, expected] of tensions.entries()) {
      if (expected === 0) expect(errors[i], `T at ${angles[i]} degrees`).toBe(0)
      else {
        expect(errors[i], `T at ${angles[i]} degrees`).toBeLessThan(0.01 * expected)
        expect(wentSlack[i], `slack at ${angles[i]} degrees`).toBe(false)
      }
    }
  })

  it('PHY-46: swinging particle never stretches any of its ropes at 10, 20 and 30 degrees beyond 1 mm for 300 steps', async () => {
    const length = 5
    const scene = anchoredParticleScene(length, [10, 20, 30])
    const sim = await load(scene)
    let maxDistance = 0
    for (let tick = 0; tick < 300; tick++) {
      sim.step()
      const p = sim.readStates().get('bola')!.position
      for (const anchor of scene.bodies.filter((body) => body.fixed)) {
        maxDistance = Math.max(maxDistance, Math.hypot(p.x - anchor.position.x, p.y - anchor.position.y))
      }
    }
    expect(maxDistance).toBeLessThanOrEqual(length + 0.001)
  })

  function pendulumScene(bob: { x: number; y: number }, vx = 0): Scene {
    return {
      version: 1,
      constants: { g: G },
      bodies: [
        { shape: 'circle', radius: 0.05, id: 'pivo', fixed: true, mass: 0, position: { x: 0, y: 0 }, rotation: 0 },
        { shape: 'circle', radius: 0.1, id: 'bola', fixed: false, mass: 1, position: bob, rotation: 0, vx },
      ],
      forces: [],
      contacts: [],
      constraints: [{ id: 'corda', kind: 'rope', a: { bodyId: 'pivo', anchor: CM }, b: { bodyId: 'bola', anchor: CM }, via: [] }],
    }
  }

  it('simple pendulum, θ₀ = 10°: period 2π√(L/g) within 2%, over 3 oscillations', async () => {
    const L = 1
    const theta0 = (10 * Math.PI) / 180
    const sim = await load(pendulumScene({ x: L * Math.sin(theta0), y: -L * Math.cos(theta0) }))
    // Upward zero crossings of x, interpolated inside the tick.
    const crossings: number[] = []
    let prevX = sim.readStates().get('bola')!.position.x
    for (let i = 1; crossings.length < 4 && i < 720; i++) {
      sim.step()
      const x = sim.readStates().get('bola')!.position.x
      if (prevX < 0 && x >= 0) crossings.push((i - 1 + -prevX / (x - prevX)) * TIMESTEP)
      prevX = x
    }
    expect(crossings).toHaveLength(4)
    const period = (crossings[3]! - crossings[0]!) / 3
    const expected = 2 * Math.PI * Math.sqrt(L / G)
    expect(Math.abs(period - expected)).toBeLessThanOrEqual(0.02 * expected)
  })

  it('loop with v_top² > gL: goes all the way round with T > 0 and the rope at L (±1 mm) every step (CLEAN-03)', async () => {
    const L = 1
    // v_top² = v₀² − 4gL = 2gL. The ±1 mm pins the substep factor φ: with φ = 1 the loop stretches ~12 mm.
    const sim = await load(pendulumScene({ x: 0, y: -L }, Math.sqrt(6 * G * L)))
    let swept = 0
    let prev = -Math.PI / 2
    let worst = 0
    const tensions: number[] = []
    for (let i = 0; swept < 2 * Math.PI && i < 300; i++) {
      sim.step()
      const p = sim.readStates().get('bola')!.position
      const phi = Math.atan2(p.y, p.x)
      let d = phi - prev
      if (d < -Math.PI) d += 2 * Math.PI
      if (d > Math.PI) d -= 2 * Math.PI
      swept += d
      prev = phi
      tensions.push(rope(sim).slack ? 0 : rope(sim).tension)
      worst = Math.max(worst, Math.abs(Math.hypot(p.x, p.y) - L))
    }
    expect(swept).toBeGreaterThanOrEqual(2 * Math.PI)
    expect(Math.min(...tensions)).toBeGreaterThan(0)
    expect(worst).toBeLessThanOrEqual(0.001)
  })

  it('loop with v_top² < gL: T = 0 near the top and the body falls inside the circle', async () => {
    const L = 1
    // v_top² would be 0.5 gL: the rope goes slack at sin α = 5/6 above the pivot.
    const sim = await load(pendulumScene({ x: 0, y: -L }, Math.sqrt(4.5 * G * L)))
    let slackNearTop = false
    let minDistance = Infinity
    for (let i = 0; i < 90; i++) {
      sim.step()
      const p = sim.readStates().get('bola')!.position
      if (rope(sim).slack && rope(sim).tension === 0 && p.y > 0.5 * L) slackNearTop = true
      if (slackNearTop) minDistance = Math.min(minDistance, Math.hypot(p.x, p.y))
    }
    expect(slackNearTop).toBe(true)
    expect(minDistance).toBeLessThan(L - 0.01)
  })

  it('slack: bodies pushed toward each other feel no rope; moving apart, it goes taut again at the same L (±1 mm)', async () => {
    // Zero g, two blocks passing each other 0.5 m apart vertically at 2 m/s
    // relative: the gap closes to 0.5 m at t = 1 s and reopens to L at t = 2 s.
    const L = Math.hypot(2, 0.5)
    const sim = await load({
      version: 1,
      constants: { g: 0 },
      bodies: [
        { shape: 'rectangle', width: 0.2, height: 0.2, id: 'a', fixed: false, mass: 1, position: { x: -1, y: -0.25 }, rotation: 0, vx: 1 },
        { shape: 'rectangle', width: 0.2, height: 0.2, id: 'b', fixed: false, mass: 1, position: { x: 1, y: 0.25 }, rotation: 0, vx: -1 },
      ],
      forces: [],
      contacts: [],
      constraints: [{ id: 'corda', kind: 'rope', a: { bodyId: 'a', anchor: CM }, b: { bodyId: 'b', anchor: CM }, via: [] }],
    })
    const distance = (): number => {
      const s = sim.readStates()
      const a = s.get('a')!.position
      const b = s.get('b')!.position
      return Math.hypot(b.x - a.x, b.y - a.y)
    }
    let maxDistance = 0
    for (let i = 1; i <= 240; i++) {
      sim.step()
      const d = distance()
      maxDistance = Math.max(maxDistance, d)
      const t = i * TIMESTEP
      if (t > 0.1 && t < 1.9) {
        expect(rope(sim).slack).toBe(true)
        expect(rope(sim).tension).toBe(0)
        expect(d).toBeLessThan(L)
        // The rope never pushes: the blocks keep their launch velocity.
        expect(sim.readStates().get('a')!.linvel.x).toBeCloseTo(1, 9)
      }
      if (t > 2.2) {
        expect(rope(sim).slack).toBe(false)
        expect(Math.abs(d - L)).toBeLessThanOrEqual(0.001)
      }
    }
    expect(maxDistance).toBeLessThanOrEqual(L + 0.001)
  })

  it('movable massless pulley: a_load = a_counterweight/2, T = 3Mmg/(M + 4m) within 2%', async () => {
    // Ceiling end → down to the movable pulley on the load M, half turn under
    // it → up over a fixed pulley → down to the counterweight m. With y up,
    // 2y_M + y_m is constant: a_M = (2m − M)g/(M + 4m), a_m = −2a_M.
    const M = 3
    const m = 1
    const r = 0.25
    const aLoad = ((2 * m - M) * G) / (M + 4 * m)
    const tClosed = (3 * M * m * G) / (M + 4 * m)
    const sim = await load({
      version: 1,
      constants: { g: G },
      bodies: [
        { shape: 'rectangle', width: 4, height: 0.5, id: 'teto', fixed: true, mass: 0, position: { x: 0, y: 10 }, rotation: 0 },
        { shape: 'rectangle', width: 0.3, height: 0.3, id: 'carga', fixed: false, mass: M, position: { x: 0, y: 4 }, rotation: 0 },
        { shape: 'rectangle', width: 0.2, height: 0.2, id: 'contrapeso', fixed: false, mass: m, position: { x: 0.75, y: 3 }, rotation: 0 },
      ],
      forces: [],
      contacts: [],
      pulleys: [
        { id: 'movel', bodyId: 'carga', anchor: CM, radius: r },
        { id: 'fixa', bodyId: 'teto', anchor: { x: 0.5, y: -0.5 }, radius: r },
      ],
      constraints: [
        {
          id: 'corda',
          kind: 'rope',
          a: { bodyId: 'teto', anchor: { x: -0.25, y: 0 } },
          b: { bodyId: 'contrapeso', anchor: CM },
          via: ['movel', 'fixa'],
        },
      ],
    })
    const pathLength = (yM: number, ym: number): number => 10 - yM + Math.PI * r + (9.5 - yM) + Math.PI * r + (9.5 - ym)
    const L = pathLength(4, 3)
    let maxLengthError = 0
    const tick = (): void => {
      sim.step()
      const s = sim.readStates()
      maxLengthError = Math.max(maxLengthError, Math.abs(pathLength(s.get('carga')!.position.y, s.get('contrapeso')!.position.y) - L))
    }
    for (let i = 0; i < 30; i++) tick()
    const s1 = sim.readStates()
    const tensions: number[] = []
    for (let i = 0; i < 60; i++) {
      tick()
      tensions.push(rope(sim).tension)
    }
    const s2 = sim.readStates()
    const dvM = s2.get('carga')!.linvel.y - s1.get('carga')!.linvel.y
    const dvm = s2.get('contrapeso')!.linvel.y - s1.get('contrapeso')!.linvel.y
    const window = 60 * TIMESTEP
    expect(Math.abs(dvM - aLoad * window)).toBeLessThanOrEqual(0.02 * Math.abs(aLoad) * window)
    expect(Math.abs(dvM + dvm / 2)).toBeLessThanOrEqual(0.02 * Math.abs(aLoad) * window)
    for (const t of tensions) expect(Math.abs(t - tClosed)).toBeLessThanOrEqual(0.02 * tClosed)
    expect(maxLengthError).toBeLessThan(0.001)
  })

  it('Atwood over two fixed pulleys in series: same a and T as over one pulley (2%)', async () => {
    const m1 = 3
    const m2 = 2
    const aClosed = ((m1 - m2) * G) / (m1 + m2)
    const tClosed = (2 * m1 * m2 * G) / (m1 + m2)
    const r = 0.25
    const TOP = { x: 0, y: 0.2 }
    const sim = await load({
      version: 1,
      constants: { g: G },
      bodies: [
        { shape: 'rectangle', width: 4, height: 0.5, id: 'teto', fixed: true, mass: 0, position: { x: 0, y: 6 }, rotation: 0 },
        { shape: 'rectangle', width: 0.4, height: 0.4, id: 'a', fixed: false, mass: m1, position: { x: -0.75, y: 2 }, rotation: 0 },
        { shape: 'rectangle', width: 0.4, height: 0.4, id: 'b', fixed: false, mass: m2, position: { x: 0.75, y: 1 }, rotation: 0 },
      ],
      forces: [],
      contacts: [],
      pulleys: [
        { id: 'p1', bodyId: 'teto', anchor: { x: -0.5, y: -1 }, radius: r },
        { id: 'p2', bodyId: 'teto', anchor: { x: 0.5, y: -1 }, radius: r },
      ],
      constraints: [{ id: 'corda', kind: 'rope', a: { bodyId: 'a', anchor: TOP }, b: { bodyId: 'b', anchor: TOP }, via: ['p1', 'p2'] }],
    })
    const pathLength = (ya: number, yb: number): number => 5 - (ya + 0.2) + (Math.PI / 2) * r + 1 + (Math.PI / 2) * r + (5 - (yb + 0.2))
    const L = pathLength(2, 1)
    let maxLengthError = 0
    const tick = (): void => {
      sim.step()
      const s = sim.readStates()
      maxLengthError = Math.max(maxLengthError, Math.abs(pathLength(s.get('a')!.position.y, s.get('b')!.position.y) - L))
    }
    for (let i = 0; i < 30; i++) tick()
    const s1 = sim.readStates()
    const tensions: number[] = []
    for (let i = 0; i < 60; i++) {
      tick()
      tensions.push(rope(sim).tension)
    }
    const s2 = sim.readStates()
    const dvA = s2.get('a')!.linvel.y - s1.get('a')!.linvel.y
    const dvB = s2.get('b')!.linvel.y - s1.get('b')!.linvel.y
    expect(Math.abs(-dvA - aClosed * 60 * TIMESTEP)).toBeLessThanOrEqual(0.02 * aClosed)
    expect(Math.abs(dvB - aClosed * 60 * TIMESTEP)).toBeLessThanOrEqual(0.02 * aClosed)
    for (const t of tensions) expect(Math.abs(t - tClosed)).toBeLessThanOrEqual(0.02 * tClosed)
    expect(maxLengthError).toBeLessThan(0.001)
  })
})

/**
 * PHY-25: a pulley with mass is a disk, I = ½MR², and the rope does not slip
 * on it. Closed forms written before running, from energy: the disk spins at
 * ω = v/R, so it adds ½Iω² = ¼Mv², M/2 to the inertia the rope drives. Every
 * scene goes through the codec first.
 */
describe('acceptance: pulley with mass (PHY-25)', () => {
  type Sim = Awaited<ReturnType<typeof createSimulator>>
  const load = (scene: Scene): Promise<Sim> => createSimulator(parse(scene))
  const rope = (sim: Sim) => sim.readConstraints().find((c) => c.id === 'corda') as RopeState
  const R = 0.25
  const TOP = { x: 0, y: 0.2 }
  const CM = { x: 0, y: 0 }
  const WINDOW = 60 * TIMESTEP
  const massOf = (M: number | undefined) => (M === undefined ? {} : { mass: M })

  function atwoodScene(m1: number, m2: number, M?: number): Scene {
    return {
      version: 1,
      constants: { g: G },
      bodies: [
        { shape: 'rectangle', width: 4, height: 0.5, id: 'teto', fixed: true, mass: 0, position: { x: 0, y: 6 }, rotation: 0 },
        { shape: 'rectangle', width: 0.4, height: 0.4, id: 'a', fixed: false, mass: m1, position: { x: -R, y: 2 }, rotation: 0 },
        { shape: 'rectangle', width: 0.4, height: 0.4, id: 'b', fixed: false, mass: m2, position: { x: R, y: 1 }, rotation: 0 },
      ],
      forces: [],
      contacts: [],
      pulleys: [{ id: 'p', bodyId: 'teto', anchor: { x: 0, y: -0.75 }, radius: R, ...massOf(M) }],
      constraints: [{ id: 'corda', kind: 'rope', a: { bodyId: 'a', anchor: TOP }, b: { bodyId: 'b', anchor: TOP }, via: ['p'] }],
    }
  }

  // PHY-24's movable pulley, now with mass M on the disk riding the load:
  // ceiling → under the disk → up over a massless fixed pulley → counterweight.
  function movableScene(m: number, M: number | undefined, m2: number): Scene {
    return {
      version: 1,
      constants: { g: G },
      bodies: [
        { shape: 'rectangle', width: 4, height: 0.5, id: 'teto', fixed: true, mass: 0, position: { x: 0, y: 10 }, rotation: 0 },
        { shape: 'rectangle', width: 0.3, height: 0.3, id: 'carga', fixed: false, mass: m, position: { x: 0, y: 4 }, rotation: 0 },
        { shape: 'rectangle', width: 0.2, height: 0.2, id: 'contrapeso', fixed: false, mass: m2, position: { x: 0.75, y: 3 }, rotation: 0 },
      ],
      forces: [],
      contacts: [],
      pulleys: [
        { id: 'movel', bodyId: 'carga', anchor: CM, radius: R, ...massOf(M) },
        { id: 'fixa', bodyId: 'teto', anchor: { x: 0.5, y: -0.5 }, radius: R },
      ],
      constraints: [
        { id: 'corda', kind: 'rope', a: { bodyId: 'teto', anchor: { x: -0.25, y: 0 } }, b: { bodyId: 'contrapeso', anchor: CM }, via: ['movel', 'fixa'] },
      ],
    }
  }

  it('Atwood over a fixed pulley of mass M: a = (m₁−m₂)g/(m₁+m₂+M/2), T₁ = m₁(g−a), T₂ = m₂(g+a) per segment, within 3%', async () => {
    const m1 = 3
    const m2 = 2
    const M = 2
    const aClosed = ((m1 - m2) * G) / (m1 + m2 + M / 2)
    const t1Closed = m1 * (G - aClosed)
    const t2Closed = m2 * (G + aClosed)
    const sim = await load(atwoodScene(m1, m2, M))
    for (let i = 0; i < 30; i++) sim.step()
    const s1 = sim.readStates()
    const segments: number[][] = []
    for (let i = 0; i < 60; i++) {
      sim.step()
      segments.push(rope(sim).segments)
    }
    const s2 = sim.readStates()
    const dvA = s2.get('a')!.linvel.y - s1.get('a')!.linvel.y
    const dvB = s2.get('b')!.linvel.y - s1.get('b')!.linvel.y
    expect(Math.abs(-dvA - aClosed * WINDOW)).toBeLessThanOrEqual(0.03 * aClosed * WINDOW)
    expect(Math.abs(dvB - aClosed * WINDOW)).toBeLessThanOrEqual(0.03 * aClosed * WINDOW)
    // Segment 0 runs from end a (m₁) to the pulley, segment 1 on to end b (m₂).
    for (const [t1, t2] of segments) {
      expect(Math.abs(t1! - t1Closed)).toBeLessThanOrEqual(0.03 * t1Closed)
      expect(Math.abs(t2! - t2Closed)).toBeLessThanOrEqual(0.03 * t2Closed)
    }
    expect(rope(sim).slack).toBe(false)
  })

  it('PHY-43: launching a upward leaves b supported by the massive pulley with T₂ = M·a/2, within 3%', async () => {
    const m = 2
    const M = 2
    const aClosed = (m * G) / (m + M / 2)
    const tClosed = (M * aClosed) / 2
    const scene = atwoodScene(m, m, M)
    scene.bodies.find((body) => body.id === 'a')!.vy = 6
    const sim = await load(scene)
    let v30 = 0
    for (let step = 1; step <= 40; step++) {
      sim.step()
      if (step === 30) v30 = sim.readStates().get('b')!.linvel.y
      if (step < 30) continue
      const state = rope(sim)
      expect(state.segments, `segments at step ${step}`).toHaveLength(2)
      expect(state.segments[0], `T₁ at step ${step}`).toBe(0)
      expect(Math.abs(state.segments[1]! - tClosed), `T₂ at step ${step}`).toBeLessThanOrEqual(0.03 * tClosed)
      expect(state.slack, `slack at step ${step}`).toBe(false)
    }
    const dvB = sim.readStates().get('b')!.linvel.y - v30
    expect(Math.abs(dvB + aClosed * 10 * TIMESTEP)).toBeLessThanOrEqual(0.03 * aClosed * 10 * TIMESTEP)
  })

  it('a massive pulley on a horizontally moving mount preserves vertical motion and tensions under a Galilean boost (CLEAN-17)', async () => {
    const scene = atwoodScene(3, 2, 2)
    // All bodies are free to translate; an upward force keeps the rope loaded.
    // A common horizontal velocity changes neither vertical motion nor tension.
    scene.bodies = scene.bodies.map((body) => ({ ...body, fixed: false, mass: body.id === 'teto' ? 10 : body.mass }))
    scene.forces = [{ id: 'lift', bodyId: 'teto', anchor: CM, magnitude: 200, direction: 90 }]
    const still = await load(scene)
    const speed = 2
    const moving = await load({ ...scene, bodies: scene.bodies.map((body) => ({ ...body, vx: speed })) })
    for (let tick = 1; tick <= 60; tick++) {
      still.step()
      moving.step()
      const reference = still.readStates()
      for (const [id, state] of moving.readStates()) {
        const expected = reference.get(id)!
        expect(Math.abs(state.position.x - expected.position.x - speed * tick * TIMESTEP)).toBeLessThanOrEqual(0.001)
        expect(Math.abs(state.position.y - expected.position.y)).toBeLessThanOrEqual(0.001)
        expect(Math.abs(state.linvel.y - expected.linvel.y)).toBeLessThanOrEqual(0.001)
      }
      const tensions = rope(still).segments
      expect(rope(still).slack).toBe(false)
      for (const [leg, tension] of rope(moving).segments.entries()) {
        expect(Math.abs(tension - tensions[leg]!)).toBeLessThanOrEqual(0.03 * tensions[leg]!)
      }
    }
  })

  it('movable pulley of mass M on a load m, counterweight m₂: a = g(m + M − 2m₂)/(m + 3M/2 + 4m₂) within 3%', async () => {
    // With y up, 2y_load + y_counterweight is constant; the disk spins at
    // ω = v_load/R (the ceiling leg is still), and its weight rides the load.
    const m = 3
    const M = 2
    // m₂ = 1 would lift the counterweight past the fixed pulley's axle inside the window.
    const m2 = 2
    const aLoad = (-G * (m + M - 2 * m2)) / (m + 1.5 * M + 4 * m2)
    const tCounterweight = m2 * (G - 2 * aLoad)
    const sim = await load(movableScene(m, M, m2))
    for (let i = 0; i < 30; i++) sim.step()
    const s1 = sim.readStates()
    const segments: number[][] = []
    for (let i = 0; i < 60; i++) {
      sim.step()
      segments.push(rope(sim).segments)
    }
    const s2 = sim.readStates()
    const dvLoad = s2.get('carga')!.linvel.y - s1.get('carga')!.linvel.y
    const dvCounterweight = s2.get('contrapeso')!.linvel.y - s1.get('contrapeso')!.linvel.y
    expect(Math.abs(dvLoad - aLoad * WINDOW)).toBeLessThanOrEqual(0.03 * Math.abs(aLoad) * WINDOW)
    expect(Math.abs(dvCounterweight + 2 * aLoad * WINDOW)).toBeLessThanOrEqual(0.03 * 2 * Math.abs(aLoad) * WINDOW)
    // Three legs; the fixed pulley is massless, so its two legs read the same T.
    for (const s of segments) {
      expect(s).toHaveLength(3)
      expect(Math.abs(s[2]! - tCounterweight)).toBeLessThanOrEqual(0.03 * tCounterweight)
    }
  })

  it.each([
    { name: 'Atwood 3 / 2 kg', scene: (M?: number) => atwoodScene(3, 2, M) },
    { name: 'movable pulley 3 kg / 1 kg', scene: (M?: number) => movableScene(3, M, 1) },
  ])('$name: mass 0 runs bit for bit like no mass', async ({ scene }) => {
    const ideal = await load(scene())
    const zero = await load(scene(0))
    for (let i = 0; i < 90; i++) {
      ideal.step()
      zero.step()
      expect(zero.readStates()).toStrictEqual(ideal.readStates())
      expect(zero.readConstraints()).toStrictEqual(ideal.readConstraints())
    }
  })

  it.each([
    { name: 'Atwood 1 / 3 kg', m1: 1, m2: 3, steps: 160 },
    { name: 'Atwood 3 / 2 kg', m1: 3, m2: 2, steps: 300 },
  ])('PHY-49: $name released from rest keeps T₁ and T₂ constant within 1% while the disk spins up', async ({ m1, m2, steps }) => {
    const M = 2
    const a = ((m2 - m1) * G) / (m1 + m2 + M / 2)
    const scene = atwoodScene(m1, m2, M)
    scene.bodies.find((body) => body.id === 'teto')!.position.y = 40
    const sim = await load(scene)
    for (let step = 1; step <= steps; step++) {
      sim.step()
      const [t1, t2] = rope(sim).segments
      expect(Math.abs(t1! - m1 * (G + a)), `T₁ at step ${step}`).toBeLessThanOrEqual(0.01 * m1 * Math.abs(G + a))
      expect(Math.abs(t2! - m2 * (G - a)), `T₂ at step ${step}`).toBeLessThanOrEqual(0.01 * m2 * Math.abs(G - a))
    }
    const t = steps * TIMESTEP
    expect(Math.abs(sim.readStates().get('a')!.linvel.y - a * t)).toBeLessThanOrEqual(0.01 * Math.abs(a * t))
  })

  it.each(PHY45_GRID)('PHY-45: $name over a pulley of mass M = 2 gains no energy and the block stays on its side of the disk', async ({ m1, m2, vy }) => {
    const { energyGain, crossings } = await phy45Run(atwoodScene(m1, m2, 2), vy)
    expect(energyGain).toBeLessThanOrEqual(0.5)
    expect(crossings).toStrictEqual([])
  })

  it.each([
    { m1: 2, m2: 1, mu: 0.8 },
    { m1: 3, m2: 2, mu: 1 },
  ])('PHY-52: friction holds table mass $m1 under hanging mass $m2 with mu=$mu and M = 2, within 1 mm and each T within 1%', async ({ m1, m2, mu }) => {
    // PHY-23's table geometry; friction supports the load without tipping:
    // mu·m1·g > m2·g and the horizontal tension m2·g < m1·g.
    const sim = await load({
      version: 1,
      constants: { g: G },
      bodies: [
        { shape: 'rectangle', width: 8, height: 1, id: 'mesa', fixed: true, mass: 0, position: { x: 0, y: -0.5 }, rotation: 0 },
        { shape: 'rectangle', width: 0.4, height: 0.4, id: 'a', fixed: false, mass: m1, position: { x: -2, y: 0.2 }, rotation: 0 },
        { shape: 'rectangle', width: 0.3, height: 0.3, id: 'b', fixed: false, mass: m2, position: { x: 4.4, y: -1.5 }, rotation: 0 },
      ],
      forces: [],
      contacts: [{ a: 'mesa', b: 'a', muS: mu, muK: mu }],
      pulleys: [{ id: 'p', bodyId: 'mesa', anchor: { x: 4.2, y: 0.5 }, radius: 0.2, mass: 2 }],
      constraints: [
        { id: 'corda', kind: 'rope', a: { bodyId: 'a', anchor: { x: 0.2, y: 0 } }, b: { bodyId: 'b', anchor: { x: 0, y: 0.15 } }, via: ['p'] },
      ],
    })
    const tClosed = m2 * G
    for (let step = 1; step <= 300; step++) {
      sim.step()
      if (step < 30) continue
      const segments = rope(sim).segments
      expect(segments).toHaveLength(2)
      for (const [leg, t] of segments.entries()) {
        expect(Math.abs(t - tClosed), `T${leg + 1} at step ${step}`).toBeLessThanOrEqual(0.01 * tClosed)
      }
    }
    expect(Math.abs(sim.readStates().get('a')!.position.x + 2), 'table displacement at step 300').toBeLessThan(0.001)
  })

  // Rapier caps |ω|·Δt at π/4 on every body: 15π ≈ 47.1 rad/s at 60 Hz. Each run ends well past it.
  it.each([
    { name: 'Atwood 1 / 3 kg, M = 2', m1: 1, m2: 3, M: 2, steps: 250 },
    { name: 'Atwood 3 / 1 kg, M = 2', m1: 3, m2: 1, M: 2, steps: 250 },
    { name: 'Atwood 1 / 3 kg, M = 0.2', m1: 1, m2: 3, M: 0.2, steps: 230 },
  ])('PHY-50: $name keeps T₁ and T₂ constant within 1% and v = a·t after the disk passes 15π rad/s', async ({ m1, m2, M, steps }) => {
    const a = ((m2 - m1) * G) / (m1 + m2 + M / 2)
    const scene = atwoodScene(m1, m2, M)
    scene.bodies.find((body) => body.id === 'teto')!.position.y = 40
    const sim = await load(scene)
    for (let step = 1; step <= steps; step++) {
      sim.step()
      const [t1, t2] = rope(sim).segments
      expect(Math.abs(t1! - m1 * (G + a)), `T₁ at step ${step}`).toBeLessThanOrEqual(0.01 * m1 * Math.abs(G + a))
      expect(Math.abs(t2! - m2 * (G - a)), `T₂ at step ${step}`).toBeLessThanOrEqual(0.01 * m2 * Math.abs(G - a))
    }
    const t = steps * TIMESTEP
    expect(Math.abs(sim.readStates().get('a')!.linvel.y - a * t)).toBeLessThanOrEqual(0.01 * Math.abs(a * t))
  })

})

/**
 * PHY-26: the ideal spring. Scenes go through the codec first. Closed forms
 * written before running; every spring end sits on the line through the
 * bodies' centers, so nothing spins.
 */
describe('acceptance: ideal spring (PHY-26)', () => {
  type Sim = Awaited<ReturnType<typeof createSimulator>>
  type SpringState = Extract<ConstraintState, { kind: 'spring' }>
  const load = (scene: Scene): Promise<Sim> => createSimulator(parse(scene))
  const spring = (sim: Sim) => sim.readConstraints().find((c) => c.id === 'mola') as SpringState

  // Frictionless floor (top at y = 0), a wall whose right face is x = −1.9,
  // a 0.4 m block resting on the floor. The spring runs from the wall's face
  // to the block's left face at y = 0.2, so x = blockX − 0.2 + 1.9 and the
  // block's equilibrium is at blockX = X0 − 1.7.
  const X0 = 1
  const X_EQ = X0 - 1.7
  function horizontalScene(m: number, k: number, blockX: number, c?: number, springMass?: number): Scene {
    return {
      version: 1,
      constants: { g: G },
      bodies: [
        { shape: 'rectangle', width: 10, height: 1, id: 'chao', fixed: true, mass: 0, position: { x: 0, y: -0.5 }, rotation: 0 },
        { shape: 'rectangle', width: 0.2, height: 1, id: 'parede', fixed: true, mass: 0, position: { x: -2, y: 0.5 }, rotation: 0 },
        { shape: 'rectangle', width: 0.4, height: 0.4, id: 'bloco', fixed: false, mass: m, position: { x: blockX, y: 0.2 }, rotation: 0 },
      ],
      forces: [],
      contacts: [],
      constraints: [
        {
          id: 'mola',
          kind: 'spring',
          a: { bodyId: 'parede', anchor: { x: 0.1, y: -0.3 } },
          b: { bodyId: 'bloco', anchor: { x: -0.2, y: 0 } },
          k,
          x0: X0,
          ...(c === undefined ? {} : { c }),
          ...(springMass === undefined ? {} : { mass: springMass }),
        },
      ],
    }
  }

  /** Samples of `read` at every step, index i at t = i·Δt. */
  function run(sim: Sim, steps: number, read: () => number): number[] {
    const out = [read()]
    for (let i = 0; i < steps; i++) {
      sim.step()
      out.push(read())
    }
    return out
  }

  /** Times the samples cross `level` going up, interpolated inside the tick. */
  function upCrossings(samples: readonly number[], level: number): number[] {
    const out: number[] = []
    for (let i = 1; i < samples.length; i++) {
      const p = samples[i - 1]! - level
      const q = samples[i]! - level
      if (p < 0 && q >= 0) out.push((i - 1 + -p / (q - p)) * TIMESTEP)
    }
    return out
  }

  /** Tick indices of the samples' positive peaks. */
  function peakTicks(samples: readonly number[]): number[] {
    const out: number[] = []
    for (let i = 1; i < samples.length - 1; i++) {
      if (samples[i]! > 0 && samples[i]! >= samples[i - 1]! && samples[i]! > samples[i + 1]!) out.push(i)
    }
    return out
  }

  it.each([
    { m: 1, k: 40 },
    { m: 2, k: 50 },
  ])('horizontal m=$m k=$k, frictionless, released A = 0.1 m out: period 2π√(m/k) and amplitude after 5 periods within 2%', async ({ m, k }) => {
    const A = 0.1
    const period = 2 * Math.PI * Math.sqrt(m / k)
    const sim = await load(horizontalScene(m, k, X_EQ + A))
    const x = run(sim, Math.ceil((6 * period) / TIMESTEP), () => sim.readStates().get('bloco')!.position.x)
    const up = upCrossings(x, X_EQ)
    expect(up.length).toBeGreaterThanOrEqual(6)
    const measured = (up[5]! - up[0]!) / 5
    expect(Math.abs(measured - period)).toBeLessThanOrEqual(0.02 * period)
    // The 5th full period after release, peak to peak.
    const fifth = x.slice(Math.floor((4 * period) / TIMESTEP), Math.ceil((5 * period) / TIMESTEP) + 1)
    const amplitude = (Math.max(...fifth) - Math.min(...fifth)) / 2
    expect(Math.abs(amplitude - A)).toBeLessThanOrEqual(0.02 * A)
  })

  it.each([
    { m: 1, k: 40 },
    { m: 0.5, k: 20 },
  ])('vertical m=$m k=$k from the ceiling, released at natural length: equilibrium mg/k below it and period 2π√(m/k) within 2%', async ({ m, k }) => {
    const x0 = 1
    const period = 2 * Math.PI * Math.sqrt(m / k)
    const drop = (m * G) / k
    // Ceiling bottom at y = 5.75; the block's top face hangs x below it.
    const sim = await load({
      version: 1,
      constants: { g: G },
      bodies: [
        { shape: 'rectangle', width: 4, height: 0.5, id: 'teto', fixed: true, mass: 0, position: { x: 0, y: 6 }, rotation: 0 },
        { shape: 'rectangle', width: 0.4, height: 0.4, id: 'bloco', fixed: false, mass: m, position: { x: 0, y: 5.75 - x0 - 0.2 }, rotation: 0 },
      ],
      forces: [],
      contacts: [],
      constraints: [
        { id: 'mola', kind: 'spring', a: { bodyId: 'teto', anchor: { x: 0, y: -0.25 } }, b: { bodyId: 'bloco', anchor: { x: 0, y: 0.2 } }, k, x0 },
      ],
    })
    const stretch = run(sim, Math.ceil((4 * period) / TIMESTEP), () => 5.75 - (sim.readStates().get('bloco')!.position.y + 0.2) - x0)
    const whole = stretch.slice(0, Math.round((3 * period) / TIMESTEP) + 1)
    const equilibrium = (Math.max(...whole) + Math.min(...whole)) / 2
    expect(Math.abs(equilibrium - drop)).toBeLessThanOrEqual(0.02 * drop)
    const up = upCrossings(stretch, drop)
    expect(up.length).toBeGreaterThanOrEqual(4)
    const measured = (up[3]! - up[0]!) / 3
    expect(Math.abs(measured - period)).toBeLessThanOrEqual(0.02 * period)
  })

  it.each([
    { m: 1, k: 40, c: 0.8 },
    { m: 2, k: 50, c: 2 },
  ])('damped m=$m k=$k c=$c: successive peaks follow A·e^(−ct/2m) within 5%', async ({ m, k, c }) => {
    const A = 0.1
    const damped = 2 * Math.PI / Math.sqrt(k / m - (c / (2 * m)) ** 2)
    const sim = await load(horizontalScene(m, k, X_EQ + A, c))
    const d = run(sim, Math.ceil((5.5 * damped) / TIMESTEP), () => sim.readStates().get('bloco')!.position.x - X_EQ)
    const peaks = peakTicks(d).map((i) => ({ t: i * TIMESTEP, value: d[i]! }))
    expect(peaks.length).toBeGreaterThanOrEqual(5)
    for (const { t, value } of peaks) {
      const envelope = A * Math.exp((-c * t) / (2 * m))
      expect(Math.abs(value - envelope)).toBeLessThanOrEqual(0.05 * envelope)
    }
  })

  it.each([
    { c: 200, steps: 60, expected: 0.081939 },
    { c: 200, steps: 600, expected: 0.013520 },
    { c: 2000, steps: 60, expected: 0.098021 },
    { c: 2000, steps: 600, expected: 0.081874 },
  ])('PHY-47: overdamped c=$c at step $steps: displacement follows the analytic solution within 1%', async ({ c, steps, expected }) => {
    // Closed-form values for m = 1, k = 40, x(0) = 0.1, v(0) = 0
    // from the ticket, independent of the simulator's integration scheme.
    const sim = await load(horizontalScene(1, 40, X_EQ + 0.1, c))
    const dx = run(sim, steps, () => sim.readStates().get('bloco')!.position.x - X_EQ)
    expect(Math.abs(dx[steps]! - expected), `displacement ${dx[steps]} at step ${steps}`).toBeLessThan(0.01 * expected)
  })

  it.each([0.01, 0.05, 0.1])('PHY-47: stiff undamped spring, m=%s kg: energy stays below 1.2·E₀ for 600 steps', async (m) => {
    const k = 400
    const sim = await load(horizontalScene(m, k, X_EQ + 0.1, 0))
    const energy = run(sim, 600, () => {
      const state = sim.readStates().get('bloco')!
      return 0.5 * m * state.linvel.x ** 2 + 0.5 * k * (state.position.x - X_EQ) ** 2
    })
    expect(energy[0]).toBeCloseTo(2, 5) // Rapier stores the initial position in f32.
    expect(Math.max(...energy)).toBeLessThanOrEqual(1.2 * energy[0]!)
  })

  it.each([
    { loadKind: 'gravity', g: G },
    { loadKind: 'applied force', g: 0 },
  ])('PHY-47: overdamped vertical spring under $loadKind keeps static equilibrium load/k', async ({ g }) => {
    const m = 1
    const k = 40
    const sim = await load({
      version: 1,
      constants: { g },
      bodies: [
        { shape: 'rectangle', width: 4, height: 0.5, id: 'teto', fixed: true, mass: 0, position: { x: 0, y: 10 }, rotation: 0 },
        { shape: 'rectangle', width: 0.4, height: 0.4, id: 'bloco', fixed: false, mass: m, position: { x: 0, y: 8.5 }, rotation: 0 },
      ],
      forces: g === 0 ? [{ id: 'carga', bodyId: 'bloco', anchor: { x: 0, y: 0 }, magnitude: m * G, direction: 270 }] : [],
      contacts: [],
      constraints: [{ id: 'mola', kind: 'spring', a: { bodyId: 'teto', anchor: { x: 0, y: 0 } }, b: { bodyId: 'bloco', anchor: { x: 0, y: 0 } }, k, x0: 1, c: 200 }],
    })
    for (let i = 0; i < 6000; i++) sim.step()
    const dx = 10 - sim.readStates().get('bloco')!.position.y - 1
    const equilibrium = m * G / k
    expect(Math.abs(dx - equilibrium), `stretch ${dx}`).toBeLessThan(0.02 * equilibrium)
  })

  it.each([
    { reverse: false, rightC: 200 },
    { reverse: true, rightC: 200 },
    { reverse: false, rightC: 2000 },
    { reverse: true, rightC: 2000 },
  ])('PHY-47: opposite springs stay balanced for 300 steps, reverse=$reverse, right c=$rightC', async ({ reverse, rightC }) => {
    const constraints: Scene['constraints'] = [
      { id: 'left-spring', kind: 'spring', a: { bodyId: 'left', anchor: { x: 0, y: 0 } }, b: { bodyId: 'body', anchor: { x: 0, y: 0 } }, k: 40, x0: 1, c: 200 },
      { id: 'right-spring', kind: 'spring', a: { bodyId: 'right', anchor: { x: 0, y: 0 } }, b: { bodyId: 'body', anchor: { x: 0, y: 0 } }, k: 40, x0: 1, c: rightC },
    ]
    if (reverse) constraints.reverse()
    const sim = await load({
      version: 1,
      constants: { g: 0 },
      bodies: [
        { shape: 'rectangle', width: 0.2, height: 0.2, id: 'left', fixed: true, mass: 0, position: { x: -1.1, y: 0 }, rotation: 0 },
        { shape: 'rectangle', width: 0.2, height: 0.2, id: 'right', fixed: true, mass: 0, position: { x: 1.1, y: 0 }, rotation: 0 },
        { shape: 'rectangle', width: 0.4, height: 0.4, id: 'body', fixed: false, mass: 1, position: { x: 0, y: 0 }, rotation: 0 },
      ],
      forces: [],
      contacts: [],
      constraints,
    })
    const positions = run(sim, 300, () => sim.readStates().get('body')!.position.x)
    const worst = Math.max(...positions.map(Math.abs))
    expect(worst, `max drift ${worst}, final x ${positions.at(-1)}`).toBeLessThan(1e-4)
  })

  it.each([false, true])('PHY-47: chain and ideal spring stay balanced with disconnected ideal first=%s', async (extra) => {
    const constraints: Scene['constraints'] = [
      { id: 'chain', kind: 'spring', a: { bodyId: 'left', anchor: { x: 0, y: 0 } }, b: { bodyId: 'body', anchor: { x: 0, y: 0 } }, k: 40, x0: 1, c: 200, mass: 0.1 },
      { id: 'ideal', kind: 'spring', a: { bodyId: 'right', anchor: { x: 0, y: 0 } }, b: { bodyId: 'body', anchor: { x: 0, y: 0 } }, k: 40, x0: 1, c: 200 },
    ]
    if (extra) constraints.unshift({ id: 'unrelated', kind: 'spring', a: { bodyId: 'dummy-a', anchor: { x: 0, y: 0 } }, b: { bodyId: 'dummy-b', anchor: { x: 0, y: 0 } }, k: 40, x0: 1, c: 0 })
    const sim = await load({
      version: 1, constants: { g: 0 }, forces: [], contacts: [], constraints,
      bodies: [
        { id: 'left', shape: 'rectangle', width: 0.2, height: 0.2, fixed: true, mass: 0, position: { x: -1.1, y: 0 }, rotation: 0 },
        { id: 'right', shape: 'rectangle', width: 0.2, height: 0.2, fixed: true, mass: 0, position: { x: 1.1, y: 0 }, rotation: 0 },
        { id: 'body', shape: 'rectangle', width: 0.4, height: 0.4, fixed: false, mass: 1, position: { x: 0, y: 0 }, rotation: 0 },
        { id: 'dummy-a', shape: 'rectangle', width: 0.2, height: 0.2, fixed: true, mass: 0, position: { x: 10, y: 10 }, rotation: 0 },
        { id: 'dummy-b', shape: 'rectangle', width: 0.2, height: 0.2, fixed: true, mass: 0, position: { x: 11, y: 10 }, rotation: 0 },
      ],
    })
    const positions = run(sim, 300, () => sim.readStates().get('body')!.position.x)
    const worst = Math.max(...positions.map(Math.abs))
    expect(worst, `extra=${extra}, max drift ${worst}, final x ${positions.at(-1)}`).toBeLessThan(1e-4)
  })

  it.each([false, true])('PHY-47: disconnected high-damping spring preserves soft spring motion, shared fixed anchor=%s', async (sharedFixed) => {
    const scene = horizontalScene(1, 40, X_EQ + 0.1, 0)
    scene.constants.g = 0
    const solo = await load(scene)
    const combined = structuredClone(scene)
    if (!sharedFixed) combined.bodies.push({ id: 'unrelated-fixed', shape: 'rectangle', width: 0.2, height: 0.2, fixed: true, mass: 0, position: { x: 10, y: 10 }, rotation: 0 })
    combined.bodies.push({ id: 'unrelated-free', shape: 'rectangle', width: 0.2, height: 0.2, fixed: false, mass: 1, position: sharedFixed ? { x: -2, y: 1.5 } : { x: 11, y: 10 }, rotation: 0 })
    combined.constraints!.push({ id: 'unrelated', kind: 'spring', a: { bodyId: sharedFixed ? 'parede' : 'unrelated-fixed', anchor: { x: 0, y: 0 } }, b: { bodyId: 'unrelated-free', anchor: { x: 0, y: 0 } }, k: 40, x0: 1, c: 1e16 })
    const together = await load(combined)
    solo.step()
    together.step()
    const soloVx = solo.readStates().get('bloco')!.linvel.x
    const combinedVx = together.readStates().get('bloco')!.linvel.x
    expect(Math.abs(combinedVx - soloVx), `solo vx ${soloVx}, combined vx ${combinedVx}`).toBeLessThan(1e-6)
  })

  it.each([
    { c: 200, fixed: true },
    { c: 2000, fixed: true },
    { c: 200, fixed: false },
    { c: 2000, fixed: false },
  ])('PHY-40: c=$c, fixed end=$fixed: mechanical energy never increases over 600 steps; free ends conserve momentum', async ({ c, fixed }) => {
    const sim = await load({
      version: 1,
      constants: { g: 0 },
      bodies: [
        { shape: 'rectangle', width: 0.4, height: 0.4, id: 'a', fixed, mass: fixed ? 0 : 1, position: { x: 0, y: 0 }, rotation: 0 },
        { shape: 'rectangle', width: 0.4, height: 0.4, id: 'b', fixed: false, mass: 1, position: { x: 1.1, y: 0 }, rotation: 0 },
      ],
      forces: [],
      contacts: [],
      constraints: [{ id: 'mola', kind: 'spring', a: { bodyId: 'a', anchor: { x: 0, y: 0 } }, b: { bodyId: 'b', anchor: { x: 0, y: 0 } }, k: 40, x0: 1, c }],
    })
    const energy = () => {
      const states = sim.readStates()
      const a = states.get('a')!
      const b = states.get('b')!
      const dx = Math.hypot(b.position.x - a.position.x, b.position.y - a.position.y) - 1
      return 0.5 * (a.linvel.x ** 2 + a.linvel.y ** 2 + b.linvel.x ** 2 + b.linvel.y ** 2) + 20 * dx ** 2
    }
    const initial = energy()
    expect(initial).toBeCloseTo(0.2, 6)
    let previous = initial
    for (let i = 0; i < 600; i++) {
      sim.step()
      const now = energy()
      expect(now, `energy increase at step ${i + 1}`).toBeLessThanOrEqual(previous + 1e-9)
      previous = now
      if (!fixed) {
        const states = sim.readStates()
        const a = states.get('a')!.linvel
        const b = states.get('b')!.linvel
        expect(Math.hypot(a.x + b.x, a.y + b.y)).toBeLessThanOrEqual(1e-9)
      }
    }
    expect(previous).toBeLessThan(initial)
  })

  it('the readout gives Δx signed (+ stretched), and F_el = kΔx + c·ẋ at each end', async () => {
    const m = 1
    const k = 40
    const c = 0.8
    const sim = await load(horizontalScene(m, k, X_EQ - 0.1, c))
    // Compressed at rest: Δx = −0.1 before any step, F_el pushes the ends
    // apart. Rapier keeps poses in f32, so the document's 0.1 reads back to ~1e-8.
    expect(spring(sim)).toStrictEqual({ id: 'mola', kind: 'spring', dx: expect.closeTo(-0.1, 6), force: { a: expect.closeTo(-4, 5), b: expect.closeTo(-4, 5) } })
    let stretched = false
    for (let i = 0; i < 90; i++) {
      sim.step()
      const s = sim.readStates().get('bloco')!
      // The wall end is fixed at (−1.9, 0.2); the block end is the block's left face.
      const bx = s.position.x - 0.2 * Math.cos(s.rotation)
      const by = s.position.y - 0.2 * Math.sin(s.rotation)
      const x = Math.hypot(bx + 1.9, by - 0.2)
      const ux = (bx + 1.9) / x
      const uy = (by - 0.2) / x
      // The block end's velocity along the spring: v + ω × r, r = (bx, by) − center.
      const rate = (s.linvel.x - s.angvel * (by - s.position.y)) * ux + (s.linvel.y + s.angvel * (bx - s.position.x)) * uy
      const force = k * (x - X0) + c * rate
      const read = spring(sim)
      expect(read.dx).toBeCloseTo(x - X0, 9)
      expect(read.force.a).toBeCloseTo(force, 6)
      expect(read.force.b).toBeCloseTo(force, 6)
      if (read.dx > 0.05) stretched = true
    }
    expect(stretched).toBe(true)
  })

  it('the readout is the force the block feels: m·Δv/Δt = −F_el (mean over the step) within 2%', async () => {
    const m = 1
    const sim = await load(horizontalScene(m, 40, X_EQ + 0.1))
    const f0 = spring(sim).force.b
    const v0 = sim.readStates().get('bloco')!.linvel.x
    sim.step()
    const f1 = spring(sim).force.b
    const v1 = sim.readStates().get('bloco')!.linvel.x
    const felt = (m * (v1 - v0)) / TIMESTEP
    const mean = -(f0 + f1) / 2
    expect(Math.abs(felt - mean)).toBeLessThanOrEqual(0.02 * Math.abs(mean))
  })

  it('a spring and a rope read out side by side, in document order', async () => {
    // Spring first: the simulator builds ropes before springs, so this order pins the sort.
    const scene = horizontalScene(1, 40, X_EQ)
    scene.constraints!.push({ id: 'corda', kind: 'rope', a: { bodyId: 'parede', anchor: { x: 0.1, y: 0.3 } }, b: { bodyId: 'bloco', anchor: { x: 0, y: 0.2 } }, via: [] })
    const sim = await load(scene)
    sim.step()
    expect(sim.readConstraints().map((c) => [c.id, c.kind])).toStrictEqual([
      ['mola', 'spring'],
      ['corda', 'rope'],
    ])
  })

  it('two free bodies, g = 0: period 2π√(μ/k) with μ = m₁m₂/(m₁+m₂) within 2%, the center of mass stays put', async () => {
    const m1 = 1
    const m2 = 2
    const k = 30
    const x0 = 1
    const period = 2 * Math.PI * Math.sqrt((m1 * m2) / (m1 + m2) / k)
    // Centers 1.6 m apart, faces 1.2 m: stretched 0.2 m. COM at x = (0·1 + 1.6·2)/3.
    const com = (1.6 * m2) / (m1 + m2)
    const sim = await load({
      version: 1,
      constants: { g: 0 },
      bodies: [
        { shape: 'rectangle', width: 0.4, height: 0.4, id: 'a', fixed: false, mass: m1, position: { x: 0, y: 0 }, rotation: 0 },
        { shape: 'rectangle', width: 0.4, height: 0.4, id: 'b', fixed: false, mass: m2, position: { x: 1.6, y: 0 }, rotation: 0 },
      ],
      forces: [],
      contacts: [],
      constraints: [{ id: 'mola', kind: 'spring', a: { bodyId: 'a', anchor: { x: 0.2, y: 0 } }, b: { bodyId: 'b', anchor: { x: -0.2, y: 0 } }, k, x0 }],
    })
    let worstCom = 0
    const gap = run(sim, Math.ceil((4 * period) / TIMESTEP), () => {
      const s = sim.readStates()
      const xa = s.get('a')!.position.x
      const xb = s.get('b')!.position.x
      worstCom = Math.max(worstCom, Math.abs((m1 * xa + m2 * xb) / (m1 + m2) - com))
      return xb - xa - 0.4 - x0
    })
    const up = upCrossings(gap, 0)
    expect(up.length).toBeGreaterThanOrEqual(4)
    expect(Math.abs((up[3]! - up[0]!) / 3 - period)).toBeLessThanOrEqual(0.02 * period)
    expect(worstCom).toBeLessThan(1e-4)
  })

  /**
   * PHY-30: the spring with mass. Closed forms from the continuum spring:
   * against a fixed end it adds mₛ/3 to the block's inertia, hangs mₛ/2 of
   * its weight on the block, and its center moves at half the block's, so
   * the ends' forces differ by mₛ·a/2 (Newton on the spring).
   */
  describe('with mass (PHY-30)', () => {
    const A = 0.1

    it('PHY-42: swapping the spring ends keeps the block trajectory within 0.1 mm over 600 steps', async () => {
      const scene = horizontalScene(1, 40, X_EQ + A, 0, 0.1)
      const original = await load(scene)
      const s = scene.constraints![0]!
      ;[s.a, s.b] = [s.b, s.a]
      const swapped = await load(scene)
      let worst = 0
      for (let i = 0; i < 600; i++) {
        original.step()
        swapped.step()
        worst = Math.max(worst, Math.abs(original.readStates().get('bloco')!.position.x - swapped.readStates().get('bloco')!.position.x))
      }
      expect(worst).toBeLessThan(1e-4)
    })

    /** Mean period over `count` up-crossings of the block through X_EQ. */
    function period(sim: Sim, count: number, estimate: number): { measured: number; x: number[] } {
      const x = run(sim, Math.ceil(((count + 1) * estimate) / TIMESTEP), () => sim.readStates().get('bloco')!.position.x)
      const up = upCrossings(x, X_EQ)
      expect(up.length).toBeGreaterThanOrEqual(count + 1)
      return { measured: (up[count]! - up[0]!) / count, x }
    }

    it.each([
      { m: 1, k: 40 },
      { m: 2, k: 50 },
    ])('horizontal m=$m k=$k, mₛ = 0.1·m: period within 3% of 2π√((m + mₛ/3)/k) and nearer it than 2π√(m/k); amplitude after 5 periods within 2%', async ({ m, k }) => {
      const ms = 0.1 * m
      const massive = 2 * Math.PI * Math.sqrt((m + ms / 3) / k)
      const massless = 2 * Math.PI * Math.sqrt(m / k)
      const { measured, x } = period(await load(horizontalScene(m, k, X_EQ + A, undefined, ms)), 5, massive)
      expect(Math.abs(measured - massive)).toBeLessThanOrEqual(0.03 * massive)
      expect(Math.abs(measured - massive)).toBeLessThan(Math.abs(measured - massless))
      const fifth = x.slice(Math.floor((4 * massive) / TIMESTEP), Math.ceil((5 * massive) / TIMESTEP) + 1)
      const amplitude = (Math.max(...fifth) - Math.min(...fifth)) / 2
      expect(Math.abs(amplitude - A)).toBeLessThanOrEqual(0.02 * A)
    })

    it('while the spring accelerates, F_el differs per end: F_b − F_a follows mₛ·a/2 within 10% (least squares over 3 periods)', async () => {
      const m = 1
      const ms = 0.1
      const sim = await load(horizontalScene(m, 40, X_EQ + A, undefined, ms))
      let v = sim.readStates().get('bloco')!.linvel.x
      let sxy = 0
      let sxx = 0
      let widest = 0
      for (let i = 0; i < Math.ceil(3 / TIMESTEP); i++) {
        sim.step()
        const now = sim.readStates().get('bloco')!.linvel.x
        // The wall end is a, the block end b, the axis from a to b is +x.
        const expected = (ms / 2) * ((now - v) / TIMESTEP)
        v = now
        const { a, b } = spring(sim).force
        sxy += (b - a) * expected
        sxx += expected * expected
        widest = Math.max(widest, Math.abs(b - a))
      }
      expect(widest).toBeGreaterThan(0.1)
      expect(Math.abs(sxy / sxx - 1)).toBeLessThanOrEqual(0.1)
    })

    it('mₛ = 0 is the ideal spring: both ends read the same F_el at every step', async () => {
      const sim = await load(horizontalScene(1, 40, X_EQ + A, undefined, 0))
      for (let i = 0; i < 60; i++) {
        sim.step()
        const { a, b } = spring(sim).force
        expect(a).toBe(b)
      }
    })

    it('with mass the readout is the force each end got: m·Δv/Δt = −F_el at the block within 0.5% every step', async () => {
      const m = 1
      const sim = await load(horizontalScene(m, 40, X_EQ + A, undefined, 0.1))
      let v = sim.readStates().get('bloco')!.linvel.x
      for (let i = 0; i < 90; i++) {
        sim.step()
        const now = sim.readStates().get('bloco')!.linvel.x
        const felt = (m * (now - v)) / TIMESTEP
        v = now
        const fb = spring(sim).force.b
        expect(Math.abs(felt + fb)).toBeLessThanOrEqual(0.005 * Math.abs(fb) + 1e-3)
      }
    })

    it('vertical, hanging from the ceiling: equilibrium (m + mₛ/2)g/k below the natural length within 2%', async () => {
      const m = 1
      const ms = 0.2
      const k = 40
      const x0 = 1
      const drop = ((m + ms / 2) * G) / k
      const sim = await load({
        version: 1,
        constants: { g: G },
        bodies: [
          { shape: 'rectangle', width: 4, height: 0.5, id: 'teto', fixed: true, mass: 0, position: { x: 0, y: 6 }, rotation: 0 },
          { shape: 'rectangle', width: 0.4, height: 0.4, id: 'bloco', fixed: false, mass: m, position: { x: 0, y: 5.75 - x0 - 0.2 }, rotation: 0 },
        ],
        forces: [],
        contacts: [],
        constraints: [
          { id: 'mola', kind: 'spring', a: { bodyId: 'teto', anchor: { x: 0, y: -0.25 } }, b: { bodyId: 'bloco', anchor: { x: 0, y: 0.2 } }, k, x0, mass: ms },
        ],
      })
      const estimate = 2 * Math.PI * Math.sqrt((m + ms / 3) / k)
      const stretch = run(sim, Math.round((3 * estimate) / TIMESTEP), () => 5.75 - (sim.readStates().get('bloco')!.position.y + 0.2) - x0)
      const equilibrium = (Math.max(...stretch) + Math.min(...stretch)) / 2
      expect(Math.abs(equilibrium - drop)).toBeLessThanOrEqual(0.02 * drop)
    })

    it('the chain is hidden and collides with nothing: readStates holds only the document bodies, and a fixed bar across the spring leaves the period at 2π√((m + mₛ/3)/k)', async () => {
      const m = 1
      const k = 40
      const ms = 0.1
      const scene = horizontalScene(m, k, X_EQ + A, undefined, ms)
      // Across the spring's line (y = 0.2, from x = −1.9 to the block's face near −0.8), touching nothing else.
      scene.bodies.push({ shape: 'rectangle', width: 0.1, height: 0.2, id: 'barra', fixed: true, mass: 0, position: { x: -1.5, y: 0.2 }, rotation: 0 })
      const sim = await load(scene)
      const massive = 2 * Math.PI * Math.sqrt((m + ms / 3) / k)
      const { measured } = period(sim, 3, massive)
      expect(new Set(sim.readStates().keys())).toStrictEqual(new Set(['chao', 'parede', 'bloco', 'barra']))
      expect(Math.abs(measured - massive)).toBeLessThanOrEqual(0.03 * massive)
      expect(Math.abs(measured - massive)).toBeLessThan(Math.abs(measured - 2 * Math.PI * Math.sqrt(m / k)))
    })

    it('damped, c = 0.5 and mₛ = 0.1: the peak-to-peak decrement follows the ideal spring with the same c within 2% over 10 peaks', async () => {
      const c = 0.5
      async function peaks(ms?: number): Promise<number[]> {
        const sim = await load(horizontalScene(1, 40, X_EQ + A, c, ms))
        const d = run(sim, Math.ceil(12 / TIMESTEP), () => sim.readStates().get('bloco')!.position.x - X_EQ)
        const out = peakTicks(d).map((i) => d[i]!)
        expect(out.length).toBeGreaterThanOrEqual(10)
        return out.slice(0, 10)
      }
      const ideal = await peaks()
      const chain = await peaks(0.1)
      for (let i = 1; i < 10; i++) {
        const expected = ideal[i]! / ideal[i - 1]!
        expect(Math.abs(chain[i]! / chain[i - 1]! - expected)).toBeLessThanOrEqual(0.02 * expected)
      }
    })

    // PHY-48: the chain's ends join the group solve. Block energy ½m·v² + ½k·Δx², released at rest at Δx = 0.1.
    const blockEnergy = (sim: Sim, m: number, k: number) => {
      const state = sim.readStates().get('bloco')!
      return 0.5 * m * state.linvel.x ** 2 + 0.5 * k * (state.position.x - X_EQ) ** 2
    }

    it.each([0, 20, 30, 50, 80, 100, 150, 200, 2000])('PHY-48: m = 1, k = 40, mₛ = 0.1, c = %s: energy never passes 1.02·E₀ in 600 steps, and falls below E₀ when c > 0', async (c) => {
      const sim = await load(horizontalScene(1, 40, X_EQ + 0.1, c, 0.1))
      const energy = run(sim, 600, () => blockEnergy(sim, 1, 40))
      expect(energy[0]).toBeCloseTo(0.2, 5)
      expect(Math.max(...energy), `max E ${Math.max(...energy)}`).toBeLessThanOrEqual(1.02 * energy[0]!)
      if (c > 0) expect(energy[600]!).toBeLessThan(energy[0]!)
    })

    it.each([
      { c: 200, steps: 60, expected: 0.081939 },
      { c: 200, steps: 600, expected: 0.013520 },
      { c: 2000, steps: 60, expected: 0.098021 },
      { c: 2000, steps: 600, expected: 0.081874 },
    ])('PHY-48: overdamped c=$c, mₛ = 0.001, step $steps: displacement follows the ideal damped oscillator within 1%', async ({ c, steps, expected }) => {
      const sim = await load(horizontalScene(1, 40, X_EQ + 0.1, c, 0.001))
      const dx = run(sim, steps, () => sim.readStates().get('bloco')!.position.x - X_EQ)
      expect(Math.abs(dx[steps]! - expected), `displacement ${dx[steps]} at step ${steps}`).toBeLessThan(0.01 * expected)
    })

    it('PHY-48: stiff spring against a light block (m = 0.01, k = 400, mₛ = 0.001, c = 0): energy stays below 1.3·E₀ for 600 steps', async () => {
      const sim = await load(horizontalScene(0.01, 400, X_EQ + 0.1, 0, 0.001))
      const energy = run(sim, 600, () => blockEnergy(sim, 0.01, 400))
      expect(energy[0]).toBeCloseTo(2, 5)
      expect(Math.max(...energy), `max E ${Math.max(...energy)}`).toBeLessThanOrEqual(1.3 * energy[0]!)
    })

    it('PHY-48: heavily damped spring with mass (c = 200, mₛ = 0.2) hangs at (m + mₛ/2)g/k below its natural length within 2% after 6000 steps', async () => {
      const m = 1
      const ms = 0.2
      const k = 40
      const x0 = 1
      const sim = await load({
        version: 1,
        constants: { g: G },
        bodies: [
          { shape: 'rectangle', width: 4, height: 0.5, id: 'teto', fixed: true, mass: 0, position: { x: 0, y: 6 }, rotation: 0 },
          { shape: 'rectangle', width: 0.4, height: 0.4, id: 'bloco', fixed: false, mass: m, position: { x: 0, y: 5.75 - x0 - 0.2 }, rotation: 0 },
        ],
        forces: [],
        contacts: [],
        constraints: [
          { id: 'mola', kind: 'spring', a: { bodyId: 'teto', anchor: { x: 0, y: -0.25 } }, b: { bodyId: 'bloco', anchor: { x: 0, y: 0.2 } }, k, x0, c: 200, mass: ms },
        ],
      })
      for (let i = 0; i < 6000; i++) sim.step()
      const stretch = 5.75 - (sim.readStates().get('bloco')!.position.y + 0.2) - x0
      const drop = ((m + ms / 2) * G) / k
      expect(Math.abs(stretch - drop), `stretch ${stretch}, expected ${drop}`).toBeLessThanOrEqual(0.02 * drop)
    })

    describe('two springs with mass on one block', () => {
      const pair = (reverse: boolean, x: number): Scene => {
        const constraints: Scene['constraints'] = [
          { id: 'left-spring', kind: 'spring', a: { bodyId: 'left', anchor: { x: 0, y: 0 } }, b: { bodyId: 'body', anchor: { x: 0, y: 0 } }, k: 40, x0: 1, c: 200, mass: 0.1 },
          { id: 'right-spring', kind: 'spring', a: { bodyId: 'right', anchor: { x: 0, y: 0 } }, b: { bodyId: 'body', anchor: { x: 0, y: 0 } }, k: 40, x0: 1, c: 200, mass: 0.1 },
        ]
        if (reverse) constraints.reverse()
        return {
          version: 1,
          constants: { g: 0 },
          forces: [],
          contacts: [],
          constraints,
          bodies: [
            { id: 'left', shape: 'rectangle', width: 0.2, height: 0.2, fixed: true, mass: 0, position: { x: -1.1, y: 0 }, rotation: 0 },
            { id: 'right', shape: 'rectangle', width: 0.2, height: 0.2, fixed: true, mass: 0, position: { x: 1.1, y: 0 }, rotation: 0 },
            { id: 'body', shape: 'rectangle', width: 0.4, height: 0.4, fixed: false, mass: 1, position: { x, y: 0 }, rotation: 0 },
          ],
        }
      }

      it.each([false, true])('PHY-48: at rest the block stays within 0.1 mm of the center for 300 steps, reverse=%s', async (reverse) => {
        const sim = await load(pair(reverse, 0))
        const positions = run(sim, 300, () => sim.readStates().get('body')!.position.x)
        const worst = Math.max(...positions.map(Math.abs))
        expect(worst, `max drift ${worst}`).toBeLessThan(1e-4)
      })

      it.each([false, true])('PHY-48: released at x = 0.1 the energy ½m·v² + ½(2k)·x² never passes 1.02·E₀, reverse=%s', async (reverse) => {
        const sim = await load(pair(reverse, 0.1))
        const energy = run(sim, 600, () => {
          const state = sim.readStates().get('body')!
          return 0.5 * state.linvel.x ** 2 + 0.5 * 80 * state.position.x ** 2
        })
        expect(energy[0]).toBeCloseTo(0.4, 5)
        expect(Math.max(...energy), `max E ${Math.max(...energy)}`).toBeLessThanOrEqual(1.02 * energy[0]!)
      })
    })

    it.each([0, 200, 2000])('PHY-48: both ends on light free blocks (m = 0.1, k = 40, mₛ = 0.1, c = %s): energy ½m·(v₁² + v₂²) + ½k·Δx² never passes 1.02·E₀ in 600 steps', async (c) => {
      const sim = await load({
        version: 1,
        constants: { g: 0 },
        forces: [],
        contacts: [],
        bodies: [
          { id: 'esq', shape: 'rectangle', width: 0.4, height: 0.4, fixed: false, mass: 0.1, position: { x: -0.6, y: 0 }, rotation: 0 },
          { id: 'dir', shape: 'rectangle', width: 0.4, height: 0.4, fixed: false, mass: 0.1, position: { x: 0.6, y: 0 }, rotation: 0 },
        ],
        constraints: [
          { id: 'mola', kind: 'spring', a: { bodyId: 'esq', anchor: { x: 0, y: 0 } }, b: { bodyId: 'dir', anchor: { x: 0, y: 0 } }, k: 40, x0: 1, c, mass: 0.1 },
        ],
      })
      const energy = run(sim, 600, () => {
        const states = sim.readStates()
        const kinetic = ['esq', 'dir'].reduce((sum, id) => sum + 0.5 * 0.1 * states.get(id)!.linvel.x ** 2, 0)
        return kinetic + 0.5 * 40 * spring(sim).dx ** 2
      })
      expect(energy[0]).toBeCloseTo(0.8, 5)
      expect(Math.max(...energy), `max E ${Math.max(...energy)}`).toBeLessThanOrEqual(1.02 * energy[0]!)
    })

    it('PHY-48: free bar held at its end by a spring with mass (c = 200) perpendicular to it: energy ½m·v² + ½I·ω² + ½k·Δx² never passes 1.02·E₀ in 600 steps', async () => {
      const m = 1
      const k = 40
      const inertia = (m * (1 ** 2 + 0.1 ** 2)) / 12
      const sim = await load({
        version: 1,
        constants: { g: 0 },
        forces: [],
        contacts: [],
        bodies: [
          { id: 'ancora', shape: 'rectangle', width: 0.2, height: 0.2, fixed: true, mass: 0, position: { x: 0.5, y: 1.1 }, rotation: 0 },
          { id: 'barra', shape: 'rectangle', width: 1, height: 0.1, fixed: false, mass: m, position: { x: 0, y: 0 }, rotation: 0 },
        ],
        constraints: [
          { id: 'mola', kind: 'spring', a: { bodyId: 'ancora', anchor: { x: 0, y: 0 } }, b: { bodyId: 'barra', anchor: { x: 0.5, y: 0 } }, k, x0: 1, c: 200, mass: 0.1 },
        ],
      })
      const energy = run(sim, 600, () => {
        const state = sim.readStates().get('barra')!
        return 0.5 * m * (state.linvel.x ** 2 + state.linvel.y ** 2) + 0.5 * inertia * state.angvel ** 2 + 0.5 * k * spring(sim).dx ** 2
      })
      expect(energy[0]).toBeCloseTo(0.2, 5)
      expect(Math.max(...energy), `max E ${Math.max(...energy)}`).toBeLessThanOrEqual(1.02 * energy[0]!)
    })
  })
})

describe('acceptance: force anchor semantics (origin-relative contract)', () => {
  // Pins the BODY-ORIGIN-relative anchor contract documented in types.ts:
  // a triangle's frame origin is its alpha-corner vertex while its COM sits
  // at (2*base/3, h/3) � so anchor {0,0} exerts torque, the centroid does not.
  function triScene(anchor: { x: number; y: number }): Scene {
    return {
      version: 1,
      constants: { g: 0 },
      bodies: [
        { id: 'tri', shape: 'triangle', base: 24, alpha: 30, fixed: false, mass: 10, position: { x: 0, y: 0 }, rotation: 0 },
      ],
      forces: [{ id: 'f', bodyId: 'tri', anchor, magnitude: 50, direction: 0 }],
      contacts: [],
    }
  }
  it('anchor {0,0} torques a triangle; centroid anchor translates without spin', async () => {
    const atOrigin = await createSimulator(triScene({ x: 0, y: 0 }))
    for (let i = 0; i < 30; i++) atOrigin.step()
    const originState = atOrigin.readStates().get('tri')!
    expect(Math.abs(originState.angvel)).toBeGreaterThan(0.05)

    const H = 24 * Math.tan((30 * Math.PI) / 180)
    const atCentroid = await createSimulator(triScene({ x: (2 * 24) / 3, y: H / 3 }))
    for (let i = 0; i < 30; i++) atCentroid.step()
    const centroidState = atCentroid.readStates().get('tri')!
    expect(centroidState.linvel.x).toBeGreaterThan(0)
    // Bound reflects f32 rounding: our H/3 anchor and Rapier's internal
    // centroid agree only to ~1e-7 m, leaving a negligible residual spin
    // (~4e-7 rad/s here vs >0.05 rad/s for the torqued origin anchor).
    expect(Math.abs(centroidState.angvel)).toBeLessThan(1e-5)
  })

  // PHY-34: each step's off-COM torque must replace the last, not add to it.
  // 1x1 m, 1 kg block, 1 N world-up at body-local (0.5, 0): the arm rides the
  // body, so tau = 0.5 cos(theta) and energy gives (1/6)/2 * omega^2 = 0.5 sin(theta),
  // omega = sqrt(6 sin(theta)). tau/I * t = 3 would assume a fixed arm; the block
  // turns ~81 deg in the second.
  it('off-COM torque does not accumulate across steps: omega = sqrt(6 sin theta) after 1 s', async () => {
    const sim = await createSimulator({
      version: 1,
      constants: { g: 0 },
      bodies: [
        { id: 'box', shape: 'rectangle', width: 1, height: 1, fixed: false, mass: 1, position: { x: 0, y: 0 }, rotation: 0 },
      ],
      forces: [{ id: 'f', bodyId: 'box', anchor: { x: 0.5, y: 0 }, magnitude: 1, direction: 90 }],
      contacts: [],
    })
    for (let i = 0; i < 60; i++) sim.step()
    const { angvel, rotation } = sim.readStates().get('box')!
    // Clamped so a spun-past-pi body fails on numbers, not NaN.
    const expected = Math.sqrt(6 * Math.max(0, Math.sin(rotation)))
    expect(Math.abs(angvel - expected)).toBeLessThanOrEqual(0.02 * expected)
  })
})
