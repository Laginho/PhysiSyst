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
 */
export { collectWarnings, parse, serialize, SceneParseError } from './codec'
export { SCENE_VERSION } from './types'
export type {
  AppliedForce,
  Body,
  CircleGeometry,
  Contact,
  Geometry,
  RectangleGeometry,
  Scene,
  TriangleGeometry,
  Vec2,
} from './types'
