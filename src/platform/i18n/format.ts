import type { SupportedLocale } from './locale.js'

/**
 * Locale-aware value formatting. Dates, times, and numeric quantities use the
 * active locale's conventions (Intl). Times that carry operational meaning are
 * rendered in UTC with an explicit `Z` suffix ({@link formatUtc}).
 */
export function formatDate(date: Date, locale: SupportedLocale): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(date)
}

export function formatLongDate(date: Date, locale: SupportedLocale): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(date)
}

/** Local-time rendering of a date/time in the active locale. */
export function formatTime(
  date: Date,
  locale: SupportedLocale,
  opts: Intl.DateTimeFormatOptions = {},
): string {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    ...opts,
  }).format(date)
}

/** UTC rendering with an explicit `Z` suffix, e.g. `10:30Z`. */
export function formatUtc(date: Date, locale: SupportedLocale): string {
  const time = formatTime(date, locale, { timeZone: 'UTC' })
  return `${time}Z`
}

/** UTC date-time with an explicit `Z` suffix, e.g. `26 Jul 2026, 10:30Z`. */
export function formatUtcDateTime(date: Date, locale: SupportedLocale): string {
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
  return `${parts}Z`
}

export function formatNumber(value: number, locale: SupportedLocale): string {
  return new Intl.NumberFormat(locale).format(value)
}

export function formatPercent(value: number, locale: SupportedLocale): string {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(value)
}
