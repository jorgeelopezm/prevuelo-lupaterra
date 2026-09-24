import type { EngineChannel } from '../../../../platform/fleet/types.js'

/** One recognized column: which channel it maps to, plus the index of the
 * source CSV column it came from. */
export interface ChannelMapping {
  columnIndex: number
  channel: EngineChannel
}

export interface ChannelMapResult {
  /** The elapsed-time column, if one was recognized (seconds from flight start). */
  timeColumnIndex: number | null
  channels: ChannelMapping[]
  /** Header names that matched no known channel. */
  ignoredColumns: string[]
}

/** One supported (or fallback) engine-monitor export format. */
export interface EngineDataFormat {
  /** A stable identifier surfaced in provenance (`detected_format`). */
  id: string
  /** Human-readable name shown alongside the provenance. */
  label: string
  /** Whether this format's detector recognizes the given header row. */
  detect(headers: string[]): boolean
  /** Maps recognized headers to channels; called only after `detect` passes. */
  mapChannels(headers: string[]): ChannelMapResult
}
