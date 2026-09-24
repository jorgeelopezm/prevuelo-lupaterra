import { z } from 'zod'

import type { ChecklistKind, CreateChecklistInput } from '../../platform/checklists/types.js'

/**
 * Field-level validation errors keyed by form field name, resolved to
 * catalog keys (never English text) so the route handler only has to
 * translate them.
 */
export type ChecklistFormErrors = Record<string, string>

export type ChecklistFormResult<T> =
  { ok: true; data: T } | { ok: false; errors: ChecklistFormErrors }

function firstIssueErrors(error: z.ZodError): ChecklistFormErrors {
  const errors: ChecklistFormErrors = {}
  for (const issue of error.issues) {
    const field = issue.path[0] ? String(issue.path[0]) : 'general'
    if (!errors[field]) errors[field] = issue.message
  }
  return errors
}

const checklistFormSchema = z.object({
  aircraftId: z.string().trim().min(1, 'checklist.error.aircraft_required'),
  name: z.string().trim().min(1, 'checklist.error.name_required'),
  kind: z.enum(['normal', 'emergency'], { message: 'checklist.error.kind_invalid' }),
})

/** Creating a checklist (aircraft-checklists: "Creating a checklist" /
 * "Empty name is rejected"). */
export function validateChecklistForm(
  body: Record<string, unknown>,
): ChecklistFormResult<CreateChecklistInput> {
  const parsed = checklistFormSchema.safeParse(body)
  if (!parsed.success) return { ok: false, errors: firstIssueErrors(parsed.error) }
  return {
    ok: true,
    data: {
      aircraftId: parsed.data.aircraftId,
      name: parsed.data.name,
      kind: parsed.data.kind as ChecklistKind,
    },
  }
}

const nameFormSchema = z.object({
  name: z.string().trim().min(1, 'checklist.error.name_required'),
})

/** Renaming a checklist (aircraft-checklists: "Empty name is rejected"). */
export function validateChecklistNameForm(
  body: Record<string, unknown>,
): ChecklistFormResult<{ name: string }> {
  const parsed = nameFormSchema.safeParse(body)
  if (!parsed.success) return { ok: false, errors: firstIssueErrors(parsed.error) }
  return { ok: true, data: parsed.data }
}

const itemTextFormSchema = z.object({
  text: z.string().trim().min(1, 'checklist.error.item_text_required'),
})

/** Adding or editing an item (aircraft-checklists: "Empty name is
 * rejected" extended to item text). */
export function validateChecklistItemForm(
  body: Record<string, unknown>,
): ChecklistFormResult<{ text: string }> {
  const parsed = itemTextFormSchema.safeParse(body)
  if (!parsed.success) return { ok: false, errors: firstIssueErrors(parsed.error) }
  return { ok: true, data: parsed.data }
}
