import { describe, expect, it } from 'vitest'
import { createSimulator, TIMESTEP } from './index'
import { parse } from '../scene'
import type { Scene } from '../scene'
import { groundBody } from '../persistence'

const G = 9.81

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

  const tension = (sim: Awaited<ReturnType<typeof createSimulator>>) => sim.readConstraints().find((c) => c.id === 'corda')!

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
    expect(sim.readConstraints()).toStrictEqual([{ id: 'corda', kind: 'rope', tension: expect.any(Number), slack: false }])
    expect(tension(sim).tension).toBeGreaterThan(0)
  })

  it('replaceScene with carry keeps the document length L, not the length at the carried poses', async () => {
    const scene = atwoodScene(3, 2)
    const L = atwoodLength(2, 1)
    const sim = await createSimulator(scene)
    for (let i = 0; i < 30; i++) sim.step()
    // Carry mid-motion with the heavy block lifted 10 cm: at the carried poses
    // the path is 10 cm shorter than the document's L. A rope rebuilt from the
    // carried poses would be taut at once; the document's rope is slack until
    // the blocks close that gap, then holds L again.
    const carry = sim.readStates()
    const a = carry.get('a')!
    carry.set('a', { ...a, position: { x: a.position.x, y: a.position.y + 0.1 } })
    sim.replaceScene(scene, carry)
    sim.step()
    expect(tension(sim).slack).toBe(true)
    expect(tension(sim).tension).toBe(0)
    for (let i = 0; i < 60; i++) sim.step()
    const s = sim.readStates()
    expect(tension(sim).slack).toBe(false)
    expect(Math.abs(atwoodLength(s.get('a')!.position.y, s.get('b')!.position.y) - L)).toBeLessThan(0.001)
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
  const rope = (sim: Sim) => sim.readConstraints().find((c) => c.id === 'corda')!
  const CM = { x: 0, y: 0 }

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

  it('loop with v_top² > gL: goes all the way round with T > 0 the whole time', async () => {
    const L = 1
    // v_top² = v₀² − 4gL = 2gL.
    const sim = await load(pendulumScene({ x: 0, y: -L }, Math.sqrt(6 * G * L)))
    let swept = 0
    let prev = -Math.PI / 2
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
    }
    expect(swept).toBeGreaterThanOrEqual(2 * Math.PI)
    expect(Math.min(...tensions)).toBeGreaterThan(0)
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
})
