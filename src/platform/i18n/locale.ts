/**
 * Localization: the source of truth for supported locales, locale resolution
 * (stored pilot preference → Accept-Language negotiation → default), and path
 * parsing. Per-locale path segments for feature domains live in
 * `segments.ts`, sourced from the catalogs.
 */

export const SUPPORTED_LOCALES = ['es', 'pt', 'en'] as const

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: SupportedLocale = 'es'

const LOCALE_SET: ReadonlySet<string> = new Set<string>(SUPPORTED_LOCALES)

export function isSupportedLocale(value: string): value is SupportedLocale {
  return LOCALE_SET.has(value)
}

/**
 * Accept-Language negotiation against the supported set. Picks the first
 * supported locale among the client's preferences (by weight, then order),
 * e.g. `pt-BR,pt;q=0.9` → `pt`. Returns the default locale when nothing matches.
 */
export function negotiateLocale(
  acceptLanguage: string | undefined,
  supported: readonly SupportedLocale[] = SUPPORTED_LOCALES,
): SupportedLocale {
  if (!acceptLanguage) return DEFAULT_LOCALE
  const accepted = parseAcceptLanguage(acceptLanguage)
  for (const { lang } of accepted) {
    if (supported.includes(lang as SupportedLocale)) {
      return lang as SupportedLocale
    }
    const primary = lang.split('-')[0]
    if (supported.includes(primary as SupportedLocale)) {
      return primary as SupportedLocale
    }
  }
  return DEFAULT_LOCALE
}

function parseAcceptLanguage(header: string): Array<{ lang: string; q: number }> {
  return header
    .split(',')
    .map((part) => {
      const pieces = part.trim().split(';')
      const lang = (pieces[0] ?? '').trim().toLowerCase()
      const qRaw = pieces.find((p) => p.trim().startsWith('q='))
      const q = qRaw ? Number(qRaw.trim().slice(2)) : 1
      return { lang, q: Number.isFinite(q) ? q : 1 }
    })
    .filter((entry) => entry.lang.length > 0)
    .sort((a, b) => b.q - a.q)
}

export interface LocaleResolutionInput {
  /** Stored pilot preference, if the pilot is authenticated. */
  storedLocale?: SupportedLocale | null
  acceptLanguage?: string
}

/**
 * Resolve the effective locale for a request, in order:
 *   1. the authenticated pilot's stored preference,
 *   2. `Accept-Language` negotiated against the supported set,
 *   3. the default locale.
 */
export function resolveLocale(input: LocaleResolutionInput = {}): SupportedLocale {
  if (input.storedLocale && isSupportedLocale(input.storedLocale)) {
    return input.storedLocale
  }
  return negotiateLocale(input.acceptLanguage)
}

/** First path segment of a URL path (the locale segment), lower-cased. */
export function firstPathSegment(urlPath: string): string {
  const clean = urlPath.split('?')[0] ?? ''
  return (clean.split('/')[1] ?? '').toLowerCase()
}
