/**
 * Scene codec — the single serialization path for Scene documents.
 *
 * Validation policy (spec: unphysical values warn inline, never block):
 * - HARD — parse() throws SceneParseError for anything that makes the
 *   document uninterpretable: wrong types, unknown/missing keys, unknown or
 *   missing shape, non-positive geometry (width/height/radius/base), alpha
 *   outside the open interval (0, 90), empty or duplicate ids, contact
 *   references that dangle, alias one body, or repeat a pair, non-finite
 *   numbers anywhere, unsupported version.
 * - SOFT — well-formed but unphysical values parse successfully; call
 *   collectWarnings(scene) to list them: g <= 0, dynamic mass <= 0 (Fixed
 *   bodies exempt — mass 0 is legitimate for them; messages name the Body
 *   by id), negative force magnitude, negative friction coefficients.
 *
 * Pulleys and rope constraints (PHY-23) HARD-reject dangling body/pulley
 * references, duplicate ids and radius <= 0, a rope with no pulley whose ends
 * share a body, and the same pulley twice in a row in `via`. A pulley mass is
 * optional; when present it must be finite and >= 0 (PHY-25).
 */
export { collectWarnings, parse, serialize, SceneParseError } from './codec'
export { bodyPointToWorld, ropePath, scenePath } from './ropePath'
export type { PathPulley, RopeArc, RopePath, RopeSegment } from './ropePath'
export { SCENE_VERSION } from './types'
export type {
  AppliedForce,
  Body,
  CircleGeometry,
  Constraint,
  ConstraintEnd,
  Contact,
  Geometry,
  Pulley,
  RectangleGeometry,
  Rope,
  Scene,
  TriangleGeometry,
  Vec2,
} from './types'
