/**
 * Pure projections between the Scene document and the running world.
 *
 * `applyStates` is what makes playback visible: the renderer keeps consuming a
 * Scene, and this projects the simulator's readback over the document's poses.
 * `carryOver` implements the rebuild policy (T7 ruling): a structural rebuild
 * preserves per-id kinematic state for surviving bodies.
 *
 * Both are React-free and allocation-cheap enough to run every frame.
 */
import type { Body, Scene } from '../scene'
import type { BodyState } from '../sim'

/**
 * Document with simulated poses substituted in. Bodies the simulator has no
 * state for (e.g. just added by an edit) keep their document pose. Returns the
 * input scene unchanged when nothing has been simulated yet, so a fresh app
 * renders exactly the document.
 */
export function applyStates(scene: Scene, states: ReadonlyMap<string, BodyState> | null | undefined): Scene {
  if (!states || states.size === 0) return scene
  return {
    ...scene,
    bodies: scene.bodies.map((body): Body => {
      const s = states.get(body.id)
      if (!s) return body
      // Spread preserves the shape discriminant and its parameters; only the
      // pose comes from the simulation.
      return { ...body, position: { x: s.position.x, y: s.position.y }, rotation: s.rotation }
    }),
  }
}

function samePose(a: Body, b: Body): boolean {
  return a.position.x === b.position.x && a.position.y === b.position.y && a.rotation === b.rotation
}

/**
 * Kinematic state to hand to `Simulator.replaceScene` when rebuilding `next`
 * out of a world that was built from `built`.
 *
 * Surviving ids carry position/rotation/velocity so a structural edit does not
 * teleport unrelated bodies back to their starting line. Two kinds of id are
 * deliberately dropped, both spawning at their document-initial state:
 *   - ids absent from `built` (nothing to carry) or from `next` (removed);
 *   - ids whose document POSE changed, i.e. the user explicitly placed the
 *     body — an explicit placement outranks the simulated position, and it is
 *     also what makes a drag while paused visibly take effect.
 */
export function carryOver(
  states: ReadonlyMap<string, BodyState> | null | undefined,
  built: Scene,
  next: Scene,
): Map<string, BodyState> {
  const carried = new Map<string, BodyState>()
  if (!states || states.size === 0) return carried
  const builtById = new Map(built.bodies.map((b) => [b.id, b]))
  for (const body of next.bodies) {
    const state = states.get(body.id)
    const before = builtById.get(body.id)
    if (!state || !before || !samePose(before, body)) continue
    carried.set(body.id, state)
  }
  return carried
}
