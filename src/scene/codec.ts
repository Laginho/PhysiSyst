import { SCENE_VERSION } from './types'
import type { AppliedForce, Body, Contact, Scene } from './types'

export class SceneParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SceneParseError'
  }
}

function fail(message: string): never {
  throw new SceneParseError(message)
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

type Loc = `at scene root` | `in constants` | `in ${string}`

function checkKeys(obj: Record<string, unknown>, keys: readonly string[], loc: Loc): void {
  for (const k of Object.keys(obj)) {
    if (!keys.includes(k)) fail(`unknown key '${k}' ${loc}`)
  }
}

function reqKey(obj: Record<string, unknown>, key: string, loc: Loc): void {
  if (!(key in obj)) fail(`missing key '${key}' ${loc}`)
}

function reqString(obj: Record<string, unknown>, key: string, where: string): string {
  const v = obj[key]
  if (typeof v !== 'string' || v === '') fail(`${where}: ${key} must be a non-empty string`)
  return v
}

function reqFinite(obj: Record<string, unknown>, key: string, where: string): number {
  const v = obj[key]
  if (!isFiniteNumber(v)) fail(`${where}: ${key} must be a finite number`)
  return v
}

function reqPositive(obj: Record<string, unknown>, key: string, where: string): number {
  const v = obj[key]
  if (!isFiniteNumber(v) || v <= 0) fail(`${where}: ${key} must be a positive finite number`)
  return v
}

function reqBoolean(obj: Record<string, unknown>, key: string, where: string): boolean {
  const v = obj[key]
  if (typeof v !== 'boolean') fail(`${where}: ${key} must be a boolean`)
  return v
}

function reqArray(doc: Record<string, unknown>, key: string): unknown[] {
  if (!Array.isArray(doc[key])) fail(`'${key}' must be an array`)
  return doc[key] as unknown[]
}

function parseVec2(raw: unknown, path: string): { x: number; y: number } {
  if (!isObject(raw)) fail(`${path} must be a JSON object`)
  checkKeys(raw, ['x', 'y'], `in ${path}`)
  const x = raw['x']
  if (!isFiniteNumber(x)) fail(`${path}x must be a finite number`)
  const y = raw['y']
  if (!isFiniteNumber(y)) fail(`${path}y must be a finite number`)
  return { x, y }
}

const BODY_COMMON = ['id', 'shape', 'fixed', 'mass', 'position', 'rotation'] as const
// Initial velocity (ticket 04): additive-optional like constants.particleMode —
// absence must survive reparse so legacy documents round-trip byte-stably.
const BODY_INITIAL_VELOCITY = ['vx', 'vy'] as const

function parseBody(raw: unknown, i: number): Body {
  const where = `bodies[${i}]`
  if (!isObject(raw)) fail(`${where} must be a JSON object`)
  const b = raw

  const shape = b['shape']
  let geometryKeys: readonly string[]
  switch (shape) {
    case 'rectangle':
      geometryKeys = ['width', 'height']
      break
    case 'circle':
      geometryKeys = ['radius']
      break
    case 'triangle':
      geometryKeys = ['base', 'alpha']
      break
    case undefined:
      fail(`${where}: missing shape`)
      break
    default:
      fail(`${where}: unknown shape '${String(shape)}'`)
  }
  checkKeys(b, [...BODY_COMMON, ...BODY_INITIAL_VELOCITY, ...geometryKeys], `in ${where}`)

  const geometry =
    shape === 'rectangle'
      ? {
          shape,
          width: reqPositive(b, 'width', where),
          height: reqPositive(b, 'height', where),
        }
      : shape === 'circle'
        ? { shape, radius: reqPositive(b, 'radius', where) }
        : {
            shape: 'triangle' as const,
            base: reqPositive(b, 'base', where),
            alpha: (() => {
              const a = reqFinite(b, 'alpha', where)
              if (a <= 0 || a >= 90) fail(`${where}: alpha must be a number strictly between 0 and 90`)
              return a
            })(),
          }

  const body: Body = {
    ...geometry,
    id: reqString(b, 'id', where),
    fixed: reqBoolean(b, 'fixed', where),
    mass: reqFinite(b, 'mass', where),
    position: parseVec2(b['position'], `${where}: position.`),
    rotation: reqFinite(b, 'rotation', where),
  }
  // Appended last so the canonical key order keeps vx/vy trailing — scenes
  // saved before v2 never gain the fields, scenes with them serialize
  // byte-identically (isDirty compares serialized strings).
  if ('vx' in b) body.vx = reqFinite(b, 'vx', where)
  if ('vy' in b) body.vy = reqFinite(b, 'vy', where)
  return body
}

const FORCE_KEYS = ['id', 'bodyId', 'anchor', 'magnitude', 'direction'] as const

function parseForce(raw: unknown, i: number, bodyIds: ReadonlySet<string>): AppliedForce {
  const where = `forces[${i}]`
  if (!isObject(raw)) fail(`${where} must be a JSON object`)
  const f = raw
  checkKeys(f, FORCE_KEYS, `in ${where}`)

  const bodyId = reqString(f, 'bodyId', where)
  if (!bodyIds.has(bodyId)) fail(`${where}: references missing body '${bodyId}'`)

  return {
    id: reqString(f, 'id', where),
    bodyId,
    anchor: parseVec2(f['anchor'], `${where}: anchor.`),
    magnitude: reqFinite(f, 'magnitude', where),
    direction: reqFinite(f, 'direction', where),
  }
}

const CONTACT_KEYS = ['a', 'b', 'muS', 'muK'] as const

function pairKey(a: string, b: string): string {
  return a < b ? `'${a}', '${b}'` : `'${b}', '${a}'`
}

function parseContact(
  raw: unknown,
  i: number,
  bodyIds: ReadonlySet<string>,
  seen: ReadonlySet<string>,
): Contact {
  const where = `contacts[${i}]`
  if (!isObject(raw)) fail(`${where} must be a JSON object`)
  const c = raw
  checkKeys(c, CONTACT_KEYS, `in ${where}`)

  const a = reqString(c, 'a', where)
  const b = reqString(c, 'b', where)
  if (a === b) fail(`${where}: must reference two distinct bodies`)
  for (const id of [a, b]) {
    if (!bodyIds.has(id)) fail(`${where}: references missing body '${id}'`)
  }
  if (seen.has(pairKey(a, b))) fail(`${where}: duplicate contact pair (${pairKey(a, b)})`)

  return { a, b, muS: reqFinite(c, 'muS', where), muK: reqFinite(c, 'muK', where) }
}

export function parse(json: unknown): Scene {
  if (!isObject(json)) fail('scene must be a JSON object')
  checkKeys(json, ['version', 'constants', 'bodies', 'forces', 'contacts'], 'at scene root')
  reqKey(json, 'version', 'at scene root')
  reqKey(json, 'constants', 'at scene root')
  reqKey(json, 'bodies', 'at scene root')
  reqKey(json, 'forces', 'at scene root')
  reqKey(json, 'contacts', 'at scene root')

  const version = json['version']
  if (typeof version !== 'number') fail('scene version must be a number')
  if (version !== SCENE_VERSION) fail(`unsupported scene version ${version} (expected ${SCENE_VERSION})`)

  const constantsRaw = json['constants']
  if (!isObject(constantsRaw)) fail('constants must be a JSON object')
  // particleMode is additive-optional (T7/M2): absent means false; when
  // present it must be a real boolean. Absence stays absence on reparse so
  // legacy documents round-trip byte-stably.
  checkKeys(constantsRaw, ['g', 'particleMode'], 'in constants')
  reqKey(constantsRaw, 'g', 'in constants')
  const g = constantsRaw['g']
  if (!isFiniteNumber(g)) fail('constants.g must be a finite number')
  let particleMode: boolean | undefined
  if ('particleMode' in constantsRaw) particleMode = reqBoolean(constantsRaw, 'particleMode', 'constants')

  const bodyRaws = reqArray(json, 'bodies')
  const forceRaws = reqArray(json, 'forces')
  const contactRaws = reqArray(json, 'contacts')

  const bodies: Body[] = []
  const bodyIds = new Set<string>()
  for (let i = 0; i < bodyRaws.length; i++) {
    const body = parseBody(bodyRaws[i], i)
    if (bodyIds.has(body.id)) fail(`bodies[${i}]: duplicate body id '${body.id}'`)
    bodyIds.add(body.id)
    bodies.push(body)
  }

  const seenPairs = new Set<string>()
  const contacts: Contact[] = []
  for (let i = 0; i < contactRaws.length; i++) {
    const c = parseContact(contactRaws[i], i, bodyIds, seenPairs)
    seenPairs.add(pairKey(c.a, c.b))
    contacts.push(c)
  }

  // Force ids are structural addresses: setForceMagnitude targets them by id,
  // so a duplicate would silently drop a force. HARD reject like bodies.
  const forces: AppliedForce[] = []
  const forceIds = new Set<string>()
  for (let i = 0; i < forceRaws.length; i++) {
    const f = parseForce(forceRaws[i], i, bodyIds)
    if (forceIds.has(f.id)) fail(`forces[${i}]: duplicate force id '${f.id}'`)
    forceIds.add(f.id)
    forces.push(f)
  }

  return {
    version,
    constants: particleMode !== undefined ? { g, particleMode } : { g },
    bodies,
    forces,
    contacts,
  }
}

export function serialize(scene: Scene): unknown {
  return JSON.parse(JSON.stringify(scene))
}

export function collectWarnings(scene: Scene): string[] {
  const warnings: string[] = []
  if (scene.constants.g <= 0) warnings.push('constants.g: g should be a positive number')
  scene.bodies.forEach((b) => {
    // Fixed bodies are exempt: mass 0 is legitimate for them (spec ticket 03).
    if (!b.fixed && b.mass <= 0) warnings.push(`body '${b.id}': mass should be a positive number`)
  })
  scene.forces.forEach((f, i) => {
    if (f.magnitude < 0) warnings.push(`forces[${i}]: magnitude should be a non-negative number`)
  })
  scene.contacts.forEach((c, i) => {
    if (c.muS < 0) warnings.push(`contacts[${i}]: muS should be a non-negative number`)
    if (c.muK < 0) warnings.push(`contacts[${i}]: muK should be a non-negative number`)
  })
  return warnings
}
