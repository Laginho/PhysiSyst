import { SCENE_VERSION } from './types'
import type { AppliedForce, Body, Constraint, ConstraintEnd, Contact, Pulley, Scene } from './types'

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

const PULLEY_KEYS = ['id', 'bodyId', 'anchor', 'radius', 'mass'] as const

function parsePulley(raw: unknown, i: number, bodies: ReadonlyMap<string, Body>): Pulley {
  const where = `pulleys[${i}]`
  if (!isObject(raw)) fail(`${where} must be a JSON object`)
  const p = raw
  checkKeys(p, PULLEY_KEYS, `in ${where}`)

  const id = reqString(p, 'id', where)
  const bodyId = reqString(p, 'bodyId', where)
  if (!bodies.has(bodyId)) fail(`${where}: references missing body '${bodyId}'`)
  const pulley: Pulley = { id, bodyId, anchor: parseVec2(p['anchor'], `${where}: anchor.`), radius: reqPositive(p, 'radius', where) }
  // The disk realism option (PHY-25): absent = 0, and absence survives reparse.
  if ('mass' in p) {
    const mass = p['mass']
    if (!isFiniteNumber(mass) || mass < 0) fail(`${where}: mass must be a non-negative finite number`)
    pulley.mass = mass
  }
  return pulley
}

function parseEnd(raw: unknown, key: 'a' | 'b', where: string, bodies: ReadonlyMap<string, Body>): ConstraintEnd {
  const path = `${where}.${key}`
  if (!isObject(raw)) fail(`${path} must be a JSON object`)
  checkKeys(raw, ['bodyId', 'anchor'], `in ${path}`)
  const bodyId = reqString(raw, 'bodyId', path)
  if (!bodies.has(bodyId)) fail(`${where}: ${key} references missing body '${bodyId}'`)
  return { bodyId, anchor: parseVec2(raw['anchor'], `${path}: anchor.`) }
}

const ROPE_KEYS = ['id', 'kind', 'a', 'b', 'via'] as const

function parseConstraint(
  raw: unknown,
  i: number,
  bodies: ReadonlyMap<string, Body>,
  pulleyIds: ReadonlySet<string>,
): Constraint {
  const where = `constraints[${i}]`
  if (!isObject(raw)) fail(`${where} must be a JSON object`)
  const c = raw
  const kind = c['kind']
  if (kind !== 'rope') fail(`${where}: unknown kind '${String(kind)}'`)
  checkKeys(c, ROPE_KEYS, `in ${where}`)

  const id = reqString(c, 'id', where)
  const a = parseEnd(c['a'], 'a', where, bodies)
  const b = parseEnd(c['b'], 'b', where, bodies)
  const viaRaw = c['via']
  if (!Array.isArray(viaRaw) || !viaRaw.every((v): v is string => typeof v === 'string' && v !== '')) {
    fail(`${where}: via must be an array of pulley ids`)
  }
  for (const pid of viaRaw) {
    if (!pulleyIds.has(pid)) fail(`${where}: via references missing pulley '${pid}'`)
  }
  if (viaRaw.length === 0 && a.bodyId === b.bodyId) fail(`${where}: a rope with no pulley must join two different bodies`)
  viaRaw.forEach((pid, k) => {
    if (pid === viaRaw[k - 1]) fail(`${where}: via repeats pulley '${pid}' back to back`)
  })
  return { id, kind, a, b, via: [...viaRaw] }
}

export function parse(json: unknown): Scene {
  if (!isObject(json)) fail('scene must be a JSON object')
  checkKeys(json, ['version', 'constants', 'bodies', 'forces', 'contacts', 'pulleys', 'constraints'], 'at scene root')
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

  const scene: Scene = {
    version,
    constants: particleMode !== undefined ? { g, particleMode } : { g },
    bodies,
    forces,
    contacts,
  }

  // Pulleys and constraints are additive-optional (PHY-23): parsed only when
  // present and appended after contacts, so documents without them keep
  // their exact bytes. Ids are structural addresses, duplicates HARD reject.
  const bodyById = new Map(bodies.map((b) => [b.id, b]))
  const pulleyIds = new Set<string>()
  if ('pulleys' in json) {
    const pulleyRaws = reqArray(json, 'pulleys')
    scene.pulleys = pulleyRaws.map((raw, i) => {
      const p = parsePulley(raw, i, bodyById)
      if (pulleyIds.has(p.id)) fail(`pulleys[${i}]: duplicate pulley id '${p.id}'`)
      pulleyIds.add(p.id)
      return p
    })
  }
  if ('constraints' in json) {
    const constraintRaws = reqArray(json, 'constraints')
    const constraintIds = new Set<string>()
    scene.constraints = constraintRaws.map((raw, i) => {
      const c = parseConstraint(raw, i, bodyById, pulleyIds)
      if (constraintIds.has(c.id)) fail(`constraints[${i}]: duplicate constraint id '${c.id}'`)
      constraintIds.add(c.id)
      return c
    })
  }
  return scene
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
