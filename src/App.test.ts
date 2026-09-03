import { describe, expect, it } from 'vitest'
import App from './App'

describe('smoke', () => {
  it('loads the app module and exports a component', () => {
    expect(typeof App).toBe('function')
  })
})
