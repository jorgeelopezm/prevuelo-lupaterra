/**
 * Ownership scoping: every query that reads pilot-owned data is constrained by
 * the authenticated pilot's identifier. When a record does not belong to the
 * pilot, the application responds as if the record did not exist (404) and
 * discloses nothing about its existence — never a 403.
 */

/** Returns the row only when it exists and the owner predicate holds. */
export function scopedToOwner<T>(row: T | null | undefined, owns: (row: T) => boolean): T | null {
  if (!row) return null
  return owns(row) ? row : null
}

/**
 * Standard handling for a scoped query result: `null` means "not found from
 * this pilot's perspective" and maps to a 404 in handlers.
 */
export function ownerScoped404(row: unknown): boolean {
  return row === null || row === undefined
}
