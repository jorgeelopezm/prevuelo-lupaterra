import { z } from 'zod'

import type { WeatherLocale } from '../provider/types.js'

/** Four uppercase letters — the ICAO location indicator / FIR designator shape. */
export const ICAO_CODE_PATTERN = /^[A-Z]{4}$/

export const ICAO_CODE_MESSAGE = 'must be a four-character ICAO location indicator (letters A-Z)'

export const icaoCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(ICAO_CODE_PATTERN, ICAO_CODE_MESSAGE)

export const icaoListSchema = z
  .array(icaoCodeSchema)
  .min(1, 'at least one ICAO location indicator is required')
  .max(20, 'no more than 20 ICAO location indicators per call')

export const localeSchema = z.enum(['es', 'pt', 'en'])

export const rawReportSchema = z
  .string()
  .trim()
  .min(3, 'raw report is too short to decode')
  .max(500, 'raw report is too long to decode')

/** `get_metar` / `get_taf` / `get_notams` input shape. */
export const locationIndicatorsSchema = z.object({
  icao: icaoListSchema,
})

/** `get_sigmet` input shape — one FIR designator. */
export const firSchema = z.object({
  fir: icaoCodeSchema.describe('four-character FIR designator'),
})

/** `decode_metar` input shape — a raw report and a target locale. */
export const decodeSchema = z.object({
  raw: rawReportSchema,
  locale: localeSchema,
})

export type LocationIndicatorsArgs = z.infer<typeof locationIndicatorsSchema>
export type FirArgs = z.infer<typeof firSchema>
export type DecodeArgs = z.infer<typeof decodeSchema>
export type { WeatherLocale }
