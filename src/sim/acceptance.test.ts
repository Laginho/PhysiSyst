import { describe, expect, it } from 'vitest'
import { createSimulator, TIMESTEP } from './index'
import type { Scene } from '../scene'

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

    // SEAM WORKAROUND (documented per brief): createSimulator exposes no way
    // to inject initial velocity, so the launch uses a momentary applied
    // force held for exactly 6 ticks, gravity-compensated so the post-cut
    // state is the intended (v0x, v0y):
    //   fx*tImp/m = v0x            (no gravity in x)
    //   fy*tImp/m - g*tImp = v0y   (gravity cancels during boost)
    const LAUNCH_TICKS = 6
    const tImp = LAUNCH_TICKS * TIMESTEP
    const fx = (MASS * v0x) / tImp
    const fy = MASS * (v0y / tImp + G)
    const sim = await createSimulator({
      version: 1,
      constants: { g: G },
      bodies: [
        { id: 'shot', shape: 'circle', radius: 0.3, fixed: false, mass: MASS, position: { x: 0, y: 25 }, rotation: 0 },
      ],
      forces: [
        {
          id: 'launch',
          bodyId: 'shot',
          anchor: { x: 0, y: 0 },
          magnitude: Math.hypot(fx, fy),
          direction: (Math.atan2(fy, fx) * 180) / Math.PI,
        },
      ],
      contacts: [],
    })

    for (let i = 0; i < LAUNCH_TICKS; i++) sim.step()
    sim.setForceMagnitude('launch', 0)
    const s0 = sim.readStates().get('shot')!
    // Boost fidelity: gravity-compensated impulse lands within 0.5%.
    expect(Math.abs(s0.linvel.x - v0x)).toBeLessThanOrEqual(0.005 * v0x)
    expect(Math.abs(s0.linvel.y - v0y)).toBeLessThanOrEqual(0.005 * v0y)

    // Parabola sampled at 3 points (closed form, written before running):
    //   y(x) = x tan(theta) - g x^2 / (2 v0x^2)
    // Tolerance: 1 cm absolute or 1% of predicted height, whichever larger.
    let stepped = LAUNCH_TICKS
    for (const totalTicks of [24, 42, 60]) {
      while (stepped < totalTicks) {
        sim.step()
        stepped++
      }
      const s = sim.readStates().get('shot')!
      const xr = s.position.x - s0.position.x
      const yr = s.position.y - s0.position.y
      const yPred = xr * Math.tan(rad) - (G * xr * xr) / (2 * v0x * v0x)
      expect(Math.abs(yr - yPred)).toBeLessThanOrEqual(Math.max(0.02, 0.01 * Math.abs(yPred)))
    }

    // Range at re-crossing of launch height: R = v^2 sin(2 theta)/g, which is
    // identically 2 v0x v0y / g. Measured via linear interpolation between
    // the straddling ticks. Tolerance 2%: interpolation granularity (one
    // timestep) dominates.
    const rangeExpected = (2 * v0x * v0y) / G
    let prev = s0
    let landed = false
    for (let guard = 0; !landed && guard < 400; guard++) {
      sim.step()
      const cur = sim.readStates().get('shot')!
      if (cur.position.y < s0.position.y && prev.position.y >= s0.position.y) {
        const frac = (prev.position.y - s0.position.y) / (prev.position.y - cur.position.y)
        const xLand = prev.position.x + frac * (cur.position.x - prev.position.x)
        expect(Math.abs(xLand - s0.position.x - rangeExpected)).toBeLessThanOrEqual(0.02 * rangeExpected)
        landed = true
      } else {
        prev = cur
      }
    }
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
