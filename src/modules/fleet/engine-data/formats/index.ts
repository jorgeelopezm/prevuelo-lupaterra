import { genericFormat } from './generic.js'
import type { EngineDataFormat } from './types.js'

export type { ChannelMapping, ChannelMapResult, EngineDataFormat } from './types.js'

/** Format registry, most-specific first. Only the generic header matcher
 * ships in this change (see `generic.ts`'s header comment); a named format
 * detector is a self-contained addition here once a real export is
 * available to test against. */
const FORMATS: readonly EngineDataFormat[] = [genericFormat]

/** The first format whose detector recognizes the header row, or `null`. */
export function detectFormat(headers: string[]): EngineDataFormat | null {
  return FORMATS.find((format) => format.detect(headers)) ?? null
}
