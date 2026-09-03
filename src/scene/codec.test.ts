import { describe, expect, it } from 'vitest'
import { collectWarnings, parse, serialize, SceneParseError as SceneError, SCENE_VERSION } from './index'
import type { Scene } from './index'
import { isDirty, loadScene } from '../persistence'
import type { Storage } from '../persistence'

const validJson = {
  version: 1,
  constants: { g: 9.81 },
  bodies: [
    {
      id: 'ground',
      shape: 'rectangle',
      width: 10,
      height: 1,
      fixed: true,
      mass: 100,
      position: { x: 0, y: -0.5 },
      rotation: 0,
    },
    {
      id: 'ball',
      shape: 'circle',
      radius: 0.5,
      fixed: false,
      mass: 2,
      position: { x: 0, y: 1 },
      rotation: 0,
    },
    {
      id: 'incline',
      shape: 'triangle',
      base: 4,
      alpha: 30,
      fixed: true,
      mass: 50,
      position: { x: 0, y: 0 },
      rotation: 0,
    },
  ],
  forces: [
    { id: 'f1', bodyId: 'ball', anchor: { x: 0.5, y: 0 }, magnitude: 12, direction: 180 },
  ],
  contacts: [{ a: 'ball', b: 'incline', muS: 0.4, muK: 0.3 }],
}

function clone(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(validJson)) as Record<string, unknown>
}

describe('valid scenes', () => {
  it('parses the full example scene', () => {
    const scene = parse(validJson)
    expect(scene.version).toBe(SCENE_VERSION)
    expect(scene.bodies).toHaveLength(3)
    expect(scene.forces).toHaveLength(1)
    expect(scene.contacts).toHaveLength(1)
  })

  it('parses a minimal scene with empty arrays', () => {
    const scene = parse({
      version: 1,
      constants: { g: 9.8 },
      bodies: [],
      forces: [],
      contacts: [],
    })
    expect(scene.constants.g).toBe(9.8)
    expect(scene.bodies).toEqual([])
  })
})

interface InvalidCase {
  name: string
  mutate?: (doc: Record<string, unknown>) => void
  replace?: unknown
  expected: string
}

const invalidCases: InvalidCase[] = [
  // root / version
  {
    name: 'not an object',
    replace: [1, 2, 3],
    expected: 'scene must be a JSON object',
  },
  {
    name: 'unknown root key',
    mutate: (d) => {
      d['gravity'] = 9.8
    },
    expected: "unknown key 'gravity' at scene root",
  },
  {
    name: 'missing root key',
    mutate: (d) => {
      delete d['forces']
    },
    expected: "missing key 'forces' at scene root",
  },
  {
    name: 'non-number version',
    mutate: (d) => {
      d['version'] = 'one'
    },
    expected: 'scene version must be a number',
  },
  {
    name: 'unknown version',
    mutate: (d) => {
      d['version'] = 2
    },
    expected: 'unsupported scene version 2 (expected 1)',
  },
  // constants
  {
    name: 'missing g',
    mutate: (d) => {
      delete (d['constants'] as Record<string, unknown>)['g']
    },
    expected: "missing key 'g' in constants",
  },
  {
    name: 'bad g (string)',
    mutate: (d) => {
      ;(d['constants'] as Record<string, unknown>)['g'] = '9.8'
    },
    expected: 'constants.g must be a finite number',
  },
  {
    name: 'bad g (Infinity)',
    mutate: (d) => {
      ;(d['constants'] as Record<string, unknown>)['g'] = Number.POSITIVE_INFINITY
    },
    expected: 'constants.g must be a finite number',
  },
  // bodies: shape + geometry
  {
    name: 'unknown shape',
    mutate: (d) => {
      ;((d['bodies'] as unknown[])[2] as Record<string, unknown>)['shape'] = 'hexagon'
    },
    expected: "bodies[2]: unknown shape 'hexagon'",
  },
  {
    name: 'negative rectangle width',
    mutate: (d) => {
      ;((d['bodies'] as unknown[])[0] as Record<string, unknown>)['width'] = -1
    },
    expected: 'bodies[0]: width must be a positive finite number',
  },
  {
    name: 'zero circle radius',
    mutate: (d) => {
      ;((d['bodies'] as unknown[])[1] as Record<string, unknown>)['radius'] = 0
    },
    expected: 'bodies[1]: radius must be a positive finite number',
  },
  {
    name: 'triangle alpha at bound (0)',
    mutate: (d) => {
      ;((d['bodies'] as unknown[])[2] as Record<string, unknown>)['alpha'] = 0
    },
    expected: 'bodies[2]: alpha must be a number strictly between 0 and 90',
  },
  {
    name: 'triangle alpha beyond 90',
    mutate: (d) => {
      ;((d['bodies'] as unknown[])[2] as Record<string, unknown>)['alpha'] = 91
    },
    expected: 'bodies[2]: alpha must be a number strictly between 0 and 90',
  },
  // bodies: scalar fields
  {
    name: 'empty body id',
    mutate: (d) => {
      ;((d['bodies'] as unknown[])[0] as Record<string, unknown>)['id'] = ''
    },
    expected: 'bodies[0]: id must be a non-empty string',
  },
  {
    name: 'duplicate body id',
    mutate: (d) => {
      ;((d['bodies'] as unknown[])[1] as Record<string, unknown>)['id'] = 'ground'
    },
    expected: "bodies[1]: duplicate body id 'ground'",
  },
  {
    name: 'non-boolean fixed',
    mutate: (d) => {
      ;((d['bodies'] as unknown[])[0] as Record<string, unknown>)['fixed'] = 'yes'
    },
    expected: 'bodies[0]: fixed must be a boolean',
  },
  {
    name: 'NaN position component',
    mutate: (d) => {
      ;(((d['bodies'] as unknown[])[1] as Record<string, unknown>)['position'] as Record<string, unknown>)[
        'x'
      ] = Number.NaN
    },
    expected: 'bodies[1]: position.x must be a finite number',
  },
  {
    name: 'NaN rotation',
    mutate: (d) => {
      ;((d['bodies'] as unknown[])[1] as Record<string, unknown>)['rotation'] = Number.NaN
    },
    expected: 'bodies[1]: rotation must be a finite number',
  },
  {
    name: 'unknown key inside body',
    mutate: (d) => {
      ;((d['bodies'] as unknown[])[0] as Record<string, unknown>)['friction'] = 0.5
    },
    expected: "unknown key 'friction' in bodies[0]",
  },
  // forces
  {
    name: 'force references missing body',
    mutate: (d) => {
      ;((d['forces'] as unknown[])[0] as Record<string, unknown>)['bodyId'] = 'b9'
    },
    expected: "forces[0]: references missing body 'b9'",
  },
  {
    name: 'force anchor NaN',
    mutate: (d) => {
      ;(((d['forces'] as unknown[])[0] as Record<string, unknown>)['anchor'] as Record<string, unknown>)[
        'y'
      ] = 'up'
    },
    expected: 'forces[0]: anchor.y must be a finite number',
  },
  {
    name: 'duplicate force id (direct)',
    mutate: (d) => {
      ;(d['forces'] as unknown[]).push({
        id: 'f1',
        bodyId: 'ball',
        anchor: { x: 0, y: 0 },
        magnitude: 1,
        direction: 0,
      })
    },
    expected: "forces[1]: duplicate force id 'f1'",
  },
  {
    name: 'duplicate force id (after other entries)',
    mutate: (d) => {
      const forces = d['forces'] as unknown[]
      forces.push({ id: 'f2', bodyId: 'ball', anchor: { x: 0, y: 0 }, magnitude: 1, direction: 0 })
      forces.push({ id: 'f1', bodyId: 'incline', anchor: { x: 0, y: 0 }, magnitude: 1, direction: 90 })
    },
    expected: "forces[2]: duplicate force id 'f1'",
  },
  // contacts
  {
    name: 'contact references missing body',
    mutate: (d) => {
      ;((d['contacts'] as unknown[])[0] as Record<string, unknown>)['b'] = 'ghost'
    },
    expected: "contacts[0]: references missing body 'ghost'",
  },
  {
    name: 'contact with self pair',
    mutate: (d) => {
      ;((d['contacts'] as unknown[])[0] as Record<string, unknown>)['b'] = 'ball'
    },
    expected: 'contacts[0]: must reference two distinct bodies',
  },
  {
    name: 'duplicate contact pair (reversed order)',
    mutate: (d) => {
      const contacts = d['contacts'] as unknown[]
      contacts.push({ a: 'incline', b: 'ball', muS: 0.1, muK: 0.1 })
    },
    expected: "contacts[1]: duplicate contact pair ('ball', 'incline')",
  },
  {
    name: 'non-finite muK',
    mutate: (d) => {
      ;((d['contacts'] as unknown[])[0] as Record<string, unknown>)['muK'] = Number.POSITIVE_INFINITY
    },
    expected: 'contacts[0]: muK must be a finite number',
  },
]

describe('invalid mutations', () => {
  it.each(invalidCases)('$name -> "$expected"', (c) => {
    const doc = c.replace !== undefined ? c.replace : clone()
    c.mutate?.(doc as Record<string, unknown>)
    expect(() => parse(doc)).toThrow(SceneError)
    expect(() => parse(doc)).toThrow(c.expected)
  })
})

interface SoftCase {
  name: string
  mutate: (doc: Record<string, unknown>) => void
  expectedWarnings: string[]
}

const softCases: SoftCase[] = [
  {
    name: 'negative mass',
    mutate: (d) => {
      ;((d['bodies'] as unknown[])[1] as Record<string, unknown>)['mass'] = -2
    },
    expectedWarnings: ["body 'ball': mass should be a positive number"],
  },
  {
    name: 'zero mass',
    mutate: (d) => {
      ;((d['bodies'] as unknown[])[1] as Record<string, unknown>)['mass'] = 0
    },
    expectedWarnings: ["body 'ball': mass should be a positive number"],
  },
  {
    name: 'negative force magnitude',
    mutate: (d) => {
      ;((d['forces'] as unknown[])[0] as Record<string, unknown>)['magnitude'] = -5
    },
    expectedWarnings: ['forces[0]: magnitude should be a non-negative number'],
  },
  {
    name: 'negative muS',
    mutate: (d) => {
      ;((d['contacts'] as unknown[])[0] as Record<string, unknown>)['muS'] = -0.4
    },
    expectedWarnings: ['contacts[0]: muS should be a non-negative number'],
  },
  {
    name: 'negative muK',
    mutate: (d) => {
      ;((d['contacts'] as unknown[])[0] as Record<string, unknown>)['muK'] = -0.3
    },
    expectedWarnings: ['contacts[0]: muK should be a non-negative number'],
  },
  {
    name: 'zero g',
    mutate: (d) => {
      ;(d['constants'] as Record<string, unknown>)['g'] = 0
    },
    expectedWarnings: ['constants.g: g should be a positive number'],
  },
  {
    name: 'multiple unphysical values aggregate in document order',
    mutate: (d) => {
      ;((d['bodies'] as unknown[])[1] as Record<string, unknown>)['mass'] = 0
      ;((d['forces'] as unknown[])[0] as Record<string, unknown>)['magnitude'] = -5
      ;((d['contacts'] as unknown[])[0] as Record<string, unknown>)['muK'] = -0.3
    },
    expectedWarnings: [
      "body 'ball': mass should be a positive number",
      'forces[0]: magnitude should be a non-negative number',
      'contacts[0]: muK should be a non-negative number',
    ],
  },
]

describe('soft validation (unphysical but well-formed parses with warnings)', () => {
  it.each(softCases)('$name', (c) => {
    const doc = clone()
    c.mutate(doc)
    const scene = parse(doc)
    expect(collectWarnings(scene)).toStrictEqual(c.expectedWarnings)
  })

  it('physical scene produces no warnings', () => {
    expect(collectWarnings(parse(clone()))).toStrictEqual([])
  })

  it('warnings never affect round-trip identity', () => {
    const doc = clone()
    ;((doc['bodies'] as unknown[])[1] as Record<string, unknown>)['mass'] = -2
    expect(serialize(parse(doc))).toStrictEqual(doc)
  })
})

describe('ticket 03: warning policy — Fixed bodies exempt, warnings name the Body', () => {
  it('a Fixed body with mass 0 produces no positive-mass warning (mass 0 is legitimate)', () => {
    const doc = clone()
    ;((doc['bodies'] as unknown[])[0] as Record<string, unknown>)['mass'] = 0
    expect(collectWarnings(parse(doc))).toStrictEqual([])
  })

  it('a dynamic Body with mass ≤ 0 warns naming the Body by id, not array position', () => {
    const doc = clone()
    ;((doc['bodies'] as unknown[])[1] as Record<string, unknown>)['mass'] = 0
    expect(collectWarnings(parse(doc))).toStrictEqual(["body 'ball': mass should be a positive number"])
  })

  it('pre-existing scenes with or without ground parse unchanged', () => {
    // without ground: parse must not inject one
    const groundless = { version: 1, constants: { g: 9.81 }, bodies: [], forces: [], contacts: [] }
    expect(parse(groundless).bodies).toEqual([])
    expect(serialize(parse(groundless))).toStrictEqual(groundless)
    // with ground: round-trips untouched
    expect(serialize(parse(clone()))).toStrictEqual(clone())
  })
})

describe('constants.particleMode (T7/M2, additive optional)', () => {
  it('tolerant parse: absent field stays absent (legacy docs unchanged)', () => {
    const scene = parse(clone())
    expect(scene.constants.particleMode).toBeUndefined()
  })

  it.each([
    ['true', true],
    ['false', false],
  ])('parses explicit %s', (_name, value) => {
    const json = clone() as Record<string, unknown>
    json.constants = { g: 9.81, particleMode: value }
    expect(parse(json).constants.particleMode).toBe(value)
  })

  it.each([
    ['string', 'yes'],
    ['number', 1],
    ['null', null],
  ])('rejects non-boolean particleMode (%s)', (_name, value) => {
    const json = clone() as Record<string, unknown>
    json.constants = { g: 9.81, particleMode: value }
    expect(() => parse(json)).toThrow(SceneError)
    expect(() => parse(json)).toThrow(/particleMode must be a boolean/)
  })

  it('round-trips byte-stably: absent stays absent, present stays present', () => {
    const legacy = parse(clone())
    expect(serialize(legacy)).not.toHaveProperty('constants.particleMode')

    const on = clone() as Record<string, unknown>
    on.constants = { g: 9.81, particleMode: true }
    expect(serialize(parse(on))).toStrictEqual(on)
  })
})

describe('round-trip identity', () => {
  it('serialize(parse(json)) deep-equals json', () => {
    const json = clone()
    expect(serialize(parse(json))).toStrictEqual(json)
  })

  it('parse(serialize(scene)) deep-equals scene', () => {
    const scene: Scene = parse(clone())
    expect(parse(serialize(scene))).toStrictEqual(scene)
  })

  it('round-trips a minimal empty scene', () => {
    const json = { version: 1, constants: { g: 0 }, bodies: [], forces: [], contacts: [] }
    expect(serialize(parse(json))).toStrictEqual(json)
  })
})

describe('ticket 04: Initial velocity (additive-optional Body field, scene version stays 1)', () => {
  it('a version-1 Body without Initial velocity parses with the field absent and serializes unchanged', () => {
    const doc = clone()
    const scene = parse(doc)
    expect(scene.bodies[1]!.vx).toBeUndefined()
    expect(scene.bodies[1]!.vy).toBeUndefined()
    expect(serialize(scene)).toStrictEqual(doc)
  })

  it('a dynamic Body with vx/vy (m/s, world frame) parses both values and round-trips losslessly', () => {
    const doc = clone() as Record<string, unknown>
    ;((doc['bodies'] as unknown[])[1] as Record<string, unknown>)['vx'] = 3
    ;((doc['bodies'] as unknown[])[1] as Record<string, unknown>)['vy'] = -4.5
    const scene = parse(doc)
    expect(scene.bodies[1]!.vx).toBe(3)
    expect(scene.bodies[1]!.vy).toBe(-4.5)
    expect(serialize(parse(serialize(scene)))).toStrictEqual(serialize(scene))
    expect(serialize(scene)).toStrictEqual(doc)
  })

  it('a half-specified velocity (vx present, vy absent) keeps absence of vy through the round-trip', () => {
    const doc = clone() as Record<string, unknown>
    ;((doc['bodies'] as unknown[])[1] as Record<string, unknown>)['vx'] = 2
    const scene = parse(doc)
    expect(scene.bodies[1]!.vx).toBe(2)
    expect(scene.bodies[1]!.vy).toBeUndefined()
    expect(serialize(scene)).toStrictEqual(doc)
  })

  it.each([
    ['string vx', 'fast'],
    ['Infinity vy', Number.POSITIVE_INFINITY],
    ['NaN vx', Number.NaN],
  ])('rejects non-finite %s', (_name, value) => {
    const doc = clone() as Record<string, unknown>
    ;((doc['bodies'] as unknown[])[1] as Record<string, unknown>)['vx'] = value
    expect(() => parse(doc)).toThrow(/bodies\[1\]: vx must be a finite number/)
  })

  it.each([
    ['string vy', 'up'],
    ['Infinity vy', Number.NEGATIVE_INFINITY],
  ])('rejects non-finite %s', (_name, value) => {
    const doc = clone() as Record<string, unknown>
    ;((doc['bodies'] as unknown[])[1] as Record<string, unknown>)['vy'] = value
    expect(() => parse(doc)).toThrow(/bodies\[1\]: vy must be a finite number/)
  })

  it('a Fixed body carrying stored vx/vy still parses and round-trips (schema-level tolerant; simulator ignores it)', () => {
    const doc = clone() as Record<string, unknown>
    ;((doc['bodies'] as unknown[])[0] as Record<string, unknown>)['vx'] = 5
    ;((doc['bodies'] as unknown[])[0] as Record<string, unknown>)['vy'] = 5
    const scene = parse(doc)
    expect(scene.bodies[0]!.fixed).toBe(true)
    expect(scene.bodies[0]!.vx).toBe(5)
    expect(serialize(scene)).toStrictEqual(doc)
  })
})

describe('ticket 04b: canonical BYTE order with Initial velocity present', () => {
  // Deep-equality ignores key insertion order, so only byte-level assertions
  // pin the canonical serialization: vx/vy must trail the body's keys, or a
  // reordered serializer changes stored bytes while every toStrictEqual stays
  // green — and the autosave isDirty string-compare would flag untouched docs.
  // Stored bytes are ALWAYS serialize() output (saveScene), so the canonical
  // forms below are written in parse()'s own key order.
  const docWithVelocity = (): Record<string, unknown> => {
    const doc = clone() as Record<string, unknown>
    ;((doc['bodies'] as unknown[])[1] as Record<string, unknown>)['vx'] = 3
    ;((doc['bodies'] as unknown[])[1] as Record<string, unknown>)['vy'] = -4.5
    return doc
  }

  /** Minimal launch scene whose stored form carries vx/vy. */
  const launchDoc = (): Record<string, unknown> => ({
    version: 1,
    constants: { g: 9.81 },
    bodies: [
      { id: 'ball', shape: 'circle', radius: 0.5, fixed: false, mass: 2, position: { x: 0, y: 1 }, rotation: 0, vx: 3, vy: -4.5 },
    ],
    forces: [],
    contacts: [],
  })

  const canonicalLaunchBytes = JSON.stringify({
    version: 1,
    constants: { g: 9.81 },
    bodies: [
      { shape: 'circle', radius: 0.5, id: 'ball', fixed: false, mass: 2, position: { x: 0, y: 1 }, rotation: 0, vx: 3, vy: -4.5 },
    ],
    forces: [],
    contacts: [],
  })

  it('a stored Initial-velocity scene re-serializes to the exact same bytes', () => {
    expect(JSON.stringify(serialize(parse(launchDoc())))).toBe(canonicalLaunchBytes)
  })

  it('vx/vy come LAST among the serialized Body keys (explicit order assertion)', () => {
    const out = serialize(parse(docWithVelocity())) as { bodies: Array<Record<string, unknown>> }
    expect(Object.keys(out.bodies[1]!)).toEqual([
      'shape',
      'radius',
      'id',
      'fixed',
      'mass',
      'position',
      'rotation',
      'vx',
      'vy',
    ])
  })

  it('isDirty stays false for a scene with Initial velocity loaded from its saved bytes', () => {
    const stored = new Map<string, string>([['physics-sim:scene:cena-vel', canonicalLaunchBytes]])
    const storage: Storage = {
      getItem: (k) => stored.get(k) ?? null,
      setItem: (k, v) => void stored.set(k, v),
      removeItem: (k) => void stored.delete(k),
    }
    const scene = loadScene(storage, 'cena-vel')!
    expect(isDirty(storage, 'cena-vel', scene)).toBe(false)
  })
})
