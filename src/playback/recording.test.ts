import { expect, it } from 'vitest'
import { Recording, RECORDING_CAP } from './recording'

it('retains the initial record, stops at 600 without evicting, and resets', () => {
  const first = { step: 0 }
  const recording = new Recording(first)
  expect(RECORDING_CAP).toBe(600)
  expect(recording.length).toBe(1)
  expect(recording.at(0)).toBe(first)
  for (let step = 1; step < 600; step++) expect(recording.push({ step })).toBe(true)
  expect(recording.push({ step: 600 })).toBe(false)
  expect(recording.length).toBe(600)
  expect(recording.at(0)).toBe(first)
  expect(recording.at(599)).toEqual({ step: 599 })
  const reset = { step: -1 }
  recording.reset(reset)
  expect(recording.length).toBe(1)
  expect(recording.at(0)).toBe(reset)
  expect(recording.at(1)).toBeUndefined()
  expect(recording.push(first)).toBe(true)
})
