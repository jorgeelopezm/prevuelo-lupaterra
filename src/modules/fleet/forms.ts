import { z } from 'zod'

import type {
  CompleteMaintenanceInput,
  CreateAircraftDocumentInput,
  CreateAircraftInput,
  CreateFlightEntryInput,
  CreateMaintenanceItemInput,
  CreateWbProfileInput,
} from '../../platform/fleet/types.js'
import { parseDurationToMinutes } from './duration.js'

/** ICAO tail marks: letters, digits, and hyphens, 2-10 characters — plausible
 * across national registration schemes (EC-ABC, N4521G, PT-ABC, CS-ABC). */
const REGISTRATION_PATTERN = /^[A-Za-z0-9-]{2,10}$/

/**
 * Field-level validation errors keyed by form field name, resolved to catalog
 * keys (never English text) so the route handler only has to translate them.
 * `general` carries an error not tied to one field (e.g. a duplicate
 * registration, which is only known after checking the database).
 */
export type FleetFormErrors = Record<string, string>

export type FleetFormResult<T> = { ok: true; data: T } | { ok: false; errors: FleetFormErrors }

const optionalTrimmed = z
  .string()
  .optional()
  .transform((v) => (v && v.trim().length > 0 ? v.trim() : null))

const yearField = z
  .string()
  .optional()
  .transform((v) => (v && v.trim().length > 0 ? Number(v.trim()) : null))

const aircraftFormSchema = z
  .object({
    registration: z
      .string()
      .trim()
      .min(1, 'fleet.error.registration_required')
      .regex(REGISTRATION_PATTERN, 'fleet.error.registration_format'),
    icaoType: z.string().trim().min(1, 'fleet.error.icao_type_required'),
    manufacturer: z.string().trim().min(1, 'fleet.error.manufacturer_required'),
    model: z.string().trim().min(1, 'fleet.error.model_required'),
    serialNumber: optionalTrimmed,
    classCategory: optionalTrimmed,
    engine: optionalTrimmed,
    propeller: optionalTrimmed,
    yearOfManufacture: yearField,
    homeBase: optionalTrimmed,
    nickname: optionalTrimmed,
    openingAirframeHours: z
      .string()
      .optional()
      .transform((v) => (v && v.trim().length > 0 ? Number(v.trim()) : null)),
    openingEngineHours: z
      .string()
      .optional()
      .transform((v) => (v && v.trim().length > 0 ? Number(v.trim()) : null)),
    openingTachHours: z
      .string()
      .optional()
      .transform((v) => (v && v.trim().length > 0 ? Number(v.trim()) : null)),
    openingLandings: z
      .string()
      .optional()
      .transform((v) => (v && v.trim().length > 0 ? Number(v.trim()) : null)),
  })
  .superRefine((data, ctx) => {
    for (const [field, value] of [
      ['openingAirframeHours', data.openingAirframeHours],
      ['openingEngineHours', data.openingEngineHours],
      ['openingTachHours', data.openingTachHours],
    ] as const) {
      if (value !== null && (!Number.isFinite(value) || value < 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: 'fleet.error.hours_invalid',
        })
      }
    }
    if (
      data.openingLandings !== null &&
      (!Number.isInteger(data.openingLandings) || data.openingLandings < 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['openingLandings'],
        message: 'fleet.error.landings_invalid',
      })
    }
  })

/**
 * Validate a submitted aircraft create/edit form body. Registration
 * uniqueness cannot be checked here (it needs the pilot's other aircraft) —
 * the route handler checks it via the repository after this passes and adds
 * a `general` error on conflict.
 */
export function validateAircraftForm(
  body: Record<string, unknown>,
): FleetFormResult<CreateAircraftInput> {
  const parsed = aircraftFormSchema.safeParse(body)
  if (!parsed.success) {
    const errors: FleetFormErrors = {}
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] ? String(issue.path[0]) : 'general'
      if (!errors[field]) errors[field] = issue.message
    }
    return { ok: false, errors }
  }
  return { ok: true, data: parsed.data }
}

const isoDateField = z
  .string()
  .optional()
  .transform((v) => (v && v.trim().length > 0 ? v.trim() : null))
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), 'fleet.error.date_invalid')

const documentFormSchema = z.object({
  kind: z.string().trim().min(1, 'fleet.error.document_kind_required'),
  reference: optionalTrimmed,
  issuedOn: isoDateField,
  expiresOn: isoDateField,
})

/** Validate a submitted airworthiness/document form. Issue-before-expiry is
 * re-checked by the repository (the authoritative check, backed by the DB
 * constraint); this only validates the date format and required fields. */
export function validateDocumentForm(
  body: Record<string, unknown>,
): FleetFormResult<CreateAircraftDocumentInput> {
  const parsed = documentFormSchema.safeParse(body)
  if (!parsed.success) {
    const errors: FleetFormErrors = {}
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] ? String(issue.path[0]) : 'general'
      if (!errors[field]) errors[field] = issue.message
    }
    return { ok: false, errors }
  }
  return { ok: true, data: parsed.data }
}

const numericField = z
  .string()
  .optional()
  .transform((v) => (v && v.trim().length > 0 ? Number(v.trim()) : null))
  .refine((v) => v === null || Number.isFinite(v), 'fleet.error.wb_value_invalid')

const stationRowSchema = z.object({
  name: z.string().trim(),
  arm: z.string().trim(),
  maxWeight: z.string().trim().optional(),
})

const pointRowSchema = z.object({
  weight: z.string().trim(),
  cg: z.string().trim(),
})

const WB_STATION_ROWS = 4
const WB_ENVELOPE_ROWS = 4

const wbFormSchema = z.object({
  emptyWeight: numericField,
  emptyWeightArm: numericField,
  mtow: numericField,
  mlw: numericField,
  mzfw: numericField,
  usableFuelQty: numericField,
  usableFuelArm: numericField,
  massUnit: optionalTrimmed,
  lengthUnit: optionalTrimmed,
  stations: z.array(stationRowSchema).length(WB_STATION_ROWS),
  points: z.array(pointRowSchema).length(WB_ENVELOPE_ROWS),
})

/**
 * Parse the fixed-row weight & balance form (no JavaScript: a fixed number of
 * optional station/envelope-point row inputs rather than a dynamically
 * added/removed row list). A row whose name (station) or weight+cg (point) is
 * blank is skipped rather than stored as an empty entry.
 */
export function parseWbForm(body: Record<string, unknown>): FleetFormResult<CreateWbProfileInput> {
  const stations = Array.from({ length: WB_STATION_ROWS }, (_, i) => ({
    name: String(body[`station_name_${i}`] ?? ''),
    arm: String(body[`station_arm_${i}`] ?? ''),
    maxWeight: String(body[`station_max_weight_${i}`] ?? ''),
  }))
  const points = Array.from({ length: WB_ENVELOPE_ROWS }, (_, i) => ({
    weight: String(body[`point_weight_${i}`] ?? ''),
    cg: String(body[`point_cg_${i}`] ?? ''),
  }))

  const parsed = wbFormSchema.safeParse({ ...body, stations, points })
  if (!parsed.success) {
    const errors: FleetFormErrors = {}
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] ? String(issue.path[0]) : 'general'
      if (!errors[field]) errors[field] = issue.message
    }
    return { ok: false, errors }
  }

  const data = parsed.data
  const loadStations: CreateWbProfileInput['loadStations'] = []
  for (const row of data.stations) {
    if (!row.name.trim()) continue
    const arm = Number(row.arm)
    if (!Number.isFinite(arm)) {
      return { ok: false, errors: { general: 'fleet.error.wb_value_invalid' } }
    }
    const maxWeight = row.maxWeight && row.maxWeight.trim() ? Number(row.maxWeight) : null
    loadStations.push({ name: row.name.trim(), arm, maxWeight })
  }

  const envelopePoints: CreateWbProfileInput['envelopePoints'] = []
  for (const row of data.points) {
    if (!row.weight.trim() && !row.cg.trim()) continue
    const weight = Number(row.weight)
    const cg = Number(row.cg)
    if (!Number.isFinite(weight) || !Number.isFinite(cg)) {
      return { ok: false, errors: { general: 'fleet.error.wb_value_invalid' } }
    }
    envelopePoints.push({ weight, cg })
  }

  return {
    ok: true,
    data: {
      emptyWeight: data.emptyWeight,
      emptyWeightArm: data.emptyWeightArm,
      mtow: data.mtow,
      mlw: data.mlw,
      mzfw: data.mzfw,
      usableFuelQty: data.usableFuelQty,
      usableFuelArm: data.usableFuelArm,
      massUnit: data.massUnit,
      lengthUnit: data.lengthUnit,
      loadStations,
      envelopePoints,
    },
  }
}

export const WB_FORM_ROWS = { stations: WB_STATION_ROWS, points: WB_ENVELOPE_ROWS }

const ICAO_LOCATION_PATTERN = /^[A-Za-z]{4}$/
const PILOT_FUNCTIONS = ['pic', 'spic', 'sic', 'dual', 'instructor'] as const

function optionalDurationField(fieldKey: string) {
  return z
    .string()
    .optional()
    .transform((v, ctx) => {
      const trimmed = (v ?? '').trim()
      if (trimmed.length === 0) return 0
      const minutes = parseDurationToMinutes(trimmed)
      if (minutes === null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `fleet.error.${fieldKey}_invalid` })
        return z.NEVER
      }
      return minutes
    })
}

function optionalCounterField(fieldKey: string) {
  return z
    .string()
    .optional()
    .transform((v) => (v && v.trim().length > 0 ? Number(v.trim()) : null))
    .refine((v) => v === null || Number.isFinite(v), `fleet.error.${fieldKey}_invalid`)
}

const flightEntryFormSchema = z
  .object({
    entryType: z.enum(['flight', 'fstd']).default('flight'),
    aircraftId: z.string().optional(),
    flightDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'fleet.error.date_invalid'),
    departureAerodrome: optionalTrimmed,
    departureTime: optionalTrimmed,
    arrivalAerodrome: optionalTrimmed,
    arrivalTime: optionalTrimmed,
    pilotFunction: z.enum(PILOT_FUNCTIONS, {
      message: 'fleet.error.pilot_function_required',
    }),
    singleEngine: z.string().optional(),
    multiEngine: z.string().optional(),
    totalTime: z
      .string()
      .trim()
      .min(1, 'fleet.error.total_time_required')
      .transform((v, ctx) => {
        const minutes = parseDurationToMinutes(v)
        if (minutes === null || minutes <= 0) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'fleet.error.total_time_invalid' })
          return z.NEVER
        }
        return minutes
      }),
    nightTime: optionalDurationField('night_time'),
    ifrTime: optionalDurationField('ifr_time'),
    crossCountryTime: optionalDurationField('cross_country_time'),
    instrumentTime: optionalDurationField('instrument_time'),
    hobbsOut: optionalCounterField('hobbs'),
    hobbsIn: optionalCounterField('hobbs'),
    tachOut: optionalCounterField('tach'),
    tachIn: optionalCounterField('tach'),
    fuelUplift: optionalCounterField('fuel'),
    fuelBurn: optionalCounterField('fuel'),
    dayLandings: optionalCounterField('landings'),
    nightLandings: optionalCounterField('landings'),
    passengers: optionalCounterField('passengers'),
    remarks: optionalTrimmed,
    deviceType: optionalTrimmed,
    deviceQualification: optionalTrimmed,
  })
  .superRefine((data, ctx) => {
    const isFstd = data.entryType === 'fstd'

    if (!isFstd) {
      if (!data.aircraftId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['aircraftId'],
          message: 'fleet.error.aircraft_required',
        })
      }
      for (const [field, value] of [
        ['departureAerodrome', data.departureAerodrome],
        ['arrivalAerodrome', data.arrivalAerodrome],
      ] as const) {
        if (value && !ICAO_LOCATION_PATTERN.test(value)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: 'fleet.error.aerodrome_invalid',
          })
        }
      }
    } else if (!data.deviceType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['deviceType'],
        message: 'fleet.error.device_type_required',
      })
    }

    for (const [field, value] of [
      ['nightTime', data.nightTime],
      ['ifrTime', data.ifrTime],
      ['crossCountryTime', data.crossCountryTime],
      ['instrumentTime', data.instrumentTime],
    ] as const) {
      if (value > data.totalTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: 'fleet.error.time_exceeds_total',
        })
      }
    }

    if (data.hobbsOut !== null && data.hobbsIn !== null && data.hobbsIn < data.hobbsOut) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['hobbsIn'],
        message: 'fleet.error.hobbs_decreasing',
      })
    }
    if (data.tachOut !== null && data.tachIn !== null && data.tachIn < data.tachOut) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tachIn'],
        message: 'fleet.error.tach_decreasing',
      })
    }

    for (const [field, value] of [
      ['dayLandings', data.dayLandings],
      ['nightLandings', data.nightLandings],
      ['passengers', data.passengers],
    ] as const) {
      if (value !== null && (!Number.isInteger(value) || value < 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: 'fleet.error.landings_invalid',
        })
      }
    }

    const today = new Date().toISOString().slice(0, 10)
    if (data.flightDate > today) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['flightDate'],
        message: 'fleet.error.date_future',
      })
    }
  })

/**
 * Validate a submitted flight/FSTD entry form. Aircraft ownership (that
 * `aircraftId` names one of the pilot's own non-retired aircraft) is checked
 * by the route handler via the repository, not here.
 */
export function validateFlightEntryForm(
  body: Record<string, unknown>,
): FleetFormResult<CreateFlightEntryInput> {
  const parsed = flightEntryFormSchema.safeParse(body)
  if (!parsed.success) {
    const errors: FleetFormErrors = {}
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] ? String(issue.path[0]) : 'general'
      if (!errors[field]) errors[field] = issue.message
    }
    return { ok: false, errors }
  }

  const data = parsed.data
  const isFstd = data.entryType === 'fstd'
  return {
    ok: true,
    data: {
      aircraftId: isFstd ? null : (data.aircraftId as string),
      kind: isFstd ? 'fstd' : 'flight',
      flightDate: data.flightDate,
      departureAerodrome: isFstd ? null : (data.departureAerodrome?.toUpperCase() ?? null),
      departureTime: isFstd ? null : data.departureTime,
      arrivalAerodrome: isFstd ? null : (data.arrivalAerodrome?.toUpperCase() ?? null),
      arrivalTime: isFstd ? null : data.arrivalTime,
      pilotFunction: data.pilotFunction,
      singleEngine: isFstd ? null : data.singleEngine === 'on',
      multiEngine: isFstd ? null : data.multiEngine === 'on',
      totalMinutes: data.totalTime,
      nightMinutes: data.nightTime,
      ifrMinutes: data.ifrTime,
      crossCountryMinutes: data.crossCountryTime,
      instrumentMinutes: data.instrumentTime,
      hobbsOut: isFstd ? null : data.hobbsOut,
      hobbsIn: isFstd ? null : data.hobbsIn,
      tachOut: isFstd ? null : data.tachOut,
      tachIn: isFstd ? null : data.tachIn,
      fuelUplift: isFstd ? null : data.fuelUplift,
      fuelBurn: isFstd ? null : data.fuelBurn,
      dayLandings: isFstd ? 0 : (data.dayLandings ?? 0),
      nightLandings: isFstd ? 0 : (data.nightLandings ?? 0),
      passengers: isFstd ? 0 : (data.passengers ?? 0),
      remarks: data.remarks,
      deviceType: isFstd ? data.deviceType : null,
      deviceQualification: isFstd ? data.deviceQualification : null,
    },
  }
}

const optionalIsoDate = z
  .string()
  .optional()
  .transform((v) => (v && v.trim().length > 0 ? v.trim() : null))
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), 'fleet.error.date_invalid')

const maintenanceItemFormSchema = z
  .object({
    description: z.string().trim().min(1, 'fleet.error.mx_description_required'),
    dueOn: optionalIsoDate,
    dueAtHours: numericField,
    hoursBasis: z.enum(['airframe', 'tach', '']).optional(),
    recurrenceMonths: optionalCounterField('mx_recurrence'),
    recurrenceHours: numericField,
    reference: optionalTrimmed,
  })
  .superRefine((data, ctx) => {
    if (data.dueOn === null && data.dueAtHours === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['general'],
        message: 'fleet.error.mx_due_condition_required',
      })
    }
    if (data.dueAtHours !== null && !data.hoursBasis) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['hoursBasis'],
        message: 'fleet.error.mx_hours_basis_required',
      })
    }
  })

/** Validate a submitted maintenance-item form. */
export function validateMaintenanceItemForm(
  body: Record<string, unknown>,
): FleetFormResult<CreateMaintenanceItemInput> {
  const parsed = maintenanceItemFormSchema.safeParse(body)
  if (!parsed.success) {
    const errors: FleetFormErrors = {}
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] ? String(issue.path[0]) : 'general'
      if (!errors[field]) errors[field] = issue.message
    }
    return { ok: false, errors }
  }
  const data = parsed.data
  return {
    ok: true,
    data: {
      description: data.description,
      dueOn: data.dueOn,
      dueAtHours: data.dueAtHours,
      hoursBasis: data.hoursBasis ? (data.hoursBasis as 'airframe' | 'tach') : null,
      recurrenceMonths: data.recurrenceMonths,
      recurrenceHours: data.recurrenceHours,
      reference: data.reference,
    },
  }
}

const completeMaintenanceFormSchema = z.object({
  completedOn: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'fleet.error.date_invalid'),
  completedAtHours: numericField,
  reference: optionalTrimmed,
})

/** Validate a submitted maintenance-completion form. */
export function validateCompleteMaintenanceForm(
  body: Record<string, unknown>,
): FleetFormResult<CompleteMaintenanceInput> {
  const parsed = completeMaintenanceFormSchema.safeParse(body)
  if (!parsed.success) {
    const errors: FleetFormErrors = {}
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] ? String(issue.path[0]) : 'general'
      if (!errors[field]) errors[field] = issue.message
    }
    return { ok: false, errors }
  }
  return { ok: true, data: parsed.data }
}
