import type { MaintenanceItemRecord, MaintenanceStatus } from './types.js'

export interface MaintenanceDerivation {
  status: MaintenanceStatus
  daysRemaining: number | null
  hoursRemaining: number | null
  /** `false` when the item has an hours-based due condition but the aircraft
   * has no derivable hour total to compare against (maintenance-tracking
   * spec: "No countdown without the data to compute it"). */
  hoursComputable: boolean
}

/**
 * Derive a maintenance item's due status and remaining time/hours. Pure
 * function of the item's due conditions, the current date, the aircraft's
 * current derived hour total (or `null` when not computable), and the
 * configured advance-warning windows — nothing here is stored.
 */
export function deriveMaintenanceStatus(
  item: Pick<MaintenanceItemRecord, 'dueOn' | 'dueAtHours' | 'hoursBasis'>,
  now: Date,
  currentHours: number | null,
  warningDays: number,
  warningHours: number,
): MaintenanceDerivation {
  let daysRemaining: number | null = null
  let daysStatus: MaintenanceStatus | null = null
  if (item.dueOn) {
    const due = new Date(`${item.dueOn}T00:00:00Z`)
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    daysRemaining = Math.floor((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
    daysStatus = daysRemaining < 0 ? 'overdue' : daysRemaining <= warningDays ? 'due_soon' : 'ok'
  }

  let hoursRemaining: number | null = null
  let hoursStatus: MaintenanceStatus | null = null
  let hoursComputable = true
  if (item.dueAtHours !== null) {
    if (currentHours === null) {
      hoursComputable = false
    } else {
      hoursRemaining = item.dueAtHours - currentHours
      hoursStatus =
        hoursRemaining < 0 ? 'overdue' : hoursRemaining <= warningHours ? 'due_soon' : 'ok'
    }
  }

  // The nearest (most urgent) of the two conditions governs the overall
  // status (spec: "Nearest condition governs").
  const severity: Record<MaintenanceStatus, number> = { ok: 0, due_soon: 1, overdue: 2 }
  const candidates = [daysStatus, hoursStatus].filter((s): s is MaintenanceStatus => s !== null)
  const status = candidates.length
    ? candidates.reduce((a, b) => (severity[b] > severity[a] ? b : a))
    : 'ok'

  return { status, daysRemaining, hoursRemaining, hoursComputable }
}

/**
 * Roll a recurring item's due condition forward from its completion values
 * (spec: "Completing an item" — recurring rolls forward, non-recurring
 * closes with no new due condition).
 */
export function rollForward(
  item: Pick<MaintenanceItemRecord, 'recurrenceMonths' | 'recurrenceHours'>,
  completedOn: string,
  completedAtHours: number | null,
): { dueOn: string | null; dueAtHours: number | null } {
  let dueOn: string | null = null
  if (item.recurrenceMonths) {
    const date = new Date(`${completedOn}T00:00:00Z`)
    date.setUTCMonth(date.getUTCMonth() + item.recurrenceMonths)
    dueOn = date.toISOString().slice(0, 10)
  }
  let dueAtHours: number | null = null
  if (item.recurrenceHours && completedAtHours !== null) {
    dueAtHours = completedAtHours + item.recurrenceHours
  }
  return { dueOn, dueAtHours }
}
