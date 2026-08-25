import { readFileSync } from 'node:fs'

import { CHROME_STRINGS } from './chrome.js'
import { isSupportedLocale, SUPPORTED_LOCALES, type SupportedLocale } from './locale.js'

export type CatalogValue = string | string[]

export type Catalog = Record<string, CatalogValue>
export type Catalogs = Record<SupportedLocale, Catalog>

const CATALOG_URL: Record<SupportedLocale, string> = {
  es: new URL('./catalogs/es.json', import.meta.url).href,
  pt: new URL('./catalogs/pt.json', import.meta.url).href,
  en: new URL('./catalogs/en.json', import.meta.url).href,
}

function loadCatalog(locale: SupportedLocale): Catalog {
  const raw = readFileSync(new URL(CATALOG_URL[locale]), 'utf8')
  return { ...(JSON.parse(raw) as Catalog), ...CHROME_STRINGS[locale] }
}

let cached: Catalogs | null = null

/** Load every catalog once and keep the immutable table in memory. */
export function loadCatalogs(): Catalogs {
  if (cached) return cached
  const catalogs = {} as Catalogs
  for (const locale of SUPPORTED_LOCALES) {
    catalogs[locale] = loadCatalog(locale)
  }
  cached = catalogs
  return catalogs
}

export interface Translator {
  /** Resolve interface text for the active locale with the fallback chain. */
  translate(key: string): string
  /** Resolve a catalog array value (renders the key itself when missing). */
  translateArray(key: string): string[]
  /** Render the translation key itself (missing-marker behaviour). */
  raw(key: string): string
  locale: SupportedLocale
}

export interface TranslatorOptions {
  locale: string
  catalogs?: Catalogs
  /** Emitted when a key falls back to the `en` catalog. */
  onFallback?: (key: string, locale: string) => void
}

/**
 * Build a translator for a locale. Missing keys fall back to the `en` catalog
 * (logging a warning), then to the key itself — never an empty string.
 */
export function createTranslator(opts: TranslatorOptions): Translator {
  const locale = opts.locale
  const requested = opts.catalogs ?? loadCatalogs()

  if (!isSupportedLocale(locale)) {
    throw new Error(`Unsupported translator locale: ${locale}`)
  }

  const lookup = (key: string, onlyFor?: SupportedLocale): CatalogValue | undefined => {
    const cat = onlyFor ?? locale
    const catalog = requested[cat]
    return catalog?.[key] ?? (onlyFor ? undefined : requested.en[key])
  }

  const translate = (key: string): string => {
    const direct = lookup(key, locale)
    if (direct !== undefined) return typeof direct === 'string' ? direct : key
    const english = lookup(key, 'en')
    if (english !== undefined) {
      opts.onFallback?.(key, locale)
      return typeof english === 'string' ? english : key
    }
    return key
  }

  const translateArray = (key: string): string[] => {
    const direct = lookup(key, locale)
    if (Array.isArray(direct)) return direct as string[]
    const english = lookup(key, 'en')
    if (Array.isArray(english)) {
      opts.onFallback?.(key, locale)
      return english as string[]
    }
    // Not an array anywhere: render the key to avoid an empty value.
    return [key]
  }

  return {
    translate,
    translateArray,
    raw: (key) => key,
    locale,
  }
}
