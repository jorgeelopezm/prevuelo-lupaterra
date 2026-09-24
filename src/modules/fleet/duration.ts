/**
 * Duration parsing/formatting for the fleet module. Every flight-time value is
 * stored as integer minutes (design decision 2) so summing thousands of legs
 * stays exact; forms accept and redisplay decimal hours (`0.9`) or `h:mm`
 * (`0:54`), converting at this one boundary.
 */

const DECIMAL_HOURS_PATTERN = /^\d+(\.\d+)?$/
const HOURS_MINUTES_PATTERN = /^(\d+):([0-5]\d)$/

/**
 * Parse a pilot-entered duration into whole minutes. Accepts decimal hours
 * (`"0.9"` → 54) or `h:mm` (`"0:54"` → 54). Returns `null` for anything
 * negative, non-numeric, or otherwise unparseable — callers turn that into a
 * field-level validation message rather than a thrown error.
 */
export function parseDurationToMinutes(input: string): number | null {
  const trimmed = input.trim()
  if (trimmed.length === 0) return null

  const hm = HOURS_MINUTES_PATTERN.exec(trimmed)
  if (hm) {
    const hours = Number(hm[1])
    const minutes = Number(hm[2])
    return hours * 60 + minutes
  }

  if (DECIMAL_HOURS_PATTERN.test(trimmed)) {
    const hours = Number(trimmed)
    if (!Number.isFinite(hours) || hours < 0) return null
    return Math.round(hours * 60)
  }

  return null
}

/** Format whole minutes back to decimal hours for redisplay, e.g. 54 → "0.9". */
export function formatMinutesAsDecimalHours(minutes: number): string {
  return (minutes / 60).toFixed(1)
}

/** Format whole minutes back to `h:mm` for redisplay, e.g. 54 → "0:54". */
export function formatMinutesAsHoursMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours}:${String(mins).padStart(2, '0')}`
}
