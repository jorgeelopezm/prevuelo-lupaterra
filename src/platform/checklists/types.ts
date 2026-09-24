export type ChecklistKind = 'normal' | 'emergency'
export type ChecklistSource = 'template' | 'pilot'
export type ChecklistRole = 'preflight'

export interface Checklist {
  id: string
  pilotId: string
  aircraftId: string
  name: string
  kind: ChecklistKind
  role: ChecklistRole | null
  source: ChecklistSource
  templateVersion: number | null
  position: number
  createdAt: Date
  updatedAt: Date
}

export interface ChecklistItem {
  id: string
  pilotId: string
  checklistId: string
  text: string
  /** Reserved for challenge/response items (design open question 2); unused
   * and unread in v1. */
  response: string | null
  position: number
  createdAt: Date
  updatedAt: Date
}

export interface ChecklistWithItems extends Checklist {
  items: ChecklistItem[]
}

/** A run's items are a point-in-time copy of a checklist's items (design
 * decision 1) — `checklistItemId` is kept only for provenance and is never
 * read for display text. */
export interface ChecklistRunItem {
  id: string
  pilotId: string
  runId: string
  checklistItemId: string | null
  text: string
  position: number
  checkedAt: Date | null
}

export interface ChecklistRun {
  id: string
  pilotId: string
  /** `null` once the checklist that started this run has been deleted
   * (design decision: "Deleting a checklist preserves completed runs") —
   * `checklistName` is denormalized onto the run for exactly that case. */
  checklistId: string | null
  checklistName: string
  flightIntentId: string
  aircraftId: string
  startedAt: Date
  completedAt: Date | null
}

export interface ChecklistRunWithItems extends ChecklistRun {
  items: ChecklistRunItem[]
}

/** The home tile's sourced figure (design decision 11). Every field that can
 * be absent is represented by the whole value being `null` — no sentinel
 * counts. */
export interface PreflightProgress {
  checklistName: string
  checkedCount: number
  totalCount: number
}

export interface CreateChecklistInput {
  aircraftId: string
  name: string
  kind: ChecklistKind
}

export type ChecklistWriteFailureReason = 'aircraft_not_owned' | 'not_found'

export type ChecklistWriteResult =
  { ok: true; checklist: Checklist } | { ok: false; reason: ChecklistWriteFailureReason }

export type SetPreflightRoleResult =
  { ok: true } | { ok: false; reason: 'not_found' | 'cannot_be_emergency' }
