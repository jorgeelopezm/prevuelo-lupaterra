/**
 * Minimal CSV reader for engine-monitor exports: quoted fields, CRLF/LF line
 * endings, and a strict column-count check (a ragged row fails the whole
 * parse — engine-data-import spec: "Partial parse failure ... the whole
 * import is rejected"). Small enough to write in-repo rather than pin a
 * dependency for it (design decision 9).
 */
export interface ParsedCsv {
  headers: string[]
  rows: string[][]
}

/** Returns `null` on any malformed input (ragged row, unterminated quote). */
export function parseCsv(text: string): ParsedCsv | null {
  if (text.trim().length === 0) return null
  const lines = splitLines(text)
  if (lines.length === 0) return null

  const headerLine = lines[0] as string
  const headers = parseLine(headerLine)
  if (headers === null) return null

  const rows: string[][] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] as string
    if (line.trim().length === 0) continue
    const row = parseLine(line)
    if (row === null) return null
    if (row.length !== headers.length) return null
    rows.push(row)
  }

  return { headers, rows }
}

function splitLines(text: string): string[] {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
}

/** Parses one CSV line honoring double-quoted fields (with `""` escaping a
 * literal quote). Returns `null` for an unterminated quoted field. */
function parseLine(line: string): string[] | null {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  let i = 0

  while (i < line.length) {
    const char = line[i]
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      current += char
      i += 1
      continue
    }
    if (char === '"') {
      inQuotes = true
      i += 1
      continue
    }
    if (char === ',') {
      fields.push(current)
      current = ''
      i += 1
      continue
    }
    current += char
    i += 1
  }
  if (inQuotes) return null
  fields.push(current)
  return fields.map((f) => f.trim())
}
