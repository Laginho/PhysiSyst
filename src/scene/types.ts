export const SCENE_VERSION = 1

export interface Vec2 {
  x: number
  y: number
}

export interface RectangleGeometry {
  shape: 'rectangle'
  width: number
  height: number
}

export interface CircleGeometry {
  shape: 'circle'
  radius: number
}

export interface TriangleGeometry {
  shape: 'triangle'
  base: number
  /**
   * Incline angle in degrees at the base-hypotenuse corner.
   * Hard-limited to the open interval (0, 90): the right-triangle model
   * derives height = base * tan(alpha), so obtuse inclines are not
   * representable in v1.
   */
  alpha: number
}

export type Geometry = RectangleGeometry | CircleGeometry | TriangleGeometry

export type Body = Geometry & {
  id: string
  fixed: boolean
  mass: number
  position: Vec2
  rotation: number
  /**
   * Initial velocity (v₀) components, m/s, world frame. Additive-optional —
   * the scene version stays 1 and absent fields stay absent on reparse so
   * pre-v2 documents round-trip byte-stably (precedent:
   * constants.particleMode). The simulator applies them as linear velocity
   * when the world is built; only dynamic bodies expose an input for them.
   */
  vx?: number
  vy?: number
}

export interface AppliedForce {
  id: string
  bodyId: string
  /**
   * Application point, meters from the body's frame ORIGIN, rotating with
   * the body. Origin == center of mass for rectangle and circle bodies. For
   * triangles the origin is the alpha-corner vertex and the COM sits at
   * (2*base/3, h/3) — anchor {0,0} therefore exerts torque on a triangle;
   * anchor at the centroid is torque-free.
   */
  anchor: Vec2
  magnitude: number
  /**
   * Direction of the push in the WORLD frame, degrees, counter-clockwise
   * from +x. Independent of body rotation; torque correctness comes from
   * applying the force at the anchor point.
   */
  direction: number
}

export interface Contact {
  a: string
  b: string
  muS: number
  muK: number
}

/**
 * A circle a rope wraps, mounted at `anchor` on a Body (same body-local,
 * origin-relative contract as AppliedForce.anchor). On a fixed body it is a
 * fixed pulley. Massless by default; `mass` is the disk realism option.
 */
export interface Pulley {
  id: string
  bodyId: string
  anchor: Vec2
  radius: number
  mass?: number
}

/** One end of a constraint: a point on a Body, body-local and origin-relative. */
export interface ConstraintEnd {
  bodyId: string
  anchor: Vec2
}

/**
 * Ideal rope from `a` to `b` over the pulleys in `via`, in order. Its length
 * is never stored: it is the path length at the document's poses, so a rope
 * always starts taut (ADR-0004).
 */
export interface Rope {
  id: string
  kind: 'rope'
  a: ConstraintEnd
  b: ConstraintEnd
  via: string[]
}

export type Constraint = Rope

export interface Scene {
  version: number
  constants: {
    g: number
    /**
     * Particle mode (T7/M2): when true, every body is built with locked
     * rotations (torque cannot spin anything). Additive optional field —
     * absent means false; toggling it is a structural change.
     */
    particleMode?: boolean
  }
  bodies: Body[]
  forces: AppliedForce[]
  contacts: Contact[]
  /**
   * Additive-optional like constants.particleMode: absent means none, and
   * absence survives reparse so documents without them round-trip
   * byte-stably. Read them as `scene.pulleys ?? []`.
   */
  pulleys?: Pulley[]
  constraints?: Constraint[]
}
