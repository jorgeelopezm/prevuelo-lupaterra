/**
 * Server-side locale helpers. The authoritative localization logic lives in the
 * platform i18n module; this file re-exports it for server code that predates
 * the move and keeps the `resolveLocaleFromUrl` name stable for request logging.
 */
import {
  DEFAULT_LOCALE,
  firstPathSegment,
  isSupportedLocale,
  negotiateLocale,
  resolveLocale,
  SUPPORTED_LOCALES,
} from '../platform/i18n/locale.js'
import type { SupportedLocale } from '../platform/i18n/locale.js'

export {
  DEFAULT_LOCALE,
  firstPathSegment,
  isSupportedLocale,
  negotiateLocale,
  resolveLocale,
  SUPPORTED_LOCALES,
}
export type { SupportedLocale }

/**
 * Lightweight locale resolution from a URL path for log records; the
 * authoritative resolution is the localization work's routing pipeline.
 */
export function resolveLocaleFromUrl(url: string): string {
  const segment = firstPathSegment(url)
  return isSupportedLocale(segment) ? segment : DEFAULT_LOCALE
}
