import type { Body, Scene, Vec2 } from '../scene'
import type { BodyState, ConstraintState, PulleyState } from './simulator'

/** Moment of inertia about the body's centroid, kg·m². */
export function momentOfInertia(body: Body): number {
  switch (body.shape) {
    case 'rectangle': return body.mass * (body.width ** 2 + body.height ** 2) / 12
    case 'circle': return body.mass * body.radius ** 2 / 2
    case 'triangle': {
      const height = body.base * Math.tan(body.alpha * Math.PI / 180)
      return body.mass * (body.base ** 2 + height ** 2) / 18
    }
  }
}

/** World centroid; triangle poses use the alpha vertex as their origin. */
export function centerOfMass(body: Body, state: BodyState): Vec2 {
  if (body.shape !== 'triangle') return { ...state.position }
  const x = 2 * body.base / 3
  const y = body.base * Math.tan(body.alpha * Math.PI / 180) / 3
  const cos = Math.cos(state.rotation)
  const sin = Math.sin(state.rotation)
  return { x: state.position.x + cos * x - sin * y, y: state.position.y + sin * x + cos * y }
}

export interface BodyEnergy {
  Ec: number
  Epg: number
  p: Vec2
}

/** Energies in joules, linear momentum in kg·m/s; potential is zero at y = 0. */
export function bodyEnergy(scene: Scene, body: Body, state: BodyState): BodyEnergy {
  const { x, y } = state.linvel
  const rotation = scene.constants.particleMode ? 0 : momentOfInertia(body) * state.angvel ** 2 / 2
  return {
    Ec: body.mass * (x ** 2 + y ** 2) / 2 + rotation,
    Epg: body.mass * scene.constants.g * centerOfMass(body, state).y,
    p: { x: body.mass * x, y: body.mass * y },
  }
}

export interface SystemEnergy extends BodyEnergy {
  Eel: number
  Emec: number
}

/**
 * Sum recorded body energies, endpoint spring strain energy, chain kinetic
 * energy and disk spin. Fixed bodies and elements without readouts are omitted.
 * This readout does not include chain internal strain or moving axle mass energy.
 */
export function systemEnergy(
  scene: Scene,
  states: ReadonlyMap<string, BodyState>,
  constraints: readonly ConstraintState[],
  pulleys: readonly PulleyState[],
): SystemEnergy {
  let Ec = 0
  let Epg = 0
  let Eel = 0
  const p = { x: 0, y: 0 }
  for (const body of scene.bodies) {
    const state = states.get(body.id)
    if (body.fixed || !state) continue
    const energy = bodyEnergy(scene, body, state)
    Ec += energy.Ec
    Epg += energy.Epg
    p.x += energy.p.x
    p.y += energy.p.y
  }
  const constraintById = new Map((scene.constraints ?? []).map((constraint) => [constraint.id, constraint]))
  for (const state of constraints) {
    const spring = constraintById.get(state.id)
    if (state.kind !== 'spring' || spring?.kind !== 'spring') continue
    Eel += spring.k * state.dx ** 2 / 2
    Ec += state.chainKinetic ?? 0
  }
  const pulleyById = new Map((scene.pulleys ?? []).map((pulley) => [pulley.id, pulley]))
  for (const state of pulleys) {
    const pulley = pulleyById.get(state.id)
    if (!pulley?.mass) continue
    Ec += pulley.mass * pulley.radius ** 2 * state.angvel ** 2 / 4
  }
  return { Ec, Epg, Eel, Emec: Ec + Epg + Eel, p }
}
