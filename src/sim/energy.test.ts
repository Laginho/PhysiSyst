import { describe, expect, it } from 'vitest'
import type { Body, Scene } from '../scene'
import type { BodyState, ConstraintState } from './simulator'
import { bodyEnergy, centerOfMass, momentOfInertia, systemEnergy } from './energy'

const square: Body = { id: 'body', shape: 'rectangle', width: 0.4, height: 0.4, mass: 2, fixed: false, position: { x: 0, y: 0 }, rotation: 0 }
const circle: Body = { ...square, shape: 'circle', radius: 0.5, mass: 3 }
const triangle: Body = { ...square, shape: 'triangle', base: 1, alpha: 45, mass: 1 }
const state: BodyState = { position: { x: 1, y: 3 }, rotation: 0, linvel: { x: 1, y: 0 }, angvel: 2 }
const scene = (bodies: Body[] = [square]): Scene => ({ version: 1, constants: { g: 10 }, bodies, forces: [], contacts: [] })

describe('energy and momentum (PHY-70)', () => {
  it.each([
    [square, 0.05333333333333334],
    [circle, 0.375],
    [triangle, 0.1111111111111111],
  ])('computes centroidal inertia for $shape', (body, expected) => {
    expect(momentOfInertia(body)).toBeCloseTo(expected, 9)
  })

  it('rotates the triangle centroid offset from its alpha vertex', () => {
    const cm = centerOfMass({ ...triangle, base: 3, alpha: 30 }, { ...state, position: { x: 1, y: 1 }, rotation: Math.PI / 2 })
    expect(cm.x).toBeCloseTo(0.42264973081037427, 9)
    expect(cm.y).toBeCloseTo(3, 9)
    expect(centerOfMass(square, state)).toEqual(state.position)
    expect(centerOfMass(circle, state)).toEqual(state.position)
  })

  it('uses current velocity, centroid height, gravity and particle mode', () => {
    expect(bodyEnergy(scene(), square, state)).toEqual({ Ec: 1.1066666666666667, Epg: 60, p: { x: 2, y: 0 } })
    const doc = scene()
    doc.constants.particleMode = true
    expect(bodyEnergy(doc, square, state).Ec).toBe(1)
    expect(bodyEnergy(scene(), triangle, { ...state, position: { x: 0, y: 0 } }).Epg).toBeCloseTo(10 / 3, 9)
    doc.constants.g = -2
    expect(bodyEnergy(doc, square, { ...state, linvel: { x: -3, y: 4 } })).toEqual({ Ec: 25, Epg: -12, p: { x: -6, y: 8 } })
  })

  it('sums moving bodies and excludes fixed bodies even with nonzero readback velocities', () => {
    const fixed = { ...square, id: 'floor', fixed: true, mass: 1000 }
    const doc = scene([square, { ...circle, id: 'ball' }, fixed])
    const states = new Map([['floor', state], ['ball', { ...state, linvel: { x: -1, y: 2 }, angvel: 0 }], ['body', state]])
    const result = systemEnergy(doc, states, [], [])
    expect(result.Ec).toBeCloseTo(8.606666666666667, 9)
    expect(result.Epg).toBe(150)
    expect(result.p).toEqual({ x: -1, y: 6 })
    expect(result.Emec).toBeCloseTo(158.60666666666665, 9)
  })

  it.each([false, true])('includes spring and disk energy with particleMode=%s', (particleMode) => {
    const doc = scene([])
    doc.constants.particleMode = particleMode
    const end = { bodyId: 'mount', anchor: { x: 0, y: 0 } }
    doc.constraints = [
      { id: 'spring', kind: 'spring', a: end, b: end, k: 50, x0: 1 },
      { id: 'ideal', kind: 'spring', a: end, b: end, k: 100, x0: 1 },
      { id: 'rope', kind: 'rope', a: end, b: end, via: [] },
    ]
    doc.pulleys = [{ id: 'disk', bodyId: 'mount', anchor: end.anchor, mass: 2, radius: 0.5 }]
    const constraints: ConstraintState[] = [
      { id: 'rope', kind: 'rope', tension: 10, slack: false, segments: [10] },
      { id: 'ideal', kind: 'spring', dx: -0.1, force: { a: -10, b: -10 } },
      { id: 'spring', kind: 'spring', dx: 0.2, chainKinetic: 0.3, force: { a: 10, b: 10 } },
    ]
    const result = systemEnergy(doc, new Map(), constraints, [{ id: 'disk', angvel: -4 }])
    expect(result.Eel).toBeCloseTo(1.5, 9)
    expect(result.Ec).toBeCloseTo(2.3, 9)
    expect(result.Emec).toBeCloseTo(3.8, 9)
    expect(result.p).toEqual({ x: 0, y: 0 })
  })

  it('returns zero for an empty scene without optional elements', () => {
    expect(systemEnergy(scene([]), new Map(), [], [])).toEqual({ Ec: 0, Epg: 0, Eel: 0, Emec: 0, p: { x: 0, y: 0 } })
  })
})
