import { en } from './en'
import { ptBR } from './pt-BR'

export const LANG_KEY = 'physics-sim:lang'
export type Lang = 'pt-BR' | 'en'
export type Catalog = typeof ptBR
export type I18nKey = keyof Catalog

const catalogs: Record<Lang, Catalog> = {
  'pt-BR': ptBR,
  // en is structurally identical; cast keeps catalog completeness test honest
  'en': en as unknown as Catalog,
}

let currentLang: Lang = 'pt-BR'

export function getLang(storage?: { getItem(k: string): string | null }): Lang {
  try {
    const raw = storage ? storage.getItem(LANG_KEY) : typeof localStorage !== 'undefined' ? localStorage.getItem(LANG_KEY) : null
    if (raw === 'en' || raw === 'pt-BR') return raw
  } catch {}
  return 'pt-BR'
}

export function setLang(lang: Lang, storage?: { setItem(k: string, v: string): void }): void {
  currentLang = lang
  try {
    if (storage) storage.setItem(LANG_KEY, lang)
    else if (typeof localStorage !== 'undefined') localStorage.setItem(LANG_KEY, lang)
  } catch {}
}

export function initLang(storage?: { getItem(k: string): string | null }): Lang {
  const lang = getLang(storage)
  currentLang = lang
  return lang
}

// call at module load to hydrate from localStorage (no-op in Vitest without window)
initLang()

export function t(key: string, params?: Record<string, string | number>): string {
  const catalog = catalogs[currentLang] ?? ptBR
  const fallback = ptBR as Record<string, string>
  let template: string = (catalog as Record<string, string>)[key] ?? fallback[key] ?? key
  if (params) {
    for (const [k, v] of Object.entries(params)) template = template.replaceAll(`{${k}}`, String(v))
  }
  return template
}

export function getCatalog(lang: Lang): Catalog {
  return catalogs[lang]
}

export function allKeys(): string[] {
  return Object.keys(ptBR)
}
