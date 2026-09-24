/**
 * Derives a document's (or a date-based maintenance item's) validity status
 * from its expiry date and the current date — never stored, always computed
 * at render time (aircraft-fleet spec: "Document validity status is derived,
 * never entered").
 */
export type DocumentStatus = 'none' | 'ok' | 'expiring_soon' | 'expired'

/**
 * @param expiresOn ISO date (`YYYY-MM-DD`) or `null` for a non-expiring document.
 * @param now Current instant (injectable for tests).
 * @param warningDays The advance-warning window in days (`DOCUMENT_WARNING_DAYS`).
 */
export function documentStatus(
  expiresOn: string | null,
  now: Date,
  warningDays: number,
): DocumentStatus {
  if (!expiresOn) return 'none'
  const expiry = new Date(`${expiresOn}T00:00:00Z`)
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const daysRemaining = Math.floor((expiry.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
  if (daysRemaining < 0) return 'expired'
  if (daysRemaining <= warningDays) return 'expiring_soon'
  return 'ok'
}

/** Days remaining until expiry (negative once expired), or `null` for a
 * non-expiring document. Used alongside `documentStatus` to show "N days". */
export function daysUntil(expiresOn: string | null, now: Date): number | null {
  if (!expiresOn) return null
  const expiry = new Date(`${expiresOn}T00:00:00Z`)
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  return Math.floor((expiry.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
}
