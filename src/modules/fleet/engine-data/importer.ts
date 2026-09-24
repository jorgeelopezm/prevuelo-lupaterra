import { createHash } from 'node:crypto'

import type { EngineChannel, EngineSeries } from '../../../platform/fleet/types.js'
import { parseCsv } from './csv.js'
import { detectFormat } from './formats/index.js'

export interface ImportedEngineData {
  originalFilename: string
  byteSize: number
  contentDigest: string
  detectedFormat: string
  channels: EngineChannel[]
  series: EngineSeries
  ignoredColumns: string[]
}

export type ImportRejectReason = 'unsupported_format' | 'malformed' | 'no_channels' | 'empty'

export type ImportOutcome =
  { ok: true; data: ImportedEngineData } | { ok: false; reason: ImportRejectReason }

/** Caps the number of points kept per channel — a downsample, not a
 * truncation: samples are taken at an even stride across the whole file so
 * the strip still shows the full flight (design decision 8). */
const MAX_POINTS = 2000

/**
 * Parses an uploaded engine-monitor CSV export into channel series. Byte-size
 * limits are enforced by the caller (the multipart upload config) before this
 * runs; this function only handles content-level rejection (malformed CSV, no
 * recognizable channel, empty file).
 */
export function importEngineData(buffer: Buffer, originalFilename: string): ImportOutcome {
  if (buffer.length === 0) return { ok: false, reason: 'empty' }

  const text = buffer.toString('utf8')
  const parsed = parseCsv(text)
  if (!parsed) return { ok: false, reason: 'malformed' }
  if (parsed.rows.length === 0) return { ok: false, reason: 'empty' }

  const format = detectFormat(parsed.headers)
  if (!format) return { ok: false, reason: 'unsupported_format' }

  const mapped = format.mapChannels(parsed.headers)
  if (mapped.channels.length === 0) return { ok: false, reason: 'no_channels' }

  const stride = Math.max(1, Math.ceil(parsed.rows.length / MAX_POINTS))
  const sampledRows = parsed.rows.filter((_, i) => i % stride === 0)

  const t: number[] = []
  const values: Record<string, number[]> = {}
  for (const mapping of mapped.channels) values[mapping.channel.key] = []

  sampledRows.forEach((row, i) => {
    t.push(mapped.timeColumnIndex !== null ? Number(row[mapped.timeColumnIndex]) || i : i)
    for (const mapping of mapped.channels) {
      const raw = row[mapping.columnIndex]
      const num = raw !== undefined ? Number(raw) : NaN
      values[mapping.channel.key]?.push(Number.isFinite(num) ? num : 0)
    }
  })

  const contentDigest = createHash('sha256').update(buffer).digest('hex')

  return {
    ok: true,
    data: {
      originalFilename,
      byteSize: buffer.length,
      contentDigest,
      detectedFormat: format.id,
      channels: mapped.channels.map((m) => m.channel),
      series: { t, values },
      ignoredColumns: mapped.ignoredColumns,
    },
  }
}
