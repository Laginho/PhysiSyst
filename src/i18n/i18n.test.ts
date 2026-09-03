import { describe, expect, it, beforeEach } from 'vitest'
import { en } from './en'
import { ptBR } from './pt-BR'
import { t, setLang, initLang, allKeys, LANG_KEY } from './index'

function memStorage() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v) },
    removeItem: (k: string) => { m.delete(k) },
  }
}

describe('i18n catalog completeness', () => {
  it('every pt-BR key exists in EN', () => {
    for (const k of Object.keys(ptBR)) {
      expect((en as Record<string, string>)[k], `missing in EN: ${k}`).toBeDefined()
      expect(typeof (en as Record<string, string>)[k]).toBe('string')
      expect((en as Record<string, string>)[k].length).toBeGreaterThan(0)
    }
  })
  it('every EN key exists in pt-BR', () => {
    for (const k of Object.keys(en)) {
      expect((ptBR as Record<string, string>)[k], `missing in pt-BR: ${k}`).toBeDefined()
    }
  })
  it('catalogs have same key count', () => {
    expect(Object.keys(en).length).toBe(Object.keys(ptBR).length)
  })
  it('allKeys matches pt-BR keys', () => {
    expect(new Set(allKeys())).toEqual(new Set(Object.keys(ptBR)))
  })
})

describe('t()', () => {
  beforeEach(() => setLang('pt-BR'))
  it('returns pt-BR by default', () => {
    expect(t('playback.play')).toBe(ptBR['playback.play'])
  })
  it('returns EN when lang is en', () => {
    setLang('en')
    expect(t('playback.play')).toBe(en['playback.play'])
  })
  it('falls back to key when unknown in both catalogs', () => {
    setLang('en')
    expect(t('__unknown__key__')).toBe('__unknown__key__')
  })
  it('falls back to pt-BR when EN is missing a key present only in pt-BR (hollow-proof)', () => {
    setLang('en')
    const k = 'term.corpoRigido' as const
    const enRec = en as Record<string, string>
    const saved = enRec[k]
    // Simulate production fallback path: EN copy lacks the key
    delete enRec[k]
    try {
      expect(t(k)).toBe(ptBR[k])
    } finally {
      enRec[k] = saved
    }
  })
  it('interpolates params', () => {
    setLang('pt-BR')
    expect(t('forces.title', { id: 'bloco' })).toBe('forças de bloco')
    setLang('en')
    expect(t('forces.title', { id: 'block' })).toBe('forces of block')
  })
  it('keeps {id} visible on missing param (loud dev failure)', () => {
    setLang('pt-BR')
    expect(t('forces.title')).toContain('{id}')
    expect(t('readout.title')).toContain('{id}')
    setLang('en')
    expect(t('forces.title')).toContain('{id}')
  })
})

describe('doc-op reason keys render via t()', () => {
  beforeEach(() => setLang('pt-BR'))
  it('error keys render to pt-BR strings', () => {
    expect(t('error.corpoInexistente')).toBe('corpo inexistente')
    expect(t('error.parConsigoMesmo')).toBe('par consigo mesmo')
    expect(t('error.parDuplicado')).toBe('par duplicado')
    expect(t('error.indiceCorrompido')).toBe('índice de cenas ilegível — iniciando vazio')
  })
  it('error keys render to EN strings', () => {
    setLang('en')
    expect(t('error.corpoInexistente')).toBe('body not found')
    expect(t('error.parConsigoMesmo')).toBe('self-pair not allowed')
    expect(t('error.parDuplicado')).toBe('duplicate pair')
  })
})

describe('persistence', () => {
  it('defaults to pt-BR when absent', () => {
    const s = memStorage()
    expect(initLang(s)).toBe('pt-BR')
  })
  it('persists and reads back', () => {
    const s = memStorage()
    setLang('en', s)
    expect(s.getItem(LANG_KEY)).toBe('en')
    expect(initLang(s)).toBe('en')
    setLang('pt-BR', s)
    expect(initLang(s)).toBe('pt-BR')
  })
  it('ignores invalid stored value', () => {
    const s = memStorage()
    s.setItem(LANG_KEY, 'fr')
    expect(initLang(s)).toBe('pt-BR')
  })
})

describe('physics terminology', () => {
  it('pt-BR has atrito estático, atrito cinético, corpo rígido', () => {
    expect(ptBR['term.atritoEstatico']).toBe('atrito estático')
    expect(ptBR['term.atritoCinetico']).toBe('atrito cinético')
    expect(ptBR['term.corpoRigido']).toBe('corpo rígido')
  })
  it('EN has static/kinetic friction and rigid body', () => {
    expect(en['term.atritoEstatico']).toBe('static friction')
    expect(en['term.atritoCinetico']).toBe('kinetic friction')
    expect(en['term.corpoRigido']).toBe('rigid body')
  })
  it('symbols universal', () => {
    expect(ptBR['properties.alpha']).toContain('α')
    expect(en['properties.alpha']).toContain('α')
    expect(ptBR['contacts.muS']).toContain('μs')
    expect(en['contacts.muS']).toContain('μs')
  })
})

describe('terminology consumed in labels', () => {
  beforeEach(() => setLang('pt-BR'))
  it('μs label composes atrito estático / static friction', () => {
    expect(t('contacts.muS')).toContain('atrito estático')
    setLang('en')
    expect(t('contacts.muS')).toContain('static friction')
  })
  it('μk label composes atrito cinético / kinetic friction', () => {
    setLang('pt-BR')
    expect(t('contacts.muK')).toContain('atrito cinético')
    setLang('en')
    expect(t('contacts.muK')).toContain('kinetic friction')
  })
  it('particle-mode label composes corpo rígido / rigid body', () => {
    setLang('pt-BR')
    expect(t('panel.particleMode')).toContain('corpo rígido')
    setLang('en')
    expect(t('panel.particleMode')).toContain('rigid body')
  })
})
