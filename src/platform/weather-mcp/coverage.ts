import type { ListCoverage } from './types.js'

/**
 * The single rule for when an empty NOTAM/SIGMET list may be shown as "none
 * in force": only when the provider marked it `complete`. An `unknown` or
 * absent coverage — or a list with entries — is never a confirmed empty.
 */
export function isConfirmedEmpty(
  list: readonly unknown[],
  coverage: ListCoverage | undefined,
): boolean {
  return list.length === 0 && coverage === 'complete'
}
