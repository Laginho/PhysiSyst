/**
 * Pure projections between the Scene document and the running world.
 *
 * `applyStates` is what makes playback visible: the renderer keeps consuming a
 * Scene, and this projects the simulator's readback over the document's poses.
 * React-free and allocation-cheap enough to run every frame.
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
